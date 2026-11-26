import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppText } from "./AppText";
import { OzonCategoryPicker } from "./OzonPickers";
import { ChecksEditor, clone, type Dicts } from "./OzonAttributeEditor";
import { confirmDiscard } from "../hooks/useUnsavedChanges";
import { settingsStyles as s } from "../screens/admin/settingsStyles";
import {
  OZON_UNARY_OPS,
  type OzonAttrRule,
  type OzonCategoryConfig,
  type OzonCategoryValue,
} from "../services/cardPipeline.service";

function CategoryButton({ value, onPress }: { value: OzonCategoryValue; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.selectBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <AppText style={styles.selectText}>{value.label}</AppText>
        <AppText style={styles.ids}>
          категория {value.descriptionCategoryId} · тип {value.typeId}
        </AppText>
      </View>
      <AppText style={styles.selectArrow}>›</AppText>
    </TouchableOpacity>
  );
}

/**
 * «★ Категория Ozon» — the category + product type of the import item: chosen first (attributes,
 * required ones and dictionaries depend on it). Conditions top-down, the first match wins.
 */
export function CategoryRuleEditor({
  category,
  dicts,
  attributes,
  onDone,
  onCancel,
}: {
  category: OzonCategoryConfig;
  dicts: Dicts;
  /** the draft's attributes — conditions may look at their values */
  attributes: OzonAttrRule[];
  onDone: (c: OzonCategoryConfig) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState<OzonCategoryConfig>(clone(category));
  /** "default" or the index of a condition whose category is being picked */
  const [picking, setPicking] = useState<"default" | number | null>(null);
  const conditions = c.conditions ?? [];

  const setConditions = (next: OzonCategoryConfig["conditions"]) => setC((cur) => ({ ...cur, conditions: next }));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= conditions.length) return;
    const next = [...conditions];
    [next[i], next[j]] = [next[j], next[i]];
    setConditions(next);
  };

  const cancel = () => confirmDiscard(JSON.stringify(c) !== JSON.stringify(category), onCancel);

  const done = () => {
    for (const [i, cond] of conditions.entries()) {
      for (const k of cond.checks) {
        if (!OZON_UNARY_OPS.includes(k.op) && !(k.value ?? "").trim()) {
          Alert.alert("Ошибка", `Условие ${i + 1}: укажите, с чем сравнивать`);
          return;
        }
      }
      if (!cond.category.descriptionCategoryId || !cond.category.typeId) {
        Alert.alert("Ошибка", `Условие ${i + 1}: выберите категорию`);
        return;
      }
    }
    const out = clone(c);
    if (!conditions.length) delete out.conditions;
    onDone(out);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={cancel}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <AppText style={s.sectionTitle}>★ Категория Ozon</AppText>
            <AppText style={s.sectionDesc}>
              Категория и тип товара на Ozon. Выбирается первой: от неё зависят атрибуты, обязательные поля и словари.
              Условия атрибутов могут проверять выбранную категорию.
            </AppText>
            <AppText style={styles.fieldLabel}>По умолчанию</AppText>
            <CategoryButton value={c.default} onPress={() => setPicking("default")} />
            <AppText style={styles.hint}>
              {conditions.length ? "Если ни одно условие ниже не сработало." : "Для всех книг."}
            </AppText>
          </View>

          <View style={s.card}>
            <AppText style={s.sectionTitle}>Условия</AppText>
            <AppText style={s.sectionDesc}>
              Проверяются сверху вниз, срабатывает первое подходящее. Например: «Если Год издания ≤ 1941 → Антикварные
              издания».
            </AppText>
            {conditions.map((cond, ci) => (
              <View key={ci} style={styles.condition}>
                <View style={styles.condHead}>
                  <AppText style={styles.condTitle}>Условие {ci + 1}</AppText>
                  <View style={styles.condTools}>
                    <TouchableOpacity onPress={() => move(ci, -1)} hitSlop={8} disabled={ci === 0}>
                      <AppText style={[styles.tool, ci === 0 && styles.toolOff]}>↑</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => move(ci, 1)} hitSlop={8} disabled={ci === conditions.length - 1}>
                      <AppText style={[styles.tool, ci === conditions.length - 1 && styles.toolOff]}>↓</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConditions(conditions.filter((_, j) => j !== ci))} hitSlop={8}>
                      <AppText style={styles.remove}>✕</AppText>
                    </TouchableOpacity>
                  </View>
                </View>
                <ChecksEditor
                  checks={cond.checks}
                  onChange={(checks) => setConditions(conditions.map((x, j) => (j === ci ? { ...x, checks } : x)))}
                  dicts={dicts}
                  attributes={attributes}
                  allowCategory={false}
                />
                <AppText style={[styles.condWord, { marginTop: 10 }]}>То</AppText>
                {cond.category.descriptionCategoryId ? (
                  <CategoryButton value={cond.category} onPress={() => setPicking(ci)} />
                ) : (
                  <TouchableOpacity style={styles.selectBtn} onPress={() => setPicking(ci)}>
                    <AppText style={[styles.selectText, { color: "#aaa" }]}>Выбрать категорию</AppText>
                    <AppText style={styles.selectArrow}>›</AppText>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              onPress={() =>
                setConditions([
                  ...conditions,
                  {
                    checks: [{ operand: { kind: "field", field: "yearPublished" }, op: "lte", value: "" }],
                    category: { label: "", descriptionCategoryId: 0, typeId: 0 },
                  },
                ])
              }
            >
              <AppText style={styles.link}>+ Условие</AppText>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.saveBtn} onPress={done} activeOpacity={0.8}>
            <AppText style={s.saveBtnText}>Готово</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={cancel} activeOpacity={0.8}>
            <AppText style={s.secondaryBtnText}>Отмена</AppText>
          </TouchableOpacity>
          <AppText style={styles.hint}>Изменения попадут на сервер после «Сохранить» на основном экране.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>

      {picking !== null && (
        <OzonCategoryPicker
          onClose={() => setPicking(null)}
          onPick={(value) => {
            if (picking === "default") setC((cur) => ({ ...cur, default: value }));
            else setConditions(conditions.map((x, j) => (j === picking ? { ...x, category: value } : x)));
            setPicking(null);
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#888", marginBottom: 2, marginTop: 8 },
  hint: { fontSize: 12, color: "#999", marginTop: 8 },
  link: { color: "#1976D2", fontSize: 14, fontWeight: "600", marginTop: 12 },
  remove: { color: "#E53935", fontSize: 18, fontWeight: "700" },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FAFAFA",
    marginTop: 8,
  },
  selectText: { fontSize: 14, color: "#333" },
  selectArrow: { fontSize: 18, color: "#1976D2", marginLeft: 8 },
  ids: { fontSize: 11, color: "#999", marginTop: 2 },
  condition: { borderWidth: 1, borderColor: "#E3F2FD", backgroundColor: "#FAFCFF", borderRadius: 10, padding: 12, marginTop: 10 },
  condHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  condTitle: { fontSize: 14, fontWeight: "700", color: "#1976D2" },
  condTools: { flexDirection: "row", alignItems: "center", gap: 14 },
  tool: { fontSize: 18, color: "#1976D2", fontWeight: "700" },
  toolOff: { color: "#ccc" },
  condWord: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
});
