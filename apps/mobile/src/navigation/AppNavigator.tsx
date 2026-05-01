import React, { useState } from 'react';
import {
  ActivityIndicator,
  View,
  Modal,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
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
import { authService } from '../services/auth.service';
import {
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_TEXT,
  PUBLIC_OFFER_TITLE,
  PUBLIC_OFFER_TEXT,
} from '../constants/legal';

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
  const { isAuthenticated, isLoading, user, refreshUser } = useAuth();
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentOffer, setConsentOffer] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [docModal, setDocModal] = useState<{ title: string; text: string } | null>(null);

  const needsConsent = isAuthenticated && user?.consentGivenAt === null;

  const handleAcceptConsent = async () => {
    if (!consentPrivacy || !consentOffer) {
      Alert.alert('Необходимо принять оба документа', 'Пожалуйста, ознакомьтесь с политикой конфиденциальности и пользовательским соглашением и подтвердите своё согласие.');
      return;
    }
    setConsentLoading(true);
    try {
      await authService.acceptConsent();
      await refreshUser();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить согласие. Попробуйте ещё раз.');
    } finally {
      setConsentLoading(false);
    }
  };
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

      {/* No-connection banner — shown for all roles when server is unreachable and no maintenance */}
      {!isActive && serverUnreachable && isAuthenticated && (
        <View style={[styles.offlineBanner, { top: insets.top }]} pointerEvents="none">
          <Text style={styles.offlineBannerText}>Нет подключения к серверу</Text>
        </View>
      )}

      {/* Consent modal for users who haven't accepted the terms yet */}
      <Modal
        visible={!!needsConsent}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.warningOverlay}>
          <View style={[styles.warningBox, docModal ? styles.warningBoxFullHeight : null]}>
            {docModal ? (
              <>
                <View style={styles.docHeader}>
                  <Text style={styles.docTitle}>{docModal.title}</Text>
                </View>
                <ScrollView style={styles.docScroll} bounces>
                  <Text style={styles.docText}>{docModal.text}</Text>
                </ScrollView>
                <TouchableOpacity style={styles.warningBtn} onPress={() => setDocModal(null)} activeOpacity={0.8}>
                  <Text style={styles.warningBtnText}>← Назад</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.warningTitle}>Согласие с документами</Text>
                <Text style={styles.consentIntro}>
                  Для продолжения работы ознакомьтесь и примите документы:
                </Text>

                <ScrollView style={styles.warningInstructionsScroll} bounces={false}>
                  <Text style={styles.consentSectionTitle}>Политика конфиденциальности</Text>
                  <Text style={styles.consentSectionText}>
                    Мы собираем ФИО, телефон и email для идентификации. Данные хранятся на серверах в РФ и не передаются третьим лицам.
                  </Text>

                  <Text style={styles.consentSectionTitle}>Пользовательское соглашение</Text>
                  <Text style={styles.consentSectionText}>
                    Приложение используется в рамках служебных обязанностей. Фотографии и карточки товаров принадлежат Правообладателю.
                  </Text>
                </ScrollView>

                <TouchableOpacity
                  style={styles.consentLinkRow}
                  onPress={() => setDocModal({ title: PRIVACY_POLICY_TITLE, text: PRIVACY_POLICY_TEXT })}
                >
                  <Text style={styles.consentLinkText}>Читать Политику конфиденциальности →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.consentLinkRow, { marginBottom: 16 }]}
                  onPress={() => setDocModal({ title: PUBLIC_OFFER_TITLE, text: PUBLIC_OFFER_TEXT })}
                >
                  <Text style={styles.consentLinkText}>Читать Пользовательское соглашение →</Text>
                </TouchableOpacity>

                <View style={styles.consentCheckRow}>
                  <TouchableOpacity onPress={() => setConsentPrivacy((v) => !v)} activeOpacity={0.7}>
                    <View style={[styles.consentCheckbox, consentPrivacy && styles.consentCheckboxChecked]}>
                      {consentPrivacy && <Text style={styles.consentCheckmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.consentCheckLabel} onPress={() => setConsentPrivacy((v) => !v)}>
                    Принимаю Политику конфиденциальности
                  </Text>
                </View>

                <View style={[styles.consentCheckRow, { marginBottom: 20 }]}>
                  <TouchableOpacity onPress={() => setConsentOffer((v) => !v)} activeOpacity={0.7}>
                    <View style={[styles.consentCheckbox, consentOffer && styles.consentCheckboxChecked]}>
                      {consentOffer && <Text style={styles.consentCheckmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.consentCheckLabel} onPress={() => setConsentOffer((v) => !v)}>
                    Принимаю Пользовательское соглашение
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.warningBtn, (!consentPrivacy || !consentOffer || consentLoading) && styles.warningBtnDisabled]}
                  onPress={handleAcceptConsent}
                  activeOpacity={0.8}
                  disabled={!consentPrivacy || !consentOffer || consentLoading}
                >
                  <Text style={styles.warningBtnText}>
                    {consentLoading ? 'Сохранение...' : 'Принять и продолжить'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
  warningBoxFullHeight: {
    flex: 1,
    maxHeight: '92%',
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
  offlineBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#B71C1C',
    paddingVertical: 6,
    paddingHorizontal: 16,
    zIndex: 200,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  consentIntro: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  consentSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
    marginTop: 8,
    marginBottom: 4,
  },
  consentSectionText: {
    fontSize: 13,
    color: '#444',
    lineHeight: 19,
    marginBottom: 8,
  },
  consentLinkRow: {
    paddingVertical: 6,
  },
  consentLinkText: {
    fontSize: 13,
    color: '#1976D2',
    textDecorationLine: 'underline',
  },
  consentCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  consentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  consentCheckboxChecked: {
    backgroundColor: '#1976D2',
  },
  consentCheckmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  consentCheckLabel: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 19,
  },
  warningBtnDisabled: {
    backgroundColor: '#90CAF9',
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A237E',
    flex: 1,
  },
  docClose: {
    fontSize: 18,
    color: '#aaa',
    paddingLeft: 12,
  },
  docScroll: {
    flex: 1,
    marginBottom: 16,
  },
  docText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 22,
  },
});
