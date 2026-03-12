import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { adminService } from '../../services/admin.service';
import type { StatsSummary } from '../../types';

export function DashboardScreen() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminService.getStatistics(7);
      setStats(data);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.grid}>
        <StatCard
          label="Всего карточек"
          value={stats?.totalCards?.toString() ?? '—'}
          color="#1976D2"
        />
        <StatCard
          label="Пользователей"
          value={stats?.totalUsers?.toString() ?? '—'}
          color="#43A047"
        />
        <StatCard
          label="Сегодня"
          value={stats?.cardsToday?.toString() ?? '—'}
          color="#FB8C00"
        />
        <StatCard
          label="За неделю"
          value={stats?.cardsThisWeek?.toString() ?? '—'}
          color="#8E24AA"
        />
      </View>

      {stats?.perUser && stats.perUser.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>По сотрудникам</Text>
          {stats.perUser.map((u) => (
            <View key={u.userId} style={styles.userRow}>
              <Text style={styles.userName}>{u.fullName}</Text>
              <Text style={styles.userCount}>{u.cardsCount}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scroll: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  cardLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  userName: {
    fontSize: 14,
    color: '#444',
  },
  userCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
  },
});
