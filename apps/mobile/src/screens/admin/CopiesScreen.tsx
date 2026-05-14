import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { BookStatus } from "../../types";
import type { Book, CopyGroup } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Copies">;
type StatusFilter = "all" | "published" | "not_published" | "archived";

// ─── Filter chip ──────────────────────────────────────────────────────────────

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

// ─── Book mini-card inside a group ────────────────────────────────────────────

function BookMiniCard({
  book,
  onNavigate,
  onDelete,
  deleting,
  stores,
}: {
  book: Book;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
  stores: OzonStore[];
}) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);
  const isPublished =
    book.status === BookStatus.PUBLISHED ||
    book.ozonProduct?.status === "published" ||
    book.ozonProduct?.status === "PUBLISHED";
  const isArchived = book.status === BookStatus.ARCHIVED;
  const storeName = isPublished && book.ozonProduct?.storeId
    ? stores.find((s) => s.id === book.ozonProduct!.storeId)?.name ?? "На Ozon"
    : null;

  return (
    <View style={styles.miniCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onNavigate(book.id)}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto.fileUrl }} style={styles.miniImage} />
        ) : (
          <View style={[styles.miniImage, styles.miniPlaceholder]}>
            <AppText style={styles.miniPlaceholderText}>Нет фото</AppText>
          </View>
        )}
        <AppText style={styles.miniTitle} numberOfLines={2}>
          {book.title}
        </AppText>
        {book.author ? (
          <AppText style={styles.miniAuthor} numberOfLines={1}>
            {book.author}
          </AppText>
        ) : null}
        <AppText style={styles.miniSku}>{book.sku}</AppText>
        {book.price != null && Number(book.price) > 0 ? (
          <AppText style={styles.miniPrice}>
            {Number(book.price).toFixed(0)} ₽
          </AppText>
        ) : null}
        {book.box?.boxNumber ? (
          <AppText style={styles.miniBox}>Кор. {book.box.boxNumber}</AppText>
        ) : null}
        {isPublished ? (
          <View style={styles.publishedGroup}>
            <View style={styles.statusBadge}>
              <AppText style={styles.statusPublishedText}>Опубликована на Ozon</AppText>
            </View>
            {storeName ? (
              <View style={[styles.statusBadge, styles.storeBadge]}>
                <AppText style={styles.storeBadgeText} numberOfLines={1}>
                  {storeName}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : isArchived ? (
          <View style={[styles.statusBadge, styles.statusArchived, styles.statusBadgeMt]}>
            <AppText style={styles.statusArchivedText}>В архиве</AppText>
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.statusPending, styles.statusBadgeMt]}>
            <AppText style={styles.statusPendingText}>Не загружена</AppText>
          </View>
        )}
      </TouchableOpacity>
      {!isPublished && !isArchived && (
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={() => onDelete(book)}
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
    </View>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function CopyGroupCard({
  group,
  onNavigate,
  onDelete,
  onUnmark,
  deletingId,
  unmarking,
  stores,
}: {
  group: CopyGroup;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  onUnmark: (group: CopyGroup) => void;
  deletingId: string | null;
  unmarking: boolean;
  stores: OzonStore[];
}) {
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={styles.groupTypeBadge}>
          <AppText style={styles.groupTypeBadgeText}>
            {group.type === "isbn" ? "ISBN" : "Название"}
          </AppText>
        </View>
        <AppText style={styles.groupKey} numberOfLines={1}>
          {group.type === "isbn" ? group.key : group.key}
        </AppText>
        <AppText style={styles.groupCount}>{group.books.length} шт.</AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.booksScroll}
        contentContainerStyle={styles.booksScrollContent}
      >
        {group.books.map((book) => (
          <BookMiniCard
            key={book.id}
            book={book}
            onNavigate={onNavigate}
            onDelete={onDelete}
            deleting={deletingId === book.id}
            stores={stores}
          />
        ))}
      </ScrollView>
      <TouchableOpacity
        style={[styles.unmarkBtn, unmarking && styles.unmarkBtnDisabled]}
        onPress={() => onUnmark(group)}
        disabled={unmarking}
        activeOpacity={0.7}
      >
        {unmarking ? (
          <ActivityIndicator size="small" color="#546E7A" />
        ) : (
          <AppText style={styles.unmarkBtnText}>Вернуть на проверку</AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export function CopiesScreen() {
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<CopyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unmarkingKey, setUnmarkingKey] = useState<string | null>(null);
  const [stores, setStores] = useState<OzonStore[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const activeFilters = useRef<{
    status?: "published" | "not_published" | "archived";
    search?: string;
  }>({});

  const fetchData = useCallback(
    async (
      filters: { status?: "published" | "not_published" | "archived"; search?: string },
      pageNum = 1,
      isRefresh = false,
    ) => {
      activeFilters.current = filters;
      try {
        const storesPromise =
          pageNum === 1
            ? adminService.getOzonStores().catch(() => ({ stores: [] as OzonStore[] }))
            : Promise.resolve(null);
        const [res, storesRes] = await Promise.all([
          adminService.getCopyGroups(pageNum, PAGE_SIZE, filters),
          storesPromise,
        ]);
        if (storesRes) setStores((storesRes as { stores: OzonStore[] }).stores);
        setGroups(
          isRefresh || pageNum === 1
            ? res.groups
            : (prev) => [...prev, ...res.groups],
        );
        setPage(pageNum);
        setTotal(res.total);
        setHasMore(pageNum < res.totalPages);
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
      fetchData(activeFilters.current, 1, true);
    }, [fetchData]),
  );

  const applyFilters = useCallback(
    (newStatus: StatusFilter, newSearch: string) => {
      const filters = {
        status:
          newStatus !== "all"
            ? (newStatus as "published" | "not_published" | "archived")
            : undefined,
        search: newSearch.trim() || undefined,
      };
      setGroups([]);
      setLoading(true);
      fetchData(filters, 1, true);
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

  const handleDelete = useCallback((book: Book) => {
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
              setGroups((prev) =>
                prev
                  .map((g) => ({
                    ...g,
                    books: g.books.filter((b) => b.id !== book.id),
                  }))
                  .filter((g) => g.books.length >= 2),
              );
              setTotal((t) => Math.max(0, t - 1));
            } catch {
              Alert.alert("Ошибка", "Не удалось удалить карточку");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const handleUnmarkGroup = useCallback((group: CopyGroup) => {
    Alert.alert(
      "Вернуть на проверку?",
      "Все книги группы будут возвращены в очередь дубликатов.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          onPress: async () => {
            const groupKey = `${group.type}:${group.key}`;
            setUnmarkingKey(groupKey);
            try {
              const bookIds = group.books.map((b) => b.id);
              await adminService.unmarkCopies(bookIds);
              setGroups((prev) => prev.filter((g) => `${g.type}:${g.key}` !== groupKey));
              setTotal((t) => Math.max(0, t - 1));
            } catch {
              Alert.alert("Ошибка", "Не удалось вернуть книги на проверку");
            } finally {
              setUnmarkingKey(null);
            }
          },
        },
      ],
    );
  }, []);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchData(activeFilters.current, page + 1);
  }, [loadingMore, hasMore, loading, page, fetchData]);

  const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
    { label: "Все", value: "all" },
    { label: "На Ozon", value: "published" },
    { label: "Не загружены", value: "not_published" },
    { label: "В архиве", value: "archived" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.filterPanel}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Поиск по названию, автору, ISBN..."
          placeholderTextColor="#bbb"
          clearButtonMode="while-editing"
        />
        <View style={styles.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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
          <AppText style={styles.totalLabel}>{total} групп</AppText>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#546E7A" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => `${item.type}:${item.key}`}
          renderItem={({ item }) => (
            <CopyGroupCard
              group={item}
              onNavigate={(id) =>
                navigation.navigate("ProductDetail", { bookId: id, editable: true })
              }
              onDelete={handleDelete}
              onUnmark={handleUnmarkGroup}
              deletingId={deletingId}
              unmarking={unmarkingKey === `${item.type}:${item.key}`}
              stores={stores}
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
                <ActivityIndicator size="small" color="#546E7A" />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },

  // Filter panel
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
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  chipActive: { backgroundColor: "#546E7A", borderColor: "#546E7A" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#666" },
  chipTextActive: { color: "#fff" },
  totalLabel: { fontSize: 12, color: "#aaa", marginLeft: "auto" },

  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12, gap: 12 },

  // Group card
  groupCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#546E7A",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  groupTypeBadge: {
    backgroundColor: "#ECEFF1",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  groupTypeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#546E7A",
  },
  groupKey: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  groupCount: {
    fontSize: 12,
    color: "#aaa",
  },
  booksScroll: { marginBottom: 4 },
  booksScrollContent: { gap: 10, paddingRight: 4 },

  // Mini card
  miniCard: {
    width: 145,
    backgroundColor: "#FAFAFA",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  miniImage: {
    width: "100%",
    aspectRatio: 0.7,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
    marginBottom: 6,
  },
  miniPlaceholder: { alignItems: "center", justifyContent: "center" },
  miniPlaceholderText: { fontSize: 10, color: "#ccc" },
  miniTitle: { fontSize: 12, fontWeight: "600", color: "#222", marginBottom: 2 },
  miniAuthor: { fontSize: 11, color: "#888", marginBottom: 2 },
  miniSku: { fontSize: 10, color: "#bbb", marginBottom: 3 },
  miniPrice: { fontSize: 13, fontWeight: "700", color: "#1976D2", marginBottom: 3 },
  miniBox: { fontSize: 10, color: "#999", marginBottom: 4 },
  publishedGroup: { marginTop: 4, gap: 3 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", backgroundColor: "#E8F5E9" },
  statusBadgeMt: { marginTop: 4 },
  storeBadge: { backgroundColor: "#E3F2FD" },
  statusPending: { backgroundColor: "#FFF3E0" },
  statusArchived: { backgroundColor: "#ECEFF1" },
  statusPublishedText: { fontSize: 10, fontWeight: "600", color: "#2E7D32" },
  storeBadgeText: { fontSize: 10, fontWeight: "600", color: "#1565C0" },
  statusPendingText: { fontSize: 10, fontWeight: "600", color: "#E65100" },
  statusArchivedText: { fontSize: 10, fontWeight: "600", color: "#546E7A" },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: "#E53935",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  unmarkBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#90A4AE",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#ECEFF1",
  },
  unmarkBtnDisabled: { opacity: 0.5 },
  unmarkBtnText: { fontSize: 13, color: "#546E7A", fontWeight: "600" },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: "#999" },
});
