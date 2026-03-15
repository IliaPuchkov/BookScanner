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

  const maxCount = stats?.perUser?.[0]?.cardsCount ?? 1;

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
      {/* Period selector */}
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

      {/* Карточки */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Карточки</Text>
        <View style={styles.statsRow}>
          <StatCell label="Всего" value={stats?.totalCards ?? 0} color="#1976D2" />
          <View style={styles.cellDivider} />
          <StatCell label="Сегодня" value={stats?.cardsToday ?? 0} color="#FB8C00" />
          <View style={styles.cellDivider} />
          <StatCell
            label={`За ${selectedDays} дн.`}
            value={stats?.cardsThisWeek ?? 0}
            color="#FB8C00"
          />
        </View>
      </View>

      {/* Пользователи */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Пользователи</Text>
        <View style={styles.statsRow}>
          <StatCell label="Всего" value={stats?.totalUsers ?? 0} color="#43A047" />
        </View>
      </View>

      {/* Производительность сотрудников */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Производительность сотрудников</Text>
        <Text style={styles.periodHint}>За выбранный период</Text>
        {stats?.perUser && stats.perUser.length > 0 ? (
          stats.perUser.map((u, index) => (
            <View key={u.userId} style={styles.userRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {u.fullName}
                </Text>
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      {
                        width: `${maxCount > 0 ? (u.cardsCount / maxCount) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{u.cardsCount}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Нет данных за период</Text>
        )}
      </View>
    </ScrollView>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    gap: 12,
  },
  periods: {
    flexDirection: 'row',
    gap: 8,
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
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 14,
  },
  periodHint: {
    fontSize: 12,
    color: '#aaa',
    marginTop: -10,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 3,
  },
  cellDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#f0f0f0',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f5f5f5',
  },
  rank: {
    width: 32,
    fontSize: 13,
    color: '#bbb',
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  barContainer: {
    height: 6,
    backgroundColor: '#E3F2FD',
    borderRadius: 3,
  },
  bar: {
    height: 6,
    backgroundColor: '#1976D2',
    borderRadius: 3,
  },
  countBadge: {
    marginLeft: 12,
    minWidth: 36,
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1976D2',
  },
  emptyText: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
