import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { supabase, COMPLAINTS_BUCKET } from '../lib/supabase';

// Helper to parse EXIF GPS into decimal lat/lon
function parseRational(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.includes('/')) {
    const [n, d] = value.split('/').map(Number);
    if (!isNaN(n) && !isNaN(d) && d!== 0) return n / d;
  }
  return Number(value) || 0;
}

function dmsToDecimal(dms: any[], ref?: string): number | null {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const deg = parseRational(dms[0]);
  const min = parseRational(dms[1]);
  const sec = parseRational(dms[2]);
  if ([deg, min, sec].some((v) => isNaN(v))) return null;
  let dec = deg + min / 60 + sec / 3600;
  if (ref && (ref === 'S' || ref === 'W')) dec = -dec;
  return dec;
}

function getCoordsFromExif(exif: any): { latitude: number; longitude: number } | null {
  try {
    const lat = dmsToDecimal(exif.GPSLatitude || exif.GPSLatitude?.values, exif.GPSLatitudeRef);
    const lon = dmsToDecimal(exif.GPSLongitude || exif.GPSLongitude?.values, exif.GPSLongitudeRef);
    if (lat!= null && lon!= null) return { latitude: lat, longitude: lon };
  } catch {}
  return null;
}

export default function AddComplaintScreen() {
  // State variables to hold the form data
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<any | null>(null);
  const [photoCoords, setPhotoCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const router = useRouter();

  // This useEffect hook runs once when the component mounts to get location permissions
  useEffect(() => {
    const requestLocationPermission = async () => {
      // Ask the user for permission to access their location
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status!== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied');
        return;
      }

      // Get the current location of the device
      let currentLocation = await Location.getCurrentPositionAsync({});
      setDeviceLocation(currentLocation);
    };

    requestLocationPermission();
  }, []);

  // Load categories (ids) for required category_id field
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('id')
          .order('id', { ascending: true });
        if (error) throw error;
        const rows = (data ?? []).map((r: any) => ({ id: String(r.id), name: String(r.id) }));
        setCategories(rows);
        if (rows.length > 0) setSelectedCategory(rows[0].id);
      } catch (e) {
        console.error('Error fetching categories', e);
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

  // Function to handle picking an image from the device's gallery
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 2],
      quality: 0.5, // Lower quality to reduce file size
      exif: true,
    });

    if (!result.canceled) {
      const picked = result.assets && result.assets.length > 0 ? result.assets[0] : null;
      if (picked?.uri) setImageUri(picked.uri);

      // Try to extract GPS from EXIF
      const exif: any = (picked as any)?.exif;
      if (exif) {
        const coords = getCoordsFromExif(exif);
        if (coords) setPhotoCoords(coords);
      }
    }
  };

  // Function to handle taking a photo with the camera
  const takePhoto = async () => {
    // Ask for camera permissions
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status!== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access camera was denied');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 2],
      quality: 0.5,
      exif: true,
    });

    if (!result.canceled) {
      const picked = result.assets && result.assets.length > 0 ? result.assets[0] : null;
      if (picked?.uri) setImageUri(picked.uri);

      // Try to extract GPS from EXIF when taking photo
      const exif: any = (picked as any)?.exif;
      if (exif) {
        const coords = getCoordsFromExif(exif);
        if (coords) setPhotoCoords(coords);
      }
    }
  };

  // Main function to handle the submission of the complaint
  const handleSubmit = async () => {
    // 1. Validate input
    if (!title || !description || !imageUri || !selectedCategory) {
      Alert.alert('Missing Information', 'Please fill all fields and select an image.');
      return;
    }

    setUploading(true);

    try {
      // 2. Get the current user's session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('User not authenticated');
      }
      const userId = session.user.id;
      const email = session.user.email || '';
      const municipalId = (session.user.user_metadata as any)?.city_id;
      if (!municipalId) {
        throw new Error('No municipal/city selected for user. Please set your city in profile.');
      }

      // Decide on coordinates: prefer photo EXIF, fallback to device location
      const lat = photoCoords?.latitude ?? deviceLocation?.coords.latitude;
      const lon = photoCoords?.longitude ?? deviceLocation?.coords.longitude;
      if (lat == null || lon == null) {
        throw new Error('Could not determine location. Enable location or use a photo with geotag.');
      }

      // Reverse geocode to human-readable address (best-effort)
      try {
        const addrs = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (addrs && addrs.length > 0) {
          const a = addrs[0];
          const parts = [a.name, a.street, a.city, a.region, a.postalCode, a.country].filter(Boolean);
          setAddress(parts.join(', '));
        }
      } catch {}

  // 3. Read the local file as ArrayBuffer via fetch (no Blob usage)
  const res = await fetch(imageUri);
  const arrayBuffer = await res.arrayBuffer();
  const extGuess = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const fileExt = ['jpg','jpeg','png','webp'].includes(extGuess) ? extGuess : 'jpg';
  const filePath = `${userId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;

        // 4. Upload the image to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(COMPLAINTS_BUCKET)
          .upload(filePath, arrayBuffer, { contentType });

        if (uploadError) {
          // Provide a clearer hint if the bucket is missing
          if (String(uploadError.message || '').toLowerCase().includes('not found')) {
            throw new Error(`Storage bucket "${COMPLAINTS_BUCKET}" not found. Create it in Supabase Storage or update COMPLAINTS_BUCKET.`);
          }
          throw uploadError;
        }

        // 5. Get the public URL of the uploaded image
        const { data: publicData } = supabase.storage
          .from(COMPLAINTS_BUCKET)
          .getPublicUrl(filePath);
        const publicUrl = (publicData && (publicData as any).publicUrl) || null;

      // 6. Prepare the data to be saved in the database
      const complaintData: any = {
        title,
        description,
        photo_url: publicUrl,
        locationAB: address || `${lat}, ${lon}`,
        municipal_id: String(municipalId),
        latitude: Number(lat.toFixed(8)),
        longitude: Number(lon.toFixed(8)),
        created_by: email,
        category_id: selectedCategory,
      };

      // 7. Insert the new complaint record into the 'complaints' table
      const { error: insertError } = await supabase.from('complaints').insert(complaintData);

      if (insertError) {
        throw insertError;
      }

      // 8. Provide feedback and navigate back
      Alert.alert('Success', 'Your complaint has been submitted successfully!');
      router.back();

    } catch (error: any) {
      console.error('Error submitting complaint:', error);
      Alert.alert('Error', error?.message || 'Failed to submit complaint.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Category */}
      <Text style={styles.label}>Category</Text>
      {categories.length === 0 ? (
        <ActivityIndicator />
      ) : (
        <View style={{ marginBottom: 16 }}>
          <DropdownSelect
            label="Category"
            options={categories}
            selected={selectedCategory ?? ''}
            onSelect={(id) => setSelectedCategory(id)}
          />
        </View>
      )}
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Large Pothole on Main St"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Provide details about the issue"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <View style={styles.imageContainer}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.image} />}
      </View>

      <View style={styles.buttonGroup}>
        <Button title="Pick from Gallery" onPress={pickImage} />
        <Button title="Take Photo" onPress={takePhoto} />
      </View>

      {uploading? (
        <ActivityIndicator size="large" color="#0000ff" style={styles.submitButton} />
      ) : (
        <Button title="Submit Complaint" onPress={handleSubmit} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  submitButton: {
    marginTop: 10,
  },
});

// Minimal local dropdown component (same shape as SignUp)
function DropdownSelect({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedName = options.find((o) => o.id === selected)?.name ?? 'Select';
  return (
    <View>
      <Button title={`${label}: ${selectedName}`} onPress={() => setOpen((s) => !s)} />
      {open && (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 8 }}>
          <ScrollView style={{ maxHeight: 220 }}>
            {options.map((opt) => (
              <Button key={opt.id} title={opt.name} onPress={() => { onSelect(opt.id); setOpen(false); }} />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}