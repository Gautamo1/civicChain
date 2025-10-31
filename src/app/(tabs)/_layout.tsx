// src/app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs, Link } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2f95dc', // A nice blue color for the active tab
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home', // This is the text for the tab bar item
          tabBarIcon: ({ color }) => <Ionicons size={28} name="home" color={color} />,
          headerTitle: 'Complaints', // This is the text shown in the header
          // This adds the "+ New" button to the top right of the header
          headerRight: () => (
            <Link href="/add-complaint" asChild>
              <Pressable style={{ marginRight: 15, backgroundColor: '#2f95dc', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>+ New</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => <MaterialCommunityIcons size={28} name="podium" color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Hotspots', // Renamed from "Hotspot Map" for a cleaner look
          tabBarIcon: ({ color }) => <MaterialCommunityIcons size={28} name="map-marker-radius" color={color} />,
        }}
      />
      <Tabs.Screen
        // This is the new Profile tab from your design
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="person-circle" color={color} />,
        }}
      />
    </Tabs>
  );
}