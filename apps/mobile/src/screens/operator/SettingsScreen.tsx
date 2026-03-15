import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/Button";
import { adminService } from "../../services/admin.service";

const AI_PROMPT_KEY = "vision_ai_prompt";
const MAX_PHOTOS_KEY = "max_photo_count";
const DEFAULT_MAX_PHOTOS = 10;

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  // AI prompt
  const [aiPrompt, setAiPrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Max photos
  const [maxPhotos, setMaxPhotos] = useState<number>(DEFAULT_MAX_PHOTOS);
  const [editingMaxPhotos, setEditingMaxPhotos] = useState(false);
  const [draftMaxPhotos, setDraftMaxPhotos] = useState("");
  const [savingMaxPhotos, setSavingMaxPhotos] = useState(false);

  const [loadingSettings, setLoadingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applySettings = (settings: Awaited<ReturnType<typeof adminService.getSettings>>) => {
    const prompt = settings.find((s) => s.key === AI_PROMPT_KEY);
    if (prompt) setAiPrompt(prompt.value);

    const maxP = settings.find((s) => s.key === MAX_PHOTOS_KEY);
    if (maxP) setMaxPhotos(parseInt(maxP.value, 10) || DEFAULT_MAX_PHOTOS);
  };

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const settings = await adminService.getSettings();
      applySettings(settings);
    } catch {
      // ignore
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadSettings();
  }, [isAdmin, loadSettings]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isAdmin) {
        const settings = await adminService.getSettings();
        applySettings(settings);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin]);

  // Prompt handlers
  const handleStartEditPrompt = () => {
    setDraftPrompt(aiPrompt);
    setEditingPrompt(true);
  };

  const handleCancelPrompt = () => {
    setEditingPrompt(false);
    setDraftPrompt("");
  };

  const handleSavePrompt = async () => {
    if (!draftPrompt.trim()) {
      Alert.alert("Ошибка", "Промпт не может быть пустым");
      return;
    }
    setSavingPrompt(true);
    try {
      await adminService.upsertSetting({
        key: AI_PROMPT_KEY,
        value: draftPrompt.trim(),
        description: "Кастомный промпт для AI-распознавания книг",
        valueType: "string",
      });
      setAiPrompt(draftPrompt.trim());
      setEditingPrompt(false);
      setDraftPrompt("");
      Alert.alert("Готово", "Промпт сохранён");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить промпт");
    } finally {
      setSavingPrompt(false);
    }
  };

  // Max photos handlers
  const handleStartEditMaxPhotos = () => {
    setDraftMaxPhotos(String(maxPhotos));
    setEditingMaxPhotos(true);
  };

  const handleCancelMaxPhotos = () => {
    setEditingMaxPhotos(false);
    setDraftMaxPhotos("");
  };

  const handleSaveMaxPhotos = async () => {
    const parsed = parseInt(draftMaxPhotos, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 20) {
      Alert.alert("Ошибка", "Введите число от 1 до 20");
      return;
    }
    setSavingMaxPhotos(true);
    try {
      await adminService.upsertSetting({
        key: MAX_PHOTOS_KEY,
        value: String(parsed),
        description: "Максимальное количество фото для одной книги",
        valueType: "number",
      });
      setMaxPhotos(parsed);
      setEditingMaxPhotos(false);
      setDraftMaxPhotos("");
      Alert.alert("Готово", "Настройка сохранена");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить настройку");
    } finally {
      setSavingMaxPhotos(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#1976D2"]}
            tintColor="#1976D2"
          />
        }
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

        {isAdmin && (
          <>
            {loadingSettings ? (
              <View style={styles.card}>
                <ActivityIndicator color="#1976D2" />
              </View>
            ) : (
              <>
                {/* Max photos setting */}
                <View style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>Максимальное количество фото</Text>
                      <Text style={styles.sectionDesc}>
                        Сколько фотографий оператор может загрузить для одной книги.
                      </Text>
                    </View>
                  </View>

                  {editingMaxPhotos ? (
                    <>
                      <TextInput
                        style={styles.numberInput}
                        value={draftMaxPhotos}
                        onChangeText={setDraftMaxPhotos}
                        keyboardType="number-pad"
                        placeholder="Введите число (1–20)"
                        placeholderTextColor="#aaa"
                        editable={!savingMaxPhotos}
                        autoFocus
                        maxLength={2}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.cancelBtn]}
                          onPress={handleCancelMaxPhotos}
                          disabled={savingMaxPhotos}
                        >
                          <Text style={styles.cancelBtnText}>Отмена</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.saveBtn, savingMaxPhotos && styles.disabledBtn]}
                          onPress={handleSaveMaxPhotos}
                          disabled={savingMaxPhotos}
                        >
                          {savingMaxPhotos ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.saveBtnText}>Сохранить</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.inlineValueRow}>
                      <View style={styles.numberBadge}>
                        <Text style={styles.numberBadgeText}>{maxPhotos}</Text>
                      </View>
                      <TouchableOpacity style={styles.editBtn} onPress={handleStartEditMaxPhotos}>
                        <Text style={styles.editBtnText}>Изменить</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* AI prompt setting */}
                <View style={styles.card}>
                  <View style={styles.sectionHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>AI-промпт для распознавания</Text>
                      <Text style={styles.sectionDesc}>
                        Этот промпт передаётся в ИИ при извлечении данных из фотографий книг.
                      </Text>
                    </View>
                  </View>

                  {editingPrompt ? (
                    <>
                      <TextInput
                        style={styles.promptInput}
                        value={draftPrompt}
                        onChangeText={setDraftPrompt}
                        placeholder="Введите кастомный промпт..."
                        placeholderTextColor="#aaa"
                        multiline
                        textAlignVertical="top"
                        editable={!savingPrompt}
                        autoFocus
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.cancelBtn]}
                          onPress={handleCancelPrompt}
                          disabled={savingPrompt}
                        >
                          <Text style={styles.cancelBtnText}>Отмена</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.saveBtn, savingPrompt && styles.disabledBtn]}
                          onPress={handleSavePrompt}
                          disabled={savingPrompt}
                        >
                          {savingPrompt ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.saveBtnText}>Сохранить</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.promptTextBox}>
                        <Text style={styles.promptText}>
                          {aiPrompt || "Промпт не задан"}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.editBtn} onPress={handleStartEditPrompt}>
                        <Text style={styles.editBtnText}>Изменить</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </>
        )}

        <Button
          title="Выйти из аккаунта"
          onPress={handleLogout}
          variant="danger"
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scroll: {
    flex: 1,
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: "#888",
  },
  inlineValueRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "space-between",
  },
  numberBadge: {
    backgroundColor: "#E3F2FD",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  numberBadgeText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1976D2",
  },
  numberInput: {
    width: "100%",
    height: 52,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: "600",
    color: "#222",
    backgroundColor: "#FAFAFA",
    textAlign: "center",
  },
  promptTextBox: {
    width: "100%",
    minHeight: 100,
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E8ECF0",
  },
  promptText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  editBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1976D2",
  },
  editBtnText: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "600",
  },
  promptInput: {
    width: "100%",
    minHeight: 160,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    alignSelf: "stretch",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  cancelBtnText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#1976D2",
  },
  saveBtnText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
