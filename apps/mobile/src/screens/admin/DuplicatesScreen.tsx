import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { boxesService } from "../../services/boxes.service";
import { BookStatus } from "../../types";
import type { DuplicateGroup, Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Duplicates">;

// ─── Book card ────────────────────────────────────────────────────────────────

function BookMiniCard({
  book,
  onNavigate,
  onDelete,
  deleting,
  onMarkNotDuplicate,
  markingNotDuplicate,
  stores,
  hasExistingCopy,
}: {
  book: Book;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
  onMarkNotDuplicate: () => void;
  markingNotDuplicate: boolean;
  stores: OzonStore[];
  hasExistingCopy: boolean;
}) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);
  const storeName = book.ozonProduct?.storeId
    ? stores.find((s) => s.id === book.ozonProduct!.storeId)?.name
    : null;
  const isPublished =
    book.ozonProduct?.status === "published" ||
    book.ozonProduct?.status === "PUBLISHED";
  return (
    <View style={styles.miniCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onNavigate(book.id)}>
        {coverPhoto ? (
          <Image
            source={{ uri: coverPhoto.fileUrl }}
            style={styles.miniImage}
          />
        ) : (
          <View style={[styles.miniImage, styles.miniPlaceholder]}>
            <AppText style={styles.miniPlaceholderText}>Нет фото</AppText>
          </View>
        )}
        {hasExistingCopy && (
          <View style={[styles.copyRoleBadge, book.isCopy ? styles.copyRoleBadgeExisting : styles.copyRoleBadgeNew]}>
            <AppText style={[styles.copyRoleBadgeText, book.isCopy ? styles.copyRoleBadgeTextExisting : styles.copyRoleBadgeTextNew]}>
              {book.isCopy ? "Копия уже в системе" : "Новая копия"}
            </AppText>
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
        {book.yearPublished ? (
          <AppText style={styles.miniMeta}>{book.yearPublished}</AppText>
        ) : null}
        {book.price != null && Number(book.price) > 0 ? (
          <AppText style={styles.miniPrice}>
            {Number(book.price).toFixed(0)} ₽
          </AppText>
        ) : null}
        {storeName ? (
          <View
            style={[
              styles.storeBadge,
              isPublished && styles.storeBadgePublished,
            ]}
          >
            <AppText style={styles.storeBadgeText} numberOfLines={1}>
              {storeName}
            </AppText>
          </View>
        ) : null}
      </TouchableOpacity>
      {book.status === BookStatus.PUBLISHED ? (
        <View style={styles.publishedLabel}>
          <AppText style={styles.publishedLabelText}>
            Опубликована на Ozon
          </AppText>
        </View>
      ) : book.status === BookStatus.ARCHIVED ? (
        <View style={styles.archivedLabel}>
          <AppText style={styles.archivedLabelText}>В архиве</AppText>
        </View>
      ) : (
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
      <TouchableOpacity
        style={[
          styles.notDuplicateBtn,
          markingNotDuplicate && styles.notDuplicateBtnDisabled,
        ]}
        onPress={onMarkNotDuplicate}
        disabled={markingNotDuplicate || deleting}
        activeOpacity={0.7}
      >
        {markingNotDuplicate ? (
          <ActivityIndicator size="small" color="#888" />
        ) : (
          <AppText style={styles.notDuplicateBtnText}>Не копия</AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Probability helpers ──────────────────────────────────────────────────────

function probabilityMeta(p: number) {
  if (p >= 100)
    return {
      border: "#E53935",
      badge: "#FFEBEE",
      text: "#C62828",
      label: "Высокая вероятность",
    };
  if (p >= 60)
    return {
      border: "#FB8C00",
      badge: "#FFF3E0",
      text: "#E65100",
      label: "Средняя вероятность",
    };
  return {
    border: "#F9A825",
    badge: "#FFFDE7",
    text: "#F57F17",
    label: "Малая вероятность",
  };
}

// ─── Group card ───────────────────────────────────────────────────────────────

function DuplicateGroupCard({
  group,
  onNavigate,
  onDelete,
  onResolve,
  onMarkBookNotDuplicate,
  onMarkCopies,
  deletingId,
  resolvingKey,
  markingNotDuplicateId,
  markingCopiesKey,
  stores,
}: {
  group: DuplicateGroup;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  onResolve: (group: DuplicateGroup) => void;
  onMarkBookNotDuplicate: (bookId: string, group: DuplicateGroup) => void;
  onMarkCopies: (group: DuplicateGroup) => void;
  deletingId: string | null;
  resolvingKey: string | null;
  markingNotDuplicateId: string | null;
  markingCopiesKey: string | null;
  stores: OzonStore[];
}) {
  const prob = group.probability ?? 30;
  const meta = probabilityMeta(prob);
  const fieldsLabel =
    group.matchedFields?.join(" + ") ??
    (group.type === "isbn" ? "ISBN" : "Название");
  return (
    <View style={[styles.groupCard, { borderLeftColor: meta.border }]}>
      <View style={styles.groupHeader}>
        <View style={[styles.badge, { backgroundColor: meta.badge }]}>
          <AppText style={[styles.badgeText, { color: meta.text }]}>
            {meta.label}
          </AppText>
        </View>
        <AppText style={[styles.badgeFields, { color: meta.text }]}>
          {fieldsLabel}
        </AppText>
        <AppText style={styles.bookCount}>{group.books.length} шт.</AppText>
      </View>
      <AppText style={styles.groupKey} numberOfLines={1}>
        {group.type === "isbn" ? `ISBN: ${group.key}` : group.key}
      </AppText>
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
            onMarkNotDuplicate={() => onMarkBookNotDuplicate(book.id, group)}
            markingNotDuplicate={markingNotDuplicateId === book.id}
            stores={stores}
            hasExistingCopy={group.books.some((b) => b.isCopy)}
          />
        ))}
      </ScrollView>
      <TouchableOpacity
        style={[
          styles.markCopiesBtn,
          markingCopiesKey === group.key && styles.resolveBtnDisabled,
        ]}
        onPress={() => onMarkCopies(group)}
        disabled={markingCopiesKey === group.key}
        activeOpacity={0.7}
      >
        {markingCopiesKey === group.key ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <AppText style={styles.markCopiesBtnText}>Это копии</AppText>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.resolveBtn,
          resolvingKey === group.key && styles.resolveBtnDisabled,
        ]}
        onPress={() => onResolve(group)}
        disabled={resolvingKey === group.key}
        activeOpacity={0.7}
      >
        {resolvingKey === group.key ? (
          <ActivityIndicator size="small" color="#555" />
        ) : (
          <AppText style={styles.resolveBtnText}>
            Это не копии — пропустить
          </AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const bg = active ? (color ?? "#1976D2") : "#fff";
  const border = active ? (color ?? "#1976D2") : "#ccc";
  return (
    <TouchableOpacity
      style={[styles.filterChip, { backgroundColor: bg, borderColor: border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <AppText
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type StatusFilter = "all" | "published" | "not_published" | "archived";

type ServerFilters = {
  search?: string;
  status?: "published" | "not_published" | "archived";
  count?: number;
  operatorId?: string;
  storeId?: string;
  boxId?: string;
};

export function DuplicatesScreen() {
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [markingNotDuplicateId, setMarkingNotDuplicateId] = useState<
    string | null
  >(null);
  const [markingCopiesKey, setMarkingCopiesKey] = useState<string | null>(null);
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [allBoxes, setAllBoxes] = useState<Array<{ id: string; boxNumber: string }>>([]);
  const [markCopiesPickerGroup, setMarkCopiesPickerGroup] = useState<DuplicateGroup | null>(null);

  // Server-side filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterProb, setFilterProb] = useState<number | null>(null); // client-side only
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterCount, setFilterCount] = useState<number | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterOperatorId, setFilterOperatorId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);
  const [filterBoxId, setFilterBoxId] = useState<string | null>(null);
  const [boxPickerOpen, setBoxPickerOpen] = useState(false);
  const [boxPickerSearch, setBoxPickerSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filterSearch), 400);
    return () => clearTimeout(t);
  }, [filterSearch]);

  const PAGE_SIZE = 50;

  const fetchData = useCallback(
    async (filters: ServerFilters, pageNum = 1, _isRefresh = false) => {
      activeFiltersRef.current = filters;
      const isFirstPage = pageNum === 1;
      try {
        const storesPromise =
          isFirstPage
            ? adminService.getOzonStores().catch(() => ({ stores: [] }))
            : Promise.resolve(null);

        const [res, storesRes] = await Promise.all([
          adminService.getDuplicates(pageNum, PAGE_SIZE, filters),
          storesPromise,
        ]);
        if (storesRes) setStores((storesRes as { stores: OzonStore[] }).stores);

        const newGroups = [...res.isbnDuplicates, ...res.possibleDuplicates];
        setGroups(isFirstPage ? newGroups : (prev) => [...prev, ...newGroups]);
        setPage(pageNum);
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

  const activeFiltersRef = useRef<ServerFilters>({});
  const filtersMounted = useRef(false);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchData({});
    boxesService.getAllBoxes().then((fetched) => {
      setAllBoxes(
        fetched
          .map((b) => ({ id: b.id, boxNumber: b.boxNumber }))
          .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber)),
      );
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when server-side filters change (skip initial mount — handled above)
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    const filters: ServerFilters = {
      search: debouncedSearch.trim() || undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      count: filterCount ?? undefined,
      operatorId: filterOperatorId ?? undefined,
      storeId: filterStoreId ?? undefined,
      boxId: filterBoxId ?? undefined,
    };
    setGroups([]);
    setLoading(true);
    fetchData(filters, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    filterStatus,
    filterCount,
    filterOperatorId,
    filterStoreId,
    filterBoxId,
  ]);

  // Extract unique operators from loaded groups (for filter UI chips)
  const operators = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) =>
      g.books.forEach((b) => {
        if (b.createdBy) map.set(b.createdById, b.createdBy.fullName);
      }),
    );
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [groups]);

  // Probability is the only client-side filter remaining
  const displayGroups = useMemo(
    () =>
      filterProb === null
        ? groups
        : groups.filter((g) => (g.probability ?? 30) === filterProb),
    [groups, filterProb],
  );

  const activeSecondaryCount = useMemo(() => {
    let n = 0;
    if (filterStatus !== "all") n++;
    if (filterCount !== null) n++;
    if (filterSearch.trim()) n++;
    if (filterOperatorId) n++;
    if (filterStoreId) n++;
    if (filterBoxId) n++;
    return n;
  }, [
    filterStatus,
    filterCount,
    filterSearch,
    filterOperatorId,
    filterStoreId,
    filterBoxId,
  ]);

  const resetFilters = useCallback(() => {
    setFilterProb(null);
    setFilterStatus("all");
    setFilterCount(null);
    setFilterSearch("");
    setFilterOperatorId(null);
    setFilterStoreId(null);
    setFilterBoxId(null);
  }, []);

  const navigate = useCallback(
    (bookId: string) =>
      navigation.navigate("ProductDetail", { bookId, editable: true }),
    [navigation],
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

  const handleMarkBookNotDuplicate = useCallback(
    async (bookId: string, group: DuplicateGroup) => {
      setMarkingNotDuplicateId(bookId);
      try {
        const others = group.books.filter((b) => b.id !== bookId);
        await Promise.all(
          others.map((other) =>
            adminService.resolveDuplicate(bookId, other.id),
          ),
        );
        setGroups((prev) =>
          prev
            .map((g) =>
              g.key === group.key && g.type === group.type
                ? { ...g, books: g.books.filter((b) => b.id !== bookId) }
                : g,
            )
            .filter((g) => g.books.length >= 2),
        );
      } catch {
        Alert.alert("Ошибка", "Не удалось пометить как не копию");
      } finally {
        setMarkingNotDuplicateId(null);
      }
    },
    [],
  );

  const handleResolve = useCallback(async (group: DuplicateGroup) => {
    if (group.books.length < 2) return;
    setResolvingKey(group.key);
    try {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < group.books.length; i++) {
        for (let j = i + 1; j < group.books.length; j++) {
          pairs.push([group.books[i].id, group.books[j].id]);
        }
      }
      await Promise.all(
        pairs.map(([id1, id2]) => adminService.resolveDuplicate(id1, id2)),
      );
      setGroups((prev) => prev.filter((g) => g.key !== group.key));
    } catch {
      Alert.alert("Ошибка", "Не удалось отметить как не копию");
    } finally {
      setResolvingKey(null);
    }
  }, []);

  const doMarkCopies = useCallback(
    async (group: DuplicateGroup, masterBookId: string | null) => {
      setMarkingCopiesKey(group.key);
      try {
        const allIds = group.books.map((b) => b.id);
        await adminService.markCopies(allIds, masterBookId ?? undefined);
        setGroups((prev) =>
          prev.filter((g) => !(g.key === group.key && g.type === group.type)),
        );
      } catch {
        Alert.alert("Ошибка", "Не удалось пометить как копии");
      } finally {
        setMarkingCopiesKey(null);
      }
    },
    [],
  );

  const handleMarkCopies = useCallback(
    (group: DuplicateGroup) => {
      const allUnpublished = group.books.every(
        (b) =>
          b.status !== BookStatus.PUBLISHED && b.status !== BookStatus.ARCHIVED,
      );
      if (allUnpublished) {
        setMarkCopiesPickerGroup(group);
      } else {
        doMarkCopies(group, null);
      }
    },
    [doMarkCopies],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchData(activeFiltersRef.current, page + 1);
  }, [loadingMore, hasMore, loading, page, fetchData]);

  const PROB_FILTERS = [
    { label: "Высокая", value: 100, color: "#E53935" },
    { label: "Средняя", value: 60, color: "#FB8C00" },
    { label: "Малая", value: 30, color: "#F9A825" },
  ];

  const COUNT_OPTIONS = [
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4+", value: 4 },
  ];

  const totalActive =
    filterProb !== null ? activeSecondaryCount + 1 : activeSecondaryCount;

  return (
    <View style={styles.container}>
      <View style={styles.filterPanel}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterToggleBtn,
              filtersOpen && styles.filterToggleBtnActive,
            ]}
            onPress={() => setFiltersOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.filterToggleText,
                filtersOpen && styles.filterToggleTextActive,
              ]}
            >
              Фильтры{totalActive > 0 ? ` (${totalActive})` : ""}
              {filtersOpen ? " ▲" : " ▼"}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.filterCount}>
            {displayGroups.length} из {groups.length}
          </AppText>
        </View>

        {/* Expanded filter panel */}
        {filtersOpen && (
          <View style={styles.filterExpanded}>
            {/* Probability */}
            <AppText style={styles.filterSectionLabel}>
              Вероятность дублирования
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
            >
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Все"
                  active={filterProb === null}
                  onPress={() => setFilterProb(null)}
                />
                {PROB_FILTERS.map((f) => (
                  <FilterChip
                    key={f.value}
                    label={f.label}
                    active={filterProb === f.value}
                    color={f.color}
                    onPress={() =>
                      setFilterProb(filterProb === f.value ? null : f.value)
                    }
                  />
                ))}
              </View>
            </ScrollView>

            {/* Search */}
            {/* <AppText style={styles.filterSectionLabel}>Название / Автор</AppText>
              <TextInput
                style={styles.searchInput}
                value={filterSearch}
                onChangeText={setFilterSearch}
                placeholder="Поиск..."
                placeholderTextColor="#bbb"
                clearButtonMode="while-editing"
              /> */}

            {/* Status */}
            <AppText style={styles.filterSectionLabel}>Статус</AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
            >
              <View style={styles.chipsRow}>
                {(
                  [
                    { label: "Все", value: "all" },
                    { label: "Загружена", value: "published" },
                    { label: "Не загружена", value: "not_published" },
                    { label: "В архиве", value: "archived" },
                  ] as { label: string; value: StatusFilter }[]
                ).map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={filterStatus === opt.value}
                    onPress={() => setFilterStatus(opt.value)}
                  />
                ))}
              </View>
            </ScrollView>

            {/* Count */}
            <AppText style={styles.filterSectionLabel}>Кол-во копий</AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
            >
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Все"
                  active={filterCount === null}
                  onPress={() => setFilterCount(null)}
                />
                {COUNT_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={filterCount === opt.value}
                    onPress={() =>
                      setFilterCount(
                        filterCount === opt.value ? null : opt.value,
                      )
                    }
                  />
                ))}
              </View>
            </ScrollView>

            {/* Store */}
            {stores.length > 0 && (
              <>
                <AppText style={styles.filterSectionLabel}>Магазин</AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                >
                  <View style={styles.chipsRow}>
                    <FilterChip
                      label="Все"
                      active={filterStoreId === null}
                      onPress={() => setFilterStoreId(null)}
                    />
                    {stores.map((s) => (
                      <FilterChip
                        key={s.id}
                        label={s.name}
                        active={filterStoreId === s.id}
                        onPress={() =>
                          setFilterStoreId(filterStoreId === s.id ? null : s.id)
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Operator */}
            {operators.length > 0 && (
              <>
                <AppText style={styles.filterSectionLabel}>Оператор</AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                >
                  <View style={styles.chipsRow}>
                    <FilterChip
                      label="Все"
                      active={filterOperatorId === null}
                      onPress={() => setFilterOperatorId(null)}
                    />
                    {operators.map((op) => (
                      <FilterChip
                        key={op.id}
                        label={op.name}
                        active={filterOperatorId === op.id}
                        onPress={() =>
                          setFilterOperatorId(
                            filterOperatorId === op.id ? null : op.id,
                          )
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Box */}
            {allBoxes.length > 0 && (
              <>
                <AppText style={styles.filterSectionLabel}>Коробка</AppText>
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setBoxPickerSearch("");
                    setBoxPickerOpen(true);
                  }}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={
                      filterBoxId
                        ? styles.pickerRowValueActive
                        : styles.pickerRowValuePlaceholder
                    }
                  >
                    {filterBoxId
                      ? allBoxes.find((b) => b.id === filterBoxId)?.boxNumber
                      : "Все коробки"}
                  </AppText>
                  <View style={styles.pickerRowRight}>
                    {filterBoxId && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setFilterBoxId(null);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppText style={styles.pickerRowClear}>✕</AppText>
                      </TouchableOpacity>
                    )}
                    <AppText style={styles.pickerRowArrow}>▼</AppText>
                  </View>
                </TouchableOpacity>
              </>
            )}

            {/* Reset */}
            {totalActive > 0 && (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={resetFilters}
                activeOpacity={0.7}
              >
                <AppText style={styles.resetBtnText}>
                  ✕ Сбросить все фильтры ({totalActive})
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <FlatList
          style={styles.container}
          data={displayGroups}
          keyExtractor={(item) => `${item.type}:${item.key}`}
          renderItem={({ item }) => (
            <DuplicateGroupCard
              group={item}
              onNavigate={navigate}
              onDelete={handleDelete}
              onResolve={handleResolve}
              onMarkBookNotDuplicate={handleMarkBookNotDuplicate}
              onMarkCopies={handleMarkCopies}
              deletingId={deletingId}
              resolvingKey={resolvingKey}
              markingNotDuplicateId={markingNotDuplicateId}
              markingCopiesKey={markingCopiesKey}
              stores={stores}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData(
                  {
                    search: debouncedSearch.trim() || undefined,
                    status: filterStatus !== "all" ? filterStatus : undefined,
                    count: filterCount ?? undefined,
                    operatorId: filterOperatorId ?? undefined,
                    storeId: filterStoreId ?? undefined,
                    boxId: filterBoxId ?? undefined,
                  },
                  1,
                  true,
                );
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
            <View style={styles.emptyContainer}>
              <AppText style={styles.emptyIcon}>✅</AppText>
              <AppText style={styles.empty}>
                {totalActive > 0
                  ? "Нет групп, подходящих под фильтры"
                  : "Копий не найдено"}
              </AppText>
            </View>
          }
        />
      )}

      {/* Mark copies — master book picker modal */}
      <Modal
        visible={markCopiesPickerGroup !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setMarkCopiesPickerGroup(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMarkCopiesPickerGroup(null)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerSheetHeader}>
                  <AppText style={styles.pickerSheetTitle}>
                    Выберите основную книгу
                  </AppText>
                  <TouchableOpacity
                    onPress={() => setMarkCopiesPickerGroup(null)}
                  >
                    <AppText style={styles.pickerDoneBtn}>Отмена</AppText>
                  </TouchableOpacity>
                </View>
                <AppText style={styles.masterPickerHint}>
                  Она останется доступной для публикации на Ozon. Остальные
                  будут помечены как копии.
                </AppText>
                <FlatList
                  data={markCopiesPickerGroup?.books ?? []}
                  keyExtractor={(item) => item.id}
                  style={styles.pickerList}
                  renderItem={({ item }) => {
                    const cover = item.photos?.find((p) => p.sortOrder === 0);
                    return (
                      <TouchableOpacity
                        style={styles.masterPickerItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          const group = markCopiesPickerGroup!;
                          setMarkCopiesPickerGroup(null);
                          doMarkCopies(group, item.id);
                        }}
                      >
                        {cover ? (
                          <Image
                            source={{ uri: cover.fileUrl }}
                            style={styles.masterPickerThumb}
                          />
                        ) : (
                          <View
                            style={[
                              styles.masterPickerThumb,
                              styles.miniPlaceholder,
                            ]}
                          >
                            <AppText style={styles.miniPlaceholderText}>
                              Нет фото
                            </AppText>
                          </View>
                        )}
                        <View style={styles.masterPickerInfo}>
                          <AppText
                            style={styles.masterPickerTitle}
                            numberOfLines={2}
                          >
                            {item.title}
                          </AppText>
                          {item.author ? (
                            <AppText
                              style={styles.masterPickerAuthor}
                              numberOfLines={1}
                            >
                              {item.author}
                            </AppText>
                          ) : null}
                          <AppText style={styles.masterPickerSku}>
                            {item.sku}
                          </AppText>
                        </View>
                        <AppText style={styles.masterPickerArrow}>›</AppText>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Box picker modal */}
      <Modal
        visible={boxPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBoxPickerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={() => setBoxPickerOpen(false)}>
            <View style={styles.pickerOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerSheetHeader}>
                    <AppText style={styles.pickerSheetTitle}>Коробка</AppText>
                    <TouchableOpacity onPress={() => setBoxPickerOpen(false)}>
                      <AppText style={styles.pickerDoneBtn}>Закрыть</AppText>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.pickerSearchInput}
                    placeholder="Поиск по номеру коробки..."
                    placeholderTextColor="#aaa"
                    value={boxPickerSearch}
                    onChangeText={setBoxPickerSearch}
                    autoFocus
                    clearButtonMode="while-editing"
                  />
                  <FlatList
                    data={[
                      { id: "", boxNumber: "Все коробки" },
                      ...allBoxes.filter((b) =>
                        b.boxNumber
                          .toLowerCase()
                          .includes(boxPickerSearch.toLowerCase()),
                      ),
                    ]}
                    keyExtractor={(item) => item.id}
                    style={styles.pickerList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      const isAll = item.id === "";
                      const active = isAll
                        ? !filterBoxId
                        : filterBoxId === item.id;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.pickerListItem,
                            active && styles.pickerListItemActive,
                          ]}
                          onPress={() => {
                            setFilterBoxId(isAll ? null : item.id);
                            setBoxPickerOpen(false);
                          }}
                        >
                          <AppText
                            style={[
                              styles.pickerListItemText,
                              active && styles.pickerListItemTextActive,
                            ]}
                          >
                            {item.boxNumber}
                          </AppText>
                          {active && (
                            <AppText style={styles.pickerListCheckmark}>
                              ✓
                            </AppText>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  // Filter panel
  filterPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  filterToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  filterToggleBtnActive: {
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  filterToggleTextActive: {
    color: "#1976D2",
  },
  filterCount: {
    fontSize: 12,
    color: "#999",
    marginLeft: "auto",
  },
  filterExpanded: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
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
    paddingBottom: 2,
  },
  resetBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1976D2",
    alignItems: "center",
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  // Group card
  groupCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeFields: {
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
    flexShrink: 1,
  },
  bookCount: {
    fontSize: 11,
    color: "#aaa",
    marginLeft: "auto",
  },
  groupKey: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
  },
  booksScroll: {
    marginBottom: 12,
  },
  booksScrollContent: {
    gap: 10,
    paddingRight: 4,
  },
  // Mini card
  miniCard: {
    width: 150,
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
  miniPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  miniPlaceholderText: {
    fontSize: 10,
    color: "#ccc",
  },
  miniTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  miniAuthor: {
    fontSize: 11,
    color: "#888",
    marginBottom: 2,
  },
  miniSku: {
    fontSize: 10,
    color: "#bbb",
    marginBottom: 2,
  },
  miniMeta: {
    fontSize: 11,
    color: "#888",
  },
  miniPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1976D2",
    marginTop: 2,
  },
  storeBadge: {
    marginTop: 4,
    backgroundColor: "#E3F2FD",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  storeBadgePublished: {
    backgroundColor: "#E8F5E9",
  },
  storeBadgeText: {
    fontSize: 10,
    color: "#1565C0",
    fontWeight: "600",
  },
  copyRoleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  copyRoleBadgeNew: {
    backgroundColor: "#FFF3E0",
  },
  copyRoleBadgeExisting: {
    backgroundColor: "#ECEFF1",
  },
  copyRoleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  copyRoleBadgeTextNew: {
    color: "#E65100",
  },
  copyRoleBadgeTextExisting: {
    color: "#546E7A",
  },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: "#E53935",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  publishedLabel: {
    marginTop: 8,
    backgroundColor: "#E8F5E9",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  publishedLabelText: {
    color: "#2E7D32",
    fontSize: 11,
    fontWeight: "600",
  },
  archivedLabel: {
    marginTop: 8,
    backgroundColor: "#ECEFF1",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  archivedLabelText: {
    color: "#546E7A",
    fontSize: 11,
    fontWeight: "600",
  },
  notDuplicateBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: "center",
  },
  notDuplicateBtnDisabled: {
    opacity: 0.5,
  },
  notDuplicateBtnText: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
  },
  markCopiesBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#1976D2",
    marginBottom: 6,
  },
  markCopiesBtnText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  resolveBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  resolveBtnDisabled: {
    opacity: 0.5,
  },
  resolveBtnText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  empty: {
    textAlign: "center",
    color: "#999",
    fontSize: 16,
  },
  // Picker row (box selector button)
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#FAFAFA",
  },
  pickerRowValueActive: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "600",
    flex: 1,
  },
  pickerRowValuePlaceholder: {
    fontSize: 14,
    color: "#aaa",
    flex: 1,
  },
  pickerRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerRowClear: {
    fontSize: 13,
    color: "#aaa",
  },
  pickerRowArrow: {
    fontSize: 10,
    color: "#aaa",
  },
  // Picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 20,
  },
  pickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerSheetTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  pickerDoneBtn: {
    fontSize: 15,
    color: "#999",
  },
  pickerSearchInput: {
    margin: 12,
    height: 40,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  pickerListItemActive: {
    backgroundColor: "#E3F2FD",
  },
  pickerListItemText: {
    fontSize: 15,
    color: "#333",
  },
  pickerListItemTextActive: {
    color: "#1976D2",
    fontWeight: "600",
  },
  pickerListCheckmark: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "700",
  },
  masterPickerHint: {
    fontSize: 13,
    color: "#888",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  masterPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
    gap: 12,
  },
  masterPickerThumb: {
    width: 52,
    height: 74,
    borderRadius: 4,
    backgroundColor: "#f0f0f0",
  },
  masterPickerInfo: {
    flex: 1,
    gap: 2,
  },
  masterPickerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  masterPickerAuthor: {
    fontSize: 12,
    color: "#888",
  },
  masterPickerSku: {
    fontSize: 11,
    color: "#bbb",
  },
  masterPickerArrow: {
    fontSize: 22,
    color: "#ccc",
  },
});
