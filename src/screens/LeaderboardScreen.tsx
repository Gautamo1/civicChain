import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

type UserScore = {
  id: string;
  name: string;
  score: number;
};

const SAMPLE_DATA: UserScore[] = [
  { id: '1', name: 'Ludhiana', score: 120 },
  { id: '2', name: 'Amritsar', score: 95 },
  { id: '3', name: 'Mohali', score: 80 },
];

export default function LeaderboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <FlatList
        data={SAMPLE_DATA}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}.</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.score}>{item.score}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  rank: { width: 30, fontSize: 16, color: '#333' },
  name: { flex: 1, fontSize: 16, color: '#333' },
  score: { fontSize: 16, color: '#666' },
});
