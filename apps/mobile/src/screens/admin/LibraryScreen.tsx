import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { AppText } from "../../components/AppText";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService } from "../../services/admin.service";
import type { Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { thumbUri } from "../../utils/photos";
import { formatDate, libraryLabel } from "../../utils/format";
import { useAuth } from "../../hooks/useAuth";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Library">;
type Scope = "mine" | "all";

function LibraryBookItem({
  item,
  onNavigate,
  onRemove,
  removing,
}: {
  item: Book;
  onNavigate: (id: string) => void;
  onRemove: (book: Book) => void;
  removing: boolean;
}) {
  const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMain}
        activeOpacity={0.7}
        onPress={() => onNavigate(item.id)}
      >
        {coverPhoto ? (
          <Image source={{ uri: thumbUri(coverPhoto) }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <AppText style={styles.placeholderText}>Нет фото</AppText>
          </View>
        )}
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
            {item.box?.boxNumber ? (
              <AppText style={styles.metaChip}>Кор. {item.box.boxNumber}</AppText>
            ) : null}
          </View>
          <AppText style={styles.ownerChip} numberOfLines={1}>
            {libraryLabel(item)}
          </AppText>
          {item.addedToLibraryAt ? (
            <AppText style={styles.addedAt}>
              Добавлена {formatDate(item.addedToLibraryAt)}
            </AppText>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.removeBtn, removing && styles.removeBtnDisabled]}
          onPress={() => onRemove(item)}
          disabled={removing}
          activeOpacity={0.7}
        >
          {removing ? (
            <ActivityIndicator size="small" color="#6A1B9A" />
          ) : (
            <AppText style={styles.removeBtnText}>Вернуть на проверку</AppText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function LibraryScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("mine");
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  const fetchBooks = useCallback(
    async (p: number, mode: "initial" | "refresh" | "more", s: Scope) => {
      if (mode === "initial") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const res = await adminService.getLibraryBooks(p, 20, {
          ownerId: s === "mine" ? user?.id : undefined,
        });
        setBooks((prev) => (mode === "more" ? [...prev, ...res.data] : res.data));
        setTotal(res.meta.total);
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
    },
    [user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      fetchBooks(1, "initial", scope);
    }, [fetchBooks, scope]),
  );

  const navigate = useCallback(
    (bookId: string) => navigation.navigate("ProductDetail", { bookId, editable: true }),
    [navigation],
  );

  const handleRemove = useCallback((book: Book) => {
    Alert.alert(
      "Вернуть на проверку?",
      `«${book.title}» будет убрана из библиотеки и снова появится в списке на проверке.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          onPress: async () => {
            setRemovingId(book.id);
            try {
              await adminService.removeFromLibrary(book.id);
              setBooks((prev) => prev.filter((b) => b.id !== book.id));
              setTotal((t) => Math.max(0, t - 1));
            } catch {
              Alert.alert("Ошибка", "Не удалось вернуть книгу на проверку");
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const handleLoadMore = () => {
    if (hasMore && !loadingMoreRef.current && !loading) {
      loadingMoreRef.current = true;
      fetchBooks(page + 1, "more", scope);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: Book }) => (
      <LibraryBookItem
        item={item}
        onNavigate={navigate}
        onRemove={handleRemove}
        removing={removingId === item.id}
      />
    ),
    [navigate, handleRemove, removingId],
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
          onRefresh={() => {
            setRefreshing(true);
            fetchBooks(1, "refresh", scope);
          }}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.chipRow}>
            {(
              [
                ["mine", "Моя библиотека"],
                ["all", "Все администраторы"],
              ] as const
            ).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[styles.chip, scope === value && styles.chipActive]}
                onPress={() => setScope(value)}
                activeOpacity={0.7}
              >
                <AppText style={[styles.chipText, scope === value && styles.chipTextActive]}>
                  {label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
          {!loading ? <AppText style={styles.totalText}>Книг: {total}</AppText> : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator size="large" color="#8E24AA" style={{ marginTop: 60 }} />
        ) : (
          <View style={styles.emptyContainer}>
            <AppText style={styles.emptyIcon}>📚</AppText>
            <AppText style={styles.empty}>
              В библиотеке пока нет книг.{"\n"}Добавьте книгу из списка «На проверке» через меню ⋮
            </AppText>
          </View>
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator size="small" color="#8E24AA" style={{ marginVertical: 16 }} />
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
  header: {
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E1BEE7",
  },
  chipActive: {
    backgroundColor: "#8E24AA",
    borderColor: "#8E24AA",
  },
  chipText: {
    fontSize: 13,
    color: "#6A1B9A",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  totalText: {
    fontSize: 12,
    color: "#888",
    marginTop: 8,
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
  },
  metaChip: {
    fontSize: 12,
    color: "#888",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ownerChip: {
    alignSelf: "flex-start",
    fontSize: 11,
    color: "#6A1B9A",
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
  },
  addedAt: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 4,
  },
  cardActions: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  removeBtn: {
    backgroundColor: "#F3E5F5",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CE93D8",
  },
  removeBtnDisabled: {
    opacity: 0.6,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6A1B9A",
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  empty: {
    textAlign: "center",
    color: "#999",
    fontSize: 15,
    lineHeight: 22,
  },
});
