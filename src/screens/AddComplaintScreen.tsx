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
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

export default function AddComplaintScreen() {
  // State variables to hold the form data
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [location, setLocation] = useState<any | null>(null);
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
      setLocation(currentLocation);
    };

    requestLocationPermission();
  }, []);

  // Function to handle picking an image from the device's gallery
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 2],
      quality: 0.5, // Lower quality to reduce file size
    });

    if (!result.canceled) {
      const picked = result.assets && result.assets.length > 0 ? result.assets[0] : null;
      if (picked?.uri) setImageUri(picked.uri);
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
    });

    if (!result.canceled) {
      const picked = result.assets && result.assets.length > 0 ? result.assets[0] : null;
      if (picked?.uri) setImageUri(picked.uri);
    }
  };

  // Main function to handle the submission of the complaint
  const handleSubmit = async () => {
    // 1. Validate input
    if (!title ||!description ||!imageUri ||!location) {
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

        // 3. Fetch the local file and get a Blob — more reliable across Expo/React Native
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const filePath = `${userId}/${new Date().toISOString()}.jpg`;
        const contentType = blob.type || 'image/jpeg';

        // 4. Upload the image to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('complaints')
          .upload(filePath, blob, { contentType });

        if (uploadError) {
          throw uploadError;
        }

        // 5. Get the public URL of the uploaded image
        const { data: publicData } = supabase.storage
          .from('complaints')
          .getPublicUrl(filePath);
        const publicUrl = (publicData && (publicData as any).publicUrl) || null;

      // 6. Prepare the data to be saved in the database
      const complaintData = {
        title,
        description,
        image_url: publicUrl,
        // Format location for PostGIS: 'POINT(longitude latitude)'
        location: `POINT(${location.coords.longitude} ${location.coords.latitude})`,
        user_id: userId,
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