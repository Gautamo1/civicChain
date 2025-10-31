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
} from 'react-native';
import { Link } from 'expo-router';
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

  // States filter
  const [states, setStates] = useState<{ id: string; name: string }[]>([]);
  const [selectedState, setSelectedState] = useState('All');

  // Cities filter (dynamic)
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [selectedCity, setSelectedCity] = useState('All');

  // Status filter
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Stats
  const [openCount, setOpenCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);

  // ==============================
  // Fetch Complaints + Stats
  // ==============================
  const fetchComplaintsAndCounts = useCallback(async () => {
    try {
      setLoading(true);

      // --- Fetch counts ---
      // Apply state/city filter to counts if selected
      let totalQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true });
      let openQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true }).eq('status', 'open');
      let resolvedQuery: any = supabase.from('complaints_with_verification_count').select('*', { count: 'exact', head: true }).eq('status', 'resolved');

      if (selectedState !== 'All') {
        totalQuery = totalQuery.eq('state_id', selectedState);
        openQuery = openQuery.eq('state_id', selectedState);
        resolvedQuery = resolvedQuery.eq('state_id', selectedState);
      }
      if (selectedCity !== 'All') {
        totalQuery = totalQuery.eq('city_id', selectedCity);
        openQuery = openQuery.eq('city_id', selectedCity);
        resolvedQuery = resolvedQuery.eq('city_id', selectedCity);
      }

      const { count: total } = await totalQuery;
      const { count: open } = await openQuery;
      const { count: resolved } = await resolvedQuery;

      setTotalCount(total ?? 0);
      setOpenCount(open ?? 0);
      setResolvedCount(resolved ?? 0);

      // --- Fetch complaints list ---
      let query = supabase.from('complaints_with_verification_count').select('*').order('created_at', { ascending: false });

  if (selectedStatus !== 'all') query = query.eq('status', selectedStatus);
      if (selectedState !== 'All') query = query.eq('state_id', selectedState);
      if (selectedCity !== 'All') query = query.eq('city_id', selectedCity);

      const { data, error } = await query;
      if (error) throw error;

      setComplaints(data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedState, selectedCity, selectedStatus]);


  // Fetch states from Supabase on mount
  useEffect(() => {
    const fetchStates = async () => {
      const { data, error } = await supabase.from('states').select('*').order('name', { ascending: true });
      if (error) {
        console.error('Error fetching states:', error);
        setStates([]);
      } else {
        setStates([{ id: 'All', name: 'All' }, ...(data ?? [])]);
      }
    };
    fetchStates();
  }, []);

  // Fetch cities from Supabase when selectedState changes
  useEffect(() => {
    const fetchCities = async () => {
      let query = supabase.from('cities').select('*').order('name', { ascending: true });
      if (selectedState !== 'All') {
        query = query.eq('state_id', selectedState);
      }
      const { data, error } = await query;
      if (error) {
        console.error('Error fetching cities:', error);
        setCities([{ id: 'All', name: 'All' }]);
      } else {
        setCities([{ id: 'All', name: 'All' }, ...(data ?? [])]);
      }
    };
    fetchCities();
  }, [selectedState]);

  useEffect(() => {
    fetchComplaintsAndCounts();
  }, [fetchComplaintsAndCounts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchComplaintsAndCounts();
  };

  // ==============================
  // Header (filters + stats)
  // ==============================
  const ListHeader = () => (
    <>
      <Text style={styles.subtitle}>Make your city better</Text>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#ffebee' }]}>
          <Text style={[styles.statNumber, { color: '#d32f2f' }]}>{openCount}</Text>
          <Text style={styles.statLabel}>OPEN</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
          <Text style={[styles.statNumber, { color: '#388e3c' }]}>{resolvedCount}</Text>
          <Text style={styles.statLabel}>RESOLVED</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
          <Text style={[styles.statNumber, { color: '#1976d2' }]}>{totalCount}</Text>
          <Text style={styles.statLabel}>TOTAL</Text>
        </View>
      </View>

      {/* States Filter */}
      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>State</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {states.map((state) => (
            <FilterPill
              key={state.id}
              label={state.name}
              isSelected={selectedState === state.id}
              onPress={() => setSelectedState(state.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* City Filter (dynamic) */}
      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>City</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cities.map((city) => (
            <FilterPill
              key={city.id}
              label={city.name}
              isSelected={selectedCity === city.id}
              onPress={() => setSelectedCity(city.id)}
            />
          ))}
        </ScrollView>
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
          renderItem={({ item }) => (
            <View style={styles.complaintCard}>
              <Text style={styles.complaintTitle}>{item.title}</Text>
              <Text numberOfLines={2}>{item.description}</Text>
            </View>
          )}
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
