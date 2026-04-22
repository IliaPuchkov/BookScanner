import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { adminService } from '../../services/admin.service';
import type { OzonStore } from '../../services/admin.service';

interface SyncDiff {
  counts: { ozonActive: number; ozonArchived: number; systemPublished: number; systemArchived: number };
  onOzonNotInSystem: Array<{ productId: number; offerId: string; name: string; visibility: string }>;
  inSystemNotOnOzon: Array<{ bookId: string; sku: string; title: string; status: string }>;
}

type Tab = 'ozon' | 'system';

export default function OzonSyncScreen() {
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | undefined>();
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('ozon');

  const loadStores = useCallback(async () => {
    try {
      const { stores: s } = await adminService.getOzonStores();
      setStores(s);
    } catch {
      // silent
    }
  }, []);

  const loadDiff = useCallback(async (storeId?: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
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
    setDiff(null);
    loadDiff(id);
  };

  const activeList = tab === 'ozon' ? (diff?.onOzonNotInSystem ?? []) : (diff?.inSystemNotOnOzon ?? []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDiff(activeStoreId, true)}
          colors={['#1976D2']}
          tintColor="#1976D2"
        />
      }
    >
      {/* Store selector */}
      {stores.length > 1 && (
        <View style={styles.storeRow}>
          <TouchableOpacity
            style={[styles.storeChip, !activeStoreId && styles.storeChipActive]}
            onPress={() => handleStoreChange(undefined)}
          >
            <Text style={[styles.storeChipText, !activeStoreId && styles.storeChipTextActive]}>
              Все магазины
            </Text>
          </TouchableOpacity>
          {stores.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, activeStoreId === s.id && styles.storeChipActive]}
              onPress={() => handleStoreChange(s.id)}
            >
              <Text style={[styles.storeChipText, activeStoreId === s.id && styles.storeChipTextActive]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loaderText}>Загружаем данные с Озона…</Text>
        </View>
      ) : diff ? (
        <>
          {/* Counts grid */}
          <View style={styles.grid}>
            <View style={[styles.tile, styles.tileBlue]}>
              <Text style={styles.tileNum}>{diff.counts.ozonActive}</Text>
              <Text style={styles.tileLabel}>Ozon{'\n'}активные</Text>
            </View>
            <View style={[styles.tile, styles.tileGrey]}>
              <Text style={styles.tileNum}>{diff.counts.ozonArchived}</Text>
              <Text style={styles.tileLabel}>Ozon{'\n'}в архиве</Text>
            </View>
            <View style={[styles.tile, styles.tileGreen]}>
              <Text style={styles.tileNum}>{diff.counts.systemPublished}</Text>
              <Text style={styles.tileLabel}>Система{'\n'}опублик.</Text>
            </View>
            <View style={[styles.tile, styles.tileOrange]}>
              <Text style={styles.tileNum}>{diff.counts.systemArchived}</Text>
              <Text style={styles.tileLabel}>Система{'\n'}в архиве</Text>
            </View>
          </View>

          {/* Diff summary */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBadge, diff.onOzonNotInSystem.length > 0 && styles.summaryBadgeWarn]}>
              <Text style={[styles.summaryBadgeNum, diff.onOzonNotInSystem.length > 0 && styles.summaryBadgeNumWarn]}>
                {diff.onOzonNotInSystem.length}
              </Text>
              <Text style={styles.summaryBadgeLabel}>на Ozon, нет в системе</Text>
            </View>
            <View style={[styles.summaryBadge, diff.inSystemNotOnOzon.length > 0 && styles.summaryBadgeWarn]}>
              <Text style={[styles.summaryBadgeNum, diff.inSystemNotOnOzon.length > 0 && styles.summaryBadgeNumWarn]}>
                {diff.inSystemNotOnOzon.length}
              </Text>
              <Text style={styles.summaryBadgeLabel}>в системе, нет на Ozon</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'ozon' && styles.tabBtnActive]}
              onPress={() => setTab('ozon')}
            >
              <Text style={[styles.tabBtnText, tab === 'ozon' && styles.tabBtnTextActive]}>
                На Ozon, нет в системе ({diff.onOzonNotInSystem.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'system' && styles.tabBtnActive]}
              onPress={() => setTab('system')}
            >
              <Text style={[styles.tabBtnText, tab === 'system' && styles.tabBtnTextActive]}>
                В системе, нет на Ozon ({diff.inSystemNotOnOzon.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          {activeList.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Расхождений нет</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {tab === 'ozon'
                ? (diff.onOzonNotInSystem.map((item) => (
                    <View key={`${item.productId}`} style={styles.listItem}>
                      <View style={styles.listItemLeft}>
                        <Text style={styles.listItemTitle} numberOfLines={2}>{item.name || '—'}</Text>
                        <Text style={styles.listItemSub}>{item.offerId}</Text>
                      </View>
                      <View style={[
                        styles.visibilityBadge,
                        item.visibility === 'ARCHIVED' && styles.visibilityBadgeArchived,
                      ]}>
                        <Text style={[
                          styles.visibilityBadgeText,
                          item.visibility === 'ARCHIVED' && styles.visibilityBadgeTextArchived,
                        ]}>
                          {item.visibility === 'ACTIVE' ? 'активный' : 'архив'}
                        </Text>
                      </View>
                    </View>
                  )))
                : (diff.inSystemNotOnOzon.map((item) => (
                    <View key={item.bookId} style={styles.listItem}>
                      <View style={styles.listItemLeft}>
                        <Text style={styles.listItemTitle} numberOfLines={2}>{item.title || '—'}</Text>
                        <Text style={styles.listItemSub}>{item.sku}</Text>
                      </View>
                      <View style={[
                        styles.visibilityBadge,
                        item.status === 'ARCHIVED' && styles.visibilityBadgeArchived,
                      ]}>
                        <Text style={[
                          styles.visibilityBadgeText,
                          item.status === 'ARCHIVED' && styles.visibilityBadgeTextArchived,
                        ]}>
                          {item.status === 'PUBLISHED' ? 'опублик.' : 'архив'}
                        </Text>
                      </View>
                    </View>
                  )))
              }
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 32 },
  storeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
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
  loaderBox: { alignItems: 'center', marginTop: 60, gap: 16 },
  loaderText: { fontSize: 14, color: '#888' },
  grid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tile: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  tileBlue: { backgroundColor: '#E3F2FD' },
  tileGrey: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#e0e0e0' },
  tileGreen: { backgroundColor: '#E8F5E9' },
  tileOrange: { backgroundColor: '#FFF3E0' },
  tileNum: { fontSize: 22, fontWeight: '700', color: '#222' },
  tileLabel: { fontSize: 10, color: '#666', textAlign: 'center', lineHeight: 14 },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryBadgeWarn: { borderColor: '#FF8F00', backgroundColor: '#FFFDE7' },
  summaryBadgeNum: { fontSize: 20, fontWeight: '700', color: '#222' },
  summaryBadgeNumWarn: { color: '#E65100' },
  summaryBadgeLabel: { fontSize: 11, color: '#666', flex: 1 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  tabBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#1976D2' },
  tabBtnText: { fontSize: 11, fontWeight: '600', color: '#666', textAlign: 'center' },
  tabBtnTextActive: { color: '#fff' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: '#aaa' },
  list: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  listItemLeft: { flex: 1, marginRight: 8 },
  listItemTitle: { fontSize: 13, color: '#212121', marginBottom: 2 },
  listItemSub: { fontSize: 11, color: '#888' },
  visibilityBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  visibilityBadgeArchived: { backgroundColor: '#F5F5F5' },
  visibilityBadgeText: { fontSize: 11, color: '#1976D2', fontWeight: '600' },
  visibilityBadgeTextArchived: { color: '#757575' },
});
