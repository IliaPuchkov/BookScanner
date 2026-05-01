import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  TouchableOpacity,
} from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/Button";
import { authService } from "../services/auth.service";
import {
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_TEXT,
  PUBLIC_OFFER_TITLE,
  PUBLIC_OFFER_TEXT,
} from "../constants/legal";

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [deleting, setDeleting] = useState(false);
  const [docModal, setDocModal] = useState<{ title: string; text: string } | null>(null);
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Удалить аккаунт",
      "Вы уверены, что хотите удалить свой аккаунт? Ваши персональные данные (ФИО, телефон, email) будут удалены. Созданные карточки товаров останутся в системе как рабочий контент компании. Это действие необратимо.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: confirmDeleteAccount,
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteMe();
      await logout();
    } catch {
      Alert.alert("Ошибка", "Не удалось удалить аккаунт. Попробуйте позже.");
      setDeleting(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.fullName?.charAt(0)?.toUpperCase() ?? "?"}
          </Text>
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.role}>
          {isAdmin ? "Администратор" : "Оператор"}
        </Text>

        <View style={styles.info}>
          <InfoItem label="Телефон" value={user?.phone ?? "—"} />
          <InfoItem label="Email" value={user?.email ?? "—"} />
          <InfoItem
            label="Статус"
            value={user?.isApproved ? "Подтвержден" : "Ожидает подтверждения"}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Документы</Text>
        <TouchableOpacity
          style={styles.docRow}
          onPress={() => setDocModal({ title: PRIVACY_POLICY_TITLE, text: PRIVACY_POLICY_TEXT })}
          activeOpacity={0.7}
        >
          <Text style={styles.docRowText}>Политика конфиденциальности</Text>
          <Text style={styles.docRowArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.docRow, { borderBottomWidth: 0 }]}
          onPress={() => setDocModal({ title: PUBLIC_OFFER_TITLE, text: PUBLIC_OFFER_TEXT })}
          activeOpacity={0.7}
        >
          <Text style={styles.docRowText}>Пользовательское соглашение</Text>
          <Text style={styles.docRowArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Выйти из аккаунта"
        onPress={handleLogout}
        variant="danger"
        style={{ marginTop: 8 }}
      />

      <Button
        title={deleting ? "Удаление..." : "Удалить аккаунт"}
        onPress={handleDeleteAccount}
        variant="secondary"
        disabled={deleting}
        style={{ marginTop: 8 }}
      />

      <Text style={styles.deleteHint}>
        При удалении аккаунта ваши персональные данные будут удалены в течение 30 дней.
      </Text>

      <Text style={styles.version}>
        Версия {Constants.expoConfig?.version ?? "—"}
      </Text>

      <Modal visible={!!docModal} animationType="slide" onRequestClose={() => setDocModal(null)}>
        <View style={styles.docContainer}>
          <View style={[styles.docHeader, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity onPress={() => setDocModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.docBack}>‹ Назад</Text>
            </TouchableOpacity>
            <Text style={styles.docTitle} numberOfLines={1}>{docModal?.title}</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView contentContainerStyle={styles.docScroll}>
            <Text style={styles.docText}>{docModal?.text}</Text>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1976D2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  role: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },
  info: {
    width: "100%",
    marginTop: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    color: "#222",
    fontWeight: "500",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  docRowText: {
    fontSize: 14,
    color: "#222",
  },
  docRowArrow: {
    fontSize: 20,
    color: "#ccc",
  },
  docContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  docBack: {
    fontSize: 16,
    color: "#1976D2",
    width: 60,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    flex: 1,
    textAlign: "center",
  },
  docScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  docText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 23,
  },
  deleteHint: {
    fontSize: 11,
    color: "#aaa",
    textAlign: "center",
    lineHeight: 16,
    marginTop: -8,
  },
  version: {
    fontSize: 12,
    color: "#bbb",
    textAlign: "center",
    marginTop: 8,
  },
});
