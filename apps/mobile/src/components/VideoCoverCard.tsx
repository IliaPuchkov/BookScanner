import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText } from './AppText';
import { adminService, type VideoCoverStatus } from '../services/admin.service';

const n = (v: number) => v.toLocaleString('ru-RU');

/** Settings → «Видеообложки на Ozon»: on/off switch and progress. */
export function VideoCoverCard() {
  const [status, setStatus] = useState<VideoCoverStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      adminService
        .getVideoCoverStatus()
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
      setStatus(await adminService.setVideoCoverEnabled(enabled));
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить настройку');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (enabled: boolean) => {
    if (!enabled) return apply(false);
    Alert.alert(
      'Включить видеообложки?',
      'После публикации сервер будет собирать для книги 8-секундный ролик из её фото и отправлять его в карточку Ozon. Готовые видеообложки уйдут в Ozon в течение 10 минут.',
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
          <AppText style={styles.title}>Видеообложки на Ozon</AppText>
          <AppText style={styles.desc}>
            8-секундный ролик из фото книги вместо главного фото в каталоге Ozon.
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
        <View style={styles.stats}>
          <AppText style={styles.line}>
            Готово: <AppText style={styles.value}>{n(status.withCover)}</AppText> из{' '}
            {n(status.published)} опубликованных
          </AppText>
          <AppText style={styles.line}>
            В карточках Ozon: <AppText style={styles.value}>{n(status.synced)}</AppText>
            {status.waitingForOzon > 0 && `, ждут отправки: ${n(status.waitingForOzon)}`}
          </AppText>
          {(status.queue.waiting > 0 || status.queue.active > 0) && (
            <AppText style={styles.line}>
              Собирается на сервере: {n(status.queue.waiting + status.queue.active)}
            </AppText>
          )}
          {status.queue.failed > 0 && (
            <AppText style={[styles.line, styles.failed]}>
              Не удалось собрать: {n(status.queue.failed)}
            </AppText>
          )}
        </View>
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
  stats: { marginTop: 12, gap: 4 },
  line: { fontSize: 14, color: '#444' },
  value: { fontWeight: '700', color: '#222' },
  failed: { color: '#E53935' },
});
