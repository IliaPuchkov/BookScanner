import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  Switch,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import { adminService, type OzonStore, type OzonStoreLimits } from "../../services/admin.service";
import { useMaintenanceContext } from "../../context/MaintenanceContext";

const AI_PROMPT_KEY = "vision_ai_prompt";
const MAX_PHOTOS_KEY = "max_photo_count";

const MAINTENANCE_ENABLED_KEY = "maintenance_enabled";
const MAINTENANCE_START_AT_KEY = "maintenance_start_at";
const MAINTENANCE_END_AT_KEY = "maintenance_end_at";
const MAINTENANCE_MESSAGE_KEY = "maintenance_message";
const MAINTENANCE_INSTRUCTIONS_KEY = "maintenance_instructions";
const MAINTENANCE_WARNING_MINUTES_KEY = "maintenance_warning_minutes";

function parseRuDateTime(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const [datePart, timePart] = trimmed.split(" ");
  if (!datePart) return null;
  const [dd, mm, yyyy] = datePart.split(".");
  const [hh, min] = (timePart || "00:00").split(":");
  const d = new Date(
    parseInt(yyyy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh || "0", 10),
    parseInt(min || "0", 10),
  );
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isoToRu(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const DEFAULT_MAX_PHOTOS = 10;

const PRICE_DEFAULT_KEY = "price_default";
const PRICE_MIN_KEY = "price_min";
const PRICE_DISCOUNT_THRESHOLD_KEY = "price_discount_threshold";
const PRICE_DISCOUNT_PERCENT_KEY = "price_discount_percent";
const PRICE_AI_MULTIPLIER_KEY = "price_ai_multiplier";

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

  // Price formula
  const [priceDefault, setPriceDefault] = useState("20000");
  const [priceMin, setPriceMin] = useState("1000");
  const [priceDiscountThreshold, setPriceDiscountThreshold] = useState("1200");
  const [priceDiscountPercent, setPriceDiscountPercent] = useState("15");
  const [priceAiMultiplier, setPriceAiMultiplier] = useState("9");
  const [editingPrice, setEditingPrice] = useState(false);
  const [draftPriceDefault, setDraftPriceDefault] = useState("");
  const [draftPriceMin, setDraftPriceMin] = useState("");
  const [draftPriceDiscountThreshold, setDraftPriceDiscountThreshold] = useState("");
  const [draftPriceDiscountPercent, setDraftPriceDiscountPercent] = useState("");
  const [draftPriceAiMultiplier, setDraftPriceAiMultiplier] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Ozon stores
  const [ozonStores, setOzonStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<Record<string, OzonStoreLimits | null>>({});
  const [storeKeyExpiry, setStoreKeyExpiry] = useState<Record<string, string | null>>({});
  const [loadingStores, setLoadingStores] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [draftStoreName, setDraftStoreName] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");

  const [loadingSettings, setLoadingSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  // Maintenance settings
  const { refresh: refreshMaintenance } = useMaintenanceContext();
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceStartAt, setMaintenanceStartAt] = useState("");
  const [maintenanceEndAt, setMaintenanceEndAt] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceInstructions, setMaintenanceInstructions] = useState("");
  const [maintenanceWarningMinutes, setMaintenanceWarningMinutes] = useState("30");
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const applySettings = (
    settings: Awaited<ReturnType<typeof adminService.getSettings>>,
  ) => {
    const prompt = settings.find((s) => s.key === AI_PROMPT_KEY);
    if (prompt) setAiPrompt(prompt.value);

    const maxP = settings.find((s) => s.key === MAX_PHOTOS_KEY);
    if (maxP) setMaxPhotos(parseInt(maxP.value, 10) || DEFAULT_MAX_PHOTOS);

    const pd = settings.find((s) => s.key === PRICE_DEFAULT_KEY);
    if (pd) setPriceDefault(pd.value);
    const pm = settings.find((s) => s.key === PRICE_MIN_KEY);
    if (pm) setPriceMin(pm.value);
    const pdt = settings.find((s) => s.key === PRICE_DISCOUNT_THRESHOLD_KEY);
    if (pdt) setPriceDiscountThreshold(pdt.value);
    const pdp = settings.find((s) => s.key === PRICE_DISCOUNT_PERCENT_KEY);
    if (pdp) setPriceDiscountPercent(pdp.value);
    const pam = settings.find((s) => s.key === PRICE_AI_MULTIPLIER_KEY);
    if (pam) setPriceAiMultiplier(pam.value);

    const mEnabled = settings.find((s) => s.key === MAINTENANCE_ENABLED_KEY);
    setMaintenanceEnabled(mEnabled?.value === "true");
    const mStart = settings.find((s) => s.key === MAINTENANCE_START_AT_KEY);
    setMaintenanceStartAt(isoToRu(mStart?.value));
    const mEnd = settings.find((s) => s.key === MAINTENANCE_END_AT_KEY);
    setMaintenanceEndAt(isoToRu(mEnd?.value));
    const mMsg = settings.find((s) => s.key === MAINTENANCE_MESSAGE_KEY);
    setMaintenanceMessage(mMsg?.value ?? "");
    const mInstr = settings.find((s) => s.key === MAINTENANCE_INSTRUCTIONS_KEY);
    setMaintenanceInstructions(mInstr?.value ?? "");
    const mWarn = settings.find((s) => s.key === MAINTENANCE_WARNING_MINUTES_KEY);
    setMaintenanceWarningMinutes(mWarn?.value ?? "30");
  };

  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await adminService.getOzonStores();
      setOzonStores(res.stores);
      const [limitsEntries, expiryEntries] = await Promise.all([
        Promise.all(
          res.stores.map(async (store) => {
            try {
              const limits = await adminService.getOzonStoreLimits(store.id);
              return [store.id, limits] as const;
            } catch {
              return [store.id, null] as const;
            }
          }),
        ),
        Promise.all(
          res.stores.map(async (store) => {
            try {
              const expiry = await adminService.getOzonStoreKeyExpiry(store.id);
              return [store.id, expiry] as const;
            } catch {
              return [store.id, null] as const;
            }
          }),
        ),
      ]);
      setStoreLimits(Object.fromEntries(limitsEntries));
      setStoreKeyExpiry(Object.fromEntries(expiryEntries));
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

  // Price formula handlers
  const handleStartEditPrice = () => {
    setDraftPriceDefault(priceDefault);
    setDraftPriceMin(priceMin);
    setDraftPriceDiscountThreshold(priceDiscountThreshold);
    setDraftPriceDiscountPercent(priceDiscountPercent);
    setDraftPriceAiMultiplier(priceAiMultiplier);
    setEditingPrice(true);
  };

  const handleCancelPrice = () => {
    setEditingPrice(false);
  };

  const handleSavePrice = async () => {
    const pd = parseInt(draftPriceDefault, 10);
    const pm = parseInt(draftPriceMin, 10);
    const pdt = parseInt(draftPriceDiscountThreshold, 10);
    const pdp = parseInt(draftPriceDiscountPercent, 10);
    const pam = parseFloat(draftPriceAiMultiplier);
    if (isNaN(pd) || pd <= 0) { Alert.alert("Ошибка", "Некорректная цена по умолчанию"); return; }
    if (isNaN(pm) || pm <= 0) { Alert.alert("Ошибка", "Некорректная минимальная цена"); return; }
    if (isNaN(pdt) || pdt <= 0) { Alert.alert("Ошибка", "Некорректный порог скидки"); return; }
    if (isNaN(pdp) || pdp < 0 || pdp > 100) { Alert.alert("Ошибка", "Процент скидки должен быть от 0 до 100"); return; }
    if (isNaN(pam) || pam <= 0) { Alert.alert("Ошибка", "Коэффициент ИИ должен быть больше 0"); return; }
    setSavingPrice(true);
    try {
      await Promise.all([
        adminService.upsertSetting({ key: PRICE_DEFAULT_KEY, value: String(pd), valueType: "number", description: "Цена книги если ИИ не смог определить цену" }),
        adminService.upsertSetting({ key: PRICE_MIN_KEY, value: String(pm), valueType: "number", description: "Минимальная цена книги" }),
        adminService.upsertSetting({ key: PRICE_DISCOUNT_THRESHOLD_KEY, value: String(pdt), valueType: "number", description: "Порог выше которого применяется скидка" }),
        adminService.upsertSetting({ key: PRICE_DISCOUNT_PERCENT_KEY, value: String(pdp), valueType: "number", description: "Процент скидки от цены ИИ" }),
        adminService.upsertSetting({ key: PRICE_AI_MULTIPLIER_KEY, value: String(pam), valueType: "number", description: "Коэффициент умножения цены от ИИ (компенсация недооценки)" }),
      ]);
      setPriceDefault(String(pd));
      setPriceMin(String(pm));
      setPriceDiscountThreshold(String(pdt));
      setPriceDiscountPercent(String(pdp));
      setPriceAiMultiplier(String(pam));
      setEditingPrice(false);
      Alert.alert("Готово", "Формула цены сохранена");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить настройки цены");
    } finally {
      setSavingPrice(false);
    }
  };

  // Ozon store handlers
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

  const handleSaveMaintenance = async () => {
    const startIso = maintenanceStartAt ? parseRuDateTime(maintenanceStartAt) : null;
    const endIso = maintenanceEndAt ? parseRuDateTime(maintenanceEndAt) : null;

    if (maintenanceStartAt && !startIso) {
      Alert.alert("Ошибка", "Неверный формат даты начала. Используйте ДД.ММ.ГГГГ ЧЧ:ММ");
      return;
    }
    if (maintenanceEndAt && !endIso) {
      Alert.alert("Ошибка", "Неверный формат даты окончания. Используйте ДД.ММ.ГГГГ ЧЧ:ММ");
      return;
    }
    const warnMin = parseInt(maintenanceWarningMinutes, 10);
    if (isNaN(warnMin) || warnMin < 0) {
      Alert.alert("Ошибка", "Укажите корректное количество минут предупреждения");
      return;
    }

    setSavingMaintenance(true);
    try {
      const calls = [
        adminService.upsertSetting({
          key: MAINTENANCE_ENABLED_KEY,
          value: String(maintenanceEnabled),
          valueType: "boolean",
          description: "Режим технических работ",
        }),
        adminService.upsertSetting({
          key: MAINTENANCE_WARNING_MINUTES_KEY,
          value: String(warnMin),
          valueType: "number",
          description: "За сколько минут до начала показывать предупреждение",
        }),
      ];

      // Only save date/text fields if they have a value — backend rejects empty strings
      if (startIso) {
        calls.push(adminService.upsertSetting({
          key: MAINTENANCE_START_AT_KEY,
          value: startIso,
          valueType: "string",
          description: "Дата и время начала технических работ (ISO)",
        }));
      }
      if (endIso) {
        calls.push(adminService.upsertSetting({
          key: MAINTENANCE_END_AT_KEY,
          value: endIso,
          valueType: "string",
          description: "Приблизительное время окончания технических работ (ISO)",
        }));
      }
      if (maintenanceMessage.trim()) {
        calls.push(adminService.upsertSetting({
          key: MAINTENANCE_MESSAGE_KEY,
          value: maintenanceMessage.trim(),
          valueType: "string",
          description: "Причина / описание технических работ",
        }));
      }
      if (maintenanceInstructions.trim()) {
        calls.push(adminService.upsertSetting({
          key: MAINTENANCE_INSTRUCTIONS_KEY,
          value: maintenanceInstructions.trim(),
          valueType: "string",
          description: "Инструкции для пользователей на время работ",
        }));
      }

      await Promise.all(calls);
      await refreshMaintenance();
      Alert.alert("Готово", maintenanceEnabled ? "Технические работы включены" : "Настройки сохранены");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить настройки");
    } finally {
      setSavingMaintenance(false);
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
                    Подключённые магазины. Выбор магазина происходит при загрузке товаров.
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
                    const expiryStr = storeKeyExpiry[store.id];
                    const expiryDate = expiryStr ? new Date(expiryStr) : null;
                    const isExpired = expiryDate ? expiryDate < new Date() : false;
                    const limits = storeLimits[store.id];
                    const createExhausted =
                      limits &&
                      limits.daily_create.limit > 0 &&
                      limits.daily_create.usage >= limits.daily_create.limit;
                    const totalExhausted =
                      limits &&
                      limits.total.limit > 0 &&
                      limits.total.usage >= limits.total.limit;
                    return (
                      <View key={store.id} style={styles.storeRow}>
                        <View style={styles.storeInfo}>
                          <Text style={styles.storeName}>{store.name}</Text>
                          <Text style={styles.storeDetails}>
                            ID: {store.clientId} · Key: {store.apiKeyMasked}
                          </Text>
                          {expiryDate !== null && (
                            <Text style={[styles.storeExpiry, isExpired && styles.storeExpiryExpired]}>
                              {isExpired
                                ? "Просрочен"
                                : `Активен до ${expiryDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                            </Text>
                          )}
                          {limits === undefined ? null : limits === null ? (
                            <Text style={styles.limitsError}>Лимиты недоступны</Text>
                          ) : (
                            <View style={styles.limitsBlock}>
                              <Text style={[styles.limitsRow, createExhausted && styles.limitsExhausted]}>
                                Создание: {limits.daily_create.usage}/{limits.daily_create.limit > 0 ? limits.daily_create.limit : "∞"} сегодня
                              </Text>
                              <Text style={styles.limitsRow}>
                                Обновление: {limits.daily_update.usage}/{limits.daily_update.limit > 0 ? limits.daily_update.limit : "∞"} сегодня
                              </Text>
                              <Text style={[styles.limitsRow, totalExhausted && styles.limitsExhausted]}>
                                Ассортимент: {limits.total.usage}/{limits.total.limit > 0 ? limits.total.limit : "∞"}
                              </Text>
                            </View>
                          )}
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

            {/* Import from Ozon */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => navigation.navigate("ImportFromOzon")}
            >
              <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Импорт с Озона</Text>
                  <Text style={styles.sectionDesc}>
                    Загрузить в систему товары, уже опубликованные в магазине на Озоне
                  </Text>
                </View>
                <Text style={{ fontSize: 20, color: "#1976D2" }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Reset stuck publications */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              disabled={backfilling}
              onPress={async () => {
                Alert.alert(
                  "Сбросить зависшие публикации",
                  "Книги, которые больше 24 часов висят в статусе «Публикуется в Ozon» без результата, будут проверены. Найденные на Ozon — помечены как опубликованные, остальные — как ошибка публикации.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Запустить",
                      onPress: async () => {
                        setBackfilling(true);
                        try {
                          const res = await adminService.resetStuckPublications();
                          if (res.checked === 0) {
                            Alert.alert("Готово", "Зависших публикаций не найдено");
                          } else {
                            Alert.alert(
                              "Готово",
                              `Проверено: ${res.checked}\nНайдено на Ozon: ${res.published}\nПомечено как ошибка: ${res.failed}`,
                            );
                          }
                        } catch {
                          Alert.alert("Ошибка", "Не удалось выполнить сброс");
                        } finally {
                          setBackfilling(false);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Сбросить зависшие публикации</Text>
                  <Text style={styles.sectionDesc}>
                    Исправить книги, застрявшие в статусе «Публикуется в Ozon» более 24 часов
                  </Text>
                </View>
                {backfilling ? (
                  <ActivityIndicator size="small" color="#1976D2" />
                ) : (
                  <Text style={{ fontSize: 20, color: "#1976D2" }}>›</Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Backfill store IDs */}
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              disabled={backfilling}
              onPress={async () => {
                Alert.alert(
                  "Привязать магазины",
                  "Система пройдёт по всем магазинам Озона и привяжет их к карточкам, у которых магазин ещё не указан. Это может занять некоторое время.",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Запустить",
                      onPress: async () => {
                        setBackfilling(true);
                        try {
                          const res = await adminService.backfillStoreIds();
                          Alert.alert(
                            "Готово",
                            `Обновлено карточек: ${res.updated}\nПроверено магазинов: ${res.stores}`,
                          );
                        } catch {
                          Alert.alert("Ошибка", "Не удалось выполнить привязку");
                        } finally {
                          setBackfilling(false);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Привязать магазины к карточкам</Text>
                  <Text style={styles.sectionDesc}>
                    Проставить магазин для карточек, опубликованных до добавления этой функции
                  </Text>
                </View>
                {backfilling ? (
                  <ActivityIndicator size="small" color="#1976D2" />
                ) : (
                  <Text style={{ fontSize: 20, color: "#1976D2" }}>›</Text>
                )}
              </View>
            </TouchableOpacity>

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

            {/* Price formula setting */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Формула расчёта цены</Text>
                  <Text style={styles.sectionDesc}>
                    Параметры по которым рассчитывается итоговая цена на основе данных от ИИ.
                  </Text>
                </View>
              </View>

              {editingPrice ? (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Цена не найдена (₽)</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draftPriceDefault}
                      onChangeText={setDraftPriceDefault}
                      keyboardType="number-pad"
                      editable={!savingPrice}
                    />
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Минимальная цена (₽)</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draftPriceMin}
                      onChangeText={setDraftPriceMin}
                      keyboardType="number-pad"
                      editable={!savingPrice}
                    />
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Порог скидки (₽)</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draftPriceDiscountThreshold}
                      onChangeText={setDraftPriceDiscountThreshold}
                      keyboardType="number-pad"
                      editable={!savingPrice}
                    />
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Скидка выше порога (%)</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draftPriceDiscountPercent}
                      onChangeText={setDraftPriceDiscountPercent}
                      keyboardType="number-pad"
                      editable={!savingPrice}
                    />
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Коэффициент ИИ ×</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draftPriceAiMultiplier}
                      onChangeText={setDraftPriceAiMultiplier}
                      keyboardType="decimal-pad"
                      editable={!savingPrice}
                    />
                  </View>
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.cancelBtn]}
                      onPress={handleCancelPrice}
                      disabled={savingPrice}
                    >
                      <Text style={styles.cancelBtnText}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.saveBtn, savingPrice && styles.disabledBtn]}
                      onPress={handleSavePrice}
                      disabled={savingPrice}
                    >
                      {savingPrice ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveBtnText}>Сохранить</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.priceFormulaBox}>
                    <Text style={styles.priceFormulaLine}>
                      Цена не найдена → <Text style={styles.priceFormulaValue}>{priceDefault} ₽</Text>
                    </Text>
                    <Text style={styles.priceFormulaLine}>
                      Цена &lt; {priceMin} ₽ → <Text style={styles.priceFormulaValue}>{priceMin} ₽</Text>
                    </Text>
                    <Text style={styles.priceFormulaLine}>
                      Цена &gt; {priceDiscountThreshold} ₽ → <Text style={styles.priceFormulaValue}>цена − {priceDiscountPercent}%</Text>
                    </Text>
                    <Text style={styles.priceFormulaLine}>
                      Иначе → <Text style={styles.priceFormulaValue}>цена без изменений</Text>
                    </Text>
                    <Text style={[styles.priceFormulaLine, { marginTop: 6 }]}>
                      Коэффициент ИИ → <Text style={styles.priceFormulaValue}>×{priceAiMultiplier}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.editBtn} onPress={handleStartEditPrice}>
                    <Text style={styles.editBtnText}>Изменить</Text>
                  </TouchableOpacity>
                </>
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

            {/* Maintenance */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Технические работы</Text>
                  <Text style={styles.sectionDesc}>
                    Управление режимом обслуживания сервера. При включении пользователи увидят экран технических работ.
                  </Text>
                </View>
              </View>

              <View style={styles.maintenanceToggleRow}>
                <Text style={[styles.maintenanceToggleLabel, maintenanceEnabled && styles.maintenanceToggleLabelActive]}>
                  {maintenanceEnabled ? "🔴  Технические работы ВКЛЮЧЕНЫ" : "🟢  Технические работы выключены"}
                </Text>
                <Switch
                  value={maintenanceEnabled}
                  onValueChange={setMaintenanceEnabled}
                  trackColor={{ false: "#ddd", true: "#FFCDD2" }}
                  thumbColor={maintenanceEnabled ? "#E53935" : "#fff"}
                />
              </View>

              <Text style={styles.maintenanceFieldLabel}>Дата и время начала (ДД.ММ.ГГГГ ЧЧ:ММ)</Text>
              <View style={styles.maintenanceDateRow}>
                <TextInput
                  style={[styles.maintenanceInput, { flex: 1, marginBottom: 0 }]}
                  value={maintenanceStartAt}
                  onChangeText={setMaintenanceStartAt}
                  placeholder="напр. 15.04.2026 18:00"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.maintenanceDateShortcuts}>
                {[
                  { label: "Сегодня", offset: 0 },
                  { label: "Завтра", offset: 1 },
                ].map(({ label, offset }) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.maintenanceDateChip}
                    onPress={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + offset);
                      d.setSeconds(0, 0);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setMaintenanceStartAt(
                        `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.maintenanceDateChipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.maintenanceFieldLabel, { marginTop: 8 }]}>Примерное окончание (ДД.ММ.ГГГГ ЧЧ:ММ)</Text>
              <TextInput
                style={styles.maintenanceInput}
                value={maintenanceEndAt}
                onChangeText={setMaintenanceEndAt}
                placeholder="напр. 15.04.2026 20:00"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
              />
              <View style={styles.maintenanceDateShortcuts}>
                {[
                  { label: "Сегодня", offset: 0 },
                  { label: "Завтра", offset: 1 },
                ].map(({ label, offset }) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.maintenanceDateChip}
                    onPress={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + offset);
                      d.setSeconds(0, 0);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      setMaintenanceEndAt(
                        `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.maintenanceDateChipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.maintenanceFieldLabel}>За сколько минут показывать предупреждение</Text>
              <TextInput
                style={styles.maintenanceInput}
                value={maintenanceWarningMinutes}
                onChangeText={setMaintenanceWarningMinutes}
                placeholder="30"
                placeholderTextColor="#bbb"
                keyboardType="number-pad"
              />

              <Text style={styles.maintenanceFieldLabel}>Причина / сообщение для пользователей</Text>
              <TextInput
                style={[styles.maintenanceInput, styles.maintenanceTextArea]}
                value={maintenanceMessage}
                onChangeText={setMaintenanceMessage}
                placeholder="Плановые технические работы по обновлению системы"
                placeholderTextColor="#bbb"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.maintenanceFieldLabel}>Инструкции для пользователей (необязательно)</Text>
              <TextInput
                style={[styles.maintenanceInput, styles.maintenanceTextArea]}
                value={maintenanceInstructions}
                onChangeText={setMaintenanceInstructions}
                placeholder={"• Завершите текущую работу\n• Все сохранённые карточки останутся\n• Несохранённые данные будут потеряны"}
                placeholderTextColor="#bbb"
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[styles.maintenanceSaveBtn, savingMaintenance && styles.maintenanceSaveBtnDisabled]}
                onPress={handleSaveMaintenance}
                disabled={savingMaintenance}
                activeOpacity={0.8}
              >
                {savingMaintenance ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.maintenanceSaveBtnText}>Сохранить</Text>
                )}
              </TouchableOpacity>
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
  storeExpiry: {
    fontSize: 12,
    color: "#43A047",
    marginTop: 2,
    fontWeight: "500",
  },
  storeExpiryExpired: {
    color: "#E53935",
    fontWeight: "700",
  },
  limitsBlock: {
    marginTop: 6,
    gap: 2,
  },
  limitsRow: {
    fontSize: 12,
    color: "#888",
  },
  limitsExhausted: {
    color: "#E53935",
    fontWeight: "600",
  },
  limitsError: {
    fontSize: 12,
    color: "#aaa",
    marginTop: 4,
    fontStyle: "italic",
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
  priceFormulaBox: {
    alignSelf: "stretch",
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    gap: 6,
  },
  priceFormulaLine: {
    fontSize: 14,
    color: "#555",
  },
  priceFormulaValue: {
    fontWeight: "700",
    color: "#1976D2",
  },
  priceRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  priceLabel: {
    fontSize: 14,
    color: "#555",
    flex: 1,
  },
  priceInput: {
    width: 100,
    height: 40,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
    backgroundColor: "#FAFAFA",
    textAlign: "center",
  },
  // Maintenance styles
  maintenanceToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAFA",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#eee",
  },
  maintenanceToggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    flex: 1,
    marginRight: 12,
  },
  maintenanceToggleLabelActive: {
    color: "#C62828",
  },
  maintenanceFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 6,
    marginTop: 4,
  },
  maintenanceInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
    backgroundColor: "#FAFAFA",
    marginBottom: 12,
  },
  maintenanceTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  maintenanceDateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  maintenanceDateShortcuts: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  maintenanceDateChip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  maintenanceDateChipText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
  maintenanceSaveBtn: {
    backgroundColor: "#1976D2",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  maintenanceSaveBtnDisabled: {
    opacity: 0.5,
  },
  maintenanceSaveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
