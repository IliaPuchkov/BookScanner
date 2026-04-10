import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  SectionList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BookCard } from "../../components/Card";
import { booksService } from "../../services/books.service";
import { sessionsService } from "../../services/sessions.service";
import { sessionStore } from "../../utils/sessionStore";
import type { Book, WorkSession, PaginatedResponse } from "../../types";
import type { OperatorStackParamList } from "../../navigation/OperatorNavigator";
import { useAuth } from "../../hooks/useAuth";

type Nav = NativeStackNavigationProp<OperatorStackParamList, "CardsList">;

export function CardsListScreen() {
  const navigation = useNavigation<Nav>();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [boxCounts, setBoxCounts] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const isReturningRef = useRef(false);

  const fetchActiveSession = useCallback(async () => {
    try {
      const active = await sessionsService.getActiveSession();
      if (active) sessionStore.setSession(active.id);
      setSession(active);
      return active;
    } catch {
      setSession(null);
      return null;
    }
  }, []);

  const fetchBoxCounts = useCallback(async (sessionId: string) => {
    try {
      const counts = await booksService.getBookCountsByBox(sessionId);
      const map: Record<string, number> = {};
      counts.forEach((c) => {
        map[c.boxId] = c.count;
      });
      setBoxCounts(map);
    } catch {
      // silent
    }
  }, []);

  const fetchBooks = useCallback(
    async (sessionId: string, p = 1, refresh = false) => {
      try {
        const res: PaginatedResponse<Book> = await booksService.getBooks({
          page: p,
          limit: 20,
          workSessionId: sessionId,
        });
        if (refresh || p === 1) {
          setBooks(res.data);
        } else {
          setBooks((prev) => [...prev, ...res.data]);
        }
        setHasMore(p < res.meta.totalPages);
        setTotalCount(res.meta.total);
        setPage(p);
      } catch {
        // silent
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (isReturningRef.current) {
        isReturningRef.current = false;
        return;
      }
      setLoading(true);
      fetchActiveSession().then((active) => {
        if (active) {
          fetchBooks(active.id, 1, true).finally(() => setLoading(false));
          fetchBoxCounts(active.id);
        } else {
          setBooks([]);
          setLoading(false);
        }
      });
    }, [fetchActiveSession, fetchBooks, fetchBoxCounts]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const active = await fetchActiveSession();
    if (active) {
      await fetchBooks(active.id, 1, true);
      fetchBoxCounts(active.id);
    } else {
      setBooks([]);
    }
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (hasMore && !loading && session) {
      fetchBooks(session.id, page + 1);
    }
  };

  // Group books by box number for SectionList — must be before early returns
  const sections = useMemo(() => {
    const grouped: Record<string, Book[]> = {};
    for (const book of books) {
      const key = book.box?.boxNumber ?? book.boxId;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(book);
    }
    return Object.entries(grouped)
      .map(([title, data]) => ({
        title,
        data,
        latestAt: Math.max(...data.map((b) => new Date(b.createdAt).getTime())),
      }))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [books]);

  const handleStartSession = async () => {
    setStarting(true);
    try {
      const newSession = await sessionsService.startSession();
      sessionStore.setSession(newSession.id);
      setSession(newSession);
      setBooks([]);
    } catch (err: any) {
      Alert.alert(
        "Ошибка",
        err?.response?.data?.message || "Не удалось начать сессию",
      );
    } finally {
      setStarting(false);
    }
  };

  const handleEndSession = () => {
    if (!session) return;
    Alert.alert(
      "Завершить сессию?",
      `Создано карточек: ${totalCount}. Завершить рабочую сессию?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Завершить",
          style: "destructive",
          onPress: async () => {
            try {
              await sessionsService.endSession(session.id);
              sessionStore.clear();
              setSession(null);
              setBooks([]);
            } catch (err: any) {
              Alert.alert(
                "Ошибка",
                err?.response?.data?.message || "Не удалось завершить сессию",
              );
            }
          },
        },
      ],
    );
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  // No active session
  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noSessionTitle}>Нет активной сессии</Text>
        <Text style={styles.noSessionHint}>
          Начните рабочую сессию, чтобы создавать карточки книг
        </Text>
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartSession}
          activeOpacity={0.8}
          disabled={starting}
        >
          <Text style={styles.startButtonText}>
            {starting ? "Запуск..." : "Начать рабочую сессию"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active session
  const sessionStart = new Date(session.startedAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={styles.container}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Сессия с {sessionStart}</Text>
          <Text style={styles.sessionCount}>Карточек: {totalCount}</Text>
        </View>
        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEndSession}
          activeOpacity={0.8}
        >
          <Text style={styles.endButtonText}>Завершить</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: Book }) => (
          <BookCard
            book={item}
            onPress={() => {
              isReturningRef.current = true;
              navigation.navigate("CardDetail", { bookId: item.id });
            }}
            userRole={user?.role}
          />
        )}
        renderSectionHeader={({ section }) => {
          const boxId = section.data[0]?.boxId;
          const count = boxId
            ? (boxCounts[boxId] ?? section.data.length)
            : section.data.length;
          return (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>
                📦 Коробка {section.title}
              </Text>
              <Text style={styles.sectionHeaderCount}>{count} шт.</Text>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Нет карточек в этой сессии</Text>
            <Text style={styles.emptyHint}>Нажмите + чтобы создать первую</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          navigation.navigate("CreateCard", { sessionId: session.id })
        }
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centered: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  noSessionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  noSessionHint: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: "#1976D2",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#1976D2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#BBDEFB",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1565C0",
  },
  sessionCount: {
    fontSize: 12,
    color: "#1976D2",
    marginTop: 2,
  },
  endButton: {
    backgroundColor: "#D32F2F",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  endButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  empty: {
    alignItems: "center",
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#999",
  },
  emptyHint: {
    fontSize: 14,
    color: "#bbb",
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
  },
  sectionHeaderCount: {
    fontSize: 12,
    color: "#999",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1976D2",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1976D2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "300",
    marginTop: -2,
  },
});
