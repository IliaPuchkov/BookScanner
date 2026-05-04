import React, {
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
  useEffect,
  useRef,
} from "react";
import {
  View,
  SectionList,
  FlatList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Input } from "../../components/Input";
import { DatePickerInput } from "../../components/DatePickerInput";
import { adminService } from "../../services/admin.service";
import type { OzonStore, OzonStoreLimits } from "../../services/admin.service";
import { boxesService } from "../../services/boxes.service";
import { booksService } from "../../services/books.service";
import { visionService } from "../../services/vision.service";
import type { Book, Box, User } from "../../types";
import type {
  AdminCardCreationParamList,
  AdminMainStackParamList,
} from "../../navigation/AdminNavigator";
import { formatDate } from "../../utils/format";
import { bookEvents } from "../../utils/bookEvents";

interface Filters {
  boxId?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  priceMin?: string;
  priceMax?: string;
  yearFrom?: string;
  yearTo?: string;
  printRunMin?: string;
  printRunMax?: string;
}

function FilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <View style={tagStyles.tag}>
      <Text style={tagStyles.label} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={tagStyles.remove}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    borderRadius: 14,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 8,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    color: "#1565C0",
    maxWidth: 160,
    marginRight: 5,
  },
  remove: {
    fontSize: 10,
    color: "#1976D2",
    fontWeight: "700",
  },
});

function FilterRow({
  label,
  value,
  onOpen,
  onClear,
}: {
  label: string;
  value?: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text
        style={[rowStyles.value, !value && rowStyles.valuePlaceholder]}
        numberOfLines={1}
      >
        {value ?? "—"}
      </Text>
      {value ? (
        <TouchableOpacity
          style={rowStyles.btn}
          onPress={onClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={rowStyles.clearIcon}>✕</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={rowStyles.btn}
          onPress={onOpen}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={rowStyles.plusIcon}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 13,
    color: "#555",
    width: 130,
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "500",
    marginRight: 4,
  },
  valuePlaceholder: {
    color: "#bbb",
    fontWeight: "400",
  },
  btn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  plusIcon: {
    fontSize: 22,
    color: "#1976D2",
    fontWeight: "300",
    lineHeight: 26,
  },
  clearIcon: {
    fontSize: 12,
    color: "#999",
    fontWeight: "700",
  },
});

type Nav = NativeStackNavigationProp<AdminCardCreationParamList>;

// ---------------------------------------------------------------------------
// Memoized list items — prevents full-list re-renders on select/publish state
// ---------------------------------------------------------------------------

type PendingBookItemProps = {
  item: Book;
  selectMode: boolean;
  isSelected: boolean;
  isPublishing: boolean;
  onToggleSelect: (id: string) => void;
  onNavigate: (bookId: string) => void;
  onPublish: (book: Book) => void;
};

const PendingBookItem = React.memo(function PendingBookItem({
  item,
  selectMode,
  isSelected,
  isPublishing,
  onToggleSelect,
  onNavigate,
  onPublish,
}: PendingBookItemProps) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  return (
    <TouchableOpacity
      style={[styles.card, selectMode && isSelected && styles.cardSelected]}
      activeOpacity={0.7}
      onPress={() => {
        if (selectMode) onToggleSelect(item.id);
        else onNavigate(item.id);
      }}
    >
      <View style={styles.imageWrapper}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto.fileUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>Нет фото</Text>
          </View>
        )}
        {selectMode && (
          <View
            style={[styles.checkbox, isSelected && styles.checkboxSelected]}
          >
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {item.author}
          </Text>
        ) : null}
        <Text style={styles.sku}>{item.sku}</Text>
        {item.price != null && Number(item.price) > 0 && (
          <Text style={styles.price}>{Number(item.price).toFixed(0)} ₽</Text>
        )}
        {!selectMode && (
          <TouchableOpacity
            style={[
              styles.publishBtn,
              isPublishing && styles.publishBtnDisabled,
            ]}
            onPress={() => onPublish(item)}
            disabled={isPublishing}
            activeOpacity={0.7}
          >
            {isPublishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.publishBtnText}>Загрузить в Озон</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});


export function PendingReviewScreen() {
  const navigation = useNavigation<Nav>();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkReExtracting, setBulkReExtracting] = useState(false);
  const [bulkActionsVisible, setBulkActionsVisible] = useState(false);
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<
    Record<string, OzonStoreLimits | null | undefined>
  >({});
  // boxId -> actual total count of pending review books
  const [boxCounts, setBoxCounts] = useState<Record<string, number>>({});
  // boxId -> all book IDs (fetched when user clicks "Выбрать всё" for a box with unloaded books)
  const [boxAllIds, setBoxAllIds] = useState<Record<string, string[]>>({});
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [pendingPublishAction, setPendingPublishAction] = useState<
    { type: "single"; book: Book } | { type: "bulk"; ids: string[] } | null
  >(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [activePickerFilter, setActivePickerFilter] = useState<string | null>(
    null,
  );
  const [pickerSearch, setPickerSearch] = useState("");
  const [tempDateFrom, setTempDateFrom] = useState("");
  const [tempDateTo, setTempDateTo] = useState("");
  const [tempPriceMin, setTempPriceMin] = useState("");
  const [tempPriceMax, setTempPriceMax] = useState("");
  const [tempYearFrom, setTempYearFrom] = useState("");
  const [tempYearTo, setTempYearTo] = useState("");
  const [printRunMin, setPrintRunMin] = useState("");
  const [printRunMax, setPrintRunMax] = useState("");
  const [tempPrintRunMin, setTempPrintRunMin] = useState("");
  const [tempPrintRunMax, setTempPrintRunMax] = useState("");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [filterUsers, setFilterUsers] = useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeParamsRef = useRef({ search: "", filters: {} as Filters });
  const loadingMoreRef = useRef(false);
  const fetchGenRef = useRef(0);
  const searchRef = useRef("");
  const filtersRef = useRef<Filters>({});


  // Load filter options once
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [allBoxes, usersRes] = await Promise.all([
          boxesService.getAllBoxes(),
          adminService.getUsers(1, 100),
        ]);
        const sorted = [...allBoxes].sort((a, b) =>
          a.boxNumber.localeCompare(b.boxNumber, undefined, { numeric: true }),
        );
        setBoxes(sorted);
        setFilterUsers(
          usersRes.data.map((u: User) => ({ id: u.id, fullName: u.fullName })),
        );
      } catch {
        // silent
      }
    };
    loadOptions();
  }, []);

  const [polling, setPolling] = useState<{
    total: number;
    completed: number;
    failed: number;
    ids: string[];
  } | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const isReturningRef = useRef(false);

  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    return bookEvents.onBookUpdated((updatedBook) => {
      setBooks((prev) => prev.map((b) => b.id === updatedBook.id ? updatedBook : b));
    });
  }, []);

  useEffect(() => {
    if (!polling) return;

    const checkProgress = async () => {
      const results = await Promise.allSettled(
        polling.ids.map((id) => visionService.getResult(id)),
      );
      let completed = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          if (r.value.status === "completed") completed++;
          else if (r.value.status === "failed") failed++;
        }
      }
      const done = completed + failed;
      if (done >= polling.total) {
        if (pollingIntervalRef.current)
          clearInterval(pollingIntervalRef.current);
        setPolling(null);
        exitSelectMode();
        if (failed > 0) {
          Alert.alert(
            "Готово с ошибками",
            `Распознано: ${completed}, не удалось: ${failed}`,
          );
        } else {
          Alert.alert("Готово", `Распознано ${completed} карточек`);
        }
        fetchBooks(
          1,
          activeParamsRef.current.search,
          activeParamsRef.current.filters,
          "refresh",
        );
      } else {
        setPolling((prev) => (prev ? { ...prev, completed, failed } : null));
      }
    };

    pollingIntervalRef.current = setInterval(checkProgress, 3000);
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [polling?.ids]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);


  useLayoutEffect(() => {
    if (selectMode) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={exitSelectMode}
            style={{
              width: 44,
              height: 44,
              backgroundColor: "#1976D2",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
              Отмена
            </Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={{
              width: 44,
              height: 44,
              backgroundColor: "#1976D2",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 22,
                fontWeight: "700",
                letterSpacing: 1,
              }}
            >
              ⋮
            </Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, selectMode, exitSelectMode]);

  const fetchBooks = useCallback(
    async (
      p: number,
      query: string,
      currentFilters: Filters,
      mode: "initial" | "refresh" | "more",
    ) => {
      // For non-"more" requests, bump the generation so any older in-flight
      // "initial"/"refresh" response is ignored when it arrives.
      const gen = mode !== "more" ? ++fetchGenRef.current : fetchGenRef.current;

      if (mode === "initial") setLoading(true);
      if (mode === "more") setLoadingMore(true);

      try {
        if (mode !== "more") {
          activeParamsRef.current = { search: query, filters: currentFilters };
        }

        const params: Record<string, string> = {};
        if (currentFilters.boxId) params.boxId = currentFilters.boxId;
        if (currentFilters.createdById)
          params.createdById = currentFilters.createdById;
        if (currentFilters.dateFrom) params.dateFrom = currentFilters.dateFrom;
        if (currentFilters.dateTo) params.dateTo = currentFilters.dateTo;
        if (currentFilters.priceMin) params.priceMin = currentFilters.priceMin;
        if (currentFilters.priceMax) params.priceMax = currentFilters.priceMax;
        if (currentFilters.yearFrom) params.yearFrom = currentFilters.yearFrom;
        if (currentFilters.yearTo) params.yearTo = currentFilters.yearTo;
        if (currentFilters.printRunMin) params.printRunMin = currentFilters.printRunMin;
        if (currentFilters.printRunMax) params.printRunMax = currentFilters.printRunMax;
        if (query) params.search = query;

        const res = await adminService.getPendingReviewBooks(
          p,
          20,
          Object.keys(params).length > 0 ? params : undefined,
        );

        // Discard stale non-"more" responses that arrived after a newer fetch started
        if (mode !== "more" && gen !== fetchGenRef.current) return;

        if (mode === "more") {
          setBooks((prev) => [...prev, ...res.data]);
        } else {
          setBooks(res.data);
        }
        setHasMore(p < res.meta.totalPages);
        setPage(p);
      } catch {
        console.error("PendingReview fetch error");
      } finally {
        loadingMoreRef.current = false;
        if (mode !== "more" && gen !== fetchGenRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
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
      fetchBooks(1, searchRef.current, filtersRef.current, "initial");
      adminService
        .getPendingReviewCountsByBox()
        .then((counts) => {
          const map: Record<string, number> = {};
          counts.forEach((c) => {
            map[c.boxId] = c.count;
          });
          setBoxCounts(map);
        })
        .catch(() => {});
      adminService
        .getOzonStores()
        .then(({ stores }) => setStores(stores))
        .catch(() => {});
    }, [fetchBooks]),
  );

  const refreshStoreLimits = async (storeList: OzonStore[]) => {
    setStoreLimits(Object.fromEntries(storeList.map((s) => [s.id, undefined])));
    const entries = await Promise.all(
      storeList.map(async (store) => {
        try {
          const limits = await adminService.getOzonStoreLimits(store.id);
          return [store.id, limits] as const;
        } catch {
          return [store.id, null] as const;
        }
      }),
    );
    setStoreLimits(Object.fromEntries(entries));
  };

  const getLimitStatus = (storeId: string, count: number) => {
    const limits = storeLimits[storeId];
    if (limits === undefined)
      return { blocked: false, label: "Загрузка...", warn: false };
    if (limits === null)
      return { blocked: false, label: "Лимиты недоступны", warn: false };

    const totalRemaining =
      limits.total.limit > 0 ? limits.total.limit - limits.total.usage : null;
    const totalExhausted = totalRemaining !== null && totalRemaining <= 0;
    const totalLine =
      totalRemaining !== null
        ? `Ассортимент: ${totalRemaining} / ${limits.total.limit} осталось мест`
        : "Ассортимент: не ограничен";

    if (totalExhausted) {
      return { blocked: true, label: `${totalLine}`, warn: true };
    }

    if (limits.daily_create.limit > 0) {
      const remaining = limits.daily_create.limit - limits.daily_create.usage;
      const createLine = `Создание: ${remaining} / ${limits.daily_create.limit} сегодня`;
      if (remaining <= 0) {
        return {
          blocked: true,
          label: `${createLine}\n${totalLine}`,
          warn: true,
        };
      }
      if (remaining < count) {
        return {
          blocked: true,
          label: `Недостаточно лимита: нужно ${count}, доступно ${remaining}\n${totalLine}`,
          warn: true,
        };
      }
      return {
        blocked: false,
        label: `${createLine}\n${totalLine}`,
        warn: false,
      };
    }

    return {
      blocked: false,
      label: `Создание: не ограничено\n${totalLine}`,
      warn: false,
    };
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setBoxAllIds({});
    fetchBooks(1, search, filters, "refresh");
    adminService
      .getPendingReviewCountsByBox()
      .then((counts) => {
        const map: Record<string, number> = {};
        counts.forEach((c) => {
          map[c.boxId] = c.count;
        });
        setBoxCounts(map);
      })
      .catch(() => {});
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMoreRef.current && !loading) {
      loadingMoreRef.current = true;
      const { search: s, filters: f } = activeParamsRef.current;
      fetchBooks(page + 1, s, f, "more");
    }
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchBooks(1, text, filters, "initial");
    }, 400);
  };

  const openPicker = (key: string) => {
    if (key === "date") {
      setTempDateFrom(dateFrom);
      setTempDateTo(dateTo);
    }
    if (key === "price") {
      setTempPriceMin(priceMin);
      setTempPriceMax(priceMax);
    }
    if (key === "year") {
      setTempYearFrom(yearFrom);
      setTempYearTo(yearTo);
    }
    if (key === "printRun") {
      setTempPrintRunMin(printRunMin);
      setTempPrintRunMax(printRunMax);
    }
    setPickerSearch("");
    setActivePickerFilter(key);
  };

  const applyRangeFilter = (key: "date" | "price" | "year" | "printRun") => {
    if (key === "price") {
      if (
        tempPriceMin &&
        tempPriceMax &&
        parseFloat(tempPriceMin) > parseFloat(tempPriceMax)
      ) {
        Alert.alert(
          "Ошибка",
          "Минимальная цена не может быть больше максимальной",
        );
        return;
      }
      setPriceMin(tempPriceMin);
      setPriceMax(tempPriceMax);
      const newF = { ...filters };
      if (tempPriceMin) newF.priceMin = tempPriceMin;
      else delete newF.priceMin;
      if (tempPriceMax) newF.priceMax = tempPriceMax;
      else delete newF.priceMax;
      setFilters(newF);
      setActivePickerFilter(null);
      fetchBooks(1, search, newF, "initial");
    } else if (key === "year") {
      if (
        tempYearFrom &&
        tempYearTo &&
        parseInt(tempYearFrom, 10) > parseInt(tempYearTo, 10)
      ) {
        Alert.alert("Ошибка", 'Год "от" не может быть больше года "до"');
        return;
      }
      setYearFrom(tempYearFrom);
      setYearTo(tempYearTo);
      const newF = { ...filters };
      if (tempYearFrom) newF.yearFrom = tempYearFrom;
      else delete newF.yearFrom;
      if (tempYearTo) newF.yearTo = tempYearTo;
      else delete newF.yearTo;
      setFilters(newF);
      setActivePickerFilter(null);
      fetchBooks(1, search, newF, "initial");
    } else if (key === "printRun") {
      setPrintRunMin(tempPrintRunMin);
      setPrintRunMax(tempPrintRunMax);
      const newF = { ...filters };
      if (tempPrintRunMin) newF.printRunMin = tempPrintRunMin;
      else delete newF.printRunMin;
      if (tempPrintRunMax) newF.printRunMax = tempPrintRunMax;
      else delete newF.printRunMax;
      setFilters(newF);
      setActivePickerFilter(null);
      fetchBooks(1, search, newF, "initial");
    } else {
      setDateFrom(tempDateFrom);
      setDateTo(tempDateTo);
      const newF = { ...filters };
      if (tempDateFrom) newF.dateFrom = tempDateFrom;
      else delete newF.dateFrom;
      if (tempDateTo) newF.dateTo = tempDateTo;
      else delete newF.dateTo;
      setFilters(newF);
      setActivePickerFilter(null);
      fetchBooks(1, search, newF, "initial");
    }
  };

  const resetFilters = () => {
    const empty: Filters = {};
    setFilters(empty);
    setDateFrom("");
    setDateTo("");
    setPriceMin("");
    setPriceMax("");
    setYearFrom("");
    setYearTo("");
    setPrintRunMin("");
    setPrintRunMax("");
    setShowFilters(false);
    fetchBooks(1, search, empty, "initial");
  };

  const removeFilter = (
    key: "boxId" | "createdById" | "date" | "price" | "year" | "printRun",
  ) => {
    const newFilters = { ...filters };
    if (key === "date") {
      delete newFilters.dateFrom;
      delete newFilters.dateTo;
      setDateFrom("");
      setDateTo("");
    } else if (key === "price") {
      delete newFilters.priceMin;
      delete newFilters.priceMax;
      setPriceMin("");
      setPriceMax("");
    } else if (key === "year") {
      delete newFilters.yearFrom;
      delete newFilters.yearTo;
      setYearFrom("");
      setYearTo("");
    } else if (key === "printRun") {
      delete newFilters.printRunMin;
      delete newFilters.printRunMax;
      setPrintRunMin("");
      setPrintRunMax("");
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    fetchBooks(1, search, newFilters, "initial");
  };

  const activeFilterCount =
    (filters.boxId ? 1 : 0) +
    (filters.createdById ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.yearFrom || filters.yearTo ? 1 : 0) +
    (filters.printRunMin || filters.printRunMax ? 1 : 0);

  const executePublish = async (
    action: { type: "single"; book: Book } | { type: "bulk"; ids: string[] },
    storeId: string,
  ) => {
    if (action.type === "single") {
      setPublishingId(action.book.id);
      try {
        await booksService.publishToOzon(action.book.id, storeId);
        Alert.alert("Готово", "Карточка отправлена на модерацию Ozon");
        setBooks((prev) => prev.filter((b) => b.id !== action.book.id));
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить в Озон");
      } finally {
        setPublishingId(null);
      }
    } else {
      setBulkPublishing(true);
      try {
        const result = await booksService.publishBulkToOzon(
          action.ids,
          storeId,
        );
        setBooks((prev) => prev.filter((b) => !action.ids.includes(b.id)));
        exitSelectMode();
        if (result.failed > 0) {
          Alert.alert(
            "Готово с ошибками",
            `Отправлено: ${result.succeeded}, не удалось: ${result.failed}`,
          );
        } else {
          Alert.alert(
            "Готово",
            `${result.succeeded} книг отправлено на модерацию Ozon`,
          );
        }
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить книги в Озон");
      } finally {
        setBulkPublishing(false);
      }
    }
  };

  const initiatePublish = (
    action: { type: "single"; book: Book } | { type: "bulk"; ids: string[] },
  ) => {
    if (stores.length === 0) {
      Alert.alert(
        "Нет магазинов",
        "Добавьте магазин Ozon в настройках администратора.",
      );
      return;
    }
    setPendingPublishAction(action);
    refreshStoreLimits(stores);
    setStorePickerVisible(true);
  };

  const handlePublish = useCallback(
    (book: Book) => {
      initiatePublish({ type: "single", book });
    },
    [stores],
  );


  const handleNavigateToPending = useCallback(
    (bookId: string) => {
      isReturningRef.current = true;
      navigation.navigate("ProductDetail", { bookId, editable: true });
    },
    [navigation],
  );

  type BookSection = {
    title: string;
    data: Book[];
    operatorName?: string;
    sectionDate?: string;
  };

  const sections = useMemo((): BookSection[] => {
    const grouped: Record<string, Book[]> = {};
    for (const book of books) {
      const key = book.box?.boxNumber ?? book.boxId ?? "Без коробки";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(book);
    }
    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data,
      operatorName: data[0]?.createdBy?.fullName,
      sectionDate: data[0]?.createdAt,
    }));
  }, [books]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectBox = useCallback(
    async (sectionBooks: Book[]) => {
      const boxId = sectionBooks[0]?.boxId;
      const loadedIds = sectionBooks.map((b) => b.id);

      // When filters or search are active, only operate on the visible filtered books
      const hasActiveFilters =
        searchRef.current.length > 0 ||
        Object.keys(filtersRef.current).length > 0;

      if (hasActiveFilters) {
        const allSelected =
          loadedIds.length > 0 &&
          loadedIds.every((id) => selectedIds.has(id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (allSelected) {
            loadedIds.forEach((id) => next.delete(id));
          } else {
            loadedIds.forEach((id) => next.add(id));
          }
          return next;
        });
        return;
      }

      const cachedIds = boxId ? boxAllIds[boxId] : undefined;
      const idsToCheck = cachedIds ?? loadedIds;
      const allSelected =
        idsToCheck.length > 0 && idsToCheck.every((id) => selectedIds.has(id));

      if (allSelected) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          idsToCheck.forEach((id) => next.delete(id));
          return next;
        });
        return;
      }

      const actualCount = boxId
        ? (boxCounts[boxId] ?? loadedIds.length)
        : loadedIds.length;

      if (!boxId || loadedIds.length >= actualCount || cachedIds) {
        const toAdd = cachedIds ?? loadedIds;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          toAdd.forEach((id) => next.add(id));
          return next;
        });
      } else {
        try {
          const allIds = await adminService.getPendingReviewIds(boxId);
          setBoxAllIds((prev) => ({ ...prev, [boxId]: allIds }));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            allIds.forEach((id) => next.add(id));
            return next;
          });
        } catch {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            loadedIds.forEach((id) => next.add(id));
            return next;
          });
        }
      }
    },
    [selectedIds, boxCounts, boxAllIds],
  );

  const handleBulkPublish = () => {
    if (selectedIds.size === 0) return;
    initiatePublish({ type: "bulk", ids: Array.from(selectedIds) });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const n = ids.length;
    Alert.alert(
      "Удалить карточки?",
      `Будет безвозвратно удалено ${n} ${n === 1 ? "карточка" : n < 5 ? "карточки" : "карточек"}. Это действие необратимо.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            setBulkDeleting(true);
            try {
              const results = await Promise.allSettled(
                ids.map((id) => booksService.deleteBook(id)),
              );
              const failed = results.filter(
                (r) => r.status === "rejected",
              ).length;
              const succeeded = results.length - failed;
              setBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
              exitSelectMode();
              if (failed > 0) {
                Alert.alert(
                  "Готово с ошибками",
                  `Удалено: ${succeeded}, не удалось: ${failed}`,
                );
              } else {
                Alert.alert("Готово", `Удалено ${succeeded} карточек`);
              }
            } catch {
              Alert.alert("Ошибка", "Не удалось выполнить удаление");
            } finally {
              setBulkDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleBulkReExtract = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const n = ids.length;
    Alert.alert(
      "Повторное распознавание?",
      `ИИ заново обработает фотографии ${n} ${n === 1 ? "карточки" : n < 5 ? "карточек" : "карточек"} и перезапишет данные.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Распознать",
          onPress: async () => {
            setBulkReExtracting(true);
            try {
              await visionService.extractBulk(ids);
              setPolling({ total: n, completed: 0, failed: 0, ids });
            } catch {
              Alert.alert("Ошибка", "Не удалось поставить книги в очередь");
            } finally {
              setBulkReExtracting(false);
            }
          },
        },
      ],
    );
  };


  const renderItem = useCallback(
    ({ item }: { item: Book }) => (
      <PendingBookItem
        item={item}
        selectMode={selectMode}
        isSelected={selectedIds.has(item.id)}
        isPublishing={publishingId === item.id}
        onToggleSelect={toggleSelect}
        onNavigate={handleNavigateToPending}
        onPublish={handlePublish}
      />
    ),
    [
      selectMode,
      selectedIds,
      publishingId,
      toggleSelect,
      handleNavigateToPending,
      handlePublish,
    ],
  );

  return (
    <>
      <Modal
        visible={storePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStorePickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStorePickerVisible(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContainer}>
                <Text style={styles.storePickerTitle}>
                  Выберите магазин Ozon
                </Text>
                {stores.map((store) => {
                  const count = pendingPublishAction
                    ? pendingPublishAction.type === "single"
                      ? 1
                      : pendingPublishAction.ids.length
                    : 1;
                  const { blocked, label, warn } = getLimitStatus(
                    store.id,
                    count,
                  );
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.menuItem,
                        blocked && styles.storeItemBlocked,
                      ]}
                      activeOpacity={blocked ? 1 : 0.7}
                      disabled={blocked}
                      onPress={() => {
                        setStorePickerVisible(false);
                        if (pendingPublishAction) {
                          const action = pendingPublishAction;
                          setPendingPublishAction(null);
                          Alert.alert(
                            "Подтверждение",
                            `Загрузить ${count} ${count === 1 ? "книгу" : "книг"} в магазин "${store.name}"?`,
                            [
                              { text: "Отмена", style: "cancel" },
                              {
                                text: "Загрузить",
                                onPress: () => executePublish(action, store.id),
                              },
                            ],
                          );
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.menuItemText,
                          blocked && styles.storeItemBlockedText,
                        ]}
                      >
                        {store.name}
                      </Text>
                      <Text
                        style={[
                          styles.storeItemClientId,
                          warn && styles.storeItemLimitWarn,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContainer}>
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setMenuVisible(false);
                    setSelectMode(true);
                  }}
                >
                  <Text style={styles.menuItemText}>Выбрать несколько</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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

      {showFilters && (
        <View style={styles.filterPanel}>
          <FilterRow
            label="Коробка"
            value={
              filters.boxId
                ? boxes.find((b) => b.id === filters.boxId)?.boxNumber
                : undefined
            }
            onOpen={() => openPicker("boxId")}
            onClear={() => removeFilter("boxId")}
          />
          <FilterRow
            label="Оператор"
            value={
              filters.createdById
                ? filterUsers.find((u) => u.id === filters.createdById)
                    ?.fullName
                : undefined
            }
            onOpen={() => openPicker("createdById")}
            onClear={() => removeFilter("createdById")}
          />
          <FilterRow
            label="Период создания"
            value={
              filters.dateFrom || filters.dateTo
                ? `${filters.dateFrom ? formatDate(filters.dateFrom) : "..."} — ${filters.dateTo ? formatDate(filters.dateTo) : "..."}`
                : undefined
            }
            onOpen={() => openPicker("date")}
            onClear={() => removeFilter("date")}
          />
          <FilterRow
            label="Цена (₽)"
            value={
              filters.priceMin || filters.priceMax
                ? `${filters.priceMin || "0"} — ${filters.priceMax || "∞"} ₽`
                : undefined
            }
            onOpen={() => openPicker("price")}
            onClear={() => removeFilter("price")}
          />
          <FilterRow
            label="Год издания"
            value={
              filters.yearFrom || filters.yearTo
                ? `${filters.yearFrom || "..."} — ${filters.yearTo || "..."}`
                : undefined
            }
            onOpen={() => openPicker("year")}
            onClear={() => removeFilter("year")}
          />
          <FilterRow
            label="Тираж"
            value={
              filters.printRunMin || filters.printRunMax
                ? `${filters.printRunMin || "..."} — ${filters.printRunMax || "..."}`
                : undefined
            }
            onOpen={() => openPicker("printRun")}
            onClear={() => removeFilter("printRun")}
          />
          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
              <Text style={styles.resetBtnText}>Сбросить фильтры</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Per-filter picker modal */}
      <Modal
        visible={activePickerFilter !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePickerFilter(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={() => setActivePickerFilter(null)}>
            <View style={styles.pickerOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerSheetHeader}>
                    <Text style={styles.pickerSheetTitle}>
                      {activePickerFilter === "boxId"
                        ? "Коробка"
                        : activePickerFilter === "createdById"
                          ? "Оператор"
                          : activePickerFilter === "date"
                            ? "Период создания"
                            : activePickerFilter === "price"
                              ? "Цена (₽)"
                              : activePickerFilter === "year"
                                ? "Год издания"
                                : "Тираж"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setActivePickerFilter(null)}
                    >
                      <Text style={styles.pickerDoneBtn}>Закрыть</Text>
                    </TouchableOpacity>
                  </View>

                  {activePickerFilter === "boxId" && (
                    <View style={styles.pickerBody}>
                      <TextInput
                        style={styles.pickerSearchInput}
                        placeholder="Поиск по номеру коробки..."
                        placeholderTextColor="#aaa"
                        value={pickerSearch}
                        onChangeText={setPickerSearch}
                        autoFocus
                        clearButtonMode="while-editing"
                      />
                      <FlatList<{ id: string; boxNumber: string }>
                        data={[
                          { id: "", boxNumber: "Все коробки" },
                          ...boxes.filter((b) =>
                            b.boxNumber
                              .toLowerCase()
                              .includes(pickerSearch.toLowerCase()),
                          ),
                        ]}
                        keyExtractor={(item) => item.id}
                        style={styles.pickerList}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => {
                          const isAll = item.id === "";
                          const active = isAll
                            ? !filters.boxId
                            : filters.boxId === item.id;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.pickerListItem,
                                active && styles.pickerListItemActive,
                              ]}
                              onPress={() => {
                                const newF = { ...filters };
                                if (isAll) delete newF.boxId;
                                else newF.boxId = item.id;
                                setFilters(newF);
                                fetchBooks(1, search, newF, "initial");
                                setActivePickerFilter(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.pickerListItemText,
                                  active && styles.pickerListItemTextActive,
                                ]}
                              >
                                {item.boxNumber}
                              </Text>
                              {active && (
                                <Text style={styles.pickerListCheckmark}>
                                  ✓
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        }}
                      />
                    </View>
                  )}

                  {activePickerFilter === "createdById" && (
                    <View style={styles.pickerBody}>
                      <TextInput
                        style={styles.pickerSearchInput}
                        placeholder="Поиск по имени..."
                        placeholderTextColor="#aaa"
                        value={pickerSearch}
                        onChangeText={setPickerSearch}
                        autoFocus
                        clearButtonMode="while-editing"
                      />
                      <FlatList<{ id: string; fullName: string }>
                        data={[
                          { id: "", fullName: "Все операторы" },
                          ...filterUsers.filter((u) =>
                            u.fullName
                              .toLowerCase()
                              .includes(pickerSearch.toLowerCase()),
                          ),
                        ]}
                        keyExtractor={(item) => item.id}
                        style={styles.pickerList}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => {
                          const isAll = item.id === "";
                          const active = isAll
                            ? !filters.createdById
                            : filters.createdById === item.id;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.pickerListItem,
                                active && styles.pickerListItemActive,
                              ]}
                              onPress={() => {
                                const newF = { ...filters };
                                if (isAll) delete newF.createdById;
                                else newF.createdById = item.id;
                                setFilters(newF);
                                fetchBooks(1, search, newF, "initial");
                                setActivePickerFilter(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.pickerListItemText,
                                  active && styles.pickerListItemTextActive,
                                ]}
                              >
                                {item.fullName}
                              </Text>
                              {active && (
                                <Text style={styles.pickerListCheckmark}>
                                  ✓
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        }}
                      />
                    </View>
                  )}

                  {activePickerFilter === "date" && (
                    <View style={styles.pickerBody}>
                      <View style={styles.rangeRow}>
                        <DatePickerInput
                          value={tempDateFrom}
                          onChange={setTempDateFrom}
                          placeholder="с"
                          maximumDate={
                            tempDateTo ? new Date(tempDateTo) : undefined
                          }
                        />
                        <Text style={styles.rangeSep}>—</Text>
                        <DatePickerInput
                          value={tempDateTo}
                          onChange={setTempDateTo}
                          placeholder="по"
                          minimumDate={
                            tempDateFrom ? new Date(tempDateFrom) : undefined
                          }
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.applyBtn, { marginTop: 16 }]}
                        onPress={() => applyRangeFilter("date")}
                      >
                        <Text style={styles.applyBtnText}>Применить</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {activePickerFilter === "price" && (
                    <View style={styles.pickerBody}>
                      <View style={styles.rangeRow}>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="от"
                            value={tempPriceMin}
                            onChangeText={setTempPriceMin}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                        <Text style={styles.rangeSep}>—</Text>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="до"
                            value={tempPriceMax}
                            onChangeText={setTempPriceMax}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.applyBtn, { marginTop: 16 }]}
                        onPress={() => applyRangeFilter("price")}
                      >
                        <Text style={styles.applyBtnText}>Применить</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {activePickerFilter === "year" && (
                    <View style={styles.pickerBody}>
                      <View style={styles.rangeRow}>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="от"
                            value={tempYearFrom}
                            onChangeText={setTempYearFrom}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                        <Text style={styles.rangeSep}>—</Text>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="до"
                            value={tempYearTo}
                            onChangeText={setTempYearTo}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.applyBtn, { marginTop: 16 }]}
                        onPress={() => applyRangeFilter("year")}
                      >
                        <Text style={styles.applyBtnText}>Применить</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Print run range */}
                  {activePickerFilter === "printRun" && (
                    <View style={styles.pickerBody}>
                      <View style={styles.rangeRow}>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="от"
                            value={tempPrintRunMin}
                            onChangeText={setTempPrintRunMin}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                        <Text style={styles.rangeSep}>—</Text>
                        <View style={{ flex: 1 }}>
                          <Input
                            label=""
                            placeholder="до"
                            value={tempPrintRunMax}
                            onChangeText={setTempPrintRunMax}
                            keyboardType="numeric"
                            style={{ marginBottom: 0 }}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.applyBtn, { marginTop: 16 }]}
                        onPress={() => applyRangeFilter("printRun")}
                      >
                        <Text style={styles.applyBtnText}>Применить</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : (
        <SectionList
          style={styles.container}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => {
            const s = section as BookSection;
            const firstBoxId = s.data[0]?.boxId;
            const cachedIds = firstBoxId ? boxAllIds[firstBoxId] : undefined;
            const idsToCheck = cachedIds ?? s.data.map((b) => b.id);
            const allSelected =
              idsToCheck.length > 0 &&
              idsToCheck.every((id) => selectedIds.has(id));
            const sectionCount = firstBoxId
              ? (boxCounts[firstBoxId] ?? s.data.length)
              : s.data.length;
            return (
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionHeaderText}>
                    📦 Коробка {s.title}
                  </Text>
                  <View style={styles.sectionHeaderMeta}>
                    {s.operatorName ? (
                      <Text style={styles.sectionHeaderMetaText}>
                        {s.operatorName}
                      </Text>
                    ) : null}
                    {s.sectionDate ? (
                      <Text style={styles.sectionHeaderMetaText}>
                        {s.operatorName ? "  ·  " : ""}
                        {formatDate(s.sectionDate)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {selectMode ? (
                  <TouchableOpacity
                    onPress={() => toggleSelectBox(s.data)}
                    style={[
                      styles.selectBoxBtn,
                      allSelected && styles.selectBoxBtnActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.selectBoxBtnText,
                        allSelected && styles.selectBoxBtnTextActive,
                      ]}
                    >
                      {allSelected ? "Снять все" : "Выбрать всё"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.sectionHeaderCount}>
                    {sectionCount} шт.
                  </Text>
                )}
              </View>
            );
          }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          stickySectionHeadersEnabled={true}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.empty}>Нет карточек ожидающих проверки</Text>
              {activeFilterCount > 0 && (
                <TouchableOpacity
                  style={styles.emptyResetBtn}
                  onPress={resetFilters}
                >
                  <Text style={styles.emptyResetText}>Сбросить фильтры</Text>
                </TouchableOpacity>
              )}
            </View>
          }
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
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("CreateCard")}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
      <Modal
        visible={bulkActionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkActionsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setBulkActionsVisible(false)}>
          <View style={styles.bulkActionsOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bulkActionsSheet}>
                <View style={styles.bulkActionsHandle} />
                <Text style={styles.bulkActionsTitle}>
                  Выбрано: {selectedIds.size}
                </Text>
                <TouchableOpacity
                  style={styles.bulkActionItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setBulkActionsVisible(false);
                    handleBulkPublish();
                  }}
                >
                  {bulkPublishing ? (
                    <ActivityIndicator
                      size="small"
                      color="#43A047"
                      style={styles.bulkActionIcon}
                    />
                  ) : (
                    <Text style={styles.bulkActionIcon}>📤</Text>
                  )}
                  <View>
                    <Text style={styles.bulkActionLabel}>Загрузить в Озон</Text>
                    <Text style={styles.bulkActionDesc}>
                      Отправить выбранные карточки на публикацию
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkActionItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    setBulkActionsVisible(false);
                    handleBulkReExtract();
                  }}
                >
                  {bulkReExtracting ? (
                    <ActivityIndicator
                      size="small"
                      color="#1976D2"
                      style={styles.bulkActionIcon}
                    />
                  ) : (
                    <Text style={styles.bulkActionIcon}>🔍</Text>
                  )}
                  <View>
                    <Text style={styles.bulkActionLabel}>
                      Распознать заново
                    </Text>
                    <Text style={styles.bulkActionDesc}>
                      ИИ перезапишет данные из фотографий
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkActionItem, styles.bulkActionItemDanger]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setBulkActionsVisible(false);
                    handleBulkDelete();
                  }}
                >
                  {bulkDeleting ? (
                    <ActivityIndicator
                      size="small"
                      color="#E53935"
                      style={styles.bulkActionIcon}
                    />
                  ) : (
                    <Text style={styles.bulkActionIcon}>🗑️</Text>
                  )}
                  <View>
                    <Text
                      style={[
                        styles.bulkActionLabel,
                        styles.bulkActionLabelDanger,
                      ]}
                    >
                      Удалить
                    </Text>
                    <Text style={styles.bulkActionDesc}>
                      Безвозвратно удалить выбранные карточки
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {polling && (
        <View style={styles.bottomBar}>
          <ActivityIndicator
            size="small"
            color="#1976D2"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.bottomBarCount}>
            Распознавание: {polling.completed + polling.failed}/{polling.total}
            {polling.failed > 0 ? `  (ошибок: ${polling.failed})` : ""}
          </Text>
        </View>
      )}
      {selectMode && !polling && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarCount}>Выбрано: {selectedIds.size}</Text>
          <TouchableOpacity
            style={[
              styles.bottomBarBtn,
              (selectedIds.size === 0 ||
                bulkPublishing ||
                bulkDeleting ||
                bulkReExtracting) &&
                styles.bottomBarBtnDisabled,
            ]}
            onPress={() => setBulkActionsVisible(true)}
            disabled={
              selectedIds.size === 0 ||
              bulkPublishing ||
              bulkDeleting ||
              bulkReExtracting
            }
            activeOpacity={0.8}
          >
            {bulkPublishing || bulkDeleting || bulkReExtracting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.bottomBarBtnText}>Действия</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  list: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fabText: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "300",
    marginTop: -2,
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
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: 70,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 10,
    color: "#999",
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  author: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  sku: {
    fontSize: 12,
    color: "#999",
  },
  price: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1976D2",
    marginTop: 4,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: "#aaa",
    flexShrink: 1,
  },
  publishBtn: {
    marginTop: 8,
    backgroundColor: "#43A047",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    alignSelf: "flex-end",
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    color: "#999",
    marginTop: 40,
    fontSize: 15,
  },
  sectionHeader: {
    backgroundColor: "#F5F5F5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
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
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  menuContainer: {
    marginTop: 52,
    marginRight: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    overflow: "hidden",
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    color: "#222",
  },
  // Section header
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionHeaderMeta: {
    flexDirection: "row",
    marginTop: 2,
  },
  sectionHeaderMetaText: {
    fontSize: 12,
    color: "#999",
  },
  selectBoxBtn: {
    borderWidth: 1,
    borderColor: "#1976D2",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectBoxBtnActive: {
    backgroundColor: "#1976D2",
  },
  selectBoxBtnText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
  selectBoxBtnTextActive: {
    color: "#fff",
  },
  // Card select mode
  cardSelected: {
    borderWidth: 2,
    borderColor: "#1976D2",
  },
  imageWrapper: {
    position: "relative",
  },
  checkbox: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#1976D2",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#1976D2",
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomBarCount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  bottomBarBtn: {
    backgroundColor: "#1976D2",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 120,
  },
  bottomBarBtnDisabled: {
    opacity: 0.4,
  },
  bottomBarBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // Bulk actions sheet
  bulkActionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  bulkActionsSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    paddingTop: 12,
  },
  bulkActionsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 12,
  },
  bulkActionsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    marginBottom: 4,
  },
  bulkActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  bulkActionItemDanger: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  bulkActionIcon: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  bulkActionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
  },
  bulkActionLabelDanger: {
    color: "#E53935",
  },
  bulkActionDesc: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  storePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  storeItemActive: {
    backgroundColor: "#E3F2FD",
  },
  storeItemActiveText: {
    color: "#1976D2",
    fontWeight: "700",
  },
  storeItemClientId: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 2,
  },
  storeItemBlocked: {
    opacity: 0.5,
    backgroundColor: "#fafafa",
  },
  storeItemBlockedText: {
    color: "#aaa",
  },
  storeItemLimitWarn: {
    color: "#E53935",
    fontWeight: "600",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#1976D2",
  },
  tabText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#1976D2",
  },
  errorText: {
    fontSize: 12,
    color: "#D32F2F",
    marginTop: 4,
    marginBottom: 4,
  },
  failedList: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  failedListContent: {
    padding: 12,
    gap: 8,
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
  activeTagsRow: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  activeTagsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  filterPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
    paddingBottom: 32,
  },
  pickerSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
  pickerBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pickerSearchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#333",
    backgroundColor: "#FAFAFA",
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 280,
  },
  pickerListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerListItemActive: {
    backgroundColor: "#F0F7FF",
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
    fontSize: 16,
    color: "#1976D2",
    fontWeight: "700",
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
    borderColor: "#1976D2",
    backgroundColor: "#1976D2",
  },
  resetBtnText: {
    fontSize: 13,
    color: "#fff",
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
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangeSep: {
    fontSize: 16,
    color: "#999",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyResetBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#1976D2",
  },
  emptyResetText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
});
