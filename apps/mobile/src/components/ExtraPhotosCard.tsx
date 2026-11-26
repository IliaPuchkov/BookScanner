import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppText } from './AppText';
import { adminService, type ExtraPhotosStatus } from '../services/admin.service';

const n = (v: number) => v.toLocaleString('ru-RU');

/** Settings → «Доп. фото на Ozon»: on/off switch and progress (within the chosen stores). */
export function ExtraPhotosCard() {
  const [status, setStatus] = useState<ExtraPhotosStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      adminService
        .getExtraPhotosStatus()
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
      setStatus(await adminService.setExtraPhotosEnabled(enabled));
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить настройку');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (enabled: boolean) => {
    if (!enabled) return apply(false);
    Alert.alert(
      'Включить доп. фото?',
      'После фото книги на Ozon появятся картинки «Об издании», «О книге», «Состояние» и записка магазина. Они добавляются в опубликованные карточки постепенно, каждые 10 минут, только в магазинах из списка выше. Цены и описание не меняются.',
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
          <AppText style={styles.title}>Доп. фото на Ozon</AppText>
          <AppText style={styles.desc}>
            Картинки после фото книги: об издании, о книге, состояние, записка магазина.
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
          {n(status.published)} опубликованных в выбранных магазинах
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
