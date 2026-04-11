import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useMaintenanceContext } from '../context/MaintenanceContext';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MaintenanceScreen() {
  const { startsAt, endsAt, message, instructions, refresh } = useMaintenanceContext();

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <Text style={styles.icon}>🔧</Text>
        <Text style={styles.title}>Технические работы</Text>
        <Text style={styles.subtitle}>
          Приложение временно недоступно.{'\n'}Приносим извинения за неудобства.
        </Text>

        <View style={styles.card}>
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Начало</Text>
              <Text style={styles.timeValue}>{formatDateTime(startsAt)}</Text>
            </View>
            <Text style={styles.timeDash}>→</Text>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Примерное окончание</Text>
              <Text style={styles.timeValue}>{formatDateTime(endsAt)}</Text>
            </View>
          </View>
        </View>

        {message ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Причина</Text>
            <Text style={styles.cardText}>{message}</Text>
          </View>
        ) : null}

        {instructions ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Что делать?</Text>
            <Text style={styles.cardText}>{instructions}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Что делать?</Text>
            <Text style={styles.cardText}>
              {'• Подождите окончания технических работ\n'}
              {'• Все сохранённые карточки и данные останутся на месте\n'}
              {'• Несохранённые изменения будут потеряны — не закрывайте приложение, если у вас есть незавершённые карточки\n'}
              {'• Нажмите «Обновить» после окончания работ'}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Что сохранится автоматически</Text>
          <Text style={styles.savedItem}>{'✅  Все карточки со статусом «Ожидает проверки»'}</Text>
          <Text style={styles.savedItem}>{'✅  Загруженные фотографии'}</Text>
          <Text style={styles.savedItem}>{'✅  Опубликованные в Ozon товары'}</Text>
          <Text style={styles.notSavedItem}>{'❌  Карточки, которые вы создаёте прямо сейчас'}</Text>
          <Text style={styles.notSavedItem}>{'❌  Несохранённые правки полей'}</Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={refresh} activeOpacity={0.8}>
          <Text style={styles.refreshBtnText}>🔄  Обновить статус</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F7FA',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A237E',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1976D2',
    textAlign: 'center',
  },
  timeDash: {
    fontSize: 18,
    color: '#ccc',
  },
  savedItem: {
    fontSize: 13,
    color: '#2E7D32',
    marginBottom: 6,
    lineHeight: 20,
  },
  notSavedItem: {
    fontSize: 13,
    color: '#C62828',
    marginBottom: 6,
    lineHeight: 20,
  },
  refreshBtn: {
    marginTop: 8,
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
