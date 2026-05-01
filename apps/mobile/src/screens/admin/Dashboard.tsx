import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
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
          <Text style={styles.gridCardTitle}>На проверке</Text>
          <Text style={[styles.gridCardCount, { color: "#E53935" }]}>
            {pendingCount}
          </Text>
        </TouchableOpacity>

        {/* Cell 2: Дубли */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardTeal]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Duplicates")}
        >
          <Text style={styles.gridCardTitle}>Дубли</Text>
          <Text style={[styles.gridCardCount, { color: "#00838F" }]}>
            {duplicatesCount}
          </Text>
        </TouchableOpacity>

        {/* Cell 3: Заниженная цена */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardAmber]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Underpriced")}
        >
          <Text style={styles.gridCardTitle}>Редкие книги</Text>
          <Text style={[styles.gridCardCount, { color: "#F57F17" }]}>
            {underpricedCount}
          </Text>
        </TouchableOpacity>

        {/* Cell 4: Ошибки */}
        <TouchableOpacity
          style={[styles.gridCard, styles.cardOrangeRed]}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("Errors")}
        >
          <Text style={styles.gridCardTitle}>Ошибки</Text>
          <Text style={[styles.gridCardCount, { color: "#BF360C" }]}>
            {errorsCount}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Statistics */}
      <TouchableOpacity
        style={[styles.wideCard, styles.cardOrange]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate("Statistics")}
      >
        <View style={styles.wideCardHeader}>
          <Text style={styles.wideCardTitle}>Статистика</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>

        {/* Количество карточек */}
        <Text style={styles.subSectionTitle}>Карточки</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#1976D2" }]}>
              {stats?.totalCards?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Всего</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#FB8C00" }]}>
              {stats?.cardsToday?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Сегодня</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#FB8C00" }]}>
              {stats?.cardsThisWeek?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>За неделю</Text>
          </View>
        </View>

        {/* Пользователи */}
        <View style={styles.sectionDivider} />
        <Text style={styles.subSectionTitle}>Пользователи</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalAdmins?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Админов</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalOperators?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Фотографов</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#43A047" }]}>
              {stats?.totalUsers?.toString() ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Всего</Text>
          </View>
        </View>

        {/* Производительность */}
        {stats?.perUser && stats.perUser.length > 0 && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.subSectionTitle}>Производительность</Text>
            {stats.perUser.slice(0, 3).map((u, i) => (
              <View key={u.userId} style={styles.perfRow}>
                <Text style={styles.perfRank}>#{i + 1}</Text>
                <Text style={styles.perfName} numberOfLines={1}>
                  {u.fullName}
                </Text>
                <Text style={styles.perfCount}>{u.cardsCount}</Text>
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
