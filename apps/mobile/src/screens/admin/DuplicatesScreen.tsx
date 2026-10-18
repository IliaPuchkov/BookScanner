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
  Switch,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { boxesService } from "../../services/boxes.service";
import { BookStatus } from "../../types";
import type { DuplicateGroup, DuplicateCriterion, Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { thumbUri } from "../../utils/photos";
import { libraryLabel, pluralRu } from "../../utils/format";
import { bookEvents, replaceBookInGroups } from "../../utils/bookEvents";
import {
  DEFAULT_DUPLICATES_VIEW,
  DUPLICATE_CRITERIA,
  duplicatesViewParams,
  loadDuplicatesView,
  saveDuplicatesView,
  type DuplicatesView,
} from "../../utils/duplicatesView";
import {
  groupTitle,
  newPairs,
  patchBooks,
  recomputeGroup,
  undecidedCount,
  resolvedAmong,
} from "../../utils/duplicateGroups";
import { useUndoable } from "../../context/UndoContext";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Duplicates">;

// Group ids are unique within one criterion
const groupId = (g: DuplicateGroup) => `${g.criterion}:${g.id}`;

/** Search criterion and switches — remembered on the device (shared with the Dashboard) */
type ViewState = DuplicatesView;
const DEFAULT_VIEW = DEFAULT_DUPLICATES_VIEW;
const CRITERIA = DUPLICATE_CRITERIA;

/** Where a book sits in its group */
type BookRole = "set" | "loose" | "excluded";

// ─── Book card ────────────────────────────────────────────────────────────────

function BookMiniCard({
  book,
  role,
  volume,
  isbnDiffers,
  isNew,
  note,
  onNavigate,
  onDelete,
  deleting,
  action,
  acting,
  stores,
  selecting,
  selected,
  onToggleSelect,
  onAddToLibrary,
  addingToLibrary,
}: {
  book: Book;
  role: BookRole;
  volume?: string;
  isbnDiffers: boolean;
  /** No decision about this book in the group yet, while others were already reviewed */
  isNew: boolean;
  /** Where the book stands, e.g. "Не решено с 2 книгами" or "Не копия со всеми" */
  note?: string;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
  /** "Не копия" / "Убрать из набора" / "Вернуть" */
  action: { label: string; onPress: () => void };
  acting: boolean;
  stores: OzonStore[];
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onAddToLibrary: (book: Book) => void;
  addingToLibrary: boolean;
}) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);
  const storeName = book.ozonProduct?.storeId
    ? stores.find((s) => s.id === book.ozonProduct!.storeId)?.name
    : null;
  const isPublished =
    book.ozonProduct?.status === "published" ||
    book.ozonProduct?.status === "PUBLISHED";
  const canSelect = selecting && role !== "excluded";
  return (
    <View
      style={[
        styles.miniCard,
        role === "excluded" && styles.miniCardExcluded,
        selected && styles.miniCardSelected,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => (canSelect ? onToggleSelect() : onNavigate(book.id))}
      >
        {canSelect && (
          <View style={[styles.selectCheck, selected && styles.selectCheckOn]}>
            {selected && <AppText style={styles.selectCheckMark}>✓</AppText>}
          </View>
        )}
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
        <View style={styles.miniBadges}>
          {isNew ? (
            <View style={[styles.copyRoleBadge, styles.copyRoleBadgeNew]}>
              <AppText style={[styles.copyRoleBadgeText, styles.copyRoleBadgeTextNew]}>
                Новая
              </AppText>
            </View>
          ) : null}
          {role === "set" && book.isCopyMaster ? (
            <View style={[styles.copyRoleBadge, styles.copyRoleBadgeExisting]}>
              <AppText style={[styles.copyRoleBadgeText, styles.copyRoleBadgeTextExisting]}>
                Основная
              </AppText>
            </View>
          ) : null}
          {volume ? (
            <View style={styles.volumeBadge}>
              <AppText style={styles.volumeBadgeText}>{volume}</AppText>
            </View>
          ) : null}
        </View>
        <AppText style={styles.miniTitle} numberOfLines={2}>
          {book.title}
        </AppText>
        {book.author ? (
          <AppText style={styles.miniAuthor} numberOfLines={1}>
            {book.author}
          </AppText>
        ) : null}
        <AppText style={styles.miniSku}>{book.sku}</AppText>
        {note ? (
          <AppText style={styles.miniNote} numberOfLines={2}>
            {note}
          </AppText>
        ) : null}
        {book.isbn ? (
          <AppText
            style={[styles.miniMeta, isbnDiffers && styles.miniIsbnDiffers]}
            numberOfLines={1}
          >
            {isbnDiffers ? `ISBN отличается: ${book.isbn}` : `ISBN ${book.isbn}`}
          </AppText>
        ) : null}
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
      {selecting ? null : book.status === BookStatus.PUBLISHED ? (
        <View style={styles.publishedLabel}>
          <AppText style={styles.publishedLabelText}>
            Опубликована на Ozon
          </AppText>
        </View>
      ) : book.status === BookStatus.ARCHIVED ? (
        <View style={styles.archivedLabel}>
          <AppText style={styles.archivedLabelText}>В архиве</AppText>
        </View>
      ) : book.status === BookStatus.IN_LIBRARY ? (
        <View style={styles.libraryLabel}>
          <AppText style={styles.libraryLabelText} numberOfLines={2}>
            {libraryLabel(book)}
          </AppText>
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
      {!selecting &&
        book.status === BookStatus.PENDING_REVIEW &&
        !book.publishedToOzon && (
          <TouchableOpacity
            style={[
              styles.libraryBtn,
              addingToLibrary && styles.deleteBtnDisabled,
            ]}
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
      {!selecting && (
        <TouchableOpacity
          style={[
            styles.notDuplicateBtn,
            acting && styles.notDuplicateBtnDisabled,
          ]}
          onPress={action.onPress}
          disabled={acting || deleting}
          activeOpacity={0.7}
        >
          {acting ? (
            <ActivityIndicator size="small" color="#888" />
          ) : (
            <AppText style={styles.notDuplicateBtnText}>{action.label}</AppText>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

type GroupHandlers = {
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  onAddToLibrary: (book: Book) => void;
  /** Marks `bookIds` one copy set; `restIds` are resolved "not copies" of them */
  onMarkCopies: (group: DuplicateGroup, bookIds: string[], restIds: string[]) => void;
  /** Resolves every undecided pair of the group */
  onResolveGroup: (group: DuplicateGroup) => void;
  onNotCopy: (group: DuplicateGroup, bookId: string) => void;
  onRemoveFromSet: (group: DuplicateGroup, bookId: string) => void;
  onRestore: (group: DuplicateGroup, bookId: string) => void;
};

function DuplicateGroupCard({
  group,
  handlers,
  busyKey,
  busyBookId,
  deletingId,
  addingToLibraryId,
  stores,
}: {
  group: DuplicateGroup;
  handlers: GroupHandlers;
  /** Group whose group-level action is running */
  busyKey: string | null;
  /** Book whose per-book action is running */
  busyBookId: string | null;
  deletingId: string | null;
  addingToLibraryId: string | null;
  stores: OzonStore[];
}) {
  // Selection mode: pick one copy set out of the group (Кн. 1 out of Кн. 1 + Кн. 2 …)
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [excludedOpen, setExcludedOpen] = useState(false);
  // Leave selection mode once the group changed under it
  useEffect(() => {
    setSelecting(false);
    setSelectedIds([]);
  }, [group.books, group.resolvedPairs]);
  // Tapping a book of a copy set selects or clears the whole set — marking copies merges whole
  // sets anyway, so there is no point in tapping each of its books
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const setId = group.books.find((b) => b.id === id)?.copyGroupId;
      const ids = setId
        ? group.books.filter((b) => b.copyGroupId === setId).map((b) => b.id)
        : [id];
      return prev.includes(id)
        ? prev.filter((x) => !ids.includes(x))
        : [...prev, ...ids.filter((x) => !prev.includes(x))];
    });

  const gid = groupId(group);
  const busy = busyKey === gid;
  const byId = useMemo(() => new Map(group.books.map((b) => [b.id, b])), [group.books]);
  const booksOf = (ids: string[]) => ids.map((id) => byId.get(id)).filter((b): b is Book => !!b);
  const sets = group.sets
    .map((s) => ({ ...s, books: booksOf(s.ids) }))
    .filter((s) => s.books.length > 0);
  const loose = booksOf(group.looseIds);
  const excluded = booksOf(group.excludedIds);
  const setIds = sets.flatMap((s) => s.ids);
  const decided = group.unresolvedCount === 0;

  // Undecided books: the ones with the most open pairs first (a new arrival is open against
  // everyone), then the newest. «Новая» = no decision about the book at all, in a group that
  // already has some.
  const touched = new Set(group.resolvedPairs.flat());
  const hasHistory = sets.length > 0 || group.resolvedPairs.length > 0;
  const openCount = new Map(loose.map((b) => [b.id, undecidedCount(group, b.id)]));
  const undecided = [...loose].sort(
    (a, b) =>
      openCount.get(b.id)! - openCount.get(a.id)! ||
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const isNew = (id: string) => hasHistory && !touched.has(id);
  const newCount = loose.filter((b) => isNew(b.id)).length;
  const noteOf = (id: string, role: BookRole) => {
    if (role === "excluded") return "Не копия со всеми";
    const n = openCount.get(id) ?? 0;
    return `Не решено с ${n} ${pluralRu(n, "книгой", "книгами", "книгами")}`;
  };

  // Unselected books outside the sets the selection touches are "not copies" of it
  const restOf = (ids: string[]) => {
    const touched = new Set(ids.map((id) => byId.get(id)?.copyGroupId).filter(Boolean));
    return group.books
      .filter((b) => !ids.includes(b.id) && !(b.copyGroupId && touched.has(b.copyGroupId)))
      .map((b) => b.id);
  };

  const renderBooks = (books: Book[], role: BookRole) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.booksScroll}
      contentContainerStyle={styles.booksScrollContent}
    >
      {books.map((book) => (
        <BookMiniCard
          key={book.id}
          book={book}
          role={role}
          volume={group.volumes[book.id]}
          isbnDiffers={group.isbnDiffers.includes(book.id)}
          isNew={role === "loose" && isNew(book.id)}
          note={role === "set" ? undefined : noteOf(book.id, role)}
          onNavigate={handlers.onNavigate}
          onDelete={handlers.onDelete}
          deleting={deletingId === book.id}
          action={
            role === "set"
              ? { label: "Убрать из набора", onPress: () => handlers.onRemoveFromSet(group, book.id) }
              : role === "excluded"
                ? { label: "Вернуть", onPress: () => handlers.onRestore(group, book.id) }
                : { label: "Не копия", onPress: () => handlers.onNotCopy(group, book.id) }
          }
          acting={busyBookId === book.id}
          stores={stores}
          selecting={selecting}
          selected={selectedIds.includes(book.id)}
          onToggleSelect={() => toggleSelect(book.id)}
          onAddToLibrary={handlers.onAddToLibrary}
          addingToLibrary={addingToLibraryId === book.id}
        />
      ))}
    </ScrollView>
  );

  // One-tap actions for the common cases; anything else goes through selection. They never
  // offer to join books already marked "not copies" of each other.
  const looseIds = loose.map((b) => b.id);
  const looseClean = resolvedAmong(group, looseIds).length === 0;
  const others = group.books.filter((b) => !looseIds.includes(b.id)).map((b) => b.id);
  const quick: Array<{ label: string; ids: string[]; rest: string[] }> = [];
  if (sets.length === 0 && loose.length >= 2 && looseClean) {
    quick.push({ label: loose.length > 2 ? "Все — копии" : "Это копии", ids: looseIds, rest: [] });
  }
  if (sets.length === 1) {
    const addable = looseIds.filter((id) => resolvedAmong(group, [id, ...sets[0].ids]).length === 0);
    if (addable.length) {
      quick.push({ label: `Добавить к набору (${addable.length})`, ids: [...addable, ...sets[0].ids], rest: [] });
    }
  }
  if (sets.length >= 1 && loose.length >= 2 && looseClean) {
    quick.push({ label: `Остальные — отдельный набор (${loose.length})`, ids: looseIds, rest: others });
  }

  return (
    <View style={[styles.groupCard, { borderLeftColor: decided ? "#43A047" : "#FB8C00" }]}>
      <View style={styles.groupHeader}>
        {group.matchedFields.map((f) => (
          <View key={f} style={[styles.badge, styles.badgeMatched]}>
            <AppText style={[styles.badgeText, styles.badgeMatchedText]}>✓ {f}</AppText>
          </View>
        ))}
        {group.differingFields.map((f) => (
          <View key={f} style={[styles.badge, styles.badgeDiffers]}>
            <AppText style={[styles.badgeText, styles.badgeDiffersText]}>≠ {f}</AppText>
          </View>
        ))}
        <AppText style={styles.bookCount}>{group.books.length} шт.</AppText>
      </View>
      <AppText style={styles.groupKey} numberOfLines={2}>
        {groupTitle(group)}
      </AppText>
      {(decided || newCount > 0) && (
        <AppText style={[styles.groupProgress, decided && styles.groupProgressDone]}>
          {decided ? "Разобрана ✓" : `Новых книг: ${newCount}`}
        </AppText>
      )}
      {group.conflictPairs.length > 0 && (
        <AppText style={styles.groupConflict}>
          ⚠ В наборе есть книги, ранее отмеченные «не копии» — набор важнее
        </AppText>
      )}

      {undecided.length > 0 && (
        <>
          {(sets.length > 0 || excluded.length > 0) && (
            <AppText style={styles.sectionLabel}>Не разобраны ({undecided.length})</AppText>
          )}
          {renderBooks(undecided, "loose")}
        </>
      )}
      {sets.map((s, i) => (
        <View key={s.copyGroupId} style={styles.setBlock}>
          <AppText style={styles.sectionLabel}>
            {sets.length > 1 ? `Набор копий ${i + 1}` : "Набор копий"} ({s.books.length})
          </AppText>
          {renderBooks(s.books, "set")}
        </View>
      ))}
      {excluded.length > 0 && !selecting && (
        <>
          {/* Bordered toggle with its own spacing — it must not read as part of the actions below */}
          <TouchableOpacity
            style={[styles.excludedToggle, excludedOpen && styles.excludedToggleOpen]}
            onPress={() => setExcludedOpen((v) => !v)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <AppText style={styles.excludedToggleText}>
              Не копии ({excluded.length})
            </AppText>
            <AppText style={styles.excludedToggleArrow}>
              {excludedOpen ? "Свернуть ▲" : "Показать ▼"}
            </AppText>
          </TouchableOpacity>
          {excludedOpen && renderBooks(excluded, "excluded")}
        </>
      )}

      {selecting ? (
        <>
          <AppText style={styles.selectHint}>
            Отметьте книги, которые являются копиями друг друга. Нажатие на книгу
            набора выбирает весь набор — выбранные книги добавятся к нему. Остальные
            будут отмечены «не копии» этих.
          </AppText>
          <TouchableOpacity
            style={[
              styles.markCopiesBtn,
              (selectedIds.length < 2 || busy) && styles.resolveBtnDisabled,
            ]}
            onPress={() => handlers.onMarkCopies(group, selectedIds, restOf(selectedIds))}
            disabled={selectedIds.length < 2 || busy}
            activeOpacity={0.7}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <AppText style={styles.markCopiesBtnText}>
                {selectedIds.length < 2
                  ? "Выберите минимум 2 книги"
                  : `Это копии (${selectedIds.length})`}
              </AppText>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={() => {
              setSelecting(false);
              setSelectedIds([]);
            }}
            disabled={busy}
            activeOpacity={0.7}
          >
            <AppText style={styles.resolveBtnText}>Отмена</AppText>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {quick.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={[styles.markCopiesBtn, busy && styles.resolveBtnDisabled]}
              onPress={() => handlers.onMarkCopies(group, q.ids, q.rest)}
              disabled={busy}
              activeOpacity={0.7}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <AppText style={styles.markCopiesBtnText}>{q.label}</AppText>
              )}
            </TouchableOpacity>
          ))}
          {loose.length + setIds.length > 2 && (
            <TouchableOpacity
              style={styles.splitBtn}
              onPress={() => setSelecting(true)}
              activeOpacity={0.7}
            >
              <AppText style={styles.splitBtnText}>
                Выбрать копии из группы
              </AppText>
            </TouchableOpacity>
          )}
          {!decided && (
            <TouchableOpacity
              style={[styles.resolveBtn, busy && styles.resolveBtnDisabled]}
              onPress={() => handlers.onResolveGroup(group)}
              disabled={busy}
              activeOpacity={0.7}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#555" />
              ) : (
                <AppText style={styles.resolveBtnText}>
                  {sets.length > 0 || excluded.length > 0
                    ? "Остальные — не копии"
                    : "Это не копии — пропустить"}
                </AppText>
              )}
            </TouchableOpacity>
          )}
        </>
      )}
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
  criterion?: DuplicateCriterion;
  respectIsbn?: boolean;
  includeUnknownAuthor?: boolean;
  showResolved?: boolean;
};

/** A copy-set request waiting for the main-copy picker */
type MarkRequest = {
  group: DuplicateGroup;
  bookIds: string[];
  restIds: string[];
  override: boolean;
};

export function DuplicatesScreen() {
  const undoable = useUndoable();
  const navigation = useNavigation<Nav>();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Server totals for the current filters and how much was loaded so far; groups/books
  // removed on screen (decided groups, deletes) are subtracted from the totals.
  const [serverTotal, setServerTotal] = useState({ groups: 0, books: 0 });
  const [loaded, setLoaded] = useState({ groups: 0, books: 0 });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [addingToLibraryId, setAddingToLibraryId] = useState<string | null>(null);
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [allBoxes, setAllBoxes] = useState<Array<{ id: string; boxNumber: string }>>([]);
  const [markCopiesPicker, setMarkCopiesPicker] = useState<MarkRequest | null>(null);

  // Criterion + switches; filters are loaded only once the stored view is read
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [viewReady, setViewReady] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Server-side filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
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

  useEffect(() => {
    loadDuplicatesView()
      .then(setView)
      .finally(() => setViewReady(true));
  }, []);

  const changeView = useCallback((patch: Partial<ViewState>) => {
    setView((prev) => {
      const next = { ...prev, ...patch };
      saveDuplicatesView(next);
      return next;
    });
  }, []);

  const PAGE_SIZE = 50;

  const activeFiltersRef = useRef<ServerFilters>({});

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
        // A newer request (other criterion or filters) has started — drop this answer
        if (activeFiltersRef.current !== filters) return;
        if (storesRes) setStores((storesRes as { stores: OzonStore[] }).stores);

        const newGroups = res.groups;
        setGroups(isFirstPage ? newGroups : (prev) => [...prev, ...newGroups]);
        setServerTotal({ groups: res.total, books: res.totalBooks });
        const newBooks = newGroups.reduce((n, g) => n + g.books.length, 0);
        setLoaded((prev) =>
          isFirstPage
            ? { groups: newGroups.length, books: newBooks }
            : { groups: prev.groups + newGroups.length, books: prev.books + newBooks },
        );
        setPage(pageNum);
        setHasMore(pageNum < res.totalPages);
      } catch {
        // silent
      } finally {
        if (activeFiltersRef.current === filters) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  const currentFilters = useCallback(
    (): ServerFilters => ({
      search: debouncedSearch.trim() || undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      count: filterCount ?? undefined,
      operatorId: filterOperatorId ?? undefined,
      storeId: filterStoreId ?? undefined,
      boxId: filterBoxId ?? undefined,
      ...duplicatesViewParams(view),
      showResolved: view.showResolved || undefined,
    }),
    [debouncedSearch, filterStatus, filterCount, filterOperatorId, filterStoreId, filterBoxId, view],
  );

  // This screen doesn't refetch on focus — pick up edits made in ProductDetail (e.g. library status)
  useEffect(
    () =>
      bookEvents.onBookUpdated((updated) =>
        setGroups((prev) => replaceBookInGroups(prev, updated)),
      ),
    [],
  );

  useEffect(() => {
    boxesService.getAllBoxes().then((fetched) => {
      setAllBoxes(
        fetched
          .map((b) => ({ id: b.id, boxNumber: b.boxNumber }))
          .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber)),
      );
    }).catch(() => {});
  }, []);

  // (Re)load when the view or a server-side filter changes
  useEffect(() => {
    if (!viewReady) return;
    setGroups([]);
    setLoading(true);
    fetchData(currentFilters(), 1, true);
  }, [viewReady, currentFilters, fetchData]);

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

  const totalGroups = serverTotal.groups - (loaded.groups - groups.length);
  const totalBooks =
    serverTotal.books - (loaded.books - groups.reduce((n, g) => n + g.books.length, 0));

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
    setFilterStatus("all");
    setFilterCount(null);
    setFilterSearch("");
    setFilterOperatorId(null);
    setFilterStoreId(null);
    setFilterBoxId(null);
  }, []);

  /**
   * Applies a change to one group (matched by id — the action may run after the list was
   * reloaded). A group leaves the list when fewer than 2 books remain, or when every pair is
   * decided and decided groups are hidden.
   */
  const updateGroup = useCallback(
    (gid: string, fn: (g: DuplicateGroup) => DuplicateGroup) =>
      setGroups((prev) =>
        prev
          .map((g) => (groupId(g) === gid ? fn(g) : g))
          .filter(
            (g) =>
              g.books.length >= 2 &&
              (viewRef.current.showResolved || g.unresolvedCount > 0),
          ),
      ),
    [],
  );

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
          onPress: () =>
            undoable({
              message: `Карточка «${book.title}» будет удалена`,
              action: async () => {
                setDeletingId(book.id);
                try {
                  await booksService.deleteBook(book.id);
                  setGroups((prev) =>
                    prev
                      .map((g) =>
                        g.books.some((b) => b.id === book.id)
                          ? recomputeGroup({ ...g, books: g.books.filter((b) => b.id !== book.id) })
                          : g,
                      )
                      .filter(
                        (g) =>
                          g.books.length >= 2 &&
                          (viewRef.current.showResolved || g.unresolvedCount > 0),
                      ),
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

  // The book stays in its group — only its status/caption changes to "В библиотеке"
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

  // "Не копия": the book is resolved against every other book of the group and folds away
  const handleNotCopy = useCallback(
    (group: DuplicateGroup, bookId: string) => {
      const book = group.books.find((b) => b.id === bookId);
      const pairs = newPairs(group, [bookId], group.books.map((b) => b.id));
      Alert.alert(
        "Не копия?",
        `Книга "${book?.title ?? "..."}" будет отмечена «не копия» для всех книг группы и свернётся в блок «Не копии». Решение можно отменить там же.`,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Подтвердить",
            onPress: () =>
              undoable({
                message: `«${book?.title ?? "Книга"}» будет отмечена «не копия»`,
                action: async () => {
                  setBusyBookId(bookId);
                  try {
                    await adminService.resolveDuplicates(pairs);
                    updateGroup(groupId(group), (g) =>
                      recomputeGroup({ ...g, resolvedPairs: [...g.resolvedPairs, ...pairs] }),
                    );
                  } catch {
                    Alert.alert("Ошибка", "Не удалось пометить как не копию");
                  } finally {
                    setBusyBookId(null);
                  }
                },
              }),
          },
        ],
      );
    },
    [undoable, updateGroup],
  );

  // "Вернуть": takes back the book's "not copies" inside this group
  // "Вернуть": takes back only the book's latest "not copies" in this group (the last tap);
  // its older decisions stay
  const handleRestore = useCallback(
    (group: DuplicateGroup, bookId: string) => {
      const others = group.books.map((b) => b.id).filter((id) => id !== bookId);
      setBusyBookId(bookId);
      adminService
        .unresolveLast(bookId, others)
        .then((undone) => {
          const gone = new Set(undone.map(([a, b]) => (a < b ? `${a}:${b}` : `${b}:${a}`)));
          updateGroup(groupId(group), (g) =>
            recomputeGroup({
              ...g,
              resolvedPairs: g.resolvedPairs.filter(
                ([a, b]) => !gone.has(a < b ? `${a}:${b}` : `${b}:${a}`),
              ),
            }),
          );
        })
        .catch(() => Alert.alert("Ошибка", "Не удалось отменить решение"))
        .finally(() => setBusyBookId(null));
    },
    [updateGroup],
  );

  // "Убрать из набора": the book stops being a copy and is "not a copy" of the rest of its set
  const handleRemoveFromSet = useCallback(
    (group: DuplicateGroup, bookId: string) => {
      const book = group.books.find((b) => b.id === bookId);
      const mates = group.books
        .filter((b) => b.id !== bookId && b.copyGroupId && b.copyGroupId === book?.copyGroupId)
        .map((b) => b.id);
      const pairs = newPairs(group, [bookId], mates);
      Alert.alert(
        "Убрать из набора?",
        `"${book?.title ?? "..."}" перестанет быть копией и будет отмечена «не копия» для остальных книг этого набора.`,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Убрать",
            onPress: () =>
              undoable({
                message: `«${book?.title ?? "Книга"}» будет убрана из набора`,
                action: async () => {
                  setBusyBookId(bookId);
                  try {
                    const { unmarkedIds } = await adminService.unmarkCopies([bookId]);
                    await adminService.resolveDuplicates(pairs);
                    const unmarked = new Set(unmarkedIds);
                    updateGroup(groupId(group), (g) =>
                      patchBooks(
                        g,
                        (b) =>
                          unmarked.has(b.id)
                            ? { ...b, isCopy: false, isCopyMaster: false, copyGroupId: null }
                            : b,
                        [...g.resolvedPairs, ...pairs],
                      ),
                    );
                  } catch {
                    Alert.alert("Ошибка", "Не удалось убрать книгу из набора");
                  } finally {
                    setBusyBookId(null);
                  }
                },
              }),
          },
        ],
      );
    },
    [undoable, updateGroup],
  );

  // "Это не копии": every undecided pair of the group is resolved
  const handleResolveGroup = useCallback(
    (group: DuplicateGroup) => {
      const pairs: Array<[string, string]> = [];
      const books = group.books;
      for (let i = 0; i < books.length; i++) {
        for (let j = i + 1; j < books.length; j++) {
          const a = books[i];
          const b = books[j];
          if (a.copyGroupId && b.copyGroupId) continue; // same set, or two sets — decided
          pairs.push([a.id, b.id]);
        }
      }
      const todo = pairs.filter(([a, b]) => newPairs(group, [a], [b]).length > 0);
      Alert.alert(
        group.sets.length > 0 ? "Остальные — не копии?" : "Это не копии?",
        "Неразобранные книги группы будут отмечены «не копии» друг для друга и для наборов. Группа уйдёт в разобранные.",
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Подтвердить",
            onPress: () =>
              undoable({
                message: "Группа будет отмечена «не копии»",
                action: async () => {
                  const gid = groupId(group);
                  setBusyKey(gid);
                  try {
                    await adminService.resolveDuplicates(todo);
                    updateGroup(gid, (g) =>
                      recomputeGroup({ ...g, resolvedPairs: [...g.resolvedPairs, ...todo] }),
                    );
                  } catch {
                    Alert.alert("Ошибка", "Не удалось отметить как не копии");
                  } finally {
                    setBusyKey(null);
                  }
                },
              }),
          },
        ],
      );
    },
    [undoable, updateGroup],
  );

  const doMarkCopies = useCallback(
    (req: MarkRequest, masterBookId: string | null) =>
      undoable({
        message: `Книг будет помечено как копии: ${req.bookIds.length}`,
        action: async () => {
          const { group, bookIds, restIds, override } = req;
          const gid = groupId(group);
          setBusyKey(gid);
          try {
            const { copyGroupId } = await adminService.markCopies(
              bookIds,
              masterBookId ?? undefined,
              restIds.length ? restIds : undefined,
              override || undefined,
            );
            const selected = new Set(bookIds);
            // The server merges whole sets the selection touches into one
            const mergedSets = new Set(
              group.books.filter((b) => selected.has(b.id) && b.copyGroupId).map((b) => b.copyGroupId),
            );
            const restPairs = newPairs(group, bookIds, restIds);
            const overridden = new Set(
              (override ? resolvedAmong(group, bookIds) : []).map(([a, b]) => `${a}:${b}`),
            );
            updateGroup(gid, (g) =>
              patchBooks(
                g,
                (b) => {
                  const joins = selected.has(b.id) || (b.copyGroupId && mergedSets.has(b.copyGroupId));
                  if (!joins) return b;
                  const isCopyMaster = masterBookId
                    ? b.id === masterBookId
                    : b.isCopy ? !!b.isCopyMaster : false;
                  return { ...b, isCopy: true, isCopyMaster, copyGroupId };
                },
                [
                  ...g.resolvedPairs.filter(([a, b]) => !overridden.has(`${a}:${b}`)),
                  ...restPairs,
                ],
              ),
            );
          } catch {
            Alert.alert("Ошибка", "Не удалось пометить как копии");
          } finally {
            setBusyKey(null);
          }
        },
      }),
    [undoable, updateGroup],
  );

  const askMarkCopies = useCallback(
    (req: MarkRequest) => {
      const { group, bookIds } = req;
      const books = group.books.filter((b) => bookIds.includes(b.id));
      const restCount = group.books.filter(
        (b) => !bookIds.includes(b.id) && !b.copyGroupId,
      ).length;
      const allUnpublished = books.every(
        (b) =>
          b.status !== BookStatus.PUBLISHED && b.status !== BookStatus.ARCHIVED,
      );
      const restNote = restCount
        ? ` Остальные ${restCount} останутся на проверке.`
        : "";
      Alert.alert(
        "Пометить как копии?",
        (allUnpublished
          ? books.some((b) => b.isCopyMaster)
            ? "Новые книги будут добавлены к уже подтверждённым копиям. Можно оставить текущую основную книгу или выбрать другую."
            : "Выберите основную книгу — она останется доступной для публикации на Ozon. Остальные выбранные будут помечены как копии."
          : `Выбранные ${books.length} книги будут помечены как копии и скрыты из очереди публикации.`) +
          restNote,
        [
          { text: "Отмена", style: "cancel" },
          {
            text: "Это копии",
            onPress: () => {
              if (allUnpublished) {
                setMarkCopiesPicker(req);
              } else {
                doMarkCopies(req, null);
              }
            },
          },
        ],
      );
    },
    [doMarkCopies],
  );

  const handleMarkCopies = useCallback(
    (group: DuplicateGroup, bookIds: string[], restIds: string[]) => {
      const req: MarkRequest = { group, bookIds, restIds, override: false };
      const conflicts = resolvedAmong(group, bookIds);
      if (!conflicts.length) {
        askMarkCopies(req);
        return;
      }
      Alert.alert(
        "Ранее отмечены как разные",
        `Среди выбранных книг ${conflicts.length} ${pluralRu(conflicts.length, "пара была отмечена", "пары были отмечены", "пар были отмечены")} «не копии». Всё равно объединить? Эти решения будут сняты.`,
        [
          { text: "Отмена", style: "cancel" },
          { text: "Объединить", onPress: () => askMarkCopies({ ...req, override: true }) },
        ],
      );
    },
    [askMarkCopies],
  );

  const handlers = useMemo<GroupHandlers>(
    () => ({
      onNavigate: navigate,
      onDelete: handleDelete,
      onAddToLibrary: handleAddToLibrary,
      onMarkCopies: handleMarkCopies,
      onResolveGroup: handleResolveGroup,
      onNotCopy: handleNotCopy,
      onRemoveFromSet: handleRemoveFromSet,
      onRestore: handleRestore,
    }),
    [navigate, handleDelete, handleAddToLibrary, handleMarkCopies, handleResolveGroup, handleNotCopy, handleRemoveFromSet, handleRestore],
  );

  // Books offered in the main-copy picker; the set's current main copy (if any) goes first
  const pickerBooks = useMemo(
    () =>
      (markCopiesPicker?.group.books ?? [])
        .filter((b) => markCopiesPicker!.bookIds.includes(b.id))
        .sort((a, b) => Number(!!b.isCopyMaster) - Number(!!a.isCopyMaster)),
    [markCopiesPicker],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchData(activeFiltersRef.current, page + 1);
  }, [loadingMore, hasMore, loading, page, fetchData]);

  const COUNT_OPTIONS = [
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4+", value: 4 },
  ];

  const totalActive = activeSecondaryCount;

  return (
    <View style={styles.container}>
      <View style={styles.filterPanel}>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.filterToggleBtn,
              styles.criterionToggleBtn,
              criteriaOpen && styles.filterToggleBtnActive,
            ]}
            onPress={() => {
              setCriteriaOpen((v) => !v);
              setFiltersOpen(false);
            }}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.filterToggleText,
                criteriaOpen && styles.filterToggleTextActive,
              ]}
              numberOfLines={1}
            >
              Критерий: {CRITERIA.find((c) => c.value === view.criterion)?.label}
              {criteriaOpen ? " ▲" : " ▼"}
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterToggleBtn,
              filtersOpen && styles.filterToggleBtnActive,
            ]}
            onPress={() => {
              setFiltersOpen((v) => !v);
              setCriteriaOpen(false);
            }}
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
        </View>
        {/* Own line, so a longer "Фильтры (N)" never pushes the buttons apart */}
        <AppText style={styles.filterCount}>
          {groups.length} {pluralRu(groups.length, "группа", "группы", "групп")} из{" "}
          {totalGroups} · {totalBooks}{" "}
          {pluralRu(totalBooks, "книга", "книги", "книг")}
        </AppText>

        {/* Expanded criterion panel: how copies are looked for */}
        {criteriaOpen && (
          <View style={styles.filterExpanded}>
            <AppText style={styles.filterSectionLabel}>Искать копии по</AppText>
            <View style={styles.criterionRow}>
              {CRITERIA.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.criterionBtn,
                    view.criterion === c.value && styles.criterionBtnActive,
                  ]}
                  onPress={() => changeView({ criterion: c.value })}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={[
                      styles.criterionBtnText,
                      view.criterion === c.value && styles.criterionBtnTextActive,
                    ]}
                    numberOfLines={2}
                  >
                    {c.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.switchRow}>
              {view.criterion !== "isbn" && (
                <View style={styles.switchItem}>
                  <Switch
                    value={view.respectIsbn}
                    onValueChange={(v) => changeView({ respectIsbn: v })}
                  />
                  <AppText style={styles.switchLabel}>Учитывать ISBN</AppText>
                </View>
              )}
              {view.criterion !== "isbn" && (
                <View style={styles.switchItem}>
                  <Switch
                    value={view.includeUnknownAuthor}
                    onValueChange={(v) => changeView({ includeUnknownAuthor: v })}
                  />
                  <AppText style={styles.switchLabel}>Книги без автора</AppText>
                </View>
              )}
              <View style={styles.switchItem}>
                <Switch
                  value={view.showResolved}
                  onValueChange={(v) => changeView({ showResolved: v })}
                />
                <AppText style={styles.switchLabel}>Разобранные</AppText>
              </View>
            </View>
          </View>
        )}

        {/* Expanded filter panel */}
        {filtersOpen && (
          <View style={styles.filterExpanded}>

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
          data={groups}
          keyExtractor={groupId}
          renderItem={({ item }) => (
            <DuplicateGroupCard
              group={item}
              handlers={handlers}
              busyKey={busyKey}
              busyBookId={busyBookId}
              deletingId={deletingId}
              addingToLibraryId={addingToLibraryId}
              stores={stores}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData(currentFilters(), 1, true);
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
                  : view.showResolved
                  ? "Копий не найдено"
                  : "Неразобранных групп нет"}
              </AppText>
            </View>
          }
        />
      )}

      {/* Mark copies — master book picker modal */}
      <Modal
        visible={markCopiesPicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setMarkCopiesPicker(null)}
      >
        <TouchableWithoutFeedback onPress={() => setMarkCopiesPicker(null)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerSheetHeader}>
                  <AppText style={styles.pickerSheetTitle}>
                    Выберите основную книгу
                  </AppText>
                  <TouchableOpacity
                    onPress={() => setMarkCopiesPicker(null)}
                  >
                    <AppText style={styles.pickerDoneBtn}>Отмена</AppText>
                  </TouchableOpacity>
                </View>
                <AppText style={styles.masterPickerHint}>
                  Она останется доступной для публикации на Ozon. Остальные
                  будут помечены как копии.
                </AppText>
                {pickerBooks.some((b) => b.isCopyMaster) && (
                  <TouchableOpacity
                    style={styles.keepMasterBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      const req = markCopiesPicker!;
                      setMarkCopiesPicker(null);
                      // no master id → the server keeps the set's current main copy
                      doMarkCopies(req, null);
                    }}
                  >
                    <AppText style={styles.keepMasterBtnText}>
                      Оставить текущую основную
                    </AppText>
                  </TouchableOpacity>
                )}
                <FlatList
                  data={pickerBooks}
                  keyExtractor={(item) => item.id}
                  style={styles.pickerList}
                  renderItem={({ item }) => {
                    const cover = item.photos?.find((p) => p.sortOrder === 0);
                    return (
                      <TouchableOpacity
                        style={styles.masterPickerItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          const req = markCopiesPicker!;
                          setMarkCopiesPicker(null);
                          doMarkCopies(req, item.id);
                        }}
                      >
                        {cover ? (
                          <Image
                            source={{ uri: thumbUri(cover) }}
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
                          {item.isCopyMaster ? (
                            <View style={styles.currentMasterBadge}>
                              <AppText style={styles.currentMasterBadgeText}>
                                Основная сейчас
                              </AppText>
                            </View>
                          ) : null}
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
    textAlign: "right",
    marginTop: 6,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  criterionToggleBtn: {
    flexShrink: 1,
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
  badgeMatched: {
    backgroundColor: "#E8F5E9",
  },
  badgeMatchedText: {
    color: "#2E7D32",
  },
  badgeDiffers: {
    backgroundColor: "#FFF3E0",
  },
  badgeDiffersText: {
    color: "#E65100",
  },
  bookCount: {
    fontSize: 11,
    color: "#aaa",
    marginLeft: "auto",
  },
  groupKey: {
    fontSize: 16,
    color: "#1A1A1A",
    fontWeight: "700",
    marginBottom: 8,
  },
  groupProgress: {
    fontSize: 12,
    color: "#E65100",
    marginBottom: 8,
  },
  groupProgressDone: {
    color: "#2E7D32",
  },
  groupConflict: {
    fontSize: 12,
    color: "#C62828",
    marginBottom: 8,
  },
  setBlock: {
    borderWidth: 1,
    borderColor: "#A5D6A7",
    backgroundColor: "#F6FBF6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingTop: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8A8A8A",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  miniCardExcluded: {
    opacity: 0.6,
  },
  miniBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  volumeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E3F2FD",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  volumeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1565C0",
  },
  excludedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D6D6D6",
    borderStyle: "dashed",
    borderRadius: 8,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  excludedToggleOpen: {
    marginBottom: 10,
  },
  excludedToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#616161",
  },
  excludedToggleArrow: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
  miniNote: {
    fontSize: 11,
    color: "#757575",
    fontStyle: "italic",
    marginTop: 2,
  },
  miniIsbnDiffers: {
    color: "#E65100",
    fontWeight: "600",
  },
  criterionRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  criterionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1976D2",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  criterionBtnActive: {
    backgroundColor: "#1976D2",
  },
  criterionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1976D2",
    textAlign: "center",
  },
  criterionBtnTextActive: {
    color: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 6,
  },
  switchItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  switchLabel: {
    fontSize: 13,
    color: "#444",
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
  libraryLabel: {
    marginTop: 8,
    backgroundColor: "#F3E5F5",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  libraryLabelText: {
    color: "#6A1B9A",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  libraryBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CE93D8",
    backgroundColor: "#F3E5F5",
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: "center",
  },
  libraryBtnText: {
    color: "#6A1B9A",
    fontSize: 12,
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
  keepMasterBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1976D2",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  keepMasterBtnText: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "600",
  },
  currentMasterBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#E8F5E9",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentMasterBadgeText: {
    fontSize: 11,
    color: "#2E7D32",
    fontWeight: "600",
  },
  splitBtn: {
    borderWidth: 1,
    borderColor: "#1976D2",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  splitBtnText: {
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "600",
  },
  selectHint: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  miniCardSelected: {
    borderColor: "#1976D2",
    borderWidth: 2,
    backgroundColor: "#E3F2FD",
  },
  selectCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheckOn: {
    backgroundColor: "#1976D2",
  },
  selectCheckMark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
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
