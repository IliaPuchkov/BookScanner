import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { adminService } from '../../services/admin.service';
import type { StatsSummary } from '../../types';

type PeriodKey = 'day' | 'week' | 'month' | 'year' | 'custom';

const PERIOD_OPTIONS: { label: string; key: PeriodKey }[] = [
  { label: 'День', key: 'day' },
  { label: 'Неделя', key: 'week' },
  { label: 'Месяц', key: 'month' },
  { label: 'Год', key: 'year' },
  { label: 'Свой', key: 'custom' },
];

const RANK_COLORS = ['#F9A825', '#9E9E9E', '#A1887F'] as const;

function getPeriodRange(key: Exclude<PeriodKey, 'custom'>): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (key === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (key === 'week') {
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (key === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  return { dateFrom: start, dateTo: end };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function StatisticsScreen() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('day');

  const defaultCustomFrom = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };
  const [customFrom, setCustomFrom] = useState<Date>(defaultCustomFrom);
  const [customTo, setCustomTo] = useState<Date>(() => endOfDay(new Date()));
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [includeActiveSessions, setIncludeActiveSessions] = useState(false);

  const fetchStats = useCallback(async (dateFrom: Date, dateTo: Date, includeSessions = false) => {
    try {
      const data = await adminService.getStatistics(dateFrom.toISOString(), dateTo.toISOString(), includeSessions);
      setStats(data);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  const getActiveDateRange = useCallback((): { dateFrom: Date; dateTo: Date } => {
    if (selectedPeriod === 'custom') {
      return { dateFrom: customFrom, dateTo: customTo };
    }
    return getPeriodRange(selectedPeriod);
  }, [selectedPeriod, customFrom, customTo]);

  useFocusEffect(
    useCallback(() => {
      const { dateFrom, dateTo } = getActiveDateRange();
      fetchStats(dateFrom, dateTo, includeActiveSessions);
    }, [fetchStats, getActiveDateRange, includeActiveSessions]),
  );

  const handlePeriodSelect = (key: PeriodKey) => {
    setSelectedPeriod(key);
    setShowFromPicker(false);
    setShowToPicker(false);
    if (key !== 'custom') {
      const { dateFrom, dateTo } = getPeriodRange(key);
      fetchStats(dateFrom, dateTo, includeActiveSessions);
    }
  };

  const handleCustomApply = () => {
    setShowFromPicker(false);
    setShowToPicker(false);
    fetchStats(customFrom, customTo, includeActiveSessions);
  };

  const handleToggleActiveSessions = (value: boolean) => {
    setIncludeActiveSessions(value);
    const { dateFrom, dateTo } = getActiveDateRange();
    fetchStats(dateFrom, dateTo, value);
  };

  const handleFromValueChange = (_event: unknown, date: Date) => {
    const newFrom = startOfDay(date);
    setCustomFrom(newFrom);
    if (newFrom > customTo) {
      setCustomTo(endOfDay(date));
    }
  };

  const handleToValueChange = (_event: unknown, date: Date) => {
    setCustomTo(endOfDay(date));
  };

  const maxCount = stats?.perUser?.[0]?.cardsCount ?? 1;

  const periodLabel =
    selectedPeriod === 'custom'
      ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
      : (PERIOD_OPTIONS.find((o) => o.key === selectedPeriod)?.label ?? 'Период');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            const { dateFrom, dateTo } = getActiveDateRange();
            fetchStats(dateFrom, dateTo);
          }}
        />
      }
    >
      {/* Карточки */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>Карточки</Text>
        <View style={styles.statsRow}>
          <StatCell label="Всего" value={stats?.totalCards ?? 0} color="#1976D2" />
          <View style={styles.cellDivider} />
          <StatCell label="Сегодня" value={stats?.cardsToday ?? 0} color="#FB8C00" />
          <View style={styles.cellDivider} />
          <StatCell label={periodLabel} value={stats?.cardsThisWeek ?? 0} color="#43A047" />
        </View>
      </View>

      {/* Пользователи */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>Пользователи</Text>
        <View style={styles.statsRow}>
          <StatCell label="Админов" value={stats?.totalAdmins ?? 0} color="#1976D2" />
          <View style={styles.cellDivider} />
          <StatCell label="Фотографов" value={stats?.totalOperators ?? 0} color="#1976D2" />
          <View style={styles.cellDivider} />
          <StatCell label="Всего" value={stats?.totalUsers ?? 0} color="#1976D2" />
        </View>
      </View>

      {/* Производительность */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Производительность</Text>

          {/* Табы периода */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodsScroll}>
            <View style={styles.periods}>
              {PERIOD_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.periodBtn, selectedPeriod === opt.key && styles.periodBtnActive]}
                  onPress={() => handlePeriodSelect(opt.key)}
                  accessibilityLabel={`Период ${opt.label}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.periodText, selectedPeriod === opt.key && styles.periodTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Галочка незавершённых сессий */}
          <TouchableOpacity style={styles.toggleRow} onPress={() => handleToggleActiveSessions(!includeActiveSessions)} activeOpacity={0.7}>
            <Switch
              value={includeActiveSessions}
              onValueChange={handleToggleActiveSessions}
              trackColor={{ false: '#ddd', true: '#90CAF9' }}
              thumbColor={includeActiveSessions ? '#1976D2' : '#fff'}
            />
            <Text style={styles.toggleLabel}>Учитывать незавершённые сессии</Text>
          </TouchableOpacity>

          {/* Выбор дат для кастомного периода */}
          {selectedPeriod === 'custom' && (
            <View style={styles.customRow}>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setShowToPicker(false); setShowFromPicker(true); }}
              >
                <Text style={styles.dateBtnLabel}>От</Text>
                <Text style={styles.dateBtnValue}>{formatDate(customFrom)}</Text>
              </TouchableOpacity>

              <Text style={styles.dateSeparator}>—</Text>

              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => { setShowFromPicker(false); setShowToPicker(true); }}
              >
                <Text style={styles.dateBtnLabel}>До</Text>
                <Text style={styles.dateBtnValue}>{formatDate(customTo)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.applyBtn} onPress={handleCustomApply}>
                <Text style={styles.applyBtnText}>Применить</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Пикеры */}
          {showFromPicker && (
            <DateTimePicker
              value={customFrom}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={customTo}
              onValueChange={handleFromValueChange}
              onDismiss={() => setShowFromPicker(false)}
            />
          )}
          {showToPicker && (
            <DateTimePicker
              value={customTo}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={customFrom}
              maximumDate={new Date()}
              onValueChange={handleToValueChange}
              onDismiss={() => setShowToPicker(false)}
            />
          )}
        </View>

        {stats?.perUser && stats.perUser.length > 0 ? (
          <>
            <View style={styles.barScaleRow}>
              <Text style={styles.barScaleLabel}>0</Text>
              <Text style={styles.barScaleLabel}>макс. {maxCount}</Text>
            </View>
            {stats.perUser.map((u, index) => {
              const rankColor = index < 3 ? RANK_COLORS[index] : '#bbb';
              const isTopThree = index < 3;
              return (
                <View key={u.userId} style={styles.userRow}>
                  <Text style={[styles.rank, { color: rankColor, fontSize: isTopThree ? 14 : 13 }]}>
                    #{index + 1}
                  </Text>
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, isTopThree && { color: '#111' }]} numberOfLines={1}>
                      {u.fullName}
                    </Text>
                    <View style={styles.barContainer}>
                      {/* Завершённые карточки */}
                      <View
                        style={[
                          styles.bar,
                          { width: `${maxCount > 0 ? (u.completedCardsCount / maxCount) * 100 : 0}%` },
                          isTopThree && { backgroundColor: rankColor },
                        ]}
                      />
                      {/* Карточки из активных сессий */}
                      {includeActiveSessions && u.activeCardsCount > 0 && (
                        <View
                          style={[
                            styles.bar,
                            styles.barActive,
                            { width: `${maxCount > 0 ? (u.activeCardsCount / maxCount) * 100 : 0}%` },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={[styles.countText, isTopThree && { color: rankColor }]}>
                      {u.completedCardsCount}
                    </Text>
                    {includeActiveSessions && u.activeCardsCount > 0 && (
                      <Text style={styles.countTextActive}>+{u.activeCardsCount}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <Text style={styles.emptyText}>Нет данных за период</Text>
        )}
      </View>
    </ScrollView>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
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
  periodsScroll: {
    flexGrow: 0,
  },
  periods: {
    flexDirection: 'row',
    gap: 8,
  },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
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
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  dateBtn: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateBtnLabel: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 2,
  },
  dateBtnValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#222',
  },
  dateSeparator: {
    fontSize: 16,
    color: '#bbb',
  },
  applyBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  applyBtnText: {
    fontSize: 13,
    fontWeight: '600',
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
  },
  sectionHeader: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 14,
  },
  barScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barScaleLabel: {
    fontSize: 11,
    color: '#bbb',
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
    textAlign: 'center',
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
    flexDirection: 'row',
    overflow: 'hidden',
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
  barActive: {
    height: 6,
    backgroundColor: '#FB8C00',
  },
  countTextActive: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FB8C00',
    textAlign: 'right',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
});
