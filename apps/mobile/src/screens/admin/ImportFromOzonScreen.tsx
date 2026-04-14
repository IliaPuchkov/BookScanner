import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { adminService } from '../../services/admin.service';
import type { OzonStore } from '../../services/admin.service';

interface OzonImportItem {
  productId: number;
  offerId: string;
  name: string;
  alreadyImported: boolean;
  bookId?: string;
}

const PAGE_LIMIT = 50;

export default function ImportFromOzonScreen() {
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | undefined>();
  const [items, setItems] = useState<OzonImportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const loadStores = useCallback(async () => {
    try {
      const { stores: s, activeId } = await adminService.getOzonStores();
      setStores(s);
      setActiveStoreId(activeId || s[0]?.id);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить список магазинов');
    }
  }, []);

  const loadItems = useCallback(async (p: number, storeId?: string, refresh = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await adminService.getOzonProductsForImport(storeId, p, PAGE_LIMIT);
      setTotal(result.total);
      setPage(p);
      if (refresh || p === 1) {
        setItems(result.items);
      } else {
        setItems((prev) => [...prev, ...result.items]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      Alert.alert('Ошибка загрузки', msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (activeStoreId !== undefined) {
      setSelected(new Set());
      loadItems(1, activeStoreId, true);
    }
  }, [activeStoreId, loadItems]);

  const toggleSelect = (productId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAllNew = () => {
    const newIds = items
      .filter((i) => !i.alreadyImported)
      .map((i) => i.productId);
    setSelected(new Set(newIds));
  };

  const handleImport = async () => {
    if (selected.size === 0) return;

    Alert.alert(
      'Подтвердите импорт',
      `Импортировать ${selected.size} товар(ов) с Озона?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Импортировать',
          onPress: async () => {
            setImporting(true);
            try {
              const result = await adminService.importOzonProducts({
                productIds: Array.from(selected),
                storeId: activeStoreId,
              });
              Alert.alert(
                'Готово',
                `Импортировано: ${result.imported}\nПропущено (уже в системе): ${result.skipped}\nОшибок: ${result.failed}`,
              );
              setSelected(new Set());
              loadItems(1, activeStoreId, true);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
              Alert.alert('Ошибка импорта', msg);
            } finally {
              setImporting(false);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: OzonImportItem }) => {
    const isSelected = selected.has(item.productId);
    return (
      <TouchableOpacity
        style={[styles.item, item.alreadyImported && styles.itemImported]}
        onPress={() => {
          if (!item.alreadyImported) toggleSelect(item.productId);
        }}
        activeOpacity={item.alreadyImported ? 1 : 0.7}
      >
        <View style={styles.itemLeft}>
          {!item.alreadyImported && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          {item.alreadyImported && (
            <View style={styles.checkboxDone}>
              <Text style={styles.checkmarkDone}>✓</Text>
            </View>
          )}
          <View style={styles.itemTextBlock}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.itemOfferId}>{item.offerId}</Text>
          </View>
        </View>
        {item.alreadyImported && (
          <View style={styles.importedBadge}>
            <Text style={styles.importedBadgeText}>В системе</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const hasMore = items.length < total;

  return (
    <View style={styles.container}>
      {/* Store selector */}
      {stores.length > 1 && (
        <View style={styles.storeRow}>
          <Text style={styles.storeLabel}>Магазин:</Text>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, activeStoreId === s.id && styles.storeChipActive]}
              onPress={() => setActiveStoreId(s.id)}
            >
              <Text
                style={[styles.storeChipText, activeStoreId === s.id && styles.storeChipTextActive]}
              >
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Stats row */}
      {!loading && (
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            Всего на Озоне: {total} · В системе: {items.filter((i) => i.alreadyImported).length} · Выбрано: {selected.size}
          </Text>
          {items.some((i) => !i.alreadyImported) && (
            <TouchableOpacity onPress={selectAllNew}>
              <Text style={styles.selectAllText}>Выбрать все новые</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#1976D2" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.productId)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => loadItems(1, activeStoreId, true)}
              colors={['#1976D2']}
            />
          }
          onEndReached={() => {
            if (hasMore && !loadingMore) loadItems(page + 1, activeStoreId);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#1976D2" /> : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>Товаров на Озоне не найдено</Text>
          }
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      {/* Bottom import bar */}
      {selected.size > 0 && (
        <View style={styles.importBar}>
          <TouchableOpacity
            style={[styles.importBtn, importing && styles.importBtnDisabled]}
            onPress={handleImport}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.importBtnText}>
                Импортировать выбранные ({selected.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexWrap: 'wrap',
    gap: 8,
  },
  storeLabel: { fontSize: 14, color: '#555', marginRight: 4 },
  storeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e3f2fd',
  },
  storeChipActive: { backgroundColor: '#1976D2' },
  storeChipText: { fontSize: 13, color: '#1976D2' },
  storeChipTextActive: { color: '#fff' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statsText: { fontSize: 12, color: '#666' },
  selectAllText: { fontSize: 13, color: '#1976D2', fontWeight: '600' },
  loader: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemImported: { opacity: 0.65 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#1976D2',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: '#1976D2' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  checkboxDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4caf50',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmarkDone: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  itemTextBlock: { flex: 1 },
  itemName: { fontSize: 14, color: '#212121', marginBottom: 2 },
  itemOfferId: { fontSize: 12, color: '#888' },
  importedBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  importedBadgeText: { fontSize: 11, color: '#388e3c', fontWeight: '600' },
  footerLoader: { marginVertical: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#999', fontSize: 14, marginTop: 40 },
  importBar: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  importBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  importBtnDisabled: { opacity: 0.6 },
  importBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
