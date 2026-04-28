import React, { useCallback, useEffect, useState } from "react";
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
import {
  adminService,
  type OzonStore,
  type OzonStoreLimits,
} from "../../services/admin.service";

export function OzonStoresScreen() {
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
  const [draftStoreName, setDraftStoreName] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");

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
        onPress: async () => {
          try {
            await adminService.removeOzonStore(store.id);
            setOzonStores((prev) => prev.filter((s) => s.id !== store.id));
          } catch {
            Alert.alert("Ошибка", "Не удалось удалить магазин");
          }
        },
      },
    ]);
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
                        <Text
                          style={[
                            styles.storeExpiry,
                            isExpired && styles.storeExpiryExpired,
                          ]}
                        >
                          {isExpired
                            ? "Ключ просрочен. Обновите его в личном кабинете Ozon."
                            : `Ключ активен до ${expiryDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                        </Text>
                      )}
                      {limits === undefined ? null : limits === null ? (
                        <Text style={styles.limitsError}>
                          Лимиты недоступны
                        </Text>
                      ) : (
                        <View style={styles.limitsBlock}>
                          <Text
                            style={[
                              styles.limitsRow,
                              totalExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Доступно пустых мест в магазине:{" "}
                            {limits.total.limit - limits.total.usage}
                          </Text>
                          <Text
                            style={[
                              styles.limitsRow,
                              createExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Можно создать товаров сегодня:{" "}
                            {limits.daily_create.limit -
                              limits.daily_create.usage}{" "}
                            сегодня
                          </Text>
                          <Text style={styles.limitsRow}>
                            Можно обновить товаров сегодня:{" "}
                            {limits.daily_update.limit -
                              limits.daily_update.usage}{" "}
                            сегодня
                          </Text>
                          <Text
                            style={[
                              styles.limitsRow,
                              totalExhausted && styles.limitsExhausted,
                            ]}
                          >
                            Занято/всего мест в магазине: {limits.total.usage}/
                            {limits.total.limit > 0 ? limits.total.limit : "∞"}
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
                  <Text style={styles.addStoreBtnText}>+ Добавить магазин</Text>
                </TouchableOpacity>
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
