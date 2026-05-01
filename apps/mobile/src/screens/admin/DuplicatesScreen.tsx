import React, { useState, useCallback } from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { adminService, type OzonStore } from "../../services/admin.service";
import { booksService } from "../../services/books.service";
import { BookStatus } from "../../types";
import type { DuplicateGroup, Book } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";

type Nav = NativeStackNavigationProp<AdminMainStackParamList, "Duplicates">;

function BookMiniCard({
  book,
  onNavigate,
  onDelete,
  deleting,
  stores,
}: {
  book: Book;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  deleting: boolean;
  stores: OzonStore[];
}) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);
  const storeName = book.ozonProduct?.storeId
    ? stores.find((s) => s.id === book.ozonProduct!.storeId)?.name
    : null;
  const isPublished = book.ozonProduct?.status === "published" || book.ozonProduct?.status === "PUBLISHED";
  return (
    <View style={styles.miniCard}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onNavigate(book.id)}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto.fileUrl }} style={styles.miniImage} />
        ) : (
          <View style={[styles.miniImage, styles.miniPlaceholder]}>
            <Text style={styles.miniPlaceholderText}>Нет фото</Text>
          </View>
        )}
        <Text style={styles.miniTitle} numberOfLines={2}>{book.title}</Text>
        {book.author ? (
          <Text style={styles.miniAuthor} numberOfLines={1}>{book.author}</Text>
        ) : null}
        <Text style={styles.miniSku}>{book.sku}</Text>
        {book.yearPublished ? (
          <Text style={styles.miniMeta}>{book.yearPublished}</Text>
        ) : null}
        {book.price != null && Number(book.price) > 0 ? (
          <Text style={styles.miniPrice}>{Number(book.price).toFixed(0)} ₽</Text>
        ) : null}
        {storeName ? (
          <View style={[styles.storeBadge, isPublished && styles.storeBadgePublished]}>
            <Text style={styles.storeBadgeText} numberOfLines={1}>{storeName}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {book.status !== BookStatus.PUBLISHED ? (
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={() => onDelete(book)}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Удалить</Text>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.publishedLabel}>
          <Text style={styles.publishedLabelText}>Опубликована на Ozon</Text>
        </View>
      )}
    </View>
  );
}

function DuplicateGroupCard({
  group,
  onNavigate,
  onDelete,
  onResolve,
  deletingId,
  resolvingKey,
  stores,
}: {
  group: DuplicateGroup;
  onNavigate: (id: string) => void;
  onDelete: (book: Book) => void;
  onResolve: (group: DuplicateGroup) => void;
  deletingId: string | null;
  resolvingKey: string | null;
  stores: OzonStore[];
}) {
  const isExact = group.type === "isbn";
  return (
    <View style={[styles.groupCard, isExact ? styles.groupExact : styles.groupPossible]}>
      <View style={styles.groupHeader}>
        <View style={[styles.badge, isExact ? styles.badgeExact : styles.badgePossible]}>
          <Text style={styles.badgeText}>{isExact ? "100% дубль" : "Возможный дубль"}</Text>
        </View>
        <Text style={styles.groupKey} numberOfLines={1}>
          {isExact ? `ISBN: ${group.key}` : `Название: ${group.key}`}
        </Text>
      </View>
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
          />
        ))}
      </ScrollView>
      <TouchableOpacity
        style={[styles.resolveBtn, resolvingKey === group.key && styles.resolveBtnDisabled]}
        onPress={() => onResolve(group)}
        disabled={resolvingKey === group.key}
        activeOpacity={0.7}
      >
        {resolvingKey === group.key ? (
          <ActivityIndicator size="small" color="#555" />
        ) : (
          <Text style={styles.resolveBtnText}>Это не дубль — пропустить</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function DuplicatesScreen() {
  const navigation = useNavigation<Nav>();
  const [isbnDuplicates, setIsbnDuplicates] = useState<DuplicateGroup[]>([]);
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [stores, setStores] = useState<OzonStore[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [res, storesRes] = await Promise.all([
        adminService.getDuplicates(),
        adminService.getOzonStores().catch(() => ({ stores: [] })),
      ]);
      setIsbnDuplicates(res.isbnDuplicates);
      setPossibleDuplicates(res.possibleDuplicates);
      setStores(storesRes.stores);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData();
    }, [fetchData]),
  );

  const navigate = useCallback(
    (bookId: string) => navigation.navigate("ProductDetail", { bookId, editable: true }),
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
          onPress: async () => {
            setDeletingId(book.id);
            try {
              await booksService.deleteBook(book.id);
              setIsbnDuplicates((prev) =>
                prev
                  .map((g) => ({ ...g, books: g.books.filter((b) => b.id !== book.id) }))
                  .filter((g) => g.books.length >= 2),
              );
              setPossibleDuplicates((prev) =>
                prev
                  .map((g) => ({ ...g, books: g.books.filter((b) => b.id !== book.id) }))
                  .filter((g) => g.books.length >= 2),
              );
            } catch {
              Alert.alert("Ошибка", "Не удалось удалить карточку");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, []);

  const handleResolve = useCallback(async (group: DuplicateGroup) => {
    if (group.books.length < 2) return;
    setResolvingKey(group.key);
    try {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < group.books.length; i++) {
        for (let j = i + 1; j < group.books.length; j++) {
          pairs.push([group.books[i].id, group.books[j].id]);
        }
      }
      await Promise.all(pairs.map(([id1, id2]) => adminService.resolveDuplicate(id1, id2)));
      if (group.type === "isbn") {
        setIsbnDuplicates((prev) => prev.filter((g) => g.key !== group.key));
      } else {
        setPossibleDuplicates((prev) => prev.filter((g) => g.key !== group.key));
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось отметить как не дубль");
    } finally {
      setResolvingKey(null);
    }
  }, []);

  const allGroups: DuplicateGroup[] = [...isbnDuplicates, ...possibleDuplicates];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={allGroups}
      keyExtractor={(item) => `${item.type}:${item.key}`}
      renderItem={({ item }) => (
        <DuplicateGroupCard
          group={item}
          onNavigate={navigate}
          onDelete={handleDelete}
          onResolve={handleResolve}
          deletingId={deletingId}
          resolvingKey={resolvingKey}
          stores={stores}
        />
      )}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData(); }}
        />
      }
      ListHeaderComponent={
        allGroups.length > 0 ? (
          <View style={styles.header}>
            {isbnDuplicates.length > 0 && (
              <Text style={styles.headerSection}>
                📌 Точные дубли (ISBN): {isbnDuplicates.length}
              </Text>
            )}
            {possibleDuplicates.length > 0 && (
              <Text style={styles.headerSection}>
                ⚠️ Возможные дубли (название): {possibleDuplicates.length}
              </Text>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.empty}>Дубликатов не найдено</Text>
        </View>
      }
    />
  );
}

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
  header: {
    marginBottom: 4,
  },
  headerSection: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
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
  groupExact: {
    borderLeftColor: "#E53935",
  },
  groupPossible: {
    borderLeftColor: "#FB8C00",
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
  badgeExact: {
    backgroundColor: "#FFEBEE",
  },
  badgePossible: {
    backgroundColor: "#FFF3E0",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
  },
  groupKey: {
    flex: 1,
    fontSize: 12,
    color: "#888",
  },
  booksScroll: {
    marginBottom: 12,
  },
  booksScrollContent: {
    gap: 10,
    paddingRight: 4,
  },
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
});
