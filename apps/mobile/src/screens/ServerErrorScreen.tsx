import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AppText } from '../components/AppText';
import { maintenanceService } from '../services/maintenance.service';

interface Props {
  onRetry: () => void;
}

export function ServerErrorScreen({ onRetry }: Props) {
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await maintenanceService.getStatus();
    } catch {
      // ignore — the status listener in ServerStatusContext will update automatically
    } finally {
      setChecking(false);
      onRetry();
    }
  };

  return (
    <View style={styles.overlay}>
      <AppText style={styles.icon}>😕</AppText>
      <AppText style={styles.title}>Что-то пошло не так</AppText>
      <AppText style={styles.subtitle}>
        Не удаётся подключиться к серверу.{'\n'}
        Проверьте интернет-соединение и попробуйте снова.
      </AppText>

      <View style={styles.card}>
        <AppText style={styles.cardTitle}>Возможные причины</AppText>
        <AppText style={styles.cardText}>
          {'• Нет интернет-соединения\n'}
          {'• Сервер временно недоступен\n'}
          {'• Ведутся технические работы'}
        </AppText>
      </View>

      <TouchableOpacity
        style={[styles.retryBtn, checking && styles.retryBtnDisabled]}
        onPress={handleRetry}
        disabled={checking}
        activeOpacity={0.8}
      >
        {checking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText style={styles.retryBtnText}>🔄  Повторить попытку</AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F7FA',
    zIndex: 9998,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
