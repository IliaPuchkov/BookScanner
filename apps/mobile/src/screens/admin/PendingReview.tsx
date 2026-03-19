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
import { booksService } from "../../services/books.service";
import { BookStatus } from "../../types";
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
    }, [fetchBooks]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBooks(1, "refresh");
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore && !loading) {
      fetchBooks(page + 1, "more");
    }
  };

  const handlePublish = (book: Book) => {
    Alert.alert(
      "Загрузить в Озон?",
      `"${book.title}" будет опубликована на Озоне`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Загрузить",
          onPress: async () => {
            setPublishingId(book.id);
            try {
              await booksService.publishToOzon(book.id);
              Alert.alert("Готово", "Карточка отправлена на модерацию Ozon");
              setBooks((prev) => prev.filter((b) => b.id !== book.id));
            } catch {
              Alert.alert("Ошибка", "Не удалось загрузить в Озон");
            } finally {
              setPublishingId(null);
            }
          },
        },
      ],
    );
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

  const toggleSelectBox = useCallback((sectionBooks: Book[]) => {
    const ids = sectionBooks.map((b) => b.id);
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleBulkPublish = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Загрузить в Озон?",
      `Будет опубликовано ${selectedIds.size} книг`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Загрузить",
          onPress: async () => {
            setBulkPublishing(true);
            const ids = Array.from(selectedIds);
            const results = await Promise.allSettled(
              ids.map((id) => booksService.publishToOzon(id)),
            );
            const failed = results.filter(
              (r) => r.status === "rejected",
            ).length;
            setBooks((prev) => prev.filter((b) => !selectedIds.has(b.id)));
            exitSelectMode();
            setBulkPublishing(false);
            if (failed > 0) {
              Alert.alert(
                "Готово с ошибками",
                `Не удалось загрузить: ${failed} книг`,
              );
            } else {
              Alert.alert(
                "Готово",
                `${ids.length} книг отправлено на модерацию Ozon`,
              );
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
          const allSelected = s.data.every((b) => selectedIds.has(b.id));
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
                  {s.data.length} шт.
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
        stickySectionHeadersEnabled={false}
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
      {selectMode && (
        <View style={styles.bottomBar}>
          <Text style={styles.bottomBarCount}>Выбрано: {selectedIds.size}</Text>
          <TouchableOpacity
            style={[
              styles.bottomBarBtn,
              (selectedIds.size === 0 || bulkPublishing) &&
                styles.bottomBarBtnDisabled,
            ]}
            onPress={handleBulkPublish}
            disabled={selectedIds.size === 0 || bulkPublishing}
            activeOpacity={0.8}
          >
            {bulkPublishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.bottomBarBtnText}>Загрузить в Озон</Text>
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
    backgroundColor: "#43A047",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 150,
    alignItems: "center",
  },
  bottomBarBtnDisabled: {
    opacity: 0.4,
  },
  bottomBarBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
