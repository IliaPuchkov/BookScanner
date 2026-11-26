import React, { useCallback, useEffect, useState } from "react";
import {
  View,
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
import { AppText } from "../../components/AppText";
import { adminService } from "../../services/admin.service";
import { useMaintenanceContext } from "../../context/MaintenanceContext";
import { settingsStyles as s } from "./settingsStyles";

const MAINTENANCE_ENABLED_KEY = "maintenance_enabled";
const MAINTENANCE_START_AT_KEY = "maintenance_start_at";
const MAINTENANCE_END_AT_KEY = "maintenance_end_at";
const MAINTENANCE_MESSAGE_KEY = "maintenance_message";
const MAINTENANCE_INSTRUCTIONS_KEY = "maintenance_instructions";
const MAINTENANCE_WARNING_MINUTES_KEY = "maintenance_warning_minutes";

const pad = (n: number) => String(n).padStart(2, "0");

function parseRuDateTime(str: string): string | null {
  const trimmed = str.trim();
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

function formatRu(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToRu(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return formatRu(d);
}

const DAY_SHORTCUTS = [
  { label: "Сегодня", offset: 0 },
  { label: "Завтра", offset: 1 },
];

function DateShortcuts({ onPick }: { onPick: (value: string) => void }) {
  return (
    <View style={styles.dateShortcuts}>
      {DAY_SHORTCUTS.map(({ label, offset }) => (
        <TouchableOpacity
          key={label}
          style={styles.dateChip}
          onPress={() => {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            d.setSeconds(0, 0);
            onPick(formatRu(d));
          }}
          activeOpacity={0.7}
        >
          <AppText style={styles.dateChipText}>{label}</AppText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function MaintenanceScreen() {
  const { refresh: refreshMaintenance } = useMaintenanceContext();
  const [enabled, setEnabled] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [message, setMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [warningMinutes, setWarningMinutes] = useState("30");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const settings = await adminService.getSettings();
      const get = (key: string) => settings.find((x) => x.key === key)?.value;
      setEnabled(get(MAINTENANCE_ENABLED_KEY) === "true");
      setStartAt(isoToRu(get(MAINTENANCE_START_AT_KEY)));
      setEndAt(isoToRu(get(MAINTENANCE_END_AT_KEY)));
      setMessage(get(MAINTENANCE_MESSAGE_KEY) ?? "");
      setInstructions(get(MAINTENANCE_INSTRUCTIONS_KEY) ?? "");
      setWarningMinutes(get(MAINTENANCE_WARNING_MINUTES_KEY) ?? "30");
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить настройки");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSave = async () => {
    const startIso = startAt ? parseRuDateTime(startAt) : null;
    const endIso = endAt ? parseRuDateTime(endAt) : null;

    if (startAt && !startIso) {
      Alert.alert(
        "Ошибка",
        "Неверный формат даты начала. Используйте ДД.ММ.ГГГГ ЧЧ:ММ",
      );
      return;
    }
    if (endAt && !endIso) {
      Alert.alert(
        "Ошибка",
        "Неверный формат даты окончания. Используйте ДД.ММ.ГГГГ ЧЧ:ММ",
      );
      return;
    }
    const warnMin = parseInt(warningMinutes, 10);
    if (isNaN(warnMin) || warnMin < 0) {
      Alert.alert(
        "Ошибка",
        "Укажите корректное количество минут предупреждения",
      );
      return;
    }

    setSaving(true);
    try {
      const calls = [
        adminService.upsertSetting({
          key: MAINTENANCE_ENABLED_KEY,
          value: String(enabled),
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
        calls.push(
          adminService.upsertSetting({
            key: MAINTENANCE_START_AT_KEY,
            value: startIso,
            valueType: "string",
            description: "Дата и время начала технических работ (ISO)",
          }),
        );
      }
      if (endIso) {
        calls.push(
          adminService.upsertSetting({
            key: MAINTENANCE_END_AT_KEY,
            value: endIso,
            valueType: "string",
            description:
              "Приблизительное время окончания технических работ (ISO)",
          }),
        );
      }
      if (message.trim()) {
        calls.push(
          adminService.upsertSetting({
            key: MAINTENANCE_MESSAGE_KEY,
            value: message.trim(),
            valueType: "string",
            description: "Причина / описание технических работ",
          }),
        );
      }
      if (instructions.trim()) {
        calls.push(
          adminService.upsertSetting({
            key: MAINTENANCE_INSTRUCTIONS_KEY,
            value: instructions.trim(),
            valueType: "string",
            description: "Инструкции для пользователей на время работ",
          }),
        );
      }

      await Promise.all(calls);
      await refreshMaintenance();
      Alert.alert(
        "Готово",
        enabled ? "Технические работы включены" : "Настройки сохранены",
      );
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#1976D2" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={s.container}
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
        <View style={s.card}>
          <AppText style={s.sectionTitle}>Технические работы</AppText>
          <AppText style={s.sectionDesc}>
            Управление режимом обслуживания сервера. При включении пользователи
            увидят экран технических работ.
          </AppText>

          <View style={styles.toggleRow}>
            <AppText
              style={[styles.toggleLabel, enabled && styles.toggleLabelActive]}
            >
              {enabled
                ? "🔴  Технические работы ВКЛЮЧЕНЫ"
                : "🟢  Технические работы выключены"}
            </AppText>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: "#ddd", true: "#FFCDD2" }}
              thumbColor={enabled ? "#E53935" : "#fff"}
            />
          </View>

          <AppText style={styles.fieldLabel}>
            Дата и время начала (ДД.ММ.ГГГГ ЧЧ:ММ)
          </AppText>
          <TextInput
            style={[styles.input, { marginBottom: 6 }]}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="напр. 15.04.2026 18:00"
            placeholderTextColor="#bbb"
            keyboardType="numbers-and-punctuation"
          />
          <DateShortcuts onPick={setStartAt} />

          <AppText style={[styles.fieldLabel, { marginTop: 8 }]}>
            Примерное окончание (ДД.ММ.ГГГГ ЧЧ:ММ)
          </AppText>
          <TextInput
            style={styles.input}
            value={endAt}
            onChangeText={setEndAt}
            placeholder="напр. 15.04.2026 20:00"
            placeholderTextColor="#bbb"
            keyboardType="numbers-and-punctuation"
          />
          <DateShortcuts onPick={setEndAt} />

          <AppText style={styles.fieldLabel}>
            За сколько минут показывать предупреждение
          </AppText>
          <TextInput
            style={styles.input}
            value={warningMinutes}
            onChangeText={setWarningMinutes}
            placeholder="30"
            placeholderTextColor="#bbb"
            keyboardType="number-pad"
          />

          <AppText style={styles.fieldLabel}>
            Причина / сообщение для пользователей
          </AppText>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={message}
            onChangeText={setMessage}
            placeholder="Плановые технические работы по обновлению системы"
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={3}
          />

          <AppText style={styles.fieldLabel}>
            Инструкции для пользователей (необязательно)
          </AppText>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder={
              "• Завершите текущую работу\n• Все сохранённые карточки останутся\n• Несохранённые данные будут потеряны"
            }
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={4}
          />
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppText style={s.saveBtnText}>Сохранить</AppText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
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
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    flex: 1,
    marginRight: 12,
  },
  toggleLabelActive: {
    color: "#C62828",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
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
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  dateShortcuts: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  dateChip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  dateChipText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
});
