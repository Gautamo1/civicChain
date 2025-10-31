// src/screens/HomeScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// Statuses match table values
const STATUSES = ['all', 'pending', 'resolved', 'verified'];

// ==============================
// Filter Pill Component
// ==============================
type FilterPillProps = {
  label: string;
  isSelected: boolean;
  onPress: () => void;
};

const makeTitleCase = (s: string) =>
  s
    .split(' ')
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

const FilterPill = ({ label, isSelected, onPress }: FilterPillProps) => (
  <Pressable
    style={[styles.pill, isSelected ? styles.pillActive : styles.pillInactive]}
    onPress={onPress}
  >
    <Text style={[styles.pillText, isSelected ? styles.pillTextActive : styles.pillTextInactive]}>
      {makeTitleCase(label)}
    </Text>
  </Pressable>
);

// ==============================
// Home Screen
// ==============================

export default function HomeScreen() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // User's city from auth metadata
  const [userCityId, setUserCityId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Track which complaints user has voted on
  const [userVotedComplaints, setUserVotedComplaints] = useState<Set<number>>(new Set());

  // Status filter
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Stats
  const [openCount, setOpenCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);

  // Fetch user's city and email from auth metadata on mount
  useEffect(() => {
    const fetchUserCity = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const cityId = session.user.user_metadata?.city_id;
          if (cityId) {
            setUserCityId(cityId);
          }
          setUserEmail(session.user.email || null);
        }
      } catch (error) {
        console.error('Error fetching user city:', error);
      }
    };
    fetchUserCity();
  }, []);

  // Re-fetch user city when screen comes into focus (e.g., after city change)
  useFocusEffect(
    useCallback(() => {
      const refreshUserCity = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const cityId = session.user.user_metadata?.city_id;
            if (cityId && cityId !== userCityId) {
              // City has changed, update it
              setUserCityId(cityId);
            }
          }
        } catch (error) {
          console.error('Error refreshing user city:', error);
        }
      };
      refreshUserCity();
    }, [userCityId])
  );

  // ==============================
  // Fetch Complaints + Stats
  // ==============================
  const fetchComplaintsAndCounts = useCallback(async () => {
    try {
      setLoading(true);

  // --- Fetch counts ---
  // Apply municipal filter to counts if user has a city
      let totalQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true });
  let openQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      let resolvedQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
      let verifiedQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true }).eq('status', 'verified');

      if (userCityId) {
        totalQuery = totalQuery.eq('municipal_id', userCityId);
        openQuery = openQuery.eq('municipal_id', userCityId);
        resolvedQuery = resolvedQuery.eq('municipal_id', userCityId);
        verifiedQuery = verifiedQuery.eq('municipal_id', userCityId);
      }

      const { count: total } = await totalQuery;
      const { count: open } = await openQuery;
      const { count: resolved } = await resolvedQuery;
      const { count: verified } = await verifiedQuery;

      setTotalCount(total ?? 0);
      setOpenCount(open ?? 0);
      setResolvedCount(resolved ?? 0);
      setVerifiedCount(verified ?? 0);

      // --- Fetch complaints list (ordered by votes descending) ---
      let query = supabase
        .from('complaints_with_verification_count')
        .select('id, title, description, location, status, votes, verification_count, created_at, municipal_id')
        .order('votes', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

  if (selectedStatus !== 'all') query = query.eq('status', selectedStatus);
  if (userCityId) query = query.eq('municipal_id', userCityId);

      const { data, error } = await query;
      if (error) throw error;

      setComplaints(data || []);

      // --- Fetch user's voted complaints ---
      if (userEmail) {
        const { data: votesData } = await supabase
          .from('user_votes')
          .select('complaint_id')
          .eq('user_email', userEmail);
        
        if (votesData) {
          const votedIds = new Set(votesData.map(v => v.complaint_id));
          setUserVotedComplaints(votedIds);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userCityId, selectedStatus]);

  useEffect(() => {
    fetchComplaintsAndCounts();
  }, [fetchComplaintsAndCounts]);

  // Real-time subscription to complaints table for auto-refresh
  useEffect(() => {
    if (!userCityId) return;

    // Subscribe to changes in complaints table for user's city
    const channel = supabase
      .channel('home_complaints_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'complaints',
          filter: `municipal_id=eq.${userCityId}`
        },
        (payload) => {
          console.log('Home complaint change detected:', payload);
          // Refresh complaints list when any change occurs
          fetchComplaintsAndCounts();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userCityId, fetchComplaintsAndCounts]);

  // Handle voting on a complaint
  const handleVote = async (complaintId: number, currentVotes: number) => {
    if (!userEmail) {
      Alert.alert('Error', 'You must be logged in to vote');
      return;
    }

    // Check if user has already voted
    if (userVotedComplaints.has(complaintId)) {
      Alert.alert('Already Voted', 'You have already voted on this complaint');
      return;
    }

    try {
      // Record the vote in user_votes table
      const { error: voteError } = await supabase
        .from('user_votes')
        .insert({
          user_email: userEmail,
          complaint_id: complaintId
        });

      if (voteError) throw voteError;

      // Increment vote count
      const { error: updateError } = await supabase
        .from('complaints')
        .update({ votes: (currentVotes || 0) + 1 })
        .eq('id', complaintId);

      if (updateError) throw updateError;

      // Update local state
      setUserVotedComplaints(prev => new Set(prev).add(complaintId));

      Alert.alert('Success', 'Your vote has been recorded!');
      // Refresh will happen automatically via realtime subscription
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to vote');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchComplaintsAndCounts();
  };

  // ==============================
  // Header (filters + stats)
  // ==============================
  const ListHeader = () => {
    const totalDisplay = selectedStatus === 'all' ? totalCount : complaints.length;
    return (
      <>
        <Text style={styles.subtitle}>Make your city better</Text>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <Pressable
            style={[styles.statCard, selectedStatus === 'pending' ? styles.statCardActive : null, { backgroundColor: '#ffebee' }]}
            onPress={() => setSelectedStatus('pending')}
          >
            <Text style={[styles.statNumber, { color: '#d32f2f' }]}>{openCount}</Text>
            <Text style={styles.statLabel}>OPEN</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, selectedStatus === 'resolved' ? styles.statCardActive : null, { backgroundColor: '#e8f5e9' }]}
            onPress={() => setSelectedStatus('resolved')}
          >
            <Text style={[styles.statNumber, { color: '#388e3c' }]}>{resolvedCount}</Text>
            <Text style={styles.statLabel}>RESOLVED</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, selectedStatus === 'verified' ? styles.statCardActive : null, { backgroundColor: '#f3e8ff' }]}
            onPress={() => setSelectedStatus('verified')}
          >
            <Text style={[styles.statNumber, { color: '#6a1b9a' }]}>{verifiedCount}</Text>
            <Text style={styles.statLabel}>VERIFIED</Text>
          </Pressable>
          <Pressable
            style={[styles.statCard, selectedStatus === 'all' ? styles.statCardActive : null, { backgroundColor: '#e3f2fd' }]}
            onPress={() => setSelectedStatus('all')}
          >
            <Text style={[styles.statNumber, { color: '#1976d2' }]}>{totalDisplay}</Text>
            <Text style={styles.statLabel}>TOTAL</Text>
          </Pressable>
        </View>

        {/* Status Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {STATUSES.map((status) => (
              <FilterPill
                key={status}
                label={status}
                isSelected={selectedStatus === status}
                onPress={() => setSelectedStatus(status)}
              />
            ))}
          </ScrollView>
        </View>
      </>
    );
  };

  // ==============================
  // Empty List
  // ==============================
  const EmptyList = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="mailbox-outline" size={80} color="#ced4da" />
      <Text style={styles.emptyTitle}>No complaints found</Text>
      <Text style={styles.emptySubtitle}>
        Try adjusting your filters or be the first to report an issue!
      </Text>
    </View>
  );

  // ==============================
  // Render
  // ==============================
  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#2f95dc" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const hasVoted = userVotedComplaints.has(item.id);
            return (
              <View style={styles.complaintCard}>
                <Pressable 
                  onPress={() => {
                    Alert.alert(
                      item.title,
                      `${item.description}\n\nLocation: ${item.location || 'N/A'}\nStatus: ${item.status}\nVotes: ${item.votes || 0}`,
                      [{ text: 'OK' }]
                    );
                  }}
                >
                  <Text style={styles.complaintTitle}>{item.title}</Text>
                  <Text numberOfLines={2} style={styles.complaintDescription}>{item.description}</Text>
                </Pressable>
                
                <View style={styles.complaintFooter}>
                  <View style={styles.voteInfo}>
                    <Ionicons name="arrow-up-circle" size={20} color="#6c757d" />
                    <Text style={styles.voteCount}>{item.votes || 0} votes</Text>
                  </View>
                  <Pressable 
                    style={[styles.voteButton, hasVoted && styles.voteButtonDisabled]}
                    onPress={() => handleVote(item.id, item.votes)}
                    disabled={hasVoted}
                  >
                    <Ionicons 
                      name={hasVoted ? "checkmark-circle" : "arrow-up-circle-outline"} 
                      size={20} 
                      color={hasVoted ? "#6c757d" : "#007bff"} 
                    />
                    <Text style={[styles.voteButtonText, hasVoted && styles.voteButtonTextDisabled]}>
                      {hasVoted ? 'Voted' : 'Vote'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyList}
          contentContainerStyle={styles.scrollContainer}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        <Pressable style={styles.fabSmall} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#495057" />
        </Pressable>
        <Pressable style={styles.fabSmall}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#495057" />
        </Pressable>
      </View>

      <Link href="/add-complaint" asChild>
        <Pressable style={styles.fabMain}>
          <Ionicons name="add" size={32} color="white" />
        </Pressable>
      </Link>
    </View>
  );
}

// ==============================
// Styles
// ==============================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statCardActive: {
    borderWidth: 2,
    borderColor: '#2f95dc',
    transform: [{ scale: 1.02 }],
  },
  statLabel: {
    fontSize: 12,
    color: '#495057',
    marginTop: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  filterSection: {
    marginBottom: 24,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#343a40',
    marginBottom: 12,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: '#343a40',
    borderColor: '#343a40',
  },
  pillInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#dee2e6',
  },
  pillText: {
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  pillTextInactive: {
    color: '#495057',
  },
  dropdownToggle: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#fff' },
  dropdownToggleActive: { borderColor: '#2f95dc' },
  dropdownToggleInactive: { borderColor: '#dee2e6' },
  dropdownList: { marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e9ecef', backgroundColor: '#fff' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
  emptyContainer: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    color: '#495057',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '80%',
  },
  complaintCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  complaintTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  complaintDescription: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 12,
  },
  complaintFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  voteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  voteCount: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '600',
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e7f3ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  voteButtonText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '600',
  },
  voteButtonDisabled: {
    backgroundColor: '#e9ecef',
    opacity: 0.6,
  },
  voteButtonTextDisabled: {
    color: '#6c757d',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    alignItems: 'center',
  },
  fabSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginTop: 10,
  },
  fabMain: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2f95dc',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
