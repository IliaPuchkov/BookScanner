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
import { UnsavedBar } from "../../components/UnsavedBar";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChanges";
import { adminService } from "../../services/admin.service";
import { settingsStyles as s } from "./settingsStyles";

const PRICE_DEFAULT_KEY = "price_default";
const PRICE_MIN_KEY = "price_min";
const PRICE_DISCOUNT_THRESHOLD_KEY = "price_discount_threshold";
const PRICE_DISCOUNT_PERCENT_KEY = "price_discount_percent";
const PRICE_AI_MULTIPLIER_KEY = "price_ai_multiplier";

interface PriceValues {
  def: string;
  min: string;
  threshold: string;
  percent: string;
  multiplier: string;
}

const DEFAULTS: PriceValues = {
  def: "20000",
  min: "1000",
  threshold: "1200",
  percent: "15",
  multiplier: "9",
};

const FIELDS: Array<{
  key: keyof PriceValues;
  label: string;
  hint: string;
  decimal?: boolean;
}> = [
  {
    key: "multiplier",
    label: "Коэффициент ИИ ×",
    hint: "На него умножается цена от ИИ (ИИ обычно недооценивает книги).",
    decimal: true,
  },
  {
    key: "def",
    label: "Цена не найдена (₽)",
    hint: "Цена книги, если ИИ не смог её определить.",
  },
  {
    key: "min",
    label: "Минимальная цена (₽)",
    hint: "Цена ниже этой поднимается до неё.",
  },
  {
    key: "threshold",
    label: "Порог скидки (₽)",
    hint: "Выше этой цены применяется скидка.",
  },
  {
    key: "percent",
    label: "Скидка выше порога (%)",
    hint: "На сколько процентов снижается цена выше порога.",
  },
];

export function PriceFormulaScreen() {
  const [saved, setSaved] = useState<PriceValues>(DEFAULTS);
  const [draft, setDraft] = useState<PriceValues>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const settings = await adminService.getSettings();
      const get = (key: string, fallback: string) =>
        settings.find((x) => x.key === key)?.value ?? fallback;
      const values: PriceValues = {
        def: get(PRICE_DEFAULT_KEY, DEFAULTS.def),
        min: get(PRICE_MIN_KEY, DEFAULTS.min),
        threshold: get(PRICE_DISCOUNT_THRESHOLD_KEY, DEFAULTS.threshold),
        percent: get(PRICE_DISCOUNT_PERCENT_KEY, DEFAULTS.percent),
        multiplier: get(PRICE_AI_MULTIPLIER_KEY, DEFAULTS.multiplier),
      };
      setSaved(values);
      setDraft(values);
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить настройки цены");
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

  const dirty = (Object.keys(draft) as Array<keyof PriceValues>).some(
    (k) => draft[k] !== saved[k],
  );

  const handleSave = async (): Promise<boolean> => {
    const pd = parseInt(draft.def, 10);
    const pm = parseInt(draft.min, 10);
    const pdt = parseInt(draft.threshold, 10);
    const pdp = parseInt(draft.percent, 10);
    const pam = parseFloat(draft.multiplier.replace(",", "."));
    if (isNaN(pd) || pd <= 0) {
      Alert.alert("Ошибка", "Некорректная цена по умолчанию");
      return false;
    }
    if (isNaN(pm) || pm <= 0) {
      Alert.alert("Ошибка", "Некорректная минимальная цена");
      return false;
    }
    if (isNaN(pdt) || pdt <= 0) {
      Alert.alert("Ошибка", "Некорректный порог скидки");
      return false;
    }
    if (isNaN(pdp) || pdp < 0 || pdp > 100) {
      Alert.alert("Ошибка", "Процент скидки должен быть от 0 до 100");
      return false;
    }
    if (isNaN(pam) || pam <= 0) {
      Alert.alert("Ошибка", "Коэффициент ИИ должен быть больше 0");
      return false;
    }
    setSaving(true);
    try {
      await Promise.all([
        adminService.upsertSetting({
          key: PRICE_DEFAULT_KEY,
          value: String(pd),
          valueType: "number",
          description: "Цена книги если ИИ не смог определить цену",
        }),
        adminService.upsertSetting({
          key: PRICE_MIN_KEY,
          value: String(pm),
          valueType: "number",
          description: "Минимальная цена книги",
        }),
        adminService.upsertSetting({
          key: PRICE_DISCOUNT_THRESHOLD_KEY,
          value: String(pdt),
          valueType: "number",
          description: "Порог выше которого применяется скидка",
        }),
        adminService.upsertSetting({
          key: PRICE_DISCOUNT_PERCENT_KEY,
          value: String(pdp),
          valueType: "number",
          description: "Процент скидки от цены ИИ",
        }),
        adminService.upsertSetting({
          key: PRICE_AI_MULTIPLIER_KEY,
          value: String(pam),
          valueType: "number",
          description:
            "Коэффициент умножения цены от ИИ (компенсация недооценки)",
        }),
      ]);
      const values: PriceValues = {
        def: String(pd),
        min: String(pm),
        threshold: String(pdt),
        percent: String(pdp),
        multiplier: String(pam),
      };
      setSaved(values);
      setDraft(values);
      Alert.alert("Готово", "Формула цены сохранена");
      return true;
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить настройки цены");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useUnsavedChangesGuard(dirty, saving, handleSave);

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
          <AppText style={s.sectionTitle}>Как считается цена</AppText>
          <AppText style={s.sectionDesc}>
            Цена от ИИ умножается на коэффициент{" "}
            <AppText style={styles.formulaValue}>
              ×{draft.multiplier || "—"}
            </AppText>
            , затем:
          </AppText>
          <View style={styles.formulaBox}>
            <AppText style={styles.formulaLine}>
              Цена не найдена →{" "}
              <AppText style={styles.formulaValue}>{draft.def || "—"} ₽</AppText>
            </AppText>
            <AppText style={styles.formulaLine}>
              Цена &lt; {draft.min || "—"} ₽ →{" "}
              <AppText style={styles.formulaValue}>{draft.min || "—"} ₽</AppText>
            </AppText>
            <AppText style={styles.formulaLine}>
              Цена &gt; {draft.threshold || "—"} ₽ →{" "}
              <AppText style={styles.formulaValue}>
                цена − {draft.percent || "—"}%
              </AppText>
            </AppText>
            <AppText style={styles.formulaLine}>
              Иначе →{" "}
              <AppText style={styles.formulaValue}>цена без изменений</AppText>
            </AppText>
          </View>
        </View>

        <View style={s.card}>
          <AppText style={s.sectionTitle}>Параметры</AppText>
          {FIELDS.map((f) => (
            <View key={f.key} style={styles.field}>
              <View style={styles.fieldRow}>
                <AppText style={styles.fieldLabel}>{f.label}</AppText>
                <TextInput
                  style={styles.fieldInput}
                  value={draft[f.key]}
                  onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                  keyboardType={f.decimal ? "decimal-pad" : "number-pad"}
                  editable={!saving}
                />
              </View>
              <AppText style={styles.fieldHint}>{f.hint}</AppText>
            </View>
          ))}
        </View>

      </ScrollView>
      <UnsavedBar
        visible={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => setDraft(saved)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formulaBox: {
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8ECF0",
    gap: 6,
  },
  formulaLine: {
    fontSize: 14,
    color: "#555",
  },
  formulaValue: {
    fontWeight: "700",
    color: "#1976D2",
  },
  field: {
    marginTop: 12,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  fieldInput: {
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
  fieldHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
});
