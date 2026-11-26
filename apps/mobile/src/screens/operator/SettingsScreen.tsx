import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { AppText } from '../../components/AppText';
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import { adminService } from "../../services/admin.service";
import { useMaintenanceContext } from "../../context/MaintenanceContext";

function NavCard({
  title,
  desc,
  status,
  onPress,
}: {
  title: string;
  desc: string;
  /** Highlighted line under the description (e.g. maintenance is on). */
  status?: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onPress}>
      <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
        <View style={{ flex: 1 }}>
          <AppText style={styles.sectionTitle}>{title}</AppText>
          <AppText style={styles.sectionDesc}>{desc}</AppText>
          {status ? <AppText style={styles.statusText}>{status}</AppText> : null}
        </View>
        <AppText style={styles.arrow}>›</AppText>
      </View>
    </TouchableOpacity>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionLabel}>{title}</AppText>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const isAdmin = user?.role === "admin";
  const maintenance = useMaintenanceContext();

  const [backfilling, setBackfilling] = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [syncingOzon, setSyncingOzon] = useState(false);

  if (!isAdmin) {
    return <View style={styles.blank} />;
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <SettingsSection title="Ozon">
        <NavCard
          title="Магазины Ozon"
          desc="Подключённые магазины. Выбор магазина происходит при загрузке товаров."
          onPress={() => navigation.navigate("OzonStores")}
        />

        <NavCard
          title="Сверка с Озоном"
          desc="Сравнение количества товаров на Ozon и в системе. Показывает расхождения по конкретным SKU."
          onPress={() => navigation.navigate("OzonSync")}
        />

        {/* Import from Ozon */}
        {/* <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("ImportFromOzon")}
        >
          <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.sectionTitle}>Импорт с Озона</AppText>
              <AppText style={styles.sectionDesc}>
                Загрузить в систему товары, уже опубликованные в магазине на
                Озоне
              </AppText>
            </View>
            <AppText style={{ fontSize: 20, color: "#1976D2" }}>›</AppText>
          </View>
        </TouchableOpacity> */}

        {/* Reset stuck publications */}
        {/* <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          disabled={resettingStuck}
          onPress={() => {
            Alert.alert(
              "Сбросить зависшие публикации",
              "Книги, которые больше 24 часов висят в статусе «Публикуется в Ozon» без результата, будут проверены. Найденные на Ozon — помечены как опубликованные, остальные — как ошибка публикации.",
              [
                { text: "Отмена", style: "cancel" },
                {
                  text: "Запустить",
                  onPress: async () => {
                    setResettingStuck(true);
                    try {
                      const res =
                        await adminService.resetStuckPublications();
                      if (res.checked === 0) {
                        Alert.alert(
                          "Готово",
                          "Зависших публикаций не найдено",
                        );
                      } else {
                        Alert.alert(
                          "Готово",
                          `Проверено: ${res.checked}\nНайдено на Ozon: ${res.published}\nПомечено как ошибка: ${res.failed}`,
                        );
                      }
                    } catch {
                      Alert.alert("Ошибка", "Не удалось выполнить сброс");
                    } finally {
                      setResettingStuck(false);
                    }
                  },
                },
              ],
            );
          }}
        >
          <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.sectionTitle}>
                Сбросить зависшие публикации
              </AppText>
              <AppText style={styles.sectionDesc}>
                Исправить книги, застрявшие в статусе «Публикуется в Ozon»
                более 24 часов
              </AppText>
            </View>
            {resettingStuck ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <AppText style={{ fontSize: 20, color: "#1976D2" }}>›</AppText>
            )}
          </View>
        </TouchableOpacity> */}

        {/* Repair failed publications */}
        {/* <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          disabled={repairing}
          onPress={() => {
            Alert.alert(
              "Восстановить failed карточки",
              "Система проверит все карточки с ошибкой публикации и найдёт те, что реально опубликованы на Ozon. Они будут помечены как опубликованные.",
              [
                { text: "Отмена", style: "cancel" },
                {
                  text: "Запустить",
                  onPress: async () => {
                    setRepairing(true);
                    try {
                      const res =
                        await adminService.repairFailedPublications();
                      Alert.alert("Запущено", res.message);
                    } catch (e: any) {
                      const msg =
                        e?.response?.data?.message ||
                        e?.message ||
                        String(e);
                      Alert.alert("Ошибка", msg);
                    } finally {
                      setRepairing(false);
                    }
                  },
                },
              ],
            );
          }}
        >
          <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.sectionTitle}>
                Восстановить failed карточки
              </AppText>
              <AppText style={styles.sectionDesc}>
                Найти карточки с ошибкой публикации, которые реально
                опубликованы на Ozon
              </AppText>
            </View>
            {repairing ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <AppText style={{ fontSize: 20, color: "#1976D2" }}>›</AppText>
            )}
          </View>
        </TouchableOpacity> */}

        {/* Backfill store IDs */}
        {/* <TouchableOpacity
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
                      Alert.alert(
                        "Ошибка",
                        "Не удалось выполнить привязку",
                      );
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
              <AppText style={styles.sectionTitle}>
                Привязать магазины к карточкам
              </AppText>
              <AppText style={styles.sectionDesc}>
                Проставить магазин для карточек, опубликованных до
                добавления этой функции
              </AppText>
            </View>
            {backfilling ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <AppText style={{ fontSize: 20, color: "#1976D2" }}>›</AppText>
            )}
          </View>
        </TouchableOpacity> */}

        {/* Sync archived status */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          disabled={syncingOzon}
          onPress={() => {
            Alert.alert(
              "Синхронизировать с Ozon",
              "Система проверит статус каждого товара по магазинам и обновит состояние: опубликован или в архиве.",
              [
                { text: "Отмена", style: "cancel" },
                {
                  text: "Запустить",
                  onPress: async () => {
                    setSyncingOzon(true);
                    try {
                      const res = await adminService.syncOzonStatus();
                      Alert.alert("Запущено", res.message);
                    } catch {
                      Alert.alert(
                        "Ошибка",
                        "Не удалось запустить синхронизацию",
                      );
                    } finally {
                      setSyncingOzon(false);
                    }
                  },
                },
              ],
            );
          }}
        >
          <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.sectionTitle}>
                Синхронизировать с Ozon
              </AppText>
              <AppText style={styles.sectionDesc}>
                Обновить статусы товаров: опубликован или в архиве
              </AppText>
            </View>
            {syncingOzon ? (
              <ActivityIndicator size="small" color="#1976D2" />
            ) : (
              <AppText style={{ fontSize: 20, color: "#1976D2" }}>›</AppText>
            )}
          </View>
        </TouchableOpacity>

        <NavCard
          title="Доп. контент на Ozon"
          desc="Видеообложки, Rich-контент, доп. фото и магазины, куда они отправляются."
          onPress={() => navigation.navigate("OzonContent")}
        />
      </SettingsSection>

      <SettingsSection title="ИИ и карточки">
        <NavCard
          title="AI-промпт для распознавания"
          desc="Промпт, который передаётся в ИИ при извлечении данных из фотографий книг."
          onPress={() => navigation.navigate("AiPrompt")}
        />

        <NavCard
          title="Формула расчёта цены"
          desc="Параметры, по которым считается итоговая цена на основе цены от ИИ."
          onPress={() => navigation.navigate("PriceFormula")}
        />

        <NavCard
          title="Правила хэштегов"
          desc="Запрещённые слова, замены и обязательные теги для хэштегов от ИИ."
          onPress={() => navigation.navigate("HashtagRules")}
        />
      </SettingsSection>

      <SettingsSection title="Пользователи и отчёты">
        <NavCard
          title="Управление пользователями"
          desc="Создание, редактирование и удаление пользователей."
          onPress={() => navigation.navigate("UserManagement")}
        />

        <NavCard
          title="Выгрузка в Excel"
          desc="Карточки за период: данные книги, магазины Ozon, операторы и даты. Поля выбираются галочками."
          onPress={() => navigation.navigate("Export")}
        />
      </SettingsSection>

      <SettingsSection title="Сервер">
        <NavCard
          title="Технические работы"
          desc="Режим обслуживания сервера: пользователи увидят экран технических работ."
          status={
            maintenance.isActive
              ? "🔴 Сейчас включены"
              : maintenance.isWarning
                ? "🟠 Запланированы"
                : null
          }
          onPress={() => navigation.navigate("Maintenance")}
        />
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 4,
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
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C62828",
    marginTop: 6,
  },
  arrow: {
    fontSize: 20,
    color: "#1976D2",
  },
});
