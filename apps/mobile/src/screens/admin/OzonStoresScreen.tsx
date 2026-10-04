import React, { useCallback, useEffect, useState } from "react";
import {
  View,
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { AppText } from '../../components/AppText';
import { parseStoresCsv, type StoreCsvRow } from "../../utils/csv";
import {
  adminService,
  type OzonStore,
  type OzonStoreLimits,
} from "../../services/admin.service";
import { useUndoable } from "../../context/UndoContext";

export function OzonStoresScreen() {
  const undoable = useUndoable();
  const [ozonStores, setOzonStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<
    Record<string, OzonStoreLimits | null>
  >({});
  const [storeKeyExpiry, setStoreKeyExpiry] = useState<
    Record<string, string | null>
  >({});
  const [loadingStores, setLoadingStores] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addingStore, setAddingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draftStoreName, setDraftStoreName] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadStores();
    } finally {
      setRefreshing(false);
    }
  }, [loadStores]);

  const handleDeleteStore = (store: OzonStore) => {
    Alert.alert("Удалить магазин", `Удалить "${store.name}"?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () =>
          undoable({
            message: `Магазин «${store.name}» будет удалён`,
            action: async () => {
              try {
                await adminService.removeOzonStore(store.id);
                setOzonStores((prev) => prev.filter((s) => s.id !== store.id));
              } catch {
                Alert.alert("Ошибка", "Не удалось удалить магазин");
              }
            },
          }),
      },
    ]);
  };

  const handleStartEdit = (store: OzonStore) => {
    setEditingStoreId(store.id);
    setEditName(store.name);
    setEditApiKey("");
  };

  const handleCancelEdit = () => {
    setEditingStoreId(null);
    setEditName("");
    setEditApiKey("");
  };

  const handleSaveEdit = async (store: OzonStore) => {
    const name = editName.trim();
    const apiKey = editApiKey.trim();
    if (!name) {
      Alert.alert("Ошибка", "Введите название магазина");
      return;
    }
    const dto: { name?: string; apiKey?: string } = {};
    if (name !== store.name) dto.name = name;
    if (apiKey) dto.apiKey = apiKey;
    if (!dto.name && !dto.apiKey) {
      handleCancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await adminService.updateOzonStore(store.id, dto);
      setOzonStores((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      handleCancelEdit();
      if (dto.apiKey) {
        // New key → its expiry date and limits change; re-check just this store
        const [limits, expiry] = await Promise.all([
          adminService.getOzonStoreLimits(store.id).catch(() => null),
          adminService.getOzonStoreKeyExpiry(store.id).catch(() => null),
        ]);
        setStoreLimits((prev) => ({ ...prev, [store.id]: limits }));
        setStoreKeyExpiry((prev) => ({ ...prev, [store.id]: expiry }));
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить изменения");
    } finally {
      setSavingEdit(false);
    }
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

  const runImport = async (rows: StoreCsvRow[]) => {
    setImporting(true);
    try {
      const res = await adminService.importOzonStores(rows);
      setOzonStores(res.stores);
      Alert.alert(
        "Импорт завершён",
        `Добавлено: ${res.added}\nОбновлено ключей: ${res.updated}`,
      );
      loadStores();
    } catch {
      Alert.alert("Ошибка", "Не удалось импортировать магазины");
    } finally {
      setImporting(false);
    }
  };

  const handleImportCsv = async () => {
    let text: string;
    try {
      // "*/*": Android often reports CSV under odd MIME types and greys it out
      const picked = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      text = await FileSystem.readAsStringAsync(picked.assets[0].uri);
    } catch {
      Alert.alert("Ошибка", "Не удалось прочитать файл");
      return;
    }

    const { stores, errors } = parseStoresCsv(text);
    const skipped = errors.length
      ? `\n\nПропущено строк: ${errors.length}\n${errors.slice(0, 5).join("\n")}`
      : "";
    if (stores.length === 0) {
      Alert.alert(
        "Нет магазинов",
        `Ожидается CSV со столбцами: название, Client-Id, Api-Key${skipped}`,
      );
      return;
    }

    const existingIds = new Set(ozonStores.map((s) => s.clientId));
    const updates = stores.filter((s) => existingIds.has(s.clientId)).length;
    const list = stores
      .slice(0, 10)
      .map((s) => `• ${s.name} (${s.clientId})`)
      .join("\n");
    const more = stores.length > 10 ? `\n…и ещё ${stores.length - 10}` : "";
    const updateNote = updates
      ? `\n\nУже подключены (ключ будет заменён): ${updates}`
      : "";
    Alert.alert(
      `Импортировать магазины: ${stores.length}?`,
      `${list}${more}${updateNote}${skipped}`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Импортировать", onPress: () => runImport(stores) },
      ],
    );
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
          {loadingStores ? (
            <ActivityIndicator color="#1976D2" style={{ marginVertical: 8 }} />
          ) : (
            <>
              {ozonStores.length === 0 && !addingStore && (
                <AppText style={styles.emptyStoresText}>
                  Нет подключённых магазинов
                </AppText>
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
                      <AppText style={styles.storeName}>{store.name}</AppText>
                      <AppText style={styles.storeDetails}>
                        ID: {store.clientId} · Key: {store.apiKeyMasked}
                      </AppText>
                      {expiryDate !== null && (
                        <AppText
                          style={[
                            styles.storeExpiry,
                            isExpired && styles.storeExpiryExpired,
                          ]}
                        >
                          {isExpired
                            ? "Ключ просрочен. Обновите его в личном кабинете Ozon."
                            : `Ключ активен до ${expiryDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                        </AppText>
                      )}
                      {limits === undefined ? null : limits === null ? (
                        <AppText style={styles.limitsError}>
                          Лимиты недоступны
                        </AppText>
                      ) : (
                        <View style={styles.limitsBlock}>
                          <AppText
                            style={[
                              styles.limitsRow,
                              totalExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Доступно пустых мест в магазине:{" "}
                            {limits.total.limit - limits.total.usage}
                          </AppText>
                          <AppText
                            style={[
                              styles.limitsRow,
                              createExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Можно создать товаров сегодня:{" "}
                            {limits.daily_create.limit -
                              limits.daily_create.usage}{" "}
                            сегодня
                          </AppText>
                          <AppText style={styles.limitsRow}>
                            Можно обновить товаров сегодня:{" "}
                            {limits.daily_update.limit -
                              limits.daily_update.usage}{" "}
                            сегодня
                          </AppText>
                          <AppText
                            style={[
                              styles.limitsRow,
                              totalExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Занято/всего мест в магазине: {limits.total.usage}/
                            {limits.total.limit > 0 ? limits.total.limit : "∞"}
                          </AppText>
                        </View>
                      )}

                      {editingStoreId === store.id && (
                        <>
                          <TextInput
                            style={styles.storeInput}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Название магазина"
                            placeholderTextColor="#aaa"
                            editable={!savingEdit}
                          />
                          <TextInput
                            style={styles.storeInput}
                            value={editApiKey}
                            onChangeText={setEditApiKey}
                            placeholder="Новый Api-Key (пусто — не менять)"
                            placeholderTextColor="#aaa"
                            autoCapitalize="none"
                            autoCorrect={false}
                            secureTextEntry
                            editable={!savingEdit}
                            autoFocus
                          />
                          <View style={styles.editActions}>
                            <TouchableOpacity
                              style={[styles.actionBtn, styles.cancelBtn]}
                              onPress={handleCancelEdit}
                              disabled={savingEdit}
                            >
                              <AppText style={styles.cancelBtnText}>Отмена</AppText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.actionBtn,
                                styles.saveBtn,
                                savingEdit && styles.disabledBtn,
                              ]}
                              onPress={() => handleSaveEdit(store)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <AppText style={styles.saveBtnText}>Сохранить</AppText>
                              )}
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>

                    {editingStoreId !== store.id && (
                      <>
                        <TouchableOpacity
                          style={styles.storeDeleteBtn}
                          onPress={() => handleStartEdit(store)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <AppText style={styles.storeEditIcon}>✎</AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.storeDeleteBtn}
                          onPress={() => handleDeleteStore(store)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <AppText style={styles.storeDeleteIcon}>✕</AppText>
                        </TouchableOpacity>
                      </>
                    )}
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
                      <AppText style={styles.cancelBtnText}>Отмена</AppText>
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
                        <AppText style={styles.saveBtnText}>Добавить</AppText>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.addActions}>
                  <TouchableOpacity
                    style={styles.addStoreBtn}
                    onPress={() => setAddingStore(true)}
                    disabled={importing}
                  >
                    <AppText style={styles.addStoreBtnText}>+ Добавить магазин</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addStoreBtn, importing && styles.disabledBtn]}
                    onPress={handleImportCsv}
                    disabled={importing}
                  >
                    {importing ? (
                      <ActivityIndicator size="small" color="#1976D2" />
                    ) : (
                      <AppText style={styles.addStoreBtnText}>Импорт из CSV</AppText>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
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
  storeEditIcon: {
    fontSize: 16,
    color: "#1976D2",
    fontWeight: "600",
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
  addActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  addStoreBtn: {
    alignSelf: "flex-start",
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
