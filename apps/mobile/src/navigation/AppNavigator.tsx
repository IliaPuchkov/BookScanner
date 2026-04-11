import React from 'react';
import {
  ActivityIndicator,
  View,
  Modal,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { useMaintenanceContext } from '../context/MaintenanceContext';
import { useServerStatusContext } from '../context/ServerStatusContext';
import { UserRole } from '../types';
import { AuthNavigator } from './AuthNavigator';
import { OperatorNavigator } from './OperatorNavigator';
import { AdminNavigator } from './AdminNavigator';
import { MaintenanceScreen } from '../screens/MaintenanceScreen';
import { ServerErrorScreen } from '../screens/ServerErrorScreen';

export type RootStackParamList = {
  Auth: undefined;
  OperatorTabs: undefined;
  AdminTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isActive, isWarning, startsAt, endsAt, message, instructions, warningDismissed, dismissWarning, refresh: refreshMaintenance } =
    useMaintenanceContext();
  const { serverUnreachable } = useServerStatusContext();
  const insets = useSafeAreaInsets();
  // Standard React Navigation header height: 56 on Android, 44 on iOS
  const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;
  const bannerTop = insets.top + HEADER_HEIGHT;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          ) : user?.role === UserRole.ADMIN ? (
            <Stack.Screen name="AdminTabs" component={AdminNavigator} />
          ) : (
            <Stack.Screen name="OperatorTabs" component={OperatorNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {/* Full maintenance screen — only for non-admin users */}
      {isActive && user?.role !== UserRole.ADMIN && <MaintenanceScreen />}

      {/* Admin banner — shown instead of full overlay */}
      {isActive && user?.role === UserRole.ADMIN && (
        <View style={[styles.adminBanner, { top: bannerTop }]} pointerEvents="none">
          <Text style={styles.adminBannerText}>🔧 Технические работы активны — операторы видят экран обслуживания</Text>
        </View>
      )}

      {/* Server unreachable screen — shown only when maintenance is not active */}
      {!isActive && serverUnreachable && user?.role !== UserRole.ADMIN && (
        <ServerErrorScreen onRetry={refreshMaintenance} />
      )}

      {/* Pre-maintenance warning modal */}
      <Modal
        visible={isWarning && !warningDismissed}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.warningOverlay}>
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>Предстоящие технические работы</Text>

            <View style={styles.warningTimeRow}>
              <View style={styles.warningTimeBlock}>
                <Text style={styles.warningTimeLabel}>Начало</Text>
                <Text style={styles.warningTimeValue}>{formatDateTime(startsAt)}</Text>
              </View>
              <Text style={styles.warningTimeDash}>→</Text>
              <View style={styles.warningTimeBlock}>
                <Text style={styles.warningTimeLabel}>Окончание (прим.)</Text>
                <Text style={styles.warningTimeValue}>{formatDateTime(endsAt)}</Text>
              </View>
            </View>

            {message ? (
              <Text style={styles.warningMessage}>{message}</Text>
            ) : null}

            <ScrollView style={styles.warningInstructionsScroll} bounces={false}>
              <Text style={styles.warningInstructionsTitle}>Что нужно сделать:</Text>
              {instructions ? (
                <Text style={styles.warningInstructionsText}>{instructions}</Text>
              ) : (
                <Text style={styles.warningInstructionsText}>
                  {'• Завершите текущую работу до начала обслуживания\n'}
                  {'• Сохраните все незаконченные карточки\n'}
                  {'• Все уже сохранённые данные останутся — ничего не потеряется\n'}
                  {'• Приложение автоматически откроется после окончания работ'}
                </Text>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.warningBtn} onPress={dismissWarning} activeOpacity={0.8}>
              <Text style={styles.warningBtnText}>Понял, спасибо</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  warningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  warningIcon: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 10,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A237E',
    textAlign: 'center',
    marginBottom: 18,
  },
  warningTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 6,
  },
  warningTimeBlock: {
    flex: 1,
    alignItems: 'center',
  },
  warningTimeLabel: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 3,
  },
  warningTimeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1976D2',
    textAlign: 'center',
  },
  warningTimeDash: {
    fontSize: 16,
    color: '#ccc',
  },
  warningMessage: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 20,
  },
  warningInstructionsScroll: {
    maxHeight: 160,
    marginBottom: 20,
  },
  warningInstructionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  warningInstructionsText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  warningBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  warningBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  adminBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#E53935',
    paddingVertical: 7,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  adminBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
