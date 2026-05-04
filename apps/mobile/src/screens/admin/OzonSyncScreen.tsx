import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { AppText } from '../../components/AppText';
import { adminService } from '../../services/admin.service';
import type { OzonStore } from '../../services/admin.service';

interface DiffItem {
  productId: number;
  offerId: string;
  name: string;
  visibility: string;
  storeId: string | null;
}

interface SystemItem {
  bookId: string;
  sku: string;
  title: string;
  status: string;
}

interface SyncDiff {
  counts: { ozonActive: number; ozonArchived: number; systemPublished: number; systemArchived: number };
  onOzonNotInSystem: DiffItem[];
  inSystemNotOnOzon: SystemItem[];
}

type Tab = 'ozon' | 'system';

const IMPORT_BATCH = 200;

export default function OzonSyncScreen() {
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | undefined>();
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('ozon');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const storeIdRef = useRef<string | undefined>(undefined);

  const loadStores = useCallback(async () => {
    try {
      const { stores: s } = await adminService.getOzonStores();
      setStores(s);
    } catch {
      // silent
    }
  }, []);

  const loadDiff = useCallback(async (storeId?: string, isRefresh = false) => {
    storeIdRef.current = storeId;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setSelected(new Set());
    try {
      const result = await adminService.getSyncDiff(storeId);
      setDiff(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      Alert.alert('Ошибка', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
    loadDiff(undefined);
  }, [loadDiff, loadStores]);

  const handleStoreChange = (id: string | undefined) => {
    setActiveStoreId(id);
    loadDiff(id);
  };

  const toggleSelect = (productId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAll = () => {
    if (!diff) return;
    setSelected(new Set(diff.onOzonNotInSystem.map((i) => i.productId)));
  };

  const deselectAll = () => setSelected(new Set());

  const handleImport = () => {
    if (!diff || selected.size === 0) return;

    const selectedItems = diff.onOzonNotInSystem.filter((i) => selected.has(i.productId));

    Alert.alert(
      'Подтвердите импорт',
      `Импортировать ${selected.size} товар(ов) в систему?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Импортировать',
          onPress: async () => {
            setImporting(true);
            setImportProgress({ done: 0, total: selectedItems.length });

            // Group by storeId + visibility (isArchived)
            type GroupKey = string;
            const groups = new Map<GroupKey, { productIds: number[]; storeId: string | null; isArchived: boolean }>();
            for (const item of selectedItems) {
              const isArchived = item.visibility === 'ARCHIVED';
              const key = `${item.storeId ?? 'null'}__${isArchived}`;
              if (!groups.has(key)) {
                groups.set(key, { productIds: [], storeId: item.storeId, isArchived });
              }
              groups.get(key)!.productIds.push(item.productId);
            }

            let totalImported = 0;
            let totalSkipped = 0;
            let totalFailed = 0;
            let done = 0;

            try {
              for (const { productIds, storeId, isArchived } of groups.values()) {
                for (let i = 0; i < productIds.length; i += IMPORT_BATCH) {
                  const batch = productIds.slice(i, i + IMPORT_BATCH);
                  const result = await adminService.importOzonProducts({
                    productIds: batch,
                    storeId: storeId ?? undefined,
                    isArchived,
                  });
                  totalImported += result.imported;
                  totalSkipped += result.skipped;
                  totalFailed += result.failed;
                  done += batch.length;
                  setImportProgress({ done, total: selectedItems.length });
                }
              }

              Alert.alert(
                'Готово',
                `Импортировано: ${totalImported}\nПропущено: ${totalSkipped}\nОшибок: ${totalFailed}`,
              );
              setSelected(new Set());
              loadDiff(storeIdRef.current, true);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
              Alert.alert('Ошибка импорта', msg);
            } finally {
              setImporting(false);
              setImportProgress(null);
            }
          },
        },
      ],
    );
  };

  const allNewCount = diff?.onOzonNotInSystem.length ?? 0;
  const allSelected = allNewCount > 0 && selected.size === allNewCount;

  const renderOzonItem = ({ item }: { item: DiffItem }) => {
    const isSelected = selected.has(item.productId);
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => toggleSelect(item.productId)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <AppText style={styles.checkmark}>✓</AppText>}
        </View>
        <View style={styles.listItemContent}>
          <AppText style={styles.listItemTitle} numberOfLines={2}>{item.name || '—'}</AppText>
          <AppText style={styles.listItemSub}>{item.offerId}</AppText>
        </View>
        <View style={[styles.badge, item.visibility === 'ARCHIVED' && styles.badgeArchived]}>
          <AppText style={[styles.badgeText, item.visibility === 'ARCHIVED' && styles.badgeTextArchived]}>
            {item.visibility === 'ACTIVE' ? 'активный' : 'архив'}
          </AppText>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSystemItem = ({ item }: { item: SystemItem }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemContent}>
        <AppText style={styles.listItemTitle} numberOfLines={2}>{item.title || '—'}</AppText>
        <AppText style={styles.listItemSub}>{item.sku}</AppText>
      </View>
      <View style={[styles.badge, item.status === 'ARCHIVED' && styles.badgeArchived]}>
        <AppText style={[styles.badgeText, item.status === 'ARCHIVED' && styles.badgeTextArchived]}>
          {item.status === 'PUBLISHED' ? 'опублик.' : 'архив'}
        </AppText>
      </View>
    </View>
  );

  const listData = tab === 'ozon'
    ? (diff?.onOzonNotInSystem ?? [])
    : (diff?.inSystemNotOnOzon ?? []);

  return (
    <View style={styles.container}>
      {/* Store selector */}
      {stores.length > 1 && (
        <View style={styles.storeRow}>
          <TouchableOpacity
            style={[styles.storeChip, !activeStoreId && styles.storeChipActive]}
            onPress={() => handleStoreChange(undefined)}
          >
            <AppText style={[styles.storeChipText, !activeStoreId && styles.storeChipTextActive]}>
              Все
            </AppText>
          </TouchableOpacity>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, activeStoreId === s.id && styles.storeChipActive]}
              onPress={() => handleStoreChange(s.id)}
            >
              <AppText style={[styles.storeChipText, activeStoreId === s.id && styles.storeChipTextActive]}>
                {s.name}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color="#1976D2" />
          <AppText style={styles.loaderText}>Загружаем данные с Озона…</AppText>
        </View>
      ) : diff ? (
        <>
          {/* Counts grid */}
          <View style={styles.grid}>
            <View style={[styles.tile, styles.tileBlue]}>
              <AppText style={styles.tileNum}>{diff.counts.ozonActive}</AppText>
              <AppText style={styles.tileLabel}>Ozon{'\n'}активные</AppText>
            </View>
            <View style={[styles.tile, styles.tileGrey]}>
              <AppText style={styles.tileNum}>{diff.counts.ozonArchived}</AppText>
              <AppText style={styles.tileLabel}>Ozon{'\n'}в архиве</AppText>
            </View>
            <View style={[styles.tile, styles.tileGreen]}>
              <AppText style={styles.tileNum}>{diff.counts.systemPublished}</AppText>
              <AppText style={styles.tileLabel}>Система{'\n'}опублик.</AppText>
            </View>
            <View style={[styles.tile, styles.tileOrange]}>
              <AppText style={styles.tileNum}>{diff.counts.systemArchived}</AppText>
              <AppText style={styles.tileLabel}>Система{'\n'}в архиве</AppText>
            </View>
          </View>

          {/* Summary badges */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBadge, diff.onOzonNotInSystem.length > 0 && styles.summaryBadgeWarn]}>
              <AppText style={[styles.summaryNum, diff.onOzonNotInSystem.length > 0 && styles.summaryNumWarn]}>
                {diff.onOzonNotInSystem.length}
              </AppText>
              <AppText style={styles.summaryLabel}>на Ozon,{'\n'}нет в системе</AppText>
            </View>
            <View style={[styles.summaryBadge, diff.inSystemNotOnOzon.length > 0 && styles.summaryBadgeWarn]}>
              <AppText style={[styles.summaryNum, diff.inSystemNotOnOzon.length > 0 && styles.summaryNumWarn]}>
                {diff.inSystemNotOnOzon.length}
              </AppText>
              <AppText style={styles.summaryLabel}>в системе,{'\n'}нет на Ozon</AppText>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'ozon' && styles.tabBtnActive]}
              onPress={() => setTab('ozon')}
            >
              <AppText style={[styles.tabBtnText, tab === 'ozon' && styles.tabBtnTextActive]}>
                На Ozon ({diff.onOzonNotInSystem.length})
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'system' && styles.tabBtnActive]}
              onPress={() => setTab('system')}
            >
              <AppText style={[styles.tabBtnText, tab === 'system' && styles.tabBtnTextActive]}>
                В системе ({diff.inSystemNotOnOzon.length})
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Select all row (only for ozon tab) */}
          {tab === 'ozon' && diff.onOzonNotInSystem.length > 0 && (
            <View style={styles.selectAllRow}>
              <AppText style={styles.selectAllCount}>Выбрано: {selected.size}</AppText>
              <TouchableOpacity onPress={allSelected ? deselectAll : selectAll}>
                <AppText style={styles.selectAllBtn}>
                  {allSelected ? 'Снять всё' : 'Выбрать все'}
                </AppText>
              </TouchableOpacity>
            </View>
          )}

          {/* List */}
          <FlatList
            data={listData as (DiffItem | SystemItem)[]}
            keyExtractor={(item) =>
              tab === 'ozon'
                ? String((item as DiffItem).productId)
                : (item as SystemItem).bookId
            }
            renderItem={
              tab === 'ozon'
                ? ({ item }) => renderOzonItem({ item: item as DiffItem })
                : ({ item }) => renderSystemItem({ item: item as SystemItem })
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadDiff(activeStoreId, true)}
                colors={['#1976D2']}
                tintColor="#1976D2"
              />
            }
            contentContainerStyle={listData.length === 0 ? styles.emptyContainer : styles.listContent}
            ListEmptyComponent={
              <AppText style={styles.emptyText}>Расхождений нет</AppText>
            }
          />
        </>
      ) : null}

      {/* Import bar */}
      {tab === 'ozon' && selected.size > 0 && (
        <View style={styles.importBar}>
          <TouchableOpacity
            style={[styles.importBtn, importing && styles.importBtnDisabled]}
            onPress={handleImport}
            disabled={importing}
          >
            {importing ? (
              <AppText style={styles.importBtnText}>
                {importProgress
                  ? `Импорт… ${importProgress.done} / ${importProgress.total}`
                  : 'Подготовка…'}
              </AppText>
            ) : (
              <AppText style={styles.importBtnText}>
                Импортировать выбранные ({selected.size})
              </AppText>
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
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  storeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e3f2fd',
  },
  storeChipActive: { backgroundColor: '#1976D2' },
  storeChipText: { fontSize: 13, color: '#1976D2' },
  storeChipTextActive: { color: '#fff' },
  loaderBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loaderText: { fontSize: 14, color: '#888' },
  grid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tile: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  tileBlue: { backgroundColor: '#E3F2FD' },
  tileGrey: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#e0e0e0' },
  tileGreen: { backgroundColor: '#E8F5E9' },
  tileOrange: { backgroundColor: '#FFF3E0' },
  tileNum: { fontSize: 20, fontWeight: '700', color: '#222' },
  tileLabel: { fontSize: 9, color: '#666', textAlign: 'center', lineHeight: 13 },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  summaryBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryBadgeWarn: { borderColor: '#FF8F00', backgroundColor: '#FFFDE7' },
  summaryNum: { fontSize: 22, fontWeight: '700', color: '#222', minWidth: 28 },
  summaryNumWarn: { color: '#E65100' },
  summaryLabel: { fontSize: 11, color: '#666', flex: 1, lineHeight: 15 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#1976D2' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
  tabBtnTextActive: { color: '#fff' },
  selectAllRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  selectAllCount: { fontSize: 12, color: '#666' },
  selectAllBtn: { fontSize: 13, color: '#1976D2', fontWeight: '600' },
  listContent: { paddingBottom: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#aaa' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
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
  listItemContent: { flex: 1, marginRight: 8 },
  listItemTitle: { fontSize: 13, color: '#212121', marginBottom: 2 },
  listItemSub: { fontSize: 11, color: '#888' },
  badge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeArchived: { backgroundColor: '#F5F5F5' },
  badgeText: { fontSize: 11, color: '#1976D2', fontWeight: '600' },
  badgeTextArchived: { color: '#757575' },
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
