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
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import { adminService, type OzonStore } from "../../services/admin.service";

const AI_PROMPT_KEY = "vision_ai_prompt";
const MAX_PHOTOS_KEY = "max_photo_count";
const DEFAULT_MAX_PHOTOS = 10;

export function SettingsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
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

  // Ozon stores
  const [ozonStores, setOzonStores] = useState<OzonStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState("");
  const [loadingStores, setLoadingStores] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [draftStoreName, setDraftStoreName] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const [loadingSettings, setLoadingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applySettings = (
    settings: Awaited<ReturnType<typeof adminService.getSettings>>,
  ) => {
    const prompt = settings.find((s) => s.key === AI_PROMPT_KEY);
    if (prompt) setAiPrompt(prompt.value);

    const maxP = settings.find((s) => s.key === MAX_PHOTOS_KEY);
    if (maxP) setMaxPhotos(parseInt(maxP.value, 10) || DEFAULT_MAX_PHOTOS);
  };

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await adminService.getOzonStores();
      setOzonStores(res.stores);
      setActiveStoreId(res.activeId);
    } catch {
      // ignore
    } finally {
      setLoadingStores(false);
    }
  }, []);

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
    if (isAdmin) {
      loadSettings();
      loadStores();
    }
  }, [isAdmin, loadSettings, loadStores]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isAdmin) {
        const [settings] = await Promise.all([
          adminService.getSettings(),
          loadStores(),
        ]);
        applySettings(settings);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [isAdmin, loadStores]);

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

  // Ozon store handlers
  const handleActivateStore = async (id: string) => {
    if (id === activeStoreId) return;
    setActivatingId(id);
    try {
      await adminService.activateOzonStore(id);
      setActiveStoreId(id);
      setOzonStores((prev) =>
        prev.map((s) => ({ ...s, isActive: s.id === id })),
      );
    } catch {
      Alert.alert("Ошибка", "Не удалось выбрать магазин");
    } finally {
      setActivatingId(null);
    }
  };

  const handleDeleteStore = (store: OzonStore) => {
    Alert.alert(
      "Удалить магазин",
      `Удалить "${store.name}"?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            try {
              await adminService.removeOzonStore(store.id);
              setOzonStores((prev) => prev.filter((s) => s.id !== store.id));
              if (activeStoreId === store.id) setActiveStoreId("");
            } catch {
              Alert.alert("Ошибка", "Не удалось удалить магазин");
            }
          },
        },
      ],
    );
  };

  const handleCancelAddStore = () => {
    setAddingStore(false);
    setDraftStoreName("");
    setDraftClientId("");
    setDraftApiKey("");
  };

  const handleSaveStore = async () => {
    if (!draftStoreName.trim()) {
      Alert.alert("Ошибка", "Введите название магазина");
      return;
    }
    if (!draftClientId.trim()) {
      Alert.alert("Ошибка", "Введите Client-Id");
      return;
    }
    if (!draftApiKey.trim()) {
      Alert.alert("Ошибка", "Введите Api-Key");
      return;
    }
    setSavingStore(true);
    try {
      const newStore = await adminService.addOzonStore({
        name: draftStoreName.trim(),
        clientId: draftClientId.trim(),
        apiKey: draftApiKey.trim(),
      });
      setOzonStores((prev) => [...prev, newStore]);
      handleCancelAddStore();
    } catch {
      Alert.alert("Ошибка", "Не удалось добавить магазин");
    } finally {
      setSavingStore(false);
    }
  };

  if (!isAdmin) {
    return <View style={styles.blank} />;
  }

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
        {loadingSettings ? (
          <View style={styles.card}>
            <ActivityIndicator color="#1976D2" />
          </View>
        ) : (
          <>
            {/* User management */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => navigation.navigate("UserManagement")}
            >
              <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Управление пользователями
                  </Text>
                  <Text style={styles.sectionDesc}>
                    Создание, редактирование и удаление пользователей.
                  </Text>
                </View>
                <Text style={styles.userMgmtArrow}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Ozon stores */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Магазины Ozon</Text>
                  <Text style={styles.sectionDesc}>
                    Выберите магазин, в который будут загружаться товары.
                  </Text>
                </View>
              </View>

              {loadingStores ? (
                <ActivityIndicator
                  color="#1976D2"
                  style={{ marginVertical: 8 }}
                />
              ) : (
                <>
                  {ozonStores.length === 0 && !addingStore && (
                    <Text style={styles.emptyStoresText}>
                      Нет подключённых магазинов
                    </Text>
                  )}

                  {ozonStores.map((store) => {
                    const isActive = store.id === activeStoreId;
                    const isActivating = activatingId === store.id;
                    return (
                      <View key={store.id} style={styles.storeRow}>
                        <TouchableOpacity
                          style={styles.storeRadioBtn}
                          onPress={() => handleActivateStore(store.id)}
                          disabled={isActivating}
                        >
                          {isActivating ? (
                            <ActivityIndicator size="small" color="#1976D2" />
                          ) : (
                            <View
                              style={[
                                styles.radioOuter,
                                isActive && styles.radioOuterActive,
                              ]}
                            >
                              {isActive && (
                                <View style={styles.radioInner} />
                              )}
                            </View>
                          )}
                        </TouchableOpacity>

                        <View style={styles.storeInfo}>
                          <Text style={styles.storeName}>{store.name}</Text>
                          <Text style={styles.storeDetails}>
                            ID: {store.clientId} · Key: {store.apiKeyMasked}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.storeDeleteBtn}
                          onPress={() => handleDeleteStore(store)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.storeDeleteIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {addingStore ? (
                    <>
                      <TextInput
                        style={[styles.storeInput, { marginTop: 12 }]}
                        value={draftStoreName}
                        onChangeText={setDraftStoreName}
                        placeholder="Название магазина"
                        placeholderTextColor="#aaa"
                        editable={!savingStore}
                      />
                      <TextInput
                        style={styles.storeInput}
                        value={draftClientId}
                        onChangeText={setDraftClientId}
                        placeholder="Client-Id"
                        placeholderTextColor="#aaa"
                        autoCapitalize="none"
                        editable={!savingStore}
                      />
                      <TextInput
                        style={styles.storeInput}
                        value={draftApiKey}
                        onChangeText={setDraftApiKey}
                        placeholder="Api-Key"
                        placeholderTextColor="#aaa"
                        autoCapitalize="none"
                        secureTextEntry
                        editable={!savingStore}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.cancelBtn]}
                          onPress={handleCancelAddStore}
                          disabled={savingStore}
                        >
                          <Text style={styles.cancelBtnText}>Отмена</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            styles.saveBtn,
                            savingStore && styles.disabledBtn,
                          ]}
                          onPress={handleSaveStore}
                          disabled={savingStore}
                        >
                          {savingStore ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.saveBtnText}>Добавить</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.addStoreBtn}
                      onPress={() => setAddingStore(true)}
                    >
                      <Text style={styles.addStoreBtnText}>
                        + Добавить магазин
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* Max photos setting */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Максимальное количество фото
                  </Text>
                  <Text style={styles.sectionDesc}>
                    Сколько фотографий оператор может загрузить для одной
                    книги.
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
                      style={[
                        styles.actionBtn,
                        styles.saveBtn,
                        savingMaxPhotos && styles.disabledBtn,
                      ]}
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
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={handleStartEditMaxPhotos}
                  >
                    <Text style={styles.editBtnText}>Изменить</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* AI prompt setting */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    AI-промпт для распознавания
                  </Text>
                  <Text style={styles.sectionDesc}>
                    Этот промпт передаётся в ИИ при извлечении данных из
                    фотографий книг.
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
                      style={[
                        styles.actionBtn,
                        styles.saveBtn,
                        savingPrompt && styles.disabledBtn,
                      ]}
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
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={handleStartEditPrompt}
                  >
                    <Text style={styles.editBtnText}>Изменить</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
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
  emptyStoresText: {
    fontSize: 14,
    color: "#aaa",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  storeRadioBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: "#1976D2",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1976D2",
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  storeDetails: {
    fontSize: 12,
    color: "#999",
  },
  storeDeleteBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  storeDeleteIcon: {
    fontSize: 14,
    color: "#ccc",
    fontWeight: "600",
  },
  storeInput: {
    alignSelf: "stretch",
    height: 44,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
    marginTop: 8,
  },
  addStoreBtn: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderStyle: "dashed",
  },
  addStoreBtnText: {
    fontSize: 14,
    color: "#1976D2",
    fontWeight: "600",
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
  userMgmtArrow: {
    fontSize: 22,
    color: "#ccc",
    fontWeight: "300",
  },
});
