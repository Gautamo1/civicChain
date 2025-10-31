import * as Location from "expo-location";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useFocusEffect } from "expo-router";
import { fetchHotspots, fetchHotspotsInBBox, Hotspot } from "../lib/map";
import { supabase } from "../lib/supabase";

const STATUSES = ["all", "pending", "resolved", "verified"];

export default function MapScreen() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [region, setRegion] = useState<any | null>(null);
  const [userCityId, setUserCityId] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const regionTimeout = useRef<any>(null);

  useEffect(() => {
    // Load user's municipal (city) id from auth metadata
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const cityId = session.user.user_metadata?.city_id || null;
          setUserCityId(cityId);
        }
      } catch (e) {
        console.warn("Could not load user city id", e);
      }
    })();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let loc: any = null;
      if (status === "granted") {
        try {
          loc = await Location.getCurrentPositionAsync({});
        } catch (e) {
          console.warn("Location unavailable, using fallback center.", e);
        }
      }

      if (loc) {
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        });

        // load visible hotspots for the initial region via bbox
        const bbox = {
          min_lat: loc.coords.latitude - 0.08 / 2,
          max_lat: loc.coords.latitude + 0.08 / 2,
          min_lng: loc.coords.longitude - 0.08 / 2,
          max_lng: loc.coords.longitude + 0.08 / 2,
        };
        const rows = await fetchHotspotsInBBox(selectedStatus, bbox, userCityId || undefined);
        setHotspots(rows);
        setLoading(false);
      } else {
        // fallback to a default region (center of India)
        setRegion({
          latitude: 20.5937,
          longitude: 78.9629,
          latitudeDelta: 10,
          longitudeDelta: 10,
        });
        await loadHotspots(selectedStatus);
      }
    })();
  }, []);

  useEffect(() => {
    // reload when status filter changes
    // If map has region, fetch by bbox; otherwise fallback to full fetch
    if (region) {
      const bbox = {
        min_lat: region.latitude - region.latitudeDelta / 2,
        max_lat: region.latitude + region.latitudeDelta / 2,
        min_lng: region.longitude - region.longitudeDelta / 2,
        max_lng: region.longitude + region.longitudeDelta / 2,
      };
      fetchHotspotsInBBox(selectedStatus, bbox, userCityId || undefined).then((rows: Hotspot[]) =>
        setHotspots(rows)
      );
    } else {
      loadHotspots(selectedStatus);
    }
  }, [selectedStatus, userCityId]);

  // Re-fetch user city when screen comes into focus (e.g., after city change)
  useFocusEffect(
    useCallback(() => {
      const refreshUserCity = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const cityId = session.user.user_metadata?.city_id || null;
            if (cityId !== userCityId) {
              // City has changed, update it and reload hotspots
              setUserCityId(cityId);
            }
          }
        } catch (e) {
          console.warn("Could not refresh user city id", e);
        }
      };
      refreshUserCity();
    }, [userCityId])
  );

  useEffect(() => {
    return () => {
      if (regionTimeout.current) clearTimeout(regionTimeout.current);
    };
  }, []);

  async function loadHotspots(status: string) {
    setLoading(true);
    const rows = await fetchHotspots(status, userCityId || undefined);
    setHotspots(rows);
    setLoading(false);
    // If there are markers, center map to first one
    if (rows.length > 0 && mapRef.current) {
      const r = {
        latitude: rows[0].latitude,
        longitude: rows[0].longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      mapRef.current.animateToRegion(r, 500);
    }
  }

  // called by MapView when panning/zooming stops
  function handleRegionChangeComplete(newRegion: any) {
    setRegion(newRegion);

    // debounce requests while user is interacting
    if (regionTimeout.current) clearTimeout(regionTimeout.current);
    regionTimeout.current = setTimeout(async () => {
      try {
        setLoading(true);
        const bbox = {
          min_lat: newRegion.latitude - newRegion.latitudeDelta / 2,
          max_lat: newRegion.latitude + newRegion.latitudeDelta / 2,
          min_lng: newRegion.longitude - newRegion.longitudeDelta / 2,
          max_lng: newRegion.longitude + newRegion.longitudeDelta / 2,
        };
        const rows = await fetchHotspotsInBBox(selectedStatus, bbox, userCityId || undefined);
        setHotspots(rows);
      } catch (err) {
        console.error("Error fetching bbox hotspots:", err);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            style={[
              styles.pill,
              selectedStatus === s ? styles.pillActive : styles.pillInactive,
            ]}
            onPress={() => setSelectedStatus(s)}
          >
            <Text
              style={
                selectedStatus === s
                  ? styles.pillTextActive
                  : styles.pillTextInactive
              }
            >
              {s.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {!region || loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#2f95dc" />
          <Text style={{ marginTop: 12 }}>
            {loading ? "Loading hotspots..." : "Determining location..."}
          </Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          showsUserLocation
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {hotspots.map((h) => (
            <Marker
              key={String(h.id)}
              coordinate={{ latitude: h.latitude, longitude: h.longitude }}
              title={h.title || "Spot"}
              description={h.status}
            >
              {h.image_url ? (
                <View style={styles.markerImageWrap}>
                  <Image
                    source={{ uri: h.image_url }}
                    style={styles.markerImage}
                  />
                </View>
              ) : (
                <View
                  style={[styles.defaultMarker, markerColorForStatus(h.status)]}
                />
              )}
            </Marker>
          ))}
        </MapView>
      )}
    </View>
  );
}

function markerColorForStatus(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "verified":
      return { backgroundColor: "#2e7d32" };
    case "resolved":
      return { backgroundColor: "#1565c0" };
    case "pending":
    case "open":
      return { backgroundColor: "#d32f2f" };
    default:
      return { backgroundColor: "#6c757d" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  filterRow: {
    flexDirection: "row",
    padding: 12,
    justifyContent: "space-around",
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  pillActive: { backgroundColor: "#343a40", borderColor: "#343a40" },
  pillInactive: { backgroundColor: "#fff", borderColor: "#dee2e6" },
  pillTextActive: { color: "#fff", fontWeight: "700" },
  pillTextInactive: { color: "#333", fontWeight: "700" },
  map: { flex: 1, width: Dimensions.get("window").width },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  defaultMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerImageWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
  },
  markerImage: { width: 36, height: 36 },
});