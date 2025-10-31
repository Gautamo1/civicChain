import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CityStat, fetchLeaderboard } from "../lib/leaderboard";

export default function LeaderboardScreen() {
  const [data, setData] = useState<CityStat[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const rows = await fetchLeaderboard();
      if (mounted) setData(rows);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#333" />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(item) => item.name}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Text style={styles.rank}>{index + 1}.</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.score}>✅ {item.score_percentage}%</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  rank: { width: 30, fontSize: 16, color: "#333" },
  name: { flex: 1, fontSize: 16, color: "#333" },
  score: { fontSize: 16, color: "#666" },
});