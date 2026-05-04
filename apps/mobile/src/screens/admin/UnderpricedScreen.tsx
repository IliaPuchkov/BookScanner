import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from "react-native";
import { AppText } from '../../components/AppText';
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Underpriced">;

function UnderpricedBookItem({
  item,
  onNavigate,
  onMarkReviewed,
  markingReviewed,
  stores,
}: {
  item: Book;
  onNavigate: (id: string) => void;
  onMarkReviewed: (id: string) => void;
  markingReviewed: boolean;
  stores: OzonStore[];
}) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  const isPublished = item.status === "published";
  const storeName = item.ozonProduct?.storeId
    ? stores.find((s) => s.id === item.ozonProduct!.storeId)?.name ?? null
    : null;
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMain}
        activeOpacity={0.7}
        onPress={() => onNavigate(item.id)}
      >
        <View style={styles.imageWrapper}>
          {coverPhoto ? (
            <Image source={{ uri: coverPhoto.fileUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <AppText style={styles.placeholderText}>Нет фото</AppText>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <AppText style={styles.title} numberOfLines={2}>{item.title}</AppText>
          {item.author ? (
            <AppText style={styles.author} numberOfLines={1}>{item.author}</AppText>
          ) : null}
          <AppText style={styles.sku}>{item.sku}</AppText>
          <View style={styles.metaRow}>
            {item.yearPublished ? (
              <AppText style={styles.metaChip}>📅 {item.yearPublished}</AppText>
            ) : null}
            {item.printRun ? (
              <AppText style={styles.metaChip}>📦 {item.printRun.toLocaleString()} экз.</AppText>
            ) : null}
            {isPublished ? (
              <AppText style={styles.publishedChip}>
                {storeName ? `Ozon: ${storeName}` : "Ozon ✓"}
              </AppText>
            ) : item.status === "pending_review" ? (
              <AppText style={styles.pendingChip}>На проверке</AppText>
            ) : null}
          </View>
          {item.price != null ? (
            <AppText style={styles.price}>{Number(item.price).toFixed(0)} ₽</AppText>
          ) : null}
          <AppText style={styles.editHint}>Нажмите, чтобы изменить цену</AppText>
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.reviewedBtn, markingReviewed && styles.reviewedBtnDisabled]}
          onPress={() => onMarkReviewed(item.id)}
          disabled={markingReviewed}
          activeOpacity={0.7}
        >
          {markingReviewed ? (
            <ActivityIndicator size="small" color="#2E7D32" />
          ) : (
            <AppText style={styles.reviewedBtnText}>✓ Цена скорректирована</AppText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const RARE_YEAR_KEY = "rare_book_max_year";
const RARE_MIN_YEAR_KEY = "rare_book_min_year";
const RARE_PRINT_RUN_KEY = "rare_book_max_print_run";
const RARE_MIN_PRICE_KEY = "rare_book_min_price";
const RARE_MAX_PRICE_KEY = "rare_book_max_price";
const RARE_STORES_KEY = "rare_book_selected_stores";
const RARE_INCLUDE_REVIEW_KEY = "rare_book_include_pending_review";

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked && <AppText style={styles.checkboxMark}>✓</AppText>}
      </View>
      <AppText style={styles.checkboxLabel}>{label}</AppText>
    </TouchableOpacity>
  );
}

export function UnderpricedScreen() {
  const navigation = useNavigation<Nav>();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [stores, setStores] = useState<OzonStore[]>([]);

  // Saved criteria
  const [rareMaxYear, setRareMaxYear] = useState(1985);
  const [rareMinYear, setRareMinYear] = useState(0);
  const [rareMaxPrintRun, setRareMaxPrintRun] = useState(10000);
  const [rarePriceMin, setRarePriceMin] = useState(0);
  const [rarePriceMax, setRarePriceMax] = useState(0);
  const [rareSelectedStores, setRareSelectedStores] = useState<string[]>([]);
  const [rareIncludePendingReview, setRareIncludePendingReview] = useState(true);

  // Editing mode
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [draftMaxYear, setDraftMaxYear] = useState("");
  const [draftMinYear, setDraftMinYear] = useState("");
  const [draftPrintRun, setDraftPrintRun] = useState("");
  const [draftPriceMin, setDraftPriceMin] = useState("");
  const [draftPriceMax, setDraftPriceMax] = useState("");
  const [draftSelectedStores, setDraftSelectedStores] = useState<string[]>([]);
  const [draftIncludePendingReview, setDraftIncludePendingReview] = useState(true);
  const [savingCriteria, setSavingCriteria] = useState(false);

  const loadingMoreRef = useRef(false);

  const fetchBooks = useCallback(async (p: number, mode: "initial" | "refresh" | "more") => {
    if (mode === "initial") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    try {
      const [res, storesRes, settingsRes] = await Promise.all([
        adminService.getUnderpricedBooks(p, 20),
        p === 1 ? adminService.getOzonStores().catch(() => ({ stores: [] })) : Promise.resolve(null),
        p === 1 ? adminService.getSettings().catch(() => []) : Promise.resolve(null),
      ]);
      if (mode === "more") {
        setBooks((prev) => [...prev, ...res.data]);
      } else {
        setBooks(res.data);
      }
      setHasMore(p < res.meta.totalPages);
      setPage(p);
      if (storesRes) setStores((storesRes as { stores: OzonStore[] }).stores);
      if (settingsRes) {
        const settings = settingsRes as { key: string; value: string; valueType: string }[];
        const get = (key: string) => settings.find((s) => s.key === key);

        const maxYearS = get(RARE_YEAR_KEY);
        const minYearS = get(RARE_MIN_YEAR_KEY);
        const printRunS = get(RARE_PRINT_RUN_KEY);
        const priceMinS = get(RARE_MIN_PRICE_KEY);
        const priceMaxS = get(RARE_MAX_PRICE_KEY);
        const storesS = get(RARE_STORES_KEY);
        const includeRevS = get(RARE_INCLUDE_REVIEW_KEY);

        if (maxYearS) setRareMaxYear(parseInt(maxYearS.value, 10) || 1985);
        if (minYearS) setRareMinYear(parseInt(minYearS.value, 10) || 0);
        if (printRunS) setRareMaxPrintRun(parseInt(printRunS.value, 10) || 10000);
        if (priceMinS) setRarePriceMin(parseFloat(priceMinS.value) || 0);
        if (priceMaxS) setRarePriceMax(parseFloat(priceMaxS.value) || 0);
        if (storesS) {
          try { setRareSelectedStores(JSON.parse(storesS.value) || []); } catch { /* */ }
        }
        if (includeRevS) setRareIncludePendingReview(includeRevS.value === "true");
      }
    } catch {
      // silent
    } finally {
      loadingMoreRef.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBooks(1, "initial");
    }, [fetchBooks]),
  );

  const navigate = useCallback(
    (bookId: string) => navigation.navigate("ProductDetail", { bookId, editable: true }),
    [navigation],
  );

  const handleMarkReviewed = useCallback((bookId: string) => {
    Alert.alert(
      "Подтверждение",
      "Отметить цену как скорректированную? Книга исчезнет из этого списка.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Да, скорректирована",
          onPress: async () => {
            setMarkingId(bookId);
            try {
              await booksService.markPriceReviewed(bookId);
              setBooks((prev) => prev.filter((b) => b.id !== bookId));
            } catch {
              Alert.alert("Ошибка", "Не удалось обновить статус");
            } finally {
              setMarkingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const openEditing = () => {
    setDraftMaxYear(String(rareMaxYear));
    setDraftMinYear(rareMinYear > 0 ? String(rareMinYear) : "");
    setDraftPrintRun(String(rareMaxPrintRun));
    setDraftPriceMin(rarePriceMin > 0 ? String(rarePriceMin) : "");
    setDraftPriceMax(rarePriceMax > 0 ? String(rarePriceMax) : "");
    setDraftSelectedStores([...rareSelectedStores]);
    setDraftIncludePendingReview(rareIncludePendingReview);
    setEditingCriteria(true);
  };

  const toggleDraftStore = (storeId: string) => {
    setDraftSelectedStores((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId],
    );
  };

  const handleSaveCriteria = async () => {
    const maxYear = parseInt(draftMaxYear, 10);
    const minYear = draftMinYear.trim() ? parseInt(draftMinYear, 10) : 0;
    const printRun = parseInt(draftPrintRun, 10);
    const priceMin = draftPriceMin.trim() ? parseFloat(draftPriceMin) : 0;
    const priceMax = draftPriceMax.trim() ? parseFloat(draftPriceMax) : 0;

    if (isNaN(maxYear) || maxYear < 1900 || maxYear > new Date().getFullYear()) {
      Alert.alert("Ошибка", "Введите корректный максимальный год (1900–текущий)");
      return;
    }
    if (minYear > 0 && (isNaN(minYear) || minYear >= maxYear)) {
      Alert.alert("Ошибка", "Год от должен быть меньше года до");
      return;
    }
    if (isNaN(printRun) || printRun <= 0) {
      Alert.alert("Ошибка", "Тираж должен быть больше 0");
      return;
    }
    if (priceMin > 0 && priceMax > 0 && priceMin >= priceMax) {
      Alert.alert("Ошибка", "Цена от должна быть меньше цены до");
      return;
    }

    setSavingCriteria(true);
    try {
      await Promise.all([
        adminService.upsertSetting({ key: RARE_YEAR_KEY, value: String(maxYear), valueType: "number", description: "Максимальный год издания для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_MIN_YEAR_KEY, value: String(minYear), valueType: "number", description: "Минимальный год издания для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_PRINT_RUN_KEY, value: String(printRun), valueType: "number", description: "Максимальный тираж для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_MIN_PRICE_KEY, value: String(priceMin), valueType: "number", description: "Минимальная цена для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_MAX_PRICE_KEY, value: String(priceMax), valueType: "number", description: "Максимальная цена для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_STORES_KEY, value: JSON.stringify(draftSelectedStores), valueType: "json", description: "Выбранные магазины Ozon для раздела редких книг" }),
        adminService.upsertSetting({ key: RARE_INCLUDE_REVIEW_KEY, value: String(draftIncludePendingReview), valueType: "boolean", description: "Включить книги на проверке в раздел редких книг" }),
      ]);
      setRareMaxYear(maxYear);
      setRareMinYear(minYear);
      setRareMaxPrintRun(printRun);
      setRarePriceMin(priceMin);
      setRarePriceMax(priceMax);
      setRareSelectedStores(draftSelectedStores);
      setRareIncludePendingReview(draftIncludePendingReview);
      setEditingCriteria(false);
      fetchBooks(1, "refresh");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить критерии");
    } finally {
      setSavingCriteria(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMoreRef.current && !loading) {
      loadingMoreRef.current = true;
      fetchBooks(page + 1, "more");
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Book }) => (
      <UnderpricedBookItem
        item={item}
        onNavigate={navigate}
        onMarkReviewed={handleMarkReviewed}
        markingReviewed={markingId === item.id}
        stores={stores}
      />
    ),
    [navigate, handleMarkReviewed, markingId, stores],
  );

  const storeSummary = () => {
    const storeFilterActive = rareSelectedStores.length > 0 || !rareIncludePendingReview;
    if (!storeFilterActive) return "Все";
    const parts: string[] = [];
    if (rareIncludePendingReview) parts.push("На проверке");
    rareSelectedStores.forEach((id) => {
      const name = stores.find((s) => s.id === id)?.name;
      if (name) parts.push(name);
    });
    return parts.length > 0 ? parts.join(", ") : "Все";
  };

  return (
    <FlatList
      style={styles.container}
      data={books}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchBooks(1, "refresh"); }}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={
        <View style={styles.infoBanner}>
          {editingCriteria ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <AppText style={styles.infoBannerText}>✏️ Критерии отбора</AppText>

              <AppText style={styles.sectionLabel}>Год издания</AppText>
              <View style={styles.rangeRow}>
                <View style={styles.rangeField}>
                  <AppText style={styles.rangeFieldLabel}>От</AppText>
                  <TextInput
                    style={styles.criteriaInput}
                    value={draftMinYear}
                    onChangeText={setDraftMinYear}
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!savingCriteria}
                    placeholder="любой"
                    placeholderTextColor="#ccc"
                  />
                </View>
                <View style={styles.rangeField}>
                  <AppText style={styles.rangeFieldLabel}>До</AppText>
                  <TextInput
                    style={styles.criteriaInput}
                    value={draftMaxYear}
                    onChangeText={setDraftMaxYear}
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!savingCriteria}
                  />
                </View>
              </View>

              <AppText style={styles.sectionLabel}>Тираж (не более)</AppText>
              <TextInput
                style={[styles.criteriaInput, styles.criteriaInputFull]}
                value={draftPrintRun}
                onChangeText={setDraftPrintRun}
                keyboardType="number-pad"
                editable={!savingCriteria}
              />

              <AppText style={styles.sectionLabel}>Цена, ₽</AppText>
              <View style={styles.rangeRow}>
                <View style={styles.rangeField}>
                  <AppText style={styles.rangeFieldLabel}>От</AppText>
                  <TextInput
                    style={styles.criteriaInput}
                    value={draftPriceMin}
                    onChangeText={setDraftPriceMin}
                    keyboardType="number-pad"
                    editable={!savingCriteria}
                    placeholder="любая"
                    placeholderTextColor="#ccc"
                  />
                </View>
                <View style={styles.rangeField}>
                  <AppText style={styles.rangeFieldLabel}>До</AppText>
                  <TextInput
                    style={styles.criteriaInput}
                    value={draftPriceMax}
                    onChangeText={setDraftPriceMax}
                    keyboardType="number-pad"
                    editable={!savingCriteria}
                    placeholder="любая"
                    placeholderTextColor="#ccc"
                  />
                </View>
              </View>

              <AppText style={styles.sectionLabel}>Статус / Магазин</AppText>
              <Checkbox
                checked={draftIncludePendingReview}
                onToggle={() => setDraftIncludePendingReview((v) => !v)}
                label="На проверке"
              />
              {stores.map((store) => (
                <Checkbox
                  key={store.id}
                  checked={draftSelectedStores.includes(store.id)}
                  onToggle={() => toggleDraftStore(store.id)}
                  label={`Ozon: ${store.name}`}
                />
              ))}
              {stores.length === 0 && (
                <AppText style={styles.noStoresHint}>Магазины не настроены</AppText>
              )}

              <View style={styles.criteriaActions}>
                <TouchableOpacity
                  style={styles.criteriaCancelBtn}
                  onPress={() => setEditingCriteria(false)}
                  disabled={savingCriteria}
                >
                  <AppText style={styles.criteriaCancelText}>Отмена</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.criteriaSaveBtn, savingCriteria && { opacity: 0.6 }]}
                  onPress={handleSaveCriteria}
                  disabled={savingCriteria}
                >
                  {savingCriteria ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <AppText style={styles.criteriaSaveText}>Сохранить</AppText>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <>
              <View style={styles.criteriaHeaderRow}>
                <AppText style={styles.infoBannerText}>📌 Критерии редких книг</AppText>
                <TouchableOpacity onPress={openEditing}>
                  <AppText style={styles.criteriaEditLink}>Изменить</AppText>
                </TouchableOpacity>
              </View>
              <AppText style={styles.criteriaLine}>
                Год: {rareMinYear > 0 ? `${rareMinYear}–${rareMaxYear}` : `≤ ${rareMaxYear}`}
                {"  "}Тираж: &lt; {rareMaxPrintRun.toLocaleString()}
              </AppText>
              {(rarePriceMin > 0 || rarePriceMax > 0) && (
                <AppText style={styles.criteriaLine}>
                  Цена:{rarePriceMin > 0 ? ` от ${rarePriceMin} ₽` : ""}
                  {rarePriceMax > 0 ? ` до ${rarePriceMax} ₽` : ""}
                </AppText>
              )}
              <AppText style={styles.criteriaLine}>Статус: {storeSummary()}</AppText>
              <AppText style={styles.infoBannerSub}>
                Скорректируйте цену или нажмите "Цена скорректирована" чтобы убрать из списка.
              </AppText>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <AppText style={styles.emptyIcon}>✅</AppText>
            <AppText style={styles.empty}>Книг с некорректной ценой не найдено</AppText>
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator size="small" color="#1976D2" style={{ marginVertical: 16 }} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  infoBanner: {
    backgroundColor: "#FFF8E1",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#F57F17",
  },
  infoBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5D4037",
    marginBottom: 6,
  },
  infoBannerSub: {
    fontSize: 12,
    color: "#8D6E63",
    marginTop: 4,
  },
  criteriaLine: {
    fontSize: 12,
    color: "#5D4037",
    marginBottom: 2,
  },
  criteriaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  criteriaEditLink: {
    fontSize: 12,
    color: "#F57F17",
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5D4037",
    marginTop: 10,
    marginBottom: 4,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 10,
  },
  rangeField: {
    flex: 1,
    gap: 2,
  },
  rangeFieldLabel: {
    fontSize: 11,
    color: "#888",
  },
  criteriaInput: {
    height: 36,
    borderWidth: 1.5,
    borderColor: "#F57F17",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
    backgroundColor: "#fff",
    textAlign: "center",
  },
  criteriaInputFull: {
    width: "100%",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    gap: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#F57F17",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxBoxChecked: {
    backgroundColor: "#F57F17",
  },
  checkboxMark: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
  },
  checkboxLabel: {
    fontSize: 13,
    color: "#5D4037",
  },
  noStoresHint: {
    fontSize: 12,
    color: "#aaa",
    fontStyle: "italic",
    paddingVertical: 4,
  },
  criteriaActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  criteriaCancelBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#ccc",
    alignItems: "center",
  },
  criteriaCancelText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  criteriaSaveBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#F57F17",
    alignItems: "center",
  },
  criteriaSaveText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  cardMain: {
    flexDirection: "row",
    padding: 12,
  },
  imageWrapper: {},
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
    marginBottom: 2,
  },
  sku: {
    fontSize: 11,
    color: "#bbb",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
    alignItems: "center",
  },
  metaChip: {
    fontSize: 12,
    color: "#888",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  publishedChip: {
    fontSize: 11,
    color: "#2E7D32",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  pendingChip: {
    fontSize: 11,
    color: "#E65100",
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F57F17",
    marginBottom: 2,
  },
  editHint: {
    fontSize: 11,
    color: "#bbb",
    fontStyle: "italic",
  },
  cardActions: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewedBtn: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  reviewedBtnDisabled: {
    opacity: 0.6,
  },
  reviewedBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2E7D32",
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
});
