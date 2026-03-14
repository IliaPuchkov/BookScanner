import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/admin.service';
import type { StatsSummary, Book } from '../../types';
import type { AdminMainStackParamList } from '../../navigation/AdminNavigator';

type Nav = NativeStackNavigationProp<AdminMainStackParamList, 'Dashboard'>;

export function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, booksData] = await Promise.all([
        adminService.getStatistics(7),
        adminService.getBookDatabase(1, 4),
      ]);
      setStats(statsData);
      setRecentBooks(booksData.data);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Row 1: Cards + Users */}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.card, styles.cardBlue]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('CardsList')}
        >
          <Text style={styles.cardValue}>
            {stats?.totalCards?.toString() ?? '—'}
          </Text>
          <Text style={styles.cardLabel}>Всего карточек</Text>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardGreen]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate('UserManagement')}
        >
          <Text style={styles.cardValue}>
            {stats?.totalUsers?.toString() ?? '—'}
          </Text>
          <Text style={styles.cardLabel}>Пользователи</Text>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Row 2: Statistics */}
      <TouchableOpacity
        style={[styles.wideCard, styles.cardOrange]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('Statistics')}
      >
        <View style={styles.wideCardHeader}>
          <Text style={styles.wideCardTitle}>Статистика</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#FB8C00' }]}>
              {stats?.cardsToday?.toString() ?? '—'}
            </Text>
            <Text style={styles.statLabel}>Сегодня</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#FB8C00' }]}>
              {stats?.cardsThisWeek?.toString() ?? '—'}
            </Text>
            <Text style={styles.statLabel}>За неделю</Text>
          </View>
          {stats?.perUser && stats.perUser.length > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#FB8C00' }]}>
                  {stats.perUser[0].cardsCount}
                </Text>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {stats.perUser[0].fullName.split(' ')[0]}
                </Text>
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>

      {/* Row 3: Book Database */}
      <TouchableOpacity
        style={[styles.wideCard, styles.cardPurple]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('BookDatabase')}
      >
        <View style={styles.wideCardHeader}>
          <Text style={styles.wideCardTitle}>База книг</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
        {recentBooks.length === 0 ? (
          <Text style={styles.emptyBooks}>Нет книг</Text>
        ) : (
          recentBooks.map((book) => (
            <View key={book.id} style={styles.bookRow}>
              <Text style={styles.bookTitle} numberOfLines={1}>
                {book.title}
              </Text>
              {book.author ? (
                <Text style={styles.bookAuthor} numberOfLines={1}>
                  {book.author}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </TouchableOpacity>
    </ScrollView>
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardBlue: {
    backgroundColor: '#1976D2',
  },
  cardGreen: {
    backgroundColor: '#43A047',
  },
  cardValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
  },
  cardLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  cardArrow: {
    position: 'absolute',
    top: 14,
    right: 14,
    fontSize: 22,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '300',
  },
  wideCard: {
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardOrange: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#FB8C00',
  },
  cardPurple: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#8E24AA',
  },
  wideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  wideCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#eee',
  },
  bookRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  emptyBooks: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
