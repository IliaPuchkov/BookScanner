import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { AppText } from '../../components/AppText';
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService } from "../../services/admin.service";
import type { StatsSummary, Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { NativeBottomTabBarProps } from "@react-navigation/bottom-tabs/unstable";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Dashboard">;
type TabsNav = NativeBottomTabBarProps;

export function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = useNavigation<TabsNav["navigation"]>();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [ocrErrorsCount, setOcrErrorsCount] = useState(0);
  const [ozonErrorsCount, setOzonErrorsCount] = useState(0);
  const [underpricedCount, setUnderpricedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, booksData] = await Promise.all([
        adminService.getStatistics(
          (() => { const d = new Date(); const diff = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d.toISOString(); })(),
          (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); })(),
        ),
        adminService.getBookDatabase(1, 4),
      ]);
      setStats(statsData);
      setRecentBooks(booksData.data);
      setPendingCount(statsData.pendingReviewCount ?? 0);
      setDuplicatesCount(statsData.duplicatesCount ?? 0);
      setOcrErrorsCount(statsData.ocrErrorsCount ?? 0);
      setOzonErrorsCount(statsData.ozonErrorsCount ?? 0);
      setUnderpricedCount(statsData.underpricedCount ?? 0);
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

  const errorsCount = ocrErrorsCount + ozonErrorsCount;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* 2×2 Alert Grid */}
      <View style={styles.grid}>
        {/* Cell 1: Карточки на проверке */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardRed]}
          activeOpacity={0.75}
          onPress={() => tabsNavigation.navigate("CardCreationTab")}
        >
          <AppText style={styles.gridCardTitle}>На проверке</AppText>
          <AppText style={[styles.gridCardCount, { color: "#E53935" }]}>
            {pendingCount}
          </AppText>
        </TouchableOpacity>

        {/* Cell 2: Дубли */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardTeal]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Duplicates")}
        >
          <AppText style={styles.gridCardTitle}>Дубли</AppText>
          <AppText style={[styles.gridCardCount, { color: "#00838F" }]}>
            {duplicatesCount}
          </AppText>
        </TouchableOpacity>

        {/* Cell 3: Заниженная цена */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardAmber]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Underpriced")}
        >
          <AppText style={styles.gridCardTitle}>Редкие книги</AppText>
          <AppText style={[styles.gridCardCount, { color: "#F57F17" }]}>
            {underpricedCount}
          </AppText>
        </TouchableOpacity>

        {/* Cell 4: Ошибки */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardOrangeRed]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Errors")}
        >
          <AppText style={styles.gridCardTitle}>Ошибки</AppText>
          <AppText style={[styles.gridCardCount, { color: "#BF360C" }]}>
            {errorsCount}
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Statistics */}
      <TouchableOpacity
        style={[styles.wideCard, styles.cardOrange]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate("Statistics")}
      >
        <View style={styles.wideCardHeader}>
          <AppText style={styles.wideCardTitle}>Статистика</AppText>
          <AppText style={styles.cardArrow}>›</AppText>
        </View>

        {/* Количество карточек */}
        <AppText style={styles.subSectionTitle}>Карточки</AppText>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#1976D2" }]}>
              {stats?.totalCards?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>Всего</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#FB8C00" }]}>
              {stats?.cardsToday?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>Сегодня</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#FB8C00" }]}>
              {stats?.cardsThisWeek?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>За неделю</AppText>
          </View>
        </View>

        {/* Пользователи */}
        <View style={styles.sectionDivider} />
        <AppText style={styles.subSectionTitle}>Пользователи</AppText>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalAdmins?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>Админов</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalOperators?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>Фотографов</AppText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <AppText style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalUsers?.toString() ?? "—"}
            </AppText>
            <AppText style={styles.statLabel}>Всего</AppText>
          </View>
        </View>

        {/* Производительность */}
        {stats?.perUser && stats.perUser.length > 0 && (
          <>
            <View style={styles.sectionDivider} />
            <AppText style={styles.subSectionTitle}>Производительность</AppText>
            {stats.perUser.slice(0, 3).map((u, i) => (
              <View key={u.userId} style={styles.perfRow}>
                <AppText style={styles.perfRank}>#{i + 1}</AppText>
                <AppText style={styles.perfName} numberOfLines={1}>
                  {u.fullName}
                </AppText>
                <AppText style={styles.perfCount}>{u.cardsCount}</AppText>
              </View>
            ))}
          </>
        )}
      </TouchableOpacity>

      {/* Book Database */}
      <TouchableOpacity
        style={[styles.wideCard, styles.cardPurple]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate("BookDatabase")}
      >
        <View style={styles.wideCardHeader}>
          <AppText style={styles.wideCardTitle}>База книг</AppText>
          <AppText style={styles.cardArrow}>›</AppText>
        </View>
        {recentBooks.length === 0 ? (
          <AppText style={styles.emptyBooks}>Нет книг</AppText>
        ) : (
          recentBooks.map((book) => (
            <View key={book.id} style={styles.bookRow}>
              <AppText style={styles.bookTitle} numberOfLines={1}>
                {book.title}
              </AppText>
              {book.author ? (
                <AppText style={styles.bookAuthor} numberOfLines={1}>
                  {book.author}
                </AppText>
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
    backgroundColor: "#F5F5F5",
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gridCard: {
    width: "47.5%",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    minHeight: 100,
    justifyContent: "space-between",
  },
  gridCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  gridCardCount: {
    fontSize: 36,
    fontWeight: "800",
    marginTop: 4,
  },
  cardRed: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#E53935",
  },
  cardTeal: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#00838F",
  },
  cardAmber: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#F57F17",
  },
  cardOrangeRed: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#BF360C",
  },
  cardOrange: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#FB8C00",
  },
  cardPurple: {
    backgroundColor: "#fff",
    borderLeftWidth: 4,
    borderLeftColor: "#8E24AA",
  },
  cardArrow: {
    position: "absolute",
    top: 14,
    right: 14,
    fontSize: 22,
    color: "rgba(0,0,0,0.15)",
    fontWeight: "300",
  },
  wideCard: {
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  wideCardHeader: {
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  wideCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#eee",
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginVertical: 14,
  },
  perfRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  perfRank: {
    width: 28,
    fontSize: 13,
    color: "#999",
    fontWeight: "600",
  },
  perfName: {
    flex: 1,
    fontSize: 14,
    color: "#444",
  },
  perfCount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1976D2",
    marginLeft: 8,
  },
  bookRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  bookAuthor: {
    fontSize: 12,
    color: "#999",
    marginTop: 1,
  },
  emptyBooks: {
    fontSize: 14,
    color: "#bbb",
    textAlign: "center",
    paddingVertical: 8,
  },
});
