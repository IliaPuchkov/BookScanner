import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Underpriced">;

function UnderpricedBookItem({
  item,
  onNavigate,
  onMarkReviewed,
  markingReviewed,
}: {
  item: Book;
  onNavigate: (id: string) => void;
  onMarkReviewed: (id: string) => void;
  markingReviewed: boolean;
}) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  const isPublished = item.status === "published";
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
              <Text style={styles.placeholderText}>Нет фото</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {item.author ? (
            <Text style={styles.author} numberOfLines={1}>{item.author}</Text>
          ) : null}
          <Text style={styles.sku}>{item.sku}</Text>
          <View style={styles.metaRow}>
            {item.yearPublished ? (
              <Text style={styles.metaChip}>📅 {item.yearPublished}</Text>
            ) : null}
            {item.printRun ? (
              <Text style={styles.metaChip}>📦 {item.printRun.toLocaleString()} экз.</Text>
            ) : null}
            {isPublished && (
              <Text style={styles.publishedChip}>Ozon ✓</Text>
            )}
          </View>
          {item.price != null ? (
            <Text style={styles.price}>{Number(item.price).toFixed(0)} ₽</Text>
          ) : null}
          <Text style={styles.editHint}>Нажмите, чтобы изменить цену</Text>
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
            <Text style={styles.reviewedBtnText}>✓ Цена скорректирована</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
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
  const loadingMoreRef = useRef(false);

  const fetchBooks = useCallback(async (p: number, mode: "initial" | "refresh" | "more") => {
    if (mode === "initial") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    try {
      const res = await adminService.getUnderpricedBooks(p, 20);
      if (mode === "more") {
        setBooks((prev) => [...prev, ...res.data]);
      } else {
        setBooks(res.data);
      }
      setHasMore(p < res.meta.totalPages);
      setPage(p);
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
      />
    ),
    [navigate, handleMarkReviewed, markingId],
  );

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
          <Text style={styles.infoBannerText}>
            📌 Критерии: год издания ≤ 1985, тираж &lt; 10 000 экземпляров
          </Text>
          <Text style={styles.infoBannerSub}>
            Скорректируйте цену или нажмите "Цена скорректирована" чтобы убрать из списка.
          </Text>
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.empty}>Книг с некорректной ценой не найдено</Text>
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
    marginBottom: 4,
  },
  infoBannerSub: {
    fontSize: 12,
    color: "#8D6E63",
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
