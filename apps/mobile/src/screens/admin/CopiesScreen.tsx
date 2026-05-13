import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { BookStatus } from "../../types";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Copies">;

type StatusFilter = "all" | "published" | "not_published";

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <AppText style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

type BookItemProps = {
  item: Book;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
};

const BookItem = React.memo(function BookItem({
  item,
  onNavigate,
  onDelete,
  deleting,
}: BookItemProps) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  const isPublished =
    item.status === BookStatus.PUBLISHED ||
    item.ozonProduct?.status === "published" ||
    item.ozonProduct?.status === "PUBLISHED";

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => onNavigate(item.id)}
    >
      <View style={styles.cardRow}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto.fileUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <AppText style={styles.thumbPlaceholderText}>Нет фото</AppText>
          </View>
        )}
        <View style={styles.cardInfo}>
          <AppText style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </AppText>
          {item.author ? (
            <AppText style={styles.cardAuthor} numberOfLines={1}>
              {item.author}
            </AppText>
          ) : null}
          <AppText style={styles.cardSku}>{item.sku}</AppText>
          <View style={styles.cardMeta}>
            {item.box?.boxNumber ? (
              <AppText style={styles.metaChip}>
                Коробка: {item.box.boxNumber}
              </AppText>
            ) : null}
            {item.createdBy?.fullName ? (
              <AppText style={styles.metaChip} numberOfLines={1}>
                {item.createdBy.fullName}
              </AppText>
            ) : null}
          </View>
          <View style={styles.cardFooter}>
            {item.price != null && Number(item.price) > 0 ? (
              <AppText style={styles.cardPrice}>
                {Number(item.price).toFixed(0)} ₽
              </AppText>
            ) : null}
            <View
              style={[
                styles.statusBadge,
                isPublished ? styles.statusPublished : styles.statusPending,
              ]}
            >
              <AppText
                style={[
                  styles.statusText,
                  isPublished
                    ? styles.statusTextPublished
                    : styles.statusTextPending,
                ]}
              >
                {isPublished ? "На Ozon" : "Не опубликована"}
              </AppText>
            </View>
          </View>
        </View>
      </View>
      {!isPublished && (
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={() => onDelete(item)}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppText style={styles.deleteBtnText}>Удалить</AppText>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

const PAGE_SIZE = 20;

export function CopiesScreen() {
  const navigation = useNavigation<Nav>();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const activeFilters = useRef<{
    status?: "published" | "not_published";
    search?: string;
  }>({});

  const fetchData = useCallback(
    async (
      filters: { status?: "published" | "not_published"; search?: string },
      pageNum = 1,
      isRefresh = false,
    ) => {
      activeFilters.current = filters;
      try {
        const res = await adminService.getCopies(pageNum, PAGE_SIZE, filters);
        setBooks(isRefresh || pageNum === 1 ? res.data : (prev) => [...prev, ...res.data]);
        setPage(pageNum);
        setTotal(res.meta.total);
        setHasMore(pageNum < res.meta.totalPages);
      } catch {
        // silent
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const filters = {
        status: statusFilter !== "all" ? (statusFilter as "published" | "not_published") : undefined,
        search: search.trim() || undefined,
      };
      fetchData(filters, 1, true);
    }, [fetchData, statusFilter, search]),
  );

  const applyFilters = useCallback(
    (newStatus: StatusFilter, newSearch: string) => {
      setBooks([]);
      setLoading(true);
      fetchData(
        {
          status: newStatus !== "all" ? (newStatus as "published" | "not_published") : undefined,
          search: newSearch.trim() || undefined,
        },
        1,
        true,
      );
    },
    [fetchData],
  );

  const handleStatusChange = useCallback(
    (s: StatusFilter) => {
      setStatusFilter(s);
      applyFilters(s, search);
    },
    [applyFilters, search],
  );

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        applyFilters(statusFilter, text);
      }, 400);
    },
    [applyFilters, statusFilter],
  );

  const handleDelete = useCallback(
    (book: Book) => {
      Alert.alert(
        "Удалить карточку?",
        `"${book.title}" будет удалена безвозвратно.`,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Удалить",
            style: "destructive",
            onPress: async () => {
              setDeletingId(book.id);
              try {
                await booksService.deleteBook(book.id);
                setBooks((prev) => prev.filter((b) => b.id !== book.id));
                setTotal((t) => t - 1);
              } catch {
                Alert.alert("Ошибка", "Не удалось удалить карточку");
              } finally {
                setDeletingId(null);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchData(activeFilters.current, page + 1);
  }, [loadingMore, hasMore, loading, page, fetchData]);

  const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
    { label: "Все", value: "all" },
    { label: "На Ozon", value: "published" },
    { label: "Не опубликованы", value: "not_published" },
  ];

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filterPanel}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Поиск по названию, автору, ISBN..."
          placeholderTextColor="#bbb"
          clearButtonMode="while-editing"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          {STATUS_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={statusFilter === opt.value}
              onPress={() => handleStatusChange(opt.value)}
            />
          ))}
        </ScrollView>
        <AppText style={styles.totalLabel}>{total} книг</AppText>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookItem
              item={item}
              onNavigate={(id) =>
                navigation.navigate("ProductDetail", { bookId: id, editable: true })
              }
              onDelete={handleDelete}
              deleting={deletingId === item.id}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData(activeFilters.current, 1, true);
              }}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#1976D2" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyIcon}>📋</AppText>
              <AppText style={styles.emptyText}>Копий не найдено</AppText>
            </View>
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
  filterPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  searchInput: {
    height: 38,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#1976D2",
    borderColor: "#1976D2",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  chipTextActive: {
    color: "#fff",
  },
  totalLabel: {
    fontSize: 12,
    color: "#aaa",
    textAlign: "right",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 12,
    gap: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#90A4AE",
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
  },
  thumb: {
    width: 70,
    aspectRatio: 0.7,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    fontSize: 10,
    color: "#ccc",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  cardAuthor: {
    fontSize: 13,
    color: "#666",
  },
  cardSku: {
    fontSize: 11,
    color: "#bbb",
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  metaChip: {
    fontSize: 11,
    color: "#888",
    backgroundColor: "#F5F5F5",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1976D2",
  },
  statusBadge: {
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPublished: {
    backgroundColor: "#E8F5E9",
  },
  statusPending: {
    backgroundColor: "#FFF3E0",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusTextPublished: {
    color: "#2E7D32",
  },
  statusTextPending: {
    color: "#E65100",
  },
  deleteBtn: {
    marginTop: 10,
    backgroundColor: "#E53935",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    marginTop: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
});
