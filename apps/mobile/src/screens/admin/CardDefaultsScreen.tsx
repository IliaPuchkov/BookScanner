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
import { AppText } from "../../components/AppText";
import { CoverType, PaperType } from "../../types";
import { cardPipelineService, type CardDefaults } from "../../services/cardPipeline.service";
import { useUndoable } from "../../context/UndoContext";
import { settingsStyles as s } from "./settingsStyles";

type NumberKey = "weightG" | "widthMm" | "lengthMm" | "thicknessMm";
type TextKey = "language" | "condition" | "bookType" | "direction";

const NUMBER_FIELDS: Array<{ key: NumberKey; label: string }> = [
  { key: "weightG", label: "Вес, г" },
  { key: "lengthMm", label: "Длина, мм" },
  { key: "widthMm", label: "Ширина, мм" },
  { key: "thicknessMm", label: "Толщина, мм" },
];

const TEXT_FIELDS: Array<{ key: TextKey; label: string }> = [
  { key: "language", label: "Язык" },
  { key: "condition", label: "Сохранность" },
  { key: "bookType", label: "Тип книги" },
  { key: "direction", label: "Направление" },
];

const PAPER_OPTIONS: Array<{ value: PaperType; label: string }> = [
  { value: PaperType.OFFSET, label: "Офсетная" },
  { value: PaperType.GLOSSY, label: "Глянцевая" },
  { value: PaperType.MATTE, label: "Матовая" },
];

const COVER_OPTIONS: Array<{ value: CoverType; label: string }> = [
  { value: CoverType.HARDCOVER, label: "Твёрдый переплёт" },
  { value: CoverType.SOFTCOVER, label: "Мягкий переплёт" },
];

/** Numbers are edited as text so a field can be cleared while typing. */
type Draft = Omit<CardDefaults, NumberKey> & Record<NumberKey, string>;

const toDraft = (d: CardDefaults): Draft => ({
  ...d,
  weightG: String(d.weightG),
  widthMm: String(d.widthMm),
  lengthMm: String(d.lengthMm),
  thicknessMm: String(d.thicknessMm),
});

function Chips<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <AppText style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function CardDefaultsScreen() {
  const undoable = useUndoable();
  const [saved, setSaved] = useState<Draft | null>(null);
  const [standard, setStandard] = useState<CardDefaults | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cardPipelineService.getCardDefaults();
      setSaved(toDraft(res.defaults));
      setDraft(toDraft(res.defaults));
      setStandard(res.standard);
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить значения по умолчанию");
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

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  const offerApply = async () => {
    let count = 0;
    try {
      count = await cardPipelineService.countStaleCards();
    } catch {
      return;
    }
    if (count === 0) return;
    Alert.alert(
      "Применить к карточкам?",
      `У ${count} неопубликованных карточек эти поля заполнены по умолчанию. Заменить их новыми значениями? Поля, которые ИИ определил или кто-то заполнил вручную, не изменятся.`,
      [
        { text: "Не сейчас", style: "cancel" },
        {
          text: "Применить",
          onPress: () =>
            undoable({
              message: `Новые значения по умолчанию — в ${count} карточек`,
              action: async () => {
                try {
                  const updated = await cardPipelineService.applyCardDefaults();
                  Alert.alert("Готово", `Обновлено карточек: ${updated}`);
                } catch {
                  Alert.alert("Ошибка", "Не удалось обновить карточки");
                }
              },
            }),
        },
      ],
    );
  };

  const handleSave = async () => {
    if (!draft) return;
    const numbers = {} as Record<NumberKey, number>;
    for (const f of NUMBER_FIELDS) {
      const n = Number(draft[f.key].replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) {
        Alert.alert("Ошибка", `${f.label}: нужно число больше 0`);
        return;
      }
      numbers[f.key] = n;
    }
    for (const f of TEXT_FIELDS) {
      if (!draft[f.key].trim()) {
        Alert.alert("Ошибка", `${f.label}: не может быть пустым`);
        return;
      }
    }
    setSaving(true);
    try {
      const result = await cardPipelineService.saveCardDefaults({ ...draft, ...numbers });
      setSaved(toDraft(result));
      setDraft(toDraft(result));
      await offerApply();
    } catch (e: any) {
      Alert.alert("Ошибка", e?.response?.data?.message ?? "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#1976D2" />
      </View>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#1976D2"]} tintColor="#1976D2" />
        }
      >
        <View style={s.card}>
          <AppText style={s.sectionTitle}>Значения по умолчанию</AppText>
          <AppText style={s.sectionDesc}>
            Подставляются в карточку, если ИИ не определил поле. Такие поля помечаются «по умолчанию» —
            их можно заменить, изменив настройку. Действует для всех маркетплейсов.
          </AppText>
        </View>

        <View style={s.card}>
          <AppText style={s.sectionTitle}>Вес и размеры</AppText>
          {NUMBER_FIELDS.map((f) => (
            <View key={f.key} style={styles.row}>
              <AppText style={styles.label}>{f.label}</AppText>
              <TextInput
                style={styles.numberInput}
                value={draft[f.key]}
                onChangeText={(v) => set(f.key, v)}
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>
          ))}
        </View>

        <View style={s.card}>
          <AppText style={s.sectionTitle}>Тип бумаги</AppText>
          <Chips options={PAPER_OPTIONS} value={draft.paperType} onChange={(v) => set("paperType", v)} disabled={saving} />
          <AppText style={[s.sectionTitle, { marginTop: 16 }]}>Тип обложки</AppText>
          <Chips options={COVER_OPTIONS} value={draft.coverType} onChange={(v) => set("coverType", v)} disabled={saving} />
        </View>

        <View style={s.card}>
          <AppText style={s.sectionTitle}>Текстовые поля</AppText>
          {TEXT_FIELDS.map((f) => (
            <View key={f.key} style={{ marginTop: 10 }}>
              <AppText style={styles.fieldLabel}>{f.label}</AppText>
              <TextInput
                style={styles.textInput}
                value={draft[f.key]}
                onChangeText={(v) => set(f.key, v)}
                editable={!saving}
                maxLength={100}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.saveBtn, (!dirty || saving) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
          activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <AppText style={s.saveBtnText}>Сохранить</AppText>}
        </TouchableOpacity>
        {dirty && !saving && (
          <TouchableOpacity style={s.secondaryBtn} onPress={() => setDraft(saved)} activeOpacity={0.8}>
            <AppText style={s.secondaryBtnText}>Отменить изменения</AppText>
          </TouchableOpacity>
        )}
        {standard && !saving && (
          <TouchableOpacity style={s.secondaryBtn} onPress={() => setDraft(toDraft(standard))} activeOpacity={0.8}>
            <AppText style={s.secondaryBtnText}>Вернуть стандартные значения</AppText>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.secondaryBtn} onPress={offerApply} activeOpacity={0.8} disabled={saving || dirty}>
          <AppText style={s.secondaryBtnText}>Применить к неопубликованным карточкам</AppText>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  label: { fontSize: 14, color: "#333", fontWeight: "600", flex: 1, marginRight: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#888", marginBottom: 6 },
  numberInput: {
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
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
    backgroundColor: "#FAFAFA",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  chipActive: { borderColor: "#1976D2", backgroundColor: "#E3F2FD" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextActive: { color: "#1976D2", fontWeight: "600" },
});
