import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Text,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Input } from '../../components/Input';
import { adminService } from '../../services/admin.service';
import type { Book } from '../../types';

export function BookDatabaseScreen() {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchBooks = useCallback(
    async (p = 1, query = search, refresh = false) => {
      try {
        const res = await adminService.getBookDatabase(p, 20, query || undefined);
        if (refresh || p === 1) {
          setBooks(res.data);
        } else {
          setBooks((prev) => [...prev, ...res.data]);
        }
        setHasMore(p < res.meta.totalPages);
        setPage(p);
      } catch {
        // silent
      } finally {
        setRefreshing(false);
      }
    },
    [search],
  );

  useFocusEffect(
    useCallback(() => {
      fetchBooks(1, search, true);
    }, [fetchBooks, search]),
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    fetchBooks(1, text, true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Input
          label=""
          placeholder="Поиск по названию, автору, ISBN..."
          value={search}
          onChangeText={handleSearch}
          style={{ marginBottom: 0 }}
        />
      </View>

      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.bookTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.bookAuthor} numberOfLines={1}>
                {item.author || '—'}
              </Text>
            </View>
            <View style={styles.rowMeta}>
              <Text style={styles.isbn}>{item.isbn || '—'}</Text>
              <Text style={styles.sku}>{item.sku}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchBooks(1, search, true);
            }}
          />
        }
        onEndReached={() => {
          if (hasMore) fetchBooks(page + 1, search);
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <Text style={styles.empty}>Нет результатов</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  searchBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
  },
  rowMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  bookAuthor: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  isbn: {
    fontSize: 11,
    color: '#999',
  },
  sku: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 15,
  },
});
