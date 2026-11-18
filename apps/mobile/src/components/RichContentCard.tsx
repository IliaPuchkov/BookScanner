import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText } from './AppText';
import { adminService, type RichContentStatus } from '../services/admin.service';

const n = (v: number) => v.toLocaleString('ru-RU');

/** Settings → «Rich-контент на Ozon»: on/off switch and progress. */
export function RichContentCard() {
  const [status, setStatus] = useState<RichContentStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      adminService
        .getRichContentStatus()
        .then((s) => alive && (setStatus(s), setError(false)))
        .catch(() => alive && setError(true));
      return () => {
        alive = false;
      };
    }, []),
  );

  const apply = async (enabled: boolean) => {
    setSaving(true);
    try {
      setStatus(await adminService.setRichContentEnabled(enabled));
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить настройку');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (enabled: boolean) => {
    if (!enabled) return apply(false);
    Alert.alert(
      'Включить Rich-контент?',
      'Новые карточки будут публиковаться с описанием «О книге», «Об издании» и «Состояние» рядом с фото. В уже опубликованные карточки оно будет добавляться постепенно, каждые 10 минут. Карточки, где Rich-контент уже есть, не изменятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Включить', onPress: () => apply(true) },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText style={styles.title}>Rich-контент на Ozon</AppText>
          <AppText style={styles.desc}>
            Описание с фото в карточке товара: о книге, об издании, состояние.
          </AppText>
        </View>
        {saving ? (
          <ActivityIndicator color="#1976D2" />
        ) : (
          <Switch
            value={!!status?.enabled}
            onValueChange={onToggle}
            disabled={!status}
            trackColor={{ false: '#ddd', true: '#BBDEFB' }}
            thumbColor={status?.enabled ? '#1976D2' : '#fff'}
          />
        )}
      </View>

      {error && <AppText style={styles.desc}>Не удалось загрузить статус</AppText>}
      {status && (
        <AppText style={styles.line}>
          В карточках Ozon: <AppText style={styles.value}>{n(status.synced)}</AppText> из{' '}
          {n(status.published)} опубликованных
        </AppText>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 4 },
  desc: { fontSize: 13, color: '#888' },
  line: { fontSize: 14, color: '#444', marginTop: 12 },
  value: { fontWeight: '700', color: '#222' },
});
