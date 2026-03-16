import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { adminService } from '../../services/admin.service';
import { booksService } from '../../services/books.service';
import { BookStatus } from '../../types';
import type { Book } from '../../types';
import type { AdminMainStackParamList } from '../../navigation/AdminNavigator';
import { formatDate } from '../../utils/format';

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

  const fetchBooks = useCallback(
    async (p: number, mode: 'initial' | 'refresh' | 'more') => {
      if (mode === 'initial') setLoading(true);
      if (mode === 'more') setLoadingMore(true);

      try {
        const res = await adminService.getPendingReviewBooks(p, 20);

        if (mode === 'more') {
          setBooks((prev) => [...prev, ...res.data]);
        } else {
          setBooks(res.data);
        }
        setHasMore(p < res.meta.totalPages);
        setPage(p);
      } catch {
        console.error('PendingReview fetch error');
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
      fetchBooks(1, 'initial');
    }, [fetchBooks]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBooks(1, 'refresh');
  };

  const handleLoadMore = () => {
    if (hasMore && !loadingMore && !loading) {
      fetchBooks(page + 1, 'more');
    }
  };

  const handlePublish = (book: Book) => {
    Alert.alert(
      'Загрузить в Озон?',
      `"${book.title}" будет опубликована на Озоне`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Загрузить',
          onPress: async () => {
            setPublishingId(book.id);
            try {
              await booksService.publishToOzon(book.id);
              Alert.alert('Готово', 'Карточка загружена в Озон');
              setBooks((prev) => prev.filter((b) => b.id !== book.id));
            } catch {
              Alert.alert('Ошибка', 'Не удалось загрузить в Озон');
            } finally {
              setPublishingId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Book }) => {
    const coverPhoto = item.photos?.find((p) => p.sortOrder === 0);
    const isPublishing = publishingId === item.id;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('CardDetail', { bookId: item.id, editable: true })
        }
      >
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto.fileUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>Нет фото</Text>
          </View>
        )}
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
          <View style={styles.meta}>
            {item.createdBy?.fullName ? (
              <Text style={styles.metaText} numberOfLines={1}>
                {item.createdBy.fullName}
              </Text>
            ) : null}
            <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.publishBtn, isPublishing && styles.publishBtnDisabled]}
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
    <FlatList
      style={styles.container}
      data={books}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  list: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: 70,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 10,
    color: '#999',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  author: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  sku: {
    fontSize: 12,
    color: '#999',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
    marginTop: 4,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#aaa',
    flexShrink: 1,
  },
  publishBtn: {
    marginTop: 8,
    backgroundColor: '#43A047',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 15,
  },
});
