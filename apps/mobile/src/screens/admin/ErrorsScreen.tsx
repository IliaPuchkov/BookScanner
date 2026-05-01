import React, { useState, useCallback, useLayoutEffect } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore, type OzonStoreLimits } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { visionService } from "../../services/vision.service";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Errors">;

type OcrBookItemProps = {
  item: Book;
  selectMode: boolean;
  isSelected: boolean;
  onNavigate: (bookId: string) => void;
  onToggleSelect: (id: string) => void;
};

const OcrBookItem = React.memo(function OcrBookItem({
  item,
  selectMode,
  isSelected,
  onNavigate,
  onToggleSelect,
}: OcrBookItemProps) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  return (
    <TouchableOpacity
      style={[styles.card, selectMode && isSelected && styles.cardSelected]}
      activeOpacity={0.7}
      onPress={() => { if (selectMode) onToggleSelect(item.id); else onNavigate(item.id); }}
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
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.sku}>{item.sku}</Text>
        <Text style={styles.errorBadge}>ИИ не определил книгу</Text>
      </View>
    </TouchableOpacity>
  );
});

type OzonFailedItemProps = {
  item: Book;
  selectMode: boolean;
  isSelected: boolean;
  isRetrying: boolean;
  onToggleSelect: (id: string) => void;
  onNavigate: (bookId: string) => void;
  onRetry: (book: Book) => void;
};

const OzonFailedItem = React.memo(function OzonFailedItem({
  item,
  selectMode,
  isSelected,
  isRetrying,
  onToggleSelect,
  onNavigate,
  onRetry,
}: OzonFailedItemProps) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  return (
    <TouchableOpacity
      style={[styles.card, selectMode && isSelected && styles.cardSelected]}
      activeOpacity={0.7}
      onPress={() => { if (selectMode) onToggleSelect(item.id); else onNavigate(item.id); }}
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
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.sku}>{item.sku}</Text>
        {item.ozonProduct?.errorMessage ? (
          <Text style={styles.errorText} numberOfLines={2}>{item.ozonProduct.errorMessage}</Text>
        ) : null}
        {!selectMode && (
          <TouchableOpacity
            style={[styles.retryBtn, isRetrying && styles.retryBtnDisabled]}
            onPress={() => onRetry(item)}
            disabled={isRetrying}
            activeOpacity={0.7}
          >
            {isRetrying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.retryBtnText}>Повторить</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

export function ErrorsScreen() {
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<"ocr" | "ozon">("ocr");

  // OCR errors state
  const [ocrBooks, setOcrBooks] = useState<Book[]>([]);
  const [loadingOcr, setLoadingOcr] = useState(true);
  const [refreshingOcr, setRefreshingOcr] = useState(false);
  const [ocrSelectMode, setOcrSelectMode] = useState(false);
  const [ocrSelectedIds, setOcrSelectedIds] = useState<Set<string>>(new Set());

  // Ozon errors state
  const [ozonBooks, setOzonBooks] = useState<Book[]>([]);
  const [loadingOzon, setLoadingOzon] = useState(true);
  const [refreshingOzon, setRefreshingOzon] = useState(false);
  const [ozonSelectMode, setOzonSelectMode] = useState(false);
  const [ozonSelectedIds, setOzonSelectedIds] = useState<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Header menu
  const [menuVisible, setMenuVisible] = useState(false);

  // Shared bulk state
  const [bulkActionsVisible, setBulkActionsVisible] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkReExtracting, setBulkReExtracting] = useState(false);

  // Store picker
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<Record<string, OzonStoreLimits | null | undefined>>({});
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [pendingPublishAction, setPendingPublishAction] = useState<
    { type: "single"; book: Book } | { type: "bulk"; ids: string[] } | null
  >(null);

  const exitSelectMode = useCallback(() => {
    setOcrSelectMode(false);
    setOcrSelectedIds(new Set());
    setOzonSelectMode(false);
    setOzonSelectedIds(new Set());
  }, []);

  const isSelectMode = ocrSelectMode || ozonSelectMode;

  useLayoutEffect(() => {
    if (isSelectMode) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={exitSelectMode}
            style={{ width: 44, height: 44, backgroundColor: "#1976D2", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Отмена</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={{ width: 44, height: 44, backgroundColor: "#1976D2", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", letterSpacing: 1 }}>⋮</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, isSelectMode, exitSelectMode]);

  const fetchOcrBooks = useCallback(async () => {
    setLoadingOcr(true);
    try {
      const res = await adminService.getOcrFailedBooks(1, 100);
      setOcrBooks(res.data);
    } catch {
      // silent
    } finally {
      setLoadingOcr(false);
      setRefreshingOcr(false);
    }
  }, []);

  const fetchOzonBooks = useCallback(async () => {
    setLoadingOzon(true);
    try {
      const res = await adminService.getFailedPublicationBooks(1, 100);
      setOzonBooks(res.data);
    } catch {
      // silent
    } finally {
      setLoadingOzon(false);
      setRefreshingOzon(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOcrBooks();
      fetchOzonBooks();
      adminService.getOzonStores().then(({ stores: s }) => setStores(s)).catch(() => {});
    }, [fetchOcrBooks, fetchOzonBooks]),
  );

  const navigate = useCallback(
    (bookId: string) => navigation.navigate("ProductDetail", { bookId, editable: true }),
    [navigation],
  );

  const activeSelectMode = activeTab === "ocr" ? ocrSelectMode : ozonSelectMode;
  const activeSelectedIds = activeTab === "ocr" ? ocrSelectedIds : ozonSelectedIds;
  const activeBooks = activeTab === "ocr" ? ocrBooks : ozonBooks;

  const setActiveSelectMode = activeTab === "ocr" ? setOcrSelectMode : setOzonSelectMode;

  const toggleOcrSelect = useCallback((id: string) => {
    setOcrSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleOzonSelect = useCallback((id: string) => {
    setOzonSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    if (limits === undefined) return { blocked: false, label: "Загрузка...", warn: false };
    if (limits === null) return { blocked: false, label: "Лимиты недоступны", warn: false };
    const totalRemaining = limits.total.limit > 0 ? limits.total.limit - limits.total.usage : null;
    const totalExhausted = totalRemaining !== null && totalRemaining <= 0;
    const totalLine = totalRemaining !== null
      ? `Ассортимент: ${totalRemaining} / ${limits.total.limit} осталось мест`
      : "Ассортимент: не ограничен";
    if (totalExhausted) return { blocked: true, label: totalLine, warn: true };
    if (limits.daily_create.limit > 0) {
      const remaining = limits.daily_create.limit - limits.daily_create.usage;
      const createLine = `Создание: ${remaining} / ${limits.daily_create.limit} сегодня`;
      if (remaining <= 0) return { blocked: true, label: `${createLine}\n${totalLine}`, warn: true };
      if (remaining < count) return { blocked: true, label: `Недостаточно лимита: нужно ${count}, доступно ${remaining}\n${totalLine}`, warn: true };
      return { blocked: false, label: `${createLine}\n${totalLine}`, warn: false };
    }
    return { blocked: false, label: `Создание: не ограничено\n${totalLine}`, warn: false };
  };

  const initiatePublish = (action: { type: "single"; book: Book } | { type: "bulk"; ids: string[] }) => {
    if (stores.length === 0) {
      Alert.alert("Нет магазинов", "Добавьте магазин Ozon в настройках.");
      return;
    }
    setPendingPublishAction(action);
    refreshStoreLimits(stores);
    setStorePickerVisible(true);
  };

  const executePublish = async (
    action: { type: "single"; book: Book } | { type: "bulk"; ids: string[] },
    storeId: string,
  ) => {
    if (action.type === "single") {
      setRetryingId(action.book.id);
      try {
        await booksService.publishToOzon(action.book.id, storeId);
        Alert.alert("Готово", "Карточка отправлена на модерацию Ozon");
        setOzonBooks((prev) => prev.filter((b) => b.id !== action.book.id));
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить в Озон");
      } finally {
        setRetryingId(null);
      }
    } else {
      setBulkPublishing(true);
      try {
        const result = await booksService.publishBulkToOzon(action.ids, storeId);
        if (activeTab === "ocr") {
          setOcrBooks((prev) => prev.filter((b) => !action.ids.includes(b.id)));
          setOcrSelectedIds(new Set());
          setOcrSelectMode(false);
        } else {
          setOzonBooks((prev) => prev.filter((b) => !action.ids.includes(b.id)));
          setOzonSelectedIds(new Set());
          setOzonSelectMode(false);
        }
        if (result.failed > 0) {
          Alert.alert("Готово с ошибками", `Отправлено: ${result.succeeded}, не удалось: ${result.failed}`);
        } else {
          Alert.alert("Готово", `${result.succeeded} книг отправлено на модерацию Ozon`);
        }
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить книги в Озон");
      } finally {
        setBulkPublishing(false);
      }
    }
  };

  const handleRetry = useCallback(
    (book: Book) => initiatePublish({ type: "single", book }),
    [stores],
  );

  const handleBulkPublish = () => {
    const ids = Array.from(activeSelectedIds);
    if (ids.length === 0) return;
    setBulkActionsVisible(false);
    initiatePublish({ type: "bulk", ids });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(activeSelectedIds);
    if (ids.length === 0) return;
    setBulkActionsVisible(false);
    Alert.alert(
      "Удалить карточки?",
      `${ids.length} карточек будут удалены безвозвратно.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            setBulkDeleting(true);
            try {
              const results = await Promise.allSettled(ids.map((id) => booksService.deleteBook(id)));
              const succeeded = results.filter((r) => r.status === "fulfilled").length;
              const failed = results.filter((r) => r.status === "rejected").length;
              if (activeTab === "ocr") {
                setOcrBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
                setOcrSelectedIds(new Set());
                setOcrSelectMode(false);
              } else {
                setOzonBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
                setOzonSelectedIds(new Set());
                setOzonSelectMode(false);
              }
              if (failed > 0) {
                Alert.alert("Готово с ошибками", `Удалено: ${succeeded}, не удалось: ${failed}`);
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
    const ids = Array.from(activeSelectedIds);
    if (ids.length === 0) return;
    setBulkActionsVisible(false);
    const n = ids.length;
    Alert.alert(
      "Повторное распознавание?",
      `ИИ заново обработает фотографии ${n} ${n === 1 ? "карточки" : "карточек"} и перезапишет данные.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Распознать",
          onPress: async () => {
            setBulkReExtracting(true);
            try {
              await visionService.extractBulk(ids);
              if (activeTab === "ocr") {
                setOcrBooks((prev) => prev.filter((b) => !ids.includes(b.id)));
                setOcrSelectedIds(new Set());
                setOcrSelectMode(false);
              } else {
                setOzonSelectedIds(new Set());
                setOzonSelectMode(false);
              }
              Alert.alert("Готово", "Книги поставлены в очередь на распознавание");
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

  const renderOcrItem = useCallback(
    ({ item }: { item: Book }) => (
      <OcrBookItem
        item={item}
        selectMode={ocrSelectMode}
        isSelected={ocrSelectedIds.has(item.id)}
        onNavigate={navigate}
        onToggleSelect={toggleOcrSelect}
      />
    ),
    [ocrSelectMode, ocrSelectedIds, navigate, toggleOcrSelect],
  );

  const renderOzonItem = useCallback(
    ({ item }: { item: Book }) => (
      <OzonFailedItem
        item={item}
        selectMode={ozonSelectMode}
        isSelected={ozonSelectedIds.has(item.id)}
        isRetrying={retryingId === item.id}
        onToggleSelect={toggleOzonSelect}
        onNavigate={navigate}
        onRetry={handleRetry}
      />
    ),
    [ozonSelectMode, ozonSelectedIds, retryingId, toggleOzonSelect, navigate, handleRetry],
  );

  const isAnyBulkBusy = bulkDeleting || bulkPublishing || bulkReExtracting;

  return (
    <>
      {/* Kebab menu modal */}
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
                    setActiveSelectMode(true);
                  }}
                >
                  <Text style={styles.menuItemText}>Выбрать несколько</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Store picker modal */}
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
                <Text style={styles.storePickerTitle}>Выберите магазин Ozon</Text>
                {stores.map((store) => {
                  const count = pendingPublishAction
                    ? pendingPublishAction.type === "single" ? 1 : pendingPublishAction.ids.length
                    : 1;
                  const { blocked, label, warn } = getLimitStatus(store.id, count);
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[styles.menuItem, blocked && styles.storeItemBlocked]}
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
                              { text: "Загрузить", onPress: () => executePublish(action, store.id) },
                            ],
                          );
                        }
                      }}
                    >
                      <Text style={[styles.menuItemText, blocked && styles.storeItemBlockedText]}>{store.name}</Text>
                      <Text style={[styles.storeLimitText, warn && styles.storeLimitWarn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bulk actions sheet */}
      <Modal
        visible={bulkActionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkActionsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setBulkActionsVisible(false)}>
          <View style={styles.bulkOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bulkSheet}>
                <View style={styles.bulkHandle} />
                <Text style={styles.bulkTitle}>Выбрано: {activeSelectedIds.size}</Text>
                <TouchableOpacity
                  style={styles.bulkItem}
                  activeOpacity={0.7}
                  onPress={handleBulkPublish}
                >
                  {bulkPublishing ? (
                    <ActivityIndicator size="small" color="#43A047" style={styles.bulkIcon} />
                  ) : (
                    <Text style={styles.bulkIcon}>📤</Text>
                  )}
                  <View>
                    <Text style={styles.bulkLabel}>Загрузить в Озон</Text>
                    <Text style={styles.bulkDesc}>Отправить выбранные карточки на публикацию</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkItem}
                  activeOpacity={0.7}
                  onPress={handleBulkReExtract}
                >
                  {bulkReExtracting ? (
                    <ActivityIndicator size="small" color="#1976D2" style={styles.bulkIcon} />
                  ) : (
                    <Text style={styles.bulkIcon}>🔍</Text>
                  )}
                  <View>
                    <Text style={styles.bulkLabel}>Распознать заново</Text>
                    <Text style={styles.bulkDesc}>ИИ перезапишет данные из фотографий</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkItem, styles.bulkItemDanger]}
                  activeOpacity={0.7}
                  onPress={handleBulkDelete}
                >
                  {bulkDeleting ? (
                    <ActivityIndicator size="small" color="#E53935" style={styles.bulkIcon} />
                  ) : (
                    <Text style={styles.bulkIcon}>🗑️</Text>
                  )}
                  <View>
                    <Text style={[styles.bulkLabel, styles.bulkLabelDanger]}>Удалить</Text>
                    <Text style={styles.bulkDesc}>Безвозвратно удалить выбранные карточки</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "ocr" && styles.tabActive]}
          onPress={() => { exitSelectMode(); setActiveTab("ocr"); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === "ocr" && styles.tabTextActive]}>
            Не распознаны{ocrBooks.length > 0 ? ` (${ocrBooks.length})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "ozon" && styles.tabActive]}
          onPress={() => { exitSelectMode(); setActiveTab("ozon"); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === "ozon" && styles.tabTextActive]}>
            Ошибки Ozon{ozonBooks.length > 0 ? ` (${ozonBooks.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {/* OCR tab */}
      {activeTab === "ocr" && (
        loadingOcr ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976D2" />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={ocrBooks}
            keyExtractor={(item) => item.id}
            renderItem={renderOcrItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshingOcr}
                onRefresh={() => { setRefreshingOcr(true); fetchOcrBooks(); }}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>Нет ошибок распознавания</Text>}
          />
        )
      )}

      {/* Ozon tab */}
      {activeTab === "ozon" && (
        loadingOzon ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976D2" />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={ozonBooks}
            keyExtractor={(item) => item.id}
            renderItem={renderOzonItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshingOzon}
                onRefresh={() => { setRefreshingOzon(true); fetchOzonBooks(); }}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>Нет ошибок публикации</Text>}
          />
        )
      )}

      {/* Bottom bar (select mode) */}
      {activeSelectMode && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarCount}>Выбрано: {activeSelectedIds.size}</Text>
          <TouchableOpacity
            style={[
              styles.bottomBarBtn,
              (activeSelectedIds.size === 0 || isAnyBulkBusy) && styles.bottomBarBtnDisabled,
            ]}
            onPress={() => setBulkActionsVisible(true)}
            disabled={activeSelectedIds.size === 0 || isAnyBulkBusy}
            activeOpacity={0.8}
          >
            {isAnyBulkBusy ? (
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: "#1976D2",
  },
  imageWrapper: {
    position: "relative",
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
  sku: {
    fontSize: 12,
    color: "#999",
  },
  errorText: {
    fontSize: 12,
    color: "#D32F2F",
    marginTop: 4,
    marginBottom: 4,
  },
  errorBadge: {
    fontSize: 11,
    color: "#fff",
    backgroundColor: "#E53935",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    overflow: "hidden",
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#FB8C00",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    alignSelf: "flex-end",
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryBtnText: {
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
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  bottomBarCount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  bottomBarBtn: {
    backgroundColor: "#1976D2",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 100,
  },
  bottomBarBtnDisabled: {
    opacity: 0.4,
  },
  bottomBarBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
    minWidth: 220,
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
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  menuItemText: {
    fontSize: 15,
    color: "#222",
    fontWeight: "600",
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
  storeItemBlocked: {
    opacity: 0.5,
    backgroundColor: "#fafafa",
  },
  storeItemBlockedText: {
    color: "#aaa",
  },
  storeLimitText: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 2,
  },
  storeLimitWarn: {
    color: "#E53935",
    fontWeight: "600",
  },
  bulkOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  bulkSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  bulkHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#ddd",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  bulkTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  bulkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  bulkItemDanger: {
    borderBottomWidth: 0,
  },
  bulkIcon: {
    fontSize: 22,
    marginRight: 16,
    width: 28,
    textAlign: "center",
  },
  bulkLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  bulkLabelDanger: {
    color: "#E53935",
  },
  bulkDesc: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
});
