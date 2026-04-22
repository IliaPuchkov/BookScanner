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
  Alert,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
import { DatePickerInput } from "../../components/DatePickerInput";
import { adminService } from "../../services/admin.service";
import type { OzonStore } from "../../services/admin.service";
import { boxesService } from "../../services/boxes.service";
import { BookStatus } from "../../types";
import type { Book, Box, User } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { formatDate } from "../../utils/format";

type Nav = NativeStackNavigationProp<AdminMainStackParamList>;
type Route = RouteProp<AdminMainStackParamList, "BookDatabase">;

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

interface Filters {
  boxId?: string;
  createdById?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  priceMin?: string;
  priceMax?: string;
  yearFrom?: string;
  yearTo?: string;
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
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  // Picker modal — which filter row was tapped
  const [activePickerFilter, setActivePickerFilter] = useState<string | null>(
    null,
  );
  const [pickerSearch, setPickerSearch] = useState("");
  // Temp state inside range modals (date/price/year) before "Применить"
  const [tempDateFrom, setTempDateFrom] = useState("");
  const [tempDateTo, setTempDateTo] = useState("");
  const [tempPriceMin, setTempPriceMin] = useState("");
  const [tempPriceMax, setTempPriceMax] = useState("");
  const [tempYearFrom, setTempYearFrom] = useState("");
  const [tempYearTo, setTempYearTo] = useState("");

  // Filter options
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string }>>(
    [],
  );
  const [ozonStores, setOzonStores] = useState<OzonStore[]>([]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchIdRef = useRef(0);
  const isReturningRef = useRef(false);
  // Tracks the search/filters actually used for the current list (applied, not UI state)
  const activeParamsRef = useRef({ search: "", filters: filters });
  // Synchronous guard: prevents onEndReached from firing multiple times before re-render
  const loadingMoreRef = useRef(false);

  // Load filter options once
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [boxesRes, usersRes, storesRes] = await Promise.all([
          boxesService.getBoxes(1, 100),
          adminService.getUsers(1, 100),
          adminService.getOzonStores().catch(() => ({ stores: [], activeId: '' })),
        ]);
        setBoxes(boxesRes.data);
        setUsers(
          usersRes.data.map((u: User) => ({ id: u.id, fullName: u.fullName })),
        );
        setOzonStores(storesRes.stores);
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
        // Sync applied params before the async call so handleLoadMore reads them
        if (mode !== "more") {
          activeParamsRef.current = { search: query, filters: currentFilters };
        }

        const params: Filters = {};
        if (currentFilters.boxId) params.boxId = currentFilters.boxId;
        if (currentFilters.createdById)
          params.createdById = currentFilters.createdById;
        if (currentFilters.dateFrom) params.dateFrom = currentFilters.dateFrom;
        if (currentFilters.dateTo) params.dateTo = currentFilters.dateTo;
        if (currentFilters.status) params.status = currentFilters.status;
        if (currentFilters.priceMin) params.priceMin = currentFilters.priceMin;
        if (currentFilters.priceMax) params.priceMax = currentFilters.priceMax;
        if (currentFilters.yearFrom) params.yearFrom = currentFilters.yearFrom;
        if (currentFilters.yearTo) params.yearTo = currentFilters.yearTo;

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
          loadingMoreRef.current = false;
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
      if (isReturningRef.current) {
        isReturningRef.current = false;
        return;
      }
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
    if (hasMore && !loadingMoreRef.current && !loading) {
      loadingMoreRef.current = true;
      const { search: s, filters: f } = activeParamsRef.current;
      fetchBooks(page + 1, s, f, "more");
    }
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
    setPickerSearch("");
    setActivePickerFilter(key);
  };

  const applyRangeFilter = (key: "date" | "price" | "year") => {
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
    setShowFilters(false);
    fetchBooks(1, search, empty, "initial");
  };

  const removeFilter = (
    key: "status" | "boxId" | "createdById" | "date" | "price" | "year",
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
    (filters.status ? 1 : 0) +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.yearFrom || filters.yearTo ? 1 : 0);

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

      {/* Compact filter rows */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Status */}
          <FilterRow
            label="Статус"
            value={
              filters.status === BookStatus.PENDING_REVIEW
                ? "На проверке"
                : filters.status === BookStatus.PUBLISHED
                  ? "Загружено в Ozon"
                  : filters.status === BookStatus.ARCHIVED
                    ? "В архиве"
                    : undefined
            }
            onOpen={() => openPicker("status")}
            onClear={() => removeFilter("status")}
          />
          {/* Box */}
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
          {/* Operator */}
          <FilterRow
            label="Оператор"
            value={
              filters.createdById
                ? users.find((u) => u.id === filters.createdById)?.fullName
                : undefined
            }
            onOpen={() => openPicker("createdById")}
            onClear={() => removeFilter("createdById")}
          />
          {/* Date */}
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
          {/* Price */}
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
          {/* Year */}
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
                    {activePickerFilter === "status"
                      ? "Статус"
                      : activePickerFilter === "boxId"
                        ? "Коробка"
                        : activePickerFilter === "createdById"
                          ? "Оператор"
                          : activePickerFilter === "date"
                            ? "Период создания"
                            : activePickerFilter === "price"
                              ? "Цена (₽)"
                              : "Год издания"}
                  </Text>
                  <TouchableOpacity onPress={() => setActivePickerFilter(null)}>
                    <Text style={styles.pickerDoneBtn}>Закрыть</Text>
                  </TouchableOpacity>
                </View>

                {/* Status chips */}
                {activePickerFilter === "status" && (
                  <View style={styles.pickerBody}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.chipRow}
                    >
                      {(
                        [
                          [undefined, "Все"],
                          [BookStatus.PENDING_REVIEW, "На проверке"],
                          [BookStatus.PUBLISHED, "Загружено в Ozon"],
                          [BookStatus.ARCHIVED, "В архиве"],
                        ] as const
                      ).map(([val, label]) => {
                        const active = filters.status === val;
                        return (
                          <TouchableOpacity
                            key={label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => {
                              const newF = { ...filters, status: val };
                              if (!val) delete newF.status;
                              setFilters(newF);
                              fetchBooks(1, search, newF, "initial");
                              setActivePickerFilter(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                active && styles.chipTextActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Box searchable list */}
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
                    <FlatList
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
                              <Text style={styles.pickerListCheckmark}>✓</Text>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}

                {/* Operator searchable list */}
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
                    <FlatList
                      data={[
                        { id: "", fullName: "Все операторы" },
                        ...users.filter((u) =>
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
                              <Text style={styles.pickerListCheckmark}>✓</Text>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}

                {/* Date range */}
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

                {/* Price range */}
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

                {/* Year range */}
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
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              onPress={() => {
                isReturningRef.current = true;
                navigation.navigate("ProductDetail", { bookId: item.id });
              }}
              userRole="admin"
              storeName={
                item.ozonProduct?.storeId
                  ? ozonStores.find((s) => s.id === item.ozonProduct!.storeId)?.name
                  : undefined
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.empty}>Нет результатов</Text>
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
