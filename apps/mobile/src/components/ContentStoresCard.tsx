import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { adminService, type ContentScope } from '../services/admin.service';

/**
 * Settings → «Магазины для видеообложек и Rich-контента»: try the new content on some stores
 * first. Nothing ticked = every store.
 */
export function ContentStoresCard() {
  const [scope, setScope] = useState<ContentScope | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      adminService
        .getContentScope()
        .then((s) => {
          if (!alive) return;
          setScope(s);
          setDraft(s.storeIds);
          setError(false);
        })
        .catch(() => alive && setError(true));
      return () => {
        alive = false;
      };
    }, []),
  );

  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const changed =
    !!scope && (draft.length !== scope.storeIds.length || draft.some((id) => !scope.storeIds.includes(id)));

  const save = async () => {
    setSaving(true);
    try {
      const s = await adminService.setContentScope(draft);
      setScope(s);
      setDraft(s.storeIds);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить магазины');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <AppText style={styles.title}>Магазины для видеообложек и Rich-контента</AppText>
      <AppText style={styles.desc}>
        Отметьте магазины, чтобы сначала попробовать новый контент только в них. Ничего не
        отмечено — во всех магазинах.
      </AppText>

      {error && <AppText style={styles.desc}>Не удалось загрузить магазины</AppText>}
      {!scope && !error && <ActivityIndicator style={{ marginTop: 12 }} color="#1976D2" />}
      {scope?.stores.map((store) => {
        const on = draft.includes(store.id);
        return (
          <TouchableOpacity key={store.id} style={styles.row} onPress={() => toggle(store.id)} disabled={saving}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? '#1976D2' : '#999'} />
            <AppText style={styles.storeName}>{store.name}</AppText>
          </TouchableOpacity>
        );
      })}
      {scope && (
        <AppText style={styles.summary}>
          {draft.length ? `Только отмеченные: ${draft.length}` : 'Сейчас: во всех магазинах'}
        </AppText>
      )}

      {changed && (
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <AppText style={styles.saveText}>Сохранить</AppText>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 4 },
  desc: { fontSize: 13, color: '#888', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  storeName: { fontSize: 15, color: '#222', flex: 1 },
  summary: { fontSize: 13, color: '#666', marginTop: 8 },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#1976D2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
