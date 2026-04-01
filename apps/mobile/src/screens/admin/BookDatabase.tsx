import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Input } from "../../components/Input";
import { BookCard } from "../../components/Card";
import { adminService } from "../../services/admin.service";
import { boxesService } from "../../services/boxes.service";
import { BookStatus } from "../../types";
import type { Book, Box, User } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList>;
type Route = RouteProp<AdminMainStackParamList, "BookDatabase">;

interface Filters {
  boxId?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export function BookDatabaseScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state
  const initialStatus = route.params?.filterStatus;
  const [showFilters, setShowFilters] = useState(!!initialStatus);
  const [filters, setFilters] = useState<Filters>(
    initialStatus ? { status: initialStatus } : {},
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter options
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string }>>(
    [],
  );

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);

  // Load filter options once
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [boxesRes, usersRes] = await Promise.all([
          boxesService.getBoxes(1, 100),
          adminService.getUsers(1, 100),
        ]);
        setBoxes(boxesRes.data);
        setUsers(
          usersRes.data.map((u: User) => ({ id: u.id, fullName: u.fullName })),
        );
      } catch {
        // silent
      }
    };
    loadOptions();
  }, []);

  const fetchBooks = useCallback(
    async (
      p: number,
      query: string,
      currentFilters: Filters,
      mode: "initial" | "refresh" | "more",
    ) => {
      const fetchId = ++fetchIdRef.current;

      if (mode === "initial") setLoading(true);
      if (mode === "more") setLoadingMore(true);

      try {
        const params: Filters = {};
        if (currentFilters.boxId) params.boxId = currentFilters.boxId;
        if (currentFilters.createdById)
          params.createdById = currentFilters.createdById;
        if (currentFilters.dateFrom) params.dateFrom = currentFilters.dateFrom;
        if (currentFilters.dateTo) params.dateTo = currentFilters.dateTo;
        if (currentFilters.status) params.status = currentFilters.status;

        const res = await adminService.getBookDatabase(
          p,
          20,
          query || undefined,
          Object.keys(params).length > 0 ? params : undefined,
        );

        if (fetchId !== fetchIdRef.current) return;

        if (mode === "more") {
          setBooks((prev) => [...prev, ...res.data]);
        } else {
          setBooks(res.data);
        }
        setHasMore(p < res.meta.totalPages);
        setPage(p);
      } catch (e) {
        if (fetchId !== fetchIdRef.current) return;
        console.error("BookDatabase fetch error:", e);
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Load on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchBooks(1, search, filters, "initial");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchBooks]),
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchBooks(1, text, filters, "initial");
    }, 400);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBooks(1, search, filters, "refresh");
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore && !loading) {
      fetchBooks(page + 1, search, filters, "more");
    }
  };

  const applyFilters = () => {
    const newFilters: Filters = { ...filters };
    if (dateFrom) newFilters.dateFrom = dateFrom;
    else delete newFilters.dateFrom;
    if (dateTo) newFilters.dateTo = dateTo;
    else delete newFilters.dateTo;
    if (!newFilters.status) delete newFilters.status;
    setFilters(newFilters);
    setShowFilters(false);
    fetchBooks(1, search, newFilters, "initial");
  };

  const resetFilters = () => {
    const empty: Filters = {};
    setFilters(empty);
    setDateFrom("");
    setDateTo("");
    setShowFilters(false);
    fetchBooks(1, search, empty, "initial");
  };

  const activeFilterCount =
    (filters.boxId ? 1 : 0) +
    (filters.createdById ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.status ? 1 : 0);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Input
          label=""
          placeholder="Поиск по названию, автору, ISBN..."
          value={search}
          onChangeText={handleSearch}
          style={{ marginBottom: 0 }}
        />
        <TouchableOpacity
          style={[
            styles.filterBtn,
            activeFilterCount > 0 && styles.filterBtnActive,
          ]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Text
            style={[
              styles.filterBtnText,
              activeFilterCount > 0 && styles.filterBtnTextActive,
            ]}
          >
            Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter panel */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Status filter */}
          <Text style={styles.filterLabel}>Статус</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            <TouchableOpacity
              style={[styles.chip, !filters.status && styles.chipActive]}
              onPress={() => setFilters((f) => ({ ...f, status: undefined }))}
            >
              <Text
                style={[
                  styles.chipText,
                  !filters.status && styles.chipTextActive,
                ]}
              >
                Все
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                filters.status === BookStatus.PENDING_REVIEW &&
                  styles.chipActive,
              ]}
              onPress={() =>
                setFilters((f) => ({ ...f, status: BookStatus.PENDING_REVIEW }))
              }
            >
              <Text
                style={[
                  styles.chipText,
                  filters.status === BookStatus.PENDING_REVIEW &&
                    styles.chipTextActive,
                ]}
              >
                Ожидает проверки администратора
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                filters.status === BookStatus.PUBLISHED && styles.chipActive,
              ]}
              onPress={() =>
                setFilters((f) => ({ ...f, status: BookStatus.PUBLISHED }))
              }
            >
              <Text
                style={[
                  styles.chipText,
                  filters.status === BookStatus.PUBLISHED &&
                    styles.chipTextActive,
                ]}
              >
                Загружено в Ozon
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Box filter */}
          <Text style={styles.filterLabel}>Коробка</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            <TouchableOpacity
              style={[styles.chip, !filters.boxId && styles.chipActive]}
              onPress={() => setFilters((f) => ({ ...f, boxId: undefined }))}
            >
              <Text
                style={[
                  styles.chipText,
                  !filters.boxId && styles.chipTextActive,
                ]}
              >
                Все
              </Text>
            </TouchableOpacity>
            {boxes.map((box) => (
              <TouchableOpacity
                key={box.id}
                style={[
                  styles.chip,
                  filters.boxId === box.id && styles.chipActive,
                ]}
                onPress={() => setFilters((f) => ({ ...f, boxId: box.id }))}
              >
                <Text
                  style={[
                    styles.chipText,
                    filters.boxId === box.id && styles.chipTextActive,
                  ]}
                >
                  {box.boxNumber}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Operator filter */}
          <Text style={styles.filterLabel}>Оператор</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            <TouchableOpacity
              style={[styles.chip, !filters.createdById && styles.chipActive]}
              onPress={() =>
                setFilters((f) => ({ ...f, createdById: undefined }))
              }
            >
              <Text
                style={[
                  styles.chipText,
                  !filters.createdById && styles.chipTextActive,
                ]}
              >
                Все
              </Text>
            </TouchableOpacity>
            {users.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.chip,
                  filters.createdById === user.id && styles.chipActive,
                ]}
                onPress={() =>
                  setFilters((f) => ({ ...f, createdById: user.id }))
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    filters.createdById === user.id && styles.chipTextActive,
                  ]}
                >
                  {user.fullName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Date range */}
          <Text style={styles.filterLabel}>Период создания</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Input
                label=""
                placeholder="с (ГГГГ-ММ-ДД)"
                value={dateFrom}
                onChangeText={setDateFrom}
                style={{ marginBottom: 0 }}
              />
            </View>
            <Text style={styles.dateSep}>—</Text>
            <View style={{ flex: 1 }}>
              <Input
                label=""
                placeholder="по (ГГГГ-ММ-ДД)"
                value={dateTo}
                onChangeText={setDateTo}
                style={{ marginBottom: 0 }}
              />
            </View>
          </View>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
              <Text style={styles.resetBtnText}>Сбросить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
              <Text style={styles.applyBtnText}>Применить</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              onPress={() =>
                navigation.navigate("ProductDetail", { bookId: item.id })
              }
              userRole="admin"
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<Text style={styles.empty}>Нет результатов</Text>}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color="#1976D2"
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  searchBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  filterBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 6,
  },
  filterBtnActive: {
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  filterBtnText: {
    fontSize: 13,
    color: "#666",
  },
  filterBtnTextActive: {
    color: "#1976D2",
    fontWeight: "600",
  },
  filterPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginTop: 10,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 6,
    backgroundColor: "#fafafa",
  },
  chipActive: {
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  chipText: {
    fontSize: 12,
    color: "#666",
  },
  chipTextActive: {
    color: "#1976D2",
    fontWeight: "600",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateSep: {
    fontSize: 16,
    color: "#999",
    marginTop: -16,
  },
  filterActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 10,
  },
  resetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  resetBtnText: {
    fontSize: 13,
    color: "#666",
  },
  applyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#1976D2",
  },
  applyBtnText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  list: {
    padding: 16,
  },
  empty: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
