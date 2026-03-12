import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { adminService } from '../../services/admin.service';
import type { StatsSummary } from '../../types';

const PERIOD_OPTIONS = [
  { label: '7 дней', days: 7 },
  { label: '14 дней', days: 14 },
  { label: '30 дней', days: 30 },
];

export function StatisticsScreen() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);

  const fetchStats = useCallback(async (days: number) => {
    try {
      const data = await adminService.getStatistics(days);
      setStats(data);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStats(selectedDays);
    }, [fetchStats, selectedDays]),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchStats(selectedDays);
          }}
        />
      }
    >
      <View style={styles.periods}>
        {PERIOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.days}
            style={[
              styles.periodBtn,
              selectedDays === opt.days && styles.periodBtnActive,
            ]}
            onPress={() => setSelectedDays(opt.days)}
          >
            <Text
              style={[
                styles.periodText,
                selectedDays === opt.days && styles.periodTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryGrid}>
        <SummaryItem label="Всего карточек" value={stats?.totalCards ?? 0} />
        <SummaryItem label="Сегодня" value={stats?.cardsToday ?? 0} />
        <SummaryItem label="За период" value={stats?.cardsThisWeek ?? 0} />
        <SummaryItem label="Пользователей" value={stats?.totalUsers ?? 0} />
      </View>

      {stats?.perUser && stats.perUser.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Производительность сотрудников</Text>
          {stats.perUser.map((u, index) => (
            <View key={u.userId} style={styles.userRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <Text style={styles.userName}>{u.fullName}</Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${
                        stats.perUser[0].cardsCount > 0
                          ? (u.cardsCount / stats.perUser[0].cardsCount) * 100
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.count}>{u.cardsCount}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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
  periods: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  periodBtnActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  periodText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  periodTextActive: {
    color: '#fff',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1976D2',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rank: {
    width: 28,
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  userName: {
    width: 100,
    fontSize: 13,
    color: '#444',
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  bar: {
    height: 8,
    backgroundColor: '#1976D2',
    borderRadius: 4,
  },
  count: {
    width: 32,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
  },
});
