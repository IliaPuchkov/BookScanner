import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { boxesService } from "../../services/boxes.service";
import { BookStatus } from "../../types";
import type { Book, CopyGroup } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { thumbUri } from "../../utils/photos";
import { libraryLabel, pluralRu } from "../../utils/format";
import { bookEvents, replaceBookInGroups } from "../../utils/bookEvents";
import { useUndoable } from "../../context/UndoContext";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Copies">;
type StatusFilter = "all" | "published" | "not_published" | "archived";

/** Server-side filters of GET /admin/books/copies/groups */
type CopyFilters = {
  status?: "published" | "not_published" | "archived";
  search?: string;
  count?: number;
  operatorId?: string;
  storeId?: string;
  boxId?: string;
};

const COUNT_OPTIONS = [
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4+", value: 4 },
];

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
  onAddToLibrary,
  addingToLibrary,
  isbnDiffers,
}: {
  book: Book;
  /** The book's valid ISBN is not the one most of its set has */
  isbnDiffers: boolean;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
  stores: OzonStore[];
  onAddToLibrary: (book: Book) => void;
  addingToLibrary: boolean;
}) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);
  const isPublished =
    book.status === BookStatus.PUBLISHED ||
    book.ozonProduct?.status === "published" ||
    book.ozonProduct?.status === "PUBLISHED";
  const isArchived = book.status === BookStatus.ARCHIVED;
  const inLibrary = libraryLabel(book);
  const storeName =
    isPublished && book.ozonProduct?.storeId
      ? (stores.find((s) => s.id === book.ozonProduct!.storeId)?.name ??
        "На Ozon")
      : null;

  return (
    <View style={styles.miniCard}>
      <View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onNavigate(book.id)}
        >
          {coverPhoto ? (
            <Image
              source={{ uri: thumbUri(coverPhoto) }}
              style={styles.miniImage}
            />
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
          {book.isbn ? (
            <AppText
              style={[styles.miniIsbn, isbnDiffers && styles.miniIsbnDiffers]}
              numberOfLines={1}
            >
              {isbnDiffers ? `ISBN отличается: ${book.isbn}` : `ISBN ${book.isbn}`}
            </AppText>
          ) : null}
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
                <AppText style={styles.statusPublishedText}>
                  Опубликована на Ozon
                </AppText>
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
            <View
              style={[
                styles.statusBadge,
                styles.statusArchived,
                styles.statusBadgeMt,
              ]}
            >
              <AppText style={styles.statusArchivedText}>В архиве</AppText>
            </View>
          ) : inLibrary ? (
            <View
              style={[
                styles.statusBadge,
                styles.statusLibrary,
                styles.statusBadgeMt,
              ]}
            >
              <AppText style={styles.statusLibraryText} numberOfLines={2}>
                {inLibrary}
              </AppText>
            </View>
          ) : (
            <View
              style={[
                styles.statusBadge,
                styles.statusPending,
                styles.statusBadgeMt,
              ]}
            >
              <AppText style={styles.statusPendingText}>Не загружена</AppText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {!isPublished && !isArchived && !inLibrary && (
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
      {book.status === BookStatus.PENDING_REVIEW && !book.publishedToOzon && (
        <TouchableOpacity
          style={[styles.libraryBtn, addingToLibrary && styles.deleteBtnDisabled]}
          onPress={() => onAddToLibrary(book)}
          disabled={addingToLibrary || deleting}
          activeOpacity={0.7}
        >
          {addingToLibrary ? (
            <ActivityIndicator size="small" color="#6A1B9A" />
          ) : (
            <AppText style={styles.libraryBtnText}>В библиотеку</AppText>
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
  stores,
  onAddToLibrary,
  addingToLibraryId,
}: {
  onAddToLibrary: (book: Book) => void;
  addingToLibraryId: string | null;
  group: CopyGroup;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  onUnmark: (group: CopyGroup) => void;
  deletingId: string | null;
  stores: OzonStore[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const kebabRef = useRef<TouchableOpacity>(null);

  const openMenu = () => {
    kebabRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setMenuPos({ top: pageY + height + 4, right: 0 });
      setMenuOpen(true);
    });
  };

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={styles.matchChips}>
          {(group.matchedFields ?? []).map((f) => (
            <View key={f} style={[styles.matchChip, styles.matchChipOk]}>
              <AppText style={[styles.matchChipText, styles.matchChipOkText]}>✓ {f}</AppText>
            </View>
          ))}
          {(group.differingFields ?? []).map((f) => (
            <View key={f} style={[styles.matchChip, styles.matchChipDiff]}>
              <AppText style={[styles.matchChipText, styles.matchChipDiffText]}>≠ {f}</AppText>
            </View>
          ))}
        </View>
        <AppText style={styles.groupCount}>{group.books.length} шт.</AppText>
        <TouchableOpacity
          ref={kebabRef}
          onPress={openMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
          style={styles.kebabBtn}
        >
          <AppText style={styles.kebabIcon}>⋮</AppText>
        </TouchableOpacity>
      </View>
      <AppText style={styles.groupKey} numberOfLines={2}>
        {group.books.map((b) => b.title).filter(Boolean).sort((a, b) => a.length - b.length)[0] ??
          group.key}
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
            stores={stores}
            onAddToLibrary={onAddToLibrary}
            addingToLibrary={addingToLibraryId === book.id}
            isbnDiffers={group.isbnDiffers?.includes(book.id) ?? false}
          />
        ))}
      </ScrollView>

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuCard, { top: menuPos.top, right: 16 }]}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuOpen(false);
                  onUnmark(group);
                }}
              >
                <AppText style={styles.menuItemText}>
                  Вернуть на проверку
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

export function CopiesScreen() {
  const undoable = useUndoable();
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<CopyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  // Server totals for the current filters and how much was loaded so far; groups/books
  // removed on screen (delete, return to review) are subtracted from the totals.
  const [serverTotal, setServerTotal] = useState({ groups: 0, books: 0 });
  const [loaded, setLoaded] = useState({ groups: 0, books: 0 });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingToLibraryId, setAddingToLibraryId] = useState<string | null>(
    null,
  );
  const [stores, setStores] = useState<OzonStore[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Same server-side filters as the Duplicates screen
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCount, setFilterCount] = useState<number | null>(null);
  const [filterOperatorId, setFilterOperatorId] = useState<string | null>(null);
  const [filterStoreId, setFilterStoreId] = useState<string | null>(null);
  const [filterBoxId, setFilterBoxId] = useState<string | null>(null);
  const [allBoxes, setAllBoxes] = useState<Array<{ id: string; boxNumber: string }>>([]);
  const [boxPickerOpen, setBoxPickerOpen] = useState(false);
  const [boxPickerSearch, setBoxPickerSearch] = useState("");

  const activeFilters = useRef<CopyFilters>({});

  const fetchData = useCallback(
    async (filters: CopyFilters, pageNum = 1, isRefresh = false) => {
      activeFilters.current = filters;
      try {
        const storesPromise =
          pageNum === 1
            ? adminService
                .getOzonStores()
                .catch(() => ({ stores: [] as OzonStore[] }))
            : Promise.resolve(null);
        const [res, storesRes] = await Promise.all([
          adminService.getCopyGroups(pageNum, PAGE_SIZE, filters),
          storesPromise,
        ]);
        // A newer request (other filters) has started — drop this answer
        if (activeFilters.current !== filters) return;
        if (storesRes) setStores((storesRes as { stores: OzonStore[] }).stores);
        setGroups(
          isRefresh || pageNum === 1
            ? res.groups
            : (prev) => [...prev, ...res.groups],
        );
        setPage(pageNum);
        setServerTotal({ groups: res.total, books: res.totalBooks });
        const newBooks = res.groups.reduce((n, g) => n + g.books.length, 0);
        setLoaded((prev) =>
          isRefresh || pageNum === 1
            ? { groups: res.groups.length, books: newBooks }
            : { groups: prev.groups + res.groups.length, books: prev.books + newBooks },
        );
        setHasMore(pageNum < res.totalPages);
      } catch {
        // silent
      } finally {
        if (activeFilters.current === filters) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
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

  useEffect(() => {
    boxesService
      .getAllBoxes()
      .then((fetched) =>
        setAllBoxes(
          fetched
            .map((b) => ({ id: b.id, boxNumber: b.boxNumber }))
            .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber)),
        ),
      )
      .catch(() => {});
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Refetch when a filter changes (the first load comes from useFocusEffect)
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setGroups([]);
    setLoading(true);
    fetchData(
      {
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        count: filterCount ?? undefined,
        operatorId: filterOperatorId ?? undefined,
        storeId: filterStoreId ?? undefined,
        boxId: filterBoxId ?? undefined,
      },
      1,
      true,
    );
  }, [statusFilter, debouncedSearch, filterCount, filterOperatorId, filterStoreId, filterBoxId, fetchData]);

  // Operators of the loaded groups (for the filter chips)
  const operators = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) =>
      g.books.forEach((b) => {
        if (b.createdBy) map.set(b.createdById, b.createdBy.fullName);
      }),
    );
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [groups]);

  const activeFilterCount =
    Number(statusFilter !== "all") +
    Number(filterCount !== null) +
    Number(!!filterOperatorId) +
    Number(!!filterStoreId) +
    Number(!!filterBoxId);

  const resetFilters = useCallback(() => {
    setStatusFilter("all");
    setFilterCount(null);
    setFilterOperatorId(null);
    setFilterStoreId(null);
    setFilterBoxId(null);
  }, []);

  const handleDelete = useCallback((book: Book) => {
    Alert.alert(
      "Удалить карточку?",
      `"${book.title}" будет удалена безвозвратно.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () =>
            undoable({
              message: `Карточка «${book.title}» будет удалена`,
              action: async () => {
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
            }),
        },
      ],
    );
  }, [undoable]);

  // The book stays in its copy group — only its status/caption changes to "В библиотеке"
  const handleAddToLibrary = useCallback((book: Book) => {
    Alert.alert(
      "Добавить в мою библиотеку?",
      `"${book.title}" станет книгой вашей домашней библиотеки и не будет публиковаться на Ozon.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Добавить",
          onPress: () =>
            undoable({
              message: `«${book.title}» будет добавлена в библиотеку`,
              action: async () => {
                setAddingToLibraryId(book.id);
                try {
                  const updated = await adminService.addToLibrary(book.id);
                  setGroups((prev) => replaceBookInGroups(prev, updated));
                  bookEvents.emitBookUpdated(updated);
                } catch {
                  Alert.alert("Ошибка", "Не удалось добавить книгу в библиотеку");
                } finally {
                  setAddingToLibraryId(null);
                }
              },
            }),
        },
      ],
    );
  }, [undoable]);

  const handleUnmarkGroup = useCallback((group: CopyGroup) => {
    Alert.alert(
      "Вернуть на проверку?",
      "Все книги группы будут возвращены в очередь дубликатов.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          onPress: () =>
            undoable({
              message: "Книги группы вернутся на проверку",
              action: async () => {
                const groupKey = group.id;
                try {
                  const bookIds = group.books.map((b) => b.id);
                  await adminService.unmarkCopies(bookIds);
                  setGroups((prev) =>
                    prev.filter((g) => g.id !== groupKey),
                  );
                } catch {
                  Alert.alert("Ошибка", "Не удалось вернуть книги на проверку");
                }
              },
            }),
        },
      ],
    );
  }, [undoable]);

  const totalGroups = serverTotal.groups - (loaded.groups - groups.length);
  const totalBooks =
    serverTotal.books - (loaded.books - groups.reduce((n, g) => n + g.books.length, 0));

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
          onChangeText={setSearch}
          placeholder="Поиск по названию, автору, ISBN..."
          placeholderTextColor="#bbb"
          clearButtonMode="while-editing"
        />
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterToggleBtn, filtersOpen && styles.filterToggleBtnActive]}
            onPress={() => setFiltersOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <AppText
              style={[styles.filterToggleText, filtersOpen && styles.filterToggleTextActive]}
            >
              Фильтры{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              {filtersOpen ? " ▲" : " ▼"}
            </AppText>
          </TouchableOpacity>
          <AppText style={styles.totalLabel}>
            {groups.length} {pluralRu(groups.length, "группа", "группы", "групп")} из{" "}
            {totalGroups} · {totalBooks}{" "}
            {pluralRu(totalBooks, "книга", "книги", "книг")}
          </AppText>
        </View>

        {filtersOpen && (
          <View style={styles.filterExpanded}>
            <AppText style={styles.filterSectionLabel}>Статус</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipsRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    active={statusFilter === opt.value}
                    onPress={() => setStatusFilter(opt.value)}
                  />
                ))}
              </View>
            </ScrollView>

            <AppText style={styles.filterSectionLabel}>Кол-во копий</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                    onPress={() => setFilterCount(filterCount === opt.value ? null : opt.value)}
                  />
                ))}
              </View>
            </ScrollView>

            {stores.length > 0 && (
              <>
                <AppText style={styles.filterSectionLabel}>Магазин</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                        onPress={() => setFilterStoreId(filterStoreId === s.id ? null : s.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {operators.length > 0 && (
              <>
                <AppText style={styles.filterSectionLabel}>Оператор</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                          setFilterOperatorId(filterOperatorId === op.id ? null : op.id)
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

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
                    style={filterBoxId ? styles.pickerRowValueActive : styles.pickerRowValuePlaceholder}
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

            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters} activeOpacity={0.7}>
                <AppText style={styles.resetBtnText}>
                  ✕ Сбросить все фильтры ({activeFilterCount})
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

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
                        b.boxNumber.toLowerCase().includes(boxPickerSearch.toLowerCase()),
                      ),
                    ]}
                    keyExtractor={(item) => item.id}
                    style={styles.pickerList}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      const isAll = item.id === "";
                      const active = isAll ? !filterBoxId : filterBoxId === item.id;
                      return (
                        <TouchableOpacity
                          style={[styles.pickerListItem, active && styles.pickerListItemActive]}
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
                          {active && <AppText style={styles.pickerListCheckmark}>✓</AppText>}
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

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#546E7A" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CopyGroupCard
              group={item}
              onNavigate={(id) =>
                navigation.navigate("ProductDetail", {
                  bookId: id,
                  editable: true,
                })
              }
              onDelete={handleDelete}
              onUnmark={handleUnmarkGroup}
              deletingId={deletingId}
              stores={stores}
              onAddToLibrary={handleAddToLibrary}
              addingToLibraryId={addingToLibraryId}
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
  matchChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  matchChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  matchChipText: { fontSize: 12, fontWeight: "700" },
  matchChipOk: { backgroundColor: "#E8F5E9" },
  matchChipOkText: { color: "#2E7D32" },
  matchChipDiff: { backgroundColor: "#FFF3E0" },
  matchChipDiffText: { color: "#E65100" },
  groupKey: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  groupCount: {
    fontSize: 12,
    color: "#aaa",
  },
  booksScroll: { marginBottom: 4 },
  booksScrollContent: { gap: 10, paddingRight: 4 },

  // Mini card
  miniCard: {
    justifyContent: "space-between",
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
  miniTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  miniAuthor: { fontSize: 11, color: "#888", marginBottom: 2 },
  miniSku: { fontSize: 10, color: "#bbb", marginBottom: 3 },
  miniIsbn: { fontSize: 10, color: "#999", marginBottom: 3 },
  miniIsbnDiffers: { color: "#E65100", fontWeight: "600" },
  miniPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1976D2",
    marginBottom: 3,
  },
  miniBox: { fontSize: 10, color: "#999", marginBottom: 4 },
  publishedGroup: { marginTop: 4, gap: 3 },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
    backgroundColor: "#E8F5E9",
  },
  statusBadgeMt: { marginTop: 4 },
  storeBadge: { backgroundColor: "#E3F2FD" },
  statusPending: { backgroundColor: "#FFF3E0" },
  statusArchived: { backgroundColor: "#ECEFF1" },
  statusPublishedText: { fontSize: 10, fontWeight: "600", color: "#2E7D32" },
  storeBadgeText: { fontSize: 10, fontWeight: "600", color: "#1565C0" },
  statusPendingText: { fontSize: 10, fontWeight: "600", color: "#E65100" },
  statusArchivedText: { fontSize: 10, fontWeight: "600", color: "#546E7A" },
  statusLibrary: { backgroundColor: "#F3E5F5" },
  statusLibraryText: { fontSize: 10, fontWeight: "600", color: "#6A1B9A" },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: "#E53935",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  libraryBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CE93D8",
    backgroundColor: "#F3E5F5",
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: "center",
  },
  libraryBtnText: { color: "#6A1B9A", fontSize: 12, fontWeight: "600" },

  kebabBtn: {
    marginLeft: 4,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  kebabIcon: {
    fontSize: 25,
    fontWeight: "600",
    color: "#000",
    lineHeight: 22,
  },
  menuOverlay: {
    flex: 1,
  },
  menuCard: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 8,
    minWidth: 180,
    overflow: "hidden",
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItemText: {
    fontSize: 14,
    color: "#333",
  },
  footerLoader: { paddingVertical: 20, alignItems: "center" },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: "#999" },
});
