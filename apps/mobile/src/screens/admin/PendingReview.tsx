import React, { useState, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  SectionList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService } from "../../services/admin.service";
import type { OzonStore, OzonStoreLimits } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { visionService } from "../../services/vision.service";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { formatDate } from "../../utils/format";

type Nav = NativeStackNavigationProp<AdminMainStackParamList>;

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
    async (p: number, mode: "initial" | "refresh" | "more") => {
      if (mode === "initial") setLoading(true);
      if (mode === "more") setLoadingMore(true);

      try {
        const res = await adminService.getPendingReviewBooks(p, 20);

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
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      fetchBooks(1, "initial");
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
        .then(async ({ stores }) => {
          setStores(stores);
          // Load limits for each store in parallel; undefined = loading, null = failed
          const entries = await Promise.all(
            stores.map(async (store) => {
              try {
                const limits = await adminService.getOzonStoreLimits(store.id);
                return [store.id, limits] as const;
              } catch {
                return [store.id, null] as const;
              }
            }),
          );
          setStoreLimits(Object.fromEntries(entries));
        })
        .catch(() => {});
    }, [fetchBooks]),
  );

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
    fetchBooks(1, "refresh");
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
    if (hasMore && !loadingMore && !loading) {
      fetchBooks(page + 1, "more");
    }
  };

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
    setStorePickerVisible(true);
  };

  const handlePublish = (book: Book) => {
    initiatePublish({ type: "single", book });
  };

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
              const failed = results.filter((r) => r.status === "rejected").length;
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
              const results = await Promise.allSettled(
                ids.map((id) => visionService.extract(id)),
              );
              const failed = results.filter((r) => r.status === "rejected").length;
              const succeeded = results.length - failed;
              exitSelectMode();
              if (failed > 0) {
                Alert.alert(
                  "Готово с ошибками",
                  `Распознано: ${succeeded}, не удалось: ${failed}`,
                );
              } else {
                Alert.alert("Готово", `Распознано ${succeeded} карточек`);
              }
            } catch {
              Alert.alert("Ошибка", "Не удалось выполнить распознавание");
            } finally {
              setBulkReExtracting(false);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Book }) => {
    const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
    const isPublishing = publishingId === item.id;
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, selectMode && isSelected && styles.cardSelected]}
        activeOpacity={0.7}
        onPress={() => {
          if (selectMode) {
            toggleSelect(item.id);
          } else {
            navigation.navigate("ProductDetail", {
              bookId: item.id,
              editable: true,
            });
          }
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
              onPress={() => handlePublish(item)}
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
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

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
        ListEmptyComponent={
          <Text style={styles.empty}>Нет карточек ожидающих проверки</Text>
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
                    <ActivityIndicator size="small" color="#43A047" style={styles.bulkActionIcon} />
                  ) : (
                    <Text style={styles.bulkActionIcon}>📤</Text>
                  )}
                  <View>
                    <Text style={styles.bulkActionLabel}>Загрузить в Озон</Text>
                    <Text style={styles.bulkActionDesc}>Отправить выбранные карточки на публикацию</Text>
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
                    <ActivityIndicator size="small" color="#1976D2" style={styles.bulkActionIcon} />
                  ) : (
                    <Text style={styles.bulkActionIcon}>🔍</Text>
                  )}
                  <View>
                    <Text style={styles.bulkActionLabel}>Распознать заново</Text>
                    <Text style={styles.bulkActionDesc}>ИИ перезапишет данные из фотографий</Text>
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
                    <ActivityIndicator size="small" color="#E53935" style={styles.bulkActionIcon} />
                  ) : (
                    <Text style={styles.bulkActionIcon}>🗑️</Text>
                  )}
                  <View>
                    <Text style={[styles.bulkActionLabel, styles.bulkActionLabelDanger]}>Удалить</Text>
                    <Text style={styles.bulkActionDesc}>Безвозвратно удалить выбранные карточки</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      {selectMode && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarCount}>Выбрано: {selectedIds.size}</Text>
          <TouchableOpacity
            style={[
              styles.bottomBarBtn,
              (selectedIds.size === 0 || bulkPublishing || bulkDeleting || bulkReExtracting) &&
                styles.bottomBarBtnDisabled,
            ]}
            onPress={() => setBulkActionsVisible(true)}
            disabled={selectedIds.size === 0 || bulkPublishing || bulkDeleting || bulkReExtracting}
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
    alignSelf: "flex-start",
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
    marginTop: 8,
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
});
