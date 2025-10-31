// src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Alert, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

export default function ProfileScreen() {
  const router = useRouter();
  const [showComplaints, setShowComplaints] = useState(false);
  const [loading, setLoading] = useState(true);

  // User data
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [cityName, setCityName] = useState('');

  // Real user complaints
  const points = 120; // mock points (TODO: calculate from real data)
  const [userComplaints, setUserComplaints] = useState<any[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);

  // Fetch user data on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setEmail(session.user.email || '');
          setDisplayName(session.user.user_metadata?.display_name || 'User');
          
          // Get city ID directly from user metadata
          const cityId = session.user.user_metadata?.city_id;
          if (cityId) {
            setCityName(String(cityId));
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // Fetch user's complaints
  const fetchUserComplaints = async () => {
    if (!email) return;
    
    setLoadingComplaints(true);
    try {
      const { data, error } = await supabase
        .from('complaints')
        .select('id, title, description, category_id, status, created_at, updated_at, submitted_date')
        .eq('created_by', email)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Debug: Log the fetched data
      console.log('Fetched complaints:', data);
      
      setUserComplaints(data || []);
    } catch (error) {
      console.error('Error fetching user complaints:', error);
      setUserComplaints([]);
    } finally {
      setLoadingComplaints(false);
    }
  };

  // Fetch user's complaints when "My Complaints" is toggled
  useEffect(() => {
    if (showComplaints && email) {
      fetchUserComplaints();
    }
  }, [showComplaints, email]);

  // Real-time subscription to complaints table for auto-refresh
  useEffect(() => {
    if (!email) return;

    // Subscribe to changes in complaints table for current user
    const channel = supabase
      .channel('complaints_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'complaints',
          filter: `created_by=eq.${email}`
        },
        (payload) => {
          console.log('Complaint change detected:', payload);
          // Refresh complaints list when any change occurs
          if (showComplaints) {
            fetchUserComplaints();
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [email, showComplaints]);

  // Handle accepting a status update from admin - changes status to verified
  const handleAcceptStatus = async (complaintId: number, status: string) => {
    try {
      // Set submitted_date to 1 second in the future to ensure it's > updated_at
      const futureDate = new Date();
      futureDate.setSeconds(futureDate.getSeconds() + 2);
      
      const { error } = await supabase
        .from('complaints')
        .update({ 
          status: 'verified',
          submitted_date: futureDate.toISOString()
        })
        .eq('id', complaintId);

      if (error) throw error;

      Alert.alert('OK', 'The complaint status has been updated to "verified".');

      // Refresh complaints list
      fetchUserComplaints();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  };

  // Helper functions for GPS extraction from EXIF
  const parseRational = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.includes('/')) {
      const [n, d] = value.split('/').map(Number);
      if (!isNaN(n) && !isNaN(d) && d !== 0) return n / d;
    }
    return Number(value) || 0;
  };

  const dmsToDecimal = (dms: any[], ref?: string): number | null => {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    const deg = parseRational(dms[0]);
    const min = parseRational(dms[1]);
    const sec = parseRational(dms[2]);
    if ([deg, min, sec].some((v) => isNaN(v))) return null;
    let dec = deg + min / 60 + sec / 3600;
    if (ref && (ref === 'S' || ref === 'W')) dec = -dec;
    return dec;
  };

  const getCoordsFromExif = (exif: any): { latitude: number; longitude: number } | null => {
    try {
      const lat = dmsToDecimal(exif.GPSLatitude || exif.GPSLatitude?.values, exif.GPSLatitudeRef);
      const lon = dmsToDecimal(exif.GPSLongitude || exif.GPSLongitude?.values, exif.GPSLongitudeRef);
      if (lat != null && lon != null) return { latitude: lat, longitude: lon };
    } catch {}
    return null;
  };

  // Handle rejecting a status update - allow user to upload new image with fresh GPS
  const handleRejectStatus = async (complaintId: number) => {
    try {
      // First get the existing complaint data to preserve title, description, category
      const { data: complaintData, error: fetchError } = await supabase
        .from('complaints')
        .select('title, description, category_id')
        .eq('id', complaintId)
        .single();

      if (fetchError) throw fetchError;

      // Ask user to choose camera or gallery
      Alert.alert(
        'Select Image Source',
        'Choose how you want to add a new image',
        [
          {
            text: 'Camera',
            onPress: async () => {
              await handleImageSelection(complaintId, complaintData, 'camera');
            }
          },
          {
            text: 'Gallery',
            onPress: async () => {
              await handleImageSelection(complaintId, complaintData, 'gallery');
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process rejection');
    }
  };

  const handleImageSelection = async (complaintId: number, complaintData: any, source: 'camera' | 'gallery') => {
    try {
      let result;

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Camera permission is needed.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
          exif: true,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Gallery permission is needed.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
          exif: true,
        });
      }

      if (result.canceled || !result.assets[0]) return;

      const imageUri = result.assets[0].uri;
      const exif = result.assets[0].exif;

      // Get GPS coordinates - prefer EXIF, fallback to device location
      let latitude: number | null = null;
      let longitude: number | null = null;

      if (exif) {
        const coords = getCoordsFromExif(exif);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
        }
      }

      // Fallback to device location if no EXIF GPS
      if (latitude === null || longitude === null) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        }
      }

      if (latitude === null || longitude === null) {
        Alert.alert('Error', 'Could not get GPS location. Please enable location services.');
        return;
      }

      // Reverse geocode to get address
      let address = 'Location not available';
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const loc = geocode[0];
          address = [loc.street, loc.city, loc.region, loc.country]
            .filter(Boolean)
            .join(', ');
        }
      } catch (err) {
        console.error('Geocoding error:', err);
      }

      // Upload new image to Storage
      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = imageUri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('complaints')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('complaints')
        .getPublicUrl(fileName);

      // Update complaint with new photo, GPS, location, and status to pending
      const futureDate = new Date();
      futureDate.setSeconds(futureDate.getSeconds() + 2);

      const { error: updateError } = await supabase
        .from('complaints')
        .update({
          photo_url: urlData.publicUrl,
          latitude,
          longitude,
          location: address,
          status: 'pending',
          submitted_date: futureDate.toISOString()
        })
        .eq('id', complaintId);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Image and location updated successfully! Status changed to pending.');
      fetchUserComplaints();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update image');
    }
  };

  // Check if complaint status was recently updated by admin (within last 7 days)
  const isRecentlyUpdated = (complaint: any): boolean => {
    if (!complaint.updated_at || !complaint.submitted_date) return false;
    const updated = new Date(complaint.updated_at);
    const submitted = new Date(complaint.submitted_date);
    const daysSinceUpdate = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
    const isUpdatedAfterSubmit = updated > submitted;
    
    // Debug logging
    console.log('Complaint:', complaint.id, {
      updated_at: complaint.updated_at,
      submitted_date: complaint.submitted_date,
      isUpdatedAfterSubmit,
      daysSinceUpdate,
      willShow: isUpdatedAfterSubmit && daysSinceUpdate <= 7
    });
    
    return isUpdatedAfterSubmit && daysSinceUpdate <= 7;
  };

  // Get color styling for status badge
  const getStatusStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'resolved':
        return { color: '#388e3c', backgroundColor: '#e8f5e9' };
      case 'verified':
        return { color: '#1976d2', backgroundColor: '#e3f2fd' };
      case 'pending':
      default:
        return { color: '#d32f2f', backgroundColor: '#ffebee' };
    }
  };

  const openEmail = async () => {
    const email = 'user@gmail.com';
    const url = `mailto:${email}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open email client');
      }
    } catch (err) {
      console.error('Error opening email client', err);
      Alert.alert('Error opening email client');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Error signing out', error);
      Alert.alert('Logout failed');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Name</Text>
        <Text style={styles.cardValue}>{displayName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>City</Text>
        <Text style={styles.cardValue}>{cityName || 'Not set'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Points</Text>
        <Text style={styles.cardValue}>{points}</Text>
      </View>

      <Pressable style={styles.card} onPress={() => setShowComplaints((s) => !s)}>
        <Text style={styles.cardTitle}>My Complaints</Text>
        <Text style={styles.linkText}>{showComplaints ? 'Hide' : 'View'} ({userComplaints.length})</Text>
      </Pressable>

      {showComplaints && (
        <>
          {loadingComplaints ? (
            <ActivityIndicator style={{ marginVertical: 16 }} />
          ) : userComplaints.length === 0 ? (
            <View style={styles.emptyComplaints}>
              <Text style={styles.emptyText}>No complaints submitted yet</Text>
            </View>
          ) : (
            <FlatList
              data={userComplaints}
              keyExtractor={(item) => item.id.toString()}
              style={{ width: '100%' }}
              renderItem={({ item }) => {
                const showActions = isRecentlyUpdated(item);
                return (
                  <Pressable 
                    style={styles.complaintItem}
                    onPress={() => {
                      Alert.alert(
                        item.title,
                        `Status: ${item.status}\n\nDescription: ${item.description || 'No description'}\n\nCategory: ${item.category_id || 'N/A'}`,
                        [{ text: 'OK' }]
                      );
                    }}
                  >
                    <View style={styles.complaintHeader}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={[styles.itemStatus, getStatusStyle(item.status)]}>
                        {item.status}
                      </Text>
                    </View>
                    
                    {showActions && (
                      <View style={styles.statusUpdateBanner}>
                        <Text style={styles.bannerText}>
                          ✓ Admin updated status to "{item.status}"
                        </Text>
                        <View style={styles.actionButtons}>
                          <Pressable
                            style={[styles.actionBtn, styles.acceptBtn]}
                            onPress={() => handleAcceptStatus(item.id, item.status)}
                          >
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => handleRejectStatus(item.id)}
                          >
                            <Text style={styles.rejectBtnText}>Reject</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}

      <Pressable style={styles.card} onPress={openEmail}>
        <Text style={styles.cardTitle}>Email</Text>
        <Text style={styles.linkText}>{email}</Text>
      </Pressable>

      <Pressable style={[styles.card, styles.logout]} onPress={handleLogout}>
        <Text style={[styles.cardTitle, { color: 'white' }]}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1976d2',
  },
  linkText: {
    color: '#2f95dc',
    fontWeight: '600',
  },
  logout: {
    backgroundColor: '#d32f2f',
    borderColor: '#d32f2f',
  },
  listItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontWeight: '600',
  },
  itemStatus: {
    color: '#6c757d',
    textTransform: 'capitalize',
  },
  emptyComplaints: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6c757d',
  },
  complaintItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  complaintHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusUpdateBanner: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    padding: 12,
    marginTop: 8,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  acceptBtn: {
    backgroundColor: '#388e3c',
    borderColor: '#388e3c',
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  rejectBtn: {
    backgroundColor: '#fff',
    borderColor: '#d32f2f',
  },
  rejectBtnText: {
    color: '#d32f2f',
    fontWeight: '600',
    fontSize: 12,
  },
});