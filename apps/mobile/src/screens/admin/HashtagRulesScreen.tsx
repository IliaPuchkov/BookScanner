import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { AppText } from "../../components/AppText";
import {
  adminService,
  type HashtagRule,
  type HashtagRuleType,
} from "../../services/admin.service";

const SECTIONS: Array<{
  type: HashtagRuleType;
  title: string;
  desc: string;
  addLabel: string;
}> = [
  {
    type: "forbid",
    title: "Запрещённые слова",
    desc: "Хэштег удаляется, если содержит этот фрагмент (без учёта регистра и ё/е). Например, «полити» уберёт #политика и #политический_детектив.",
    addLabel: "+ Запрещённое слово",
  },
  {
    type: "replace",
    title: "Замена тегов",
    desc: "Хэштег целиком заменяется на другой. Запрещённые слова проверяются уже после замены.",
    addLabel: "+ Замена",
  },
  {
    type: "add",
    title: "Обязательные теги",
    desc: "Добавляются к каждой книге первыми. Можно ограничить годом издания.",
    addLabel: "+ Обязательный тег",
  },
];

interface Draft {
  value: string;
  replacement: string;
  yearFrom: string;
  yearTo: string;
}

const EMPTY_DRAFT: Draft = { value: "", replacement: "", yearFrom: "", yearTo: "" };

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function tagText(s: string | null | undefined): string {
  const body = (s ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "_");
  return body ? `#${body}` : "";
}

function yearRangeText(r: HashtagRule): string | null {
  if (r.yearFrom != null && r.yearTo != null) return `${r.yearFrom}–${r.yearTo} г.`;
  if (r.yearFrom != null) return `с ${r.yearFrom} г.`;
  if (r.yearTo != null) return `до ${r.yearTo} г.`;
  return null;
}

function parseYear(s: string): number | null | "bad" {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (isNaN(n) || String(n) !== t || n < 1000 || n > 2100) return "bad";
  return n;
}

/** Same rules as backend `hashtagRuleError`, minus the length check (server has the final say) */
function draftToRule(type: HashtagRuleType, d: Draft, base: HashtagRule | null): HashtagRule | string {
  const value = d.value.trim();
  if (!value.replace(/[#\s]/g, "")) return type === "forbid" ? "Введите фрагмент слова" : "Введите хэштег";
  const rule: HashtagRule = { id: base?.id ?? newId(), type, enabled: base?.enabled ?? true, value };
  if (type === "replace") {
    const replacement = d.replacement.trim();
    if (!replacement.replace(/[#\s]/g, "")) return "Введите, на какой тег заменить";
    rule.replacement = replacement;
  }
  if (type === "add") {
    const yearFrom = parseYear(d.yearFrom);
    const yearTo = parseYear(d.yearTo);
    if (yearFrom === "bad" || yearTo === "bad") return "Год — число от 1000 до 2100";
    if (yearFrom != null && yearTo != null && yearFrom > yearTo) return "Год «с» больше года «по»";
    rule.yearFrom = yearFrom;
    rule.yearTo = yearTo;
  }
  return rule;
}

function errorMessage(e: any, fallback: string): string {
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join("\n");
  return typeof msg === "string" ? msg : fallback;
}

export function HashtagRulesScreen() {
  const navigation = useNavigation<any>();
  const [saved, setSaved] = useState<HashtagRule[]>([]);
  const [rules, setRules] = useState<HashtagRule[]>([]);
  const [defaults, setDefaults] = useState<HashtagRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline form: either a new rule of `type` or an existing rule `id`
  const [editing, setEditing] = useState<{ type: HashtagRuleType; id: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // Check
  const [testTags, setTestTags] = useState("");
  const [testYear, setTestYear] = useState("");
  const [testResult, setTestResult] = useState<string[] | null>(null);
  const [testing, setTesting] = useState(false);

  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(saved), [rules, saved]);

  const load = useCallback(async () => {
    try {
      const res = await adminService.getHashtagRules();
      setSaved(res.rules);
      setRules(res.rules);
      setDefaults(res.defaults);
      setEditing(null);
    } catch (e) {
      Alert.alert("Ошибка", errorMessage(e, "Не удалось загрузить правила"));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Unsaved changes: ask before leaving
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!dirty || saving) return;
      e.preventDefault();
      Alert.alert("Есть несохранённые изменения", "Выйти без сохранения?", [
        { text: "Остаться", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, dirty, saving]);

  const handleRefresh = useCallback(async () => {
    const reload = async () => {
      setRefreshing(true);
      try {
        await load();
      } finally {
        setRefreshing(false);
      }
    };
    if (!dirty) return reload();
    Alert.alert("Обновить список?", "Несохранённые изменения пропадут.", [
      { text: "Отмена", style: "cancel" },
      { text: "Обновить", style: "destructive", onPress: reload },
    ]);
  }, [dirty, load]);

  const startAdd = (type: HashtagRuleType) => {
    setEditing({ type, id: null });
    setDraft(EMPTY_DRAFT);
  };

  const startEdit = (r: HashtagRule) => {
    setEditing({ type: r.type, id: r.id });
    setDraft({
      value: r.value,
      replacement: r.replacement ?? "",
      yearFrom: r.yearFrom != null ? String(r.yearFrom) : "",
      yearTo: r.yearTo != null ? String(r.yearTo) : "",
    });
  };

  const applyDraft = () => {
    if (!editing) return;
    const base = editing.id ? rules.find((r) => r.id === editing.id) ?? null : null;
    const res = draftToRule(editing.type, draft, base);
    if (typeof res === "string") {
      Alert.alert("Ошибка", res);
      return;
    }
    setRules((prev) => (base ? prev.map((r) => (r.id === base.id ? res : r)) : [...prev, res]));
    setEditing(null);
    setTestResult(null);
  };

  const toggle = (id: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    setTestResult(null);
  };

  // Not saved until «Сохранить», so no undo banner is needed
  const remove = (r: HashtagRule) => {
    setRules((prev) => prev.filter((x) => x.id !== r.id));
    if (editing?.id === r.id) setEditing(null);
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminService.saveHashtagRules(rules);
      setSaved(res);
      setRules(res);
      setEditing(null);
      Alert.alert("Готово", "Правила сохранены. Они применяются к новым распознаваниям и при публикации на Ozon.");
    } catch (e) {
      Alert.alert("Ошибка", errorMessage(e, "Не удалось сохранить правила"));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    Alert.alert(
      "Вернуть стандартные правила?",
      "Список заменится стандартными запрещёнными словами. Замены и обязательные теги удалятся. Изменения применятся после «Сохранить».",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          style: "destructive",
          onPress: () => {
            setRules(defaults);
            setEditing(null);
            setTestResult(null);
          },
        },
      ],
    );
  };

  const handleTest = async () => {
    const tags = testTags.split(/[,\n]+|\s+(?=#)/).map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      Alert.alert("Проверка", "Введите хэштеги через запятую, например: #классика, #политика, #проза");
      return;
    }
    const year = parseYear(testYear);
    if (year === "bad") {
      Alert.alert("Ошибка", "Год — число от 1000 до 2100");
      return;
    }
    setTesting(true);
    try {
      setTestResult(await adminService.previewHashtagRules(tags, rules, year ?? undefined));
    } catch (e) {
      Alert.alert("Ошибка", errorMessage(e, "Не удалось проверить правила"));
    } finally {
      setTesting(false);
    }
  };

  const renderForm = (type: HashtagRuleType) => (
    <View style={styles.form}>
      <AppText style={styles.fieldLabel}>
        {type === "forbid" ? "Фрагмент слова" : type === "replace" ? "Какой тег заменить" : "Тег"}
      </AppText>
      <TextInput
        style={styles.input}
        value={draft.value}
        onChangeText={(value) => setDraft((d) => ({ ...d, value }))}
        placeholder={type === "forbid" ? "напр. полити" : type === "replace" ? "#советская_литература" : "#букинистика"}
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />
      {type === "replace" && (
        <>
          <AppText style={styles.fieldLabel}>На какой тег заменить</AppText>
          <TextInput
            style={styles.input}
            value={draft.replacement}
            onChangeText={(replacement) => setDraft((d) => ({ ...d, replacement }))}
            placeholder="#ссср"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      )}
      {type === "add" && (
        <>
          <AppText style={styles.fieldLabel}>Год издания (необязательно)</AppText>
          <View style={styles.yearRow}>
            <TextInput
              style={[styles.input, styles.yearInput]}
              value={draft.yearFrom}
              onChangeText={(yearFrom) => setDraft((d) => ({ ...d, yearFrom }))}
              placeholder="с"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={4}
            />
            <AppText style={styles.yearDash}>—</AppText>
            <TextInput
              style={[styles.input, styles.yearInput]}
              value={draft.yearTo}
              onChangeText={(yearTo) => setDraft((d) => ({ ...d, yearTo }))}
              placeholder="по"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        </>
      )}
      <View style={styles.editActions}>
        <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setEditing(null)}>
          <AppText style={styles.cancelBtnText}>Отмена</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={applyDraft}>
          <AppText style={styles.saveBtnText}>{editing?.id ? "Готово" : "Добавить"}</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRule = (r: HashtagRule) => {
    if (editing?.id === r.id) return <View key={r.id}>{renderForm(r.type)}</View>;
    const years = r.type === "add" ? yearRangeText(r) : null;
    return (
      <View key={r.id} style={styles.ruleRow}>
        <Switch
          value={r.enabled}
          onValueChange={(v) => toggle(r.id, v)}
          trackColor={{ false: "#ddd", true: "#BBDEFB" }}
          thumbColor={r.enabled ? "#1976D2" : "#fff"}
        />
        <TouchableOpacity style={styles.ruleText} onPress={() => startEdit(r)} activeOpacity={0.6}>
          <AppText style={[styles.ruleValue, !r.enabled && styles.ruleDisabled]}>
            {r.type === "forbid" ? r.value : tagText(r.value)}
            {r.type === "replace" && (
              <AppText style={styles.ruleArrow}>{"  →  "}{tagText(r.replacement)}</AppText>
            )}
          </AppText>
          {years && <AppText style={styles.ruleNote}>{years}</AppText>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => startEdit(r)} hitSlop={8}>
          <AppText style={styles.editIcon}>✎</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => remove(r)} hitSlop={8}>
          <AppText style={styles.deleteIcon}>✕</AppText>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color="#1976D2" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#1976D2"]} tintColor="#1976D2" />
        }
      >
        <AppText style={styles.intro}>
          Правила применяются к хэштегам от ИИ сразу после распознавания (оператор видит итог в карточке) и ещё раз при
          публикации на Ozon. Порядок: замены → запрещённые слова → обязательные теги в начало. Всего не больше 30 тегов,
          каждый до 29 символов.
        </AppText>

        {SECTIONS.map((s) => {
          const list = rules.filter((r) => r.type === s.type);
          const adding = editing?.type === s.type && editing.id === null;
          return (
            <View key={s.type} style={styles.card}>
              <AppText style={styles.sectionTitle}>
                {s.title}
                {list.length > 0 && <AppText style={styles.sectionCount}>{`  ${list.length}`}</AppText>}
              </AppText>
              <AppText style={styles.sectionDesc}>{s.desc}</AppText>
              {list.length === 0 && !adding && <AppText style={styles.empty}>Правил нет</AppText>}
              {list.map(renderRule)}
              {adding ? (
                renderForm(s.type)
              ) : (
                <TouchableOpacity style={styles.addBtn} onPress={() => startAdd(s.type)}>
                  <AppText style={styles.addBtnText}>{s.addLabel}</AppText>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Check */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Проверить правила</AppText>
          <AppText style={styles.sectionDesc}>
            Проверяет текущий список, в том числе несохранённые изменения.
          </AppText>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={testTags}
            onChangeText={(t) => {
              setTestTags(t);
              setTestResult(null);
            }}
            placeholder="#классика, #политика, #советская_литература"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <View style={styles.yearRow}>
            <TextInput
              style={[styles.input, styles.yearInput]}
              value={testYear}
              onChangeText={(t) => {
                setTestYear(t);
                setTestResult(null);
              }}
              placeholder="Год издания"
              placeholderTextColor="#aaa"
              keyboardType="number-pad"
              maxLength={4}
            />
            <TouchableOpacity
              style={[styles.checkBtn, testing && styles.disabledBtn]}
              onPress={handleTest}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <AppText style={styles.addBtnText}>Проверить</AppText>
              )}
            </TouchableOpacity>
          </View>
          {testResult && (
            <View style={styles.resultBox}>
              {testResult.length === 0 ? (
                <AppText style={styles.empty}>Не осталось ни одного тега</AppText>
              ) : (
                <AppText style={styles.resultText}>{testResult.join("  ")}</AppText>
              )}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefaults}>
          <AppText style={styles.resetBtnText}>Вернуть стандартные правила</AppText>
        </TouchableOpacity>
      </ScrollView>

      {dirty && (
        <View style={styles.saveBar}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.cancelBtn]}
            onPress={() => {
              setRules(saved);
              setEditing(null);
              setTestResult(null);
            }}
            disabled={saving}
          >
            <AppText style={styles.cancelBtnText}>Отменить изменения</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn, saving && styles.disabledBtn]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <AppText style={styles.saveBtnText}>Сохранить</AppText>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { alignItems: "center", justifyContent: "center" },
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  intro: { fontSize: 13, color: "#777", lineHeight: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#222", marginBottom: 4 },
  sectionCount: { fontSize: 14, fontWeight: "600", color: "#999" },
  sectionDesc: { fontSize: 13, color: "#888", marginBottom: 8 },
  empty: { fontSize: 14, color: "#aaa", marginVertical: 6 },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  ruleText: { flex: 1, marginLeft: 8 },
  ruleValue: { fontSize: 15, color: "#222", fontWeight: "500" },
  ruleArrow: { color: "#1976D2", fontWeight: "500" },
  ruleDisabled: { color: "#bbb", textDecorationLine: "line-through" },
  ruleNote: { fontSize: 12, color: "#888", marginTop: 2 },
  iconBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  editIcon: { fontSize: 16, color: "#1976D2", fontWeight: "600" },
  deleteIcon: { fontSize: 14, color: "#ccc", fontWeight: "600" },
  form: {
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E8ECF0",
  },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#888", marginTop: 4, marginBottom: 4 },
  input: {
    height: 44,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
    marginBottom: 6,
  },
  textArea: { height: 72, paddingTop: 10, textAlignVertical: "top" },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  yearInput: { flex: 1 },
  yearDash: { fontSize: 16, color: "#888", marginBottom: 6 },
  editActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cancelBtn: { borderWidth: 1.5, borderColor: "#ccc", backgroundColor: "#fff" },
  cancelBtnText: { fontSize: 14, color: "#666", fontWeight: "600" },
  saveBtn: { backgroundColor: "#1976D2" },
  saveBtnText: { fontSize: 14, color: "#fff", fontWeight: "600" },
  disabledBtn: { opacity: 0.6 },
  addBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, color: "#1976D2", fontWeight: "600" },
  checkBtn: {
    flex: 1,
    height: 44,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    alignItems: "center",
    justifyContent: "center",
  },
  resultBox: {
    marginTop: 6,
    backgroundColor: "#E3F2FD",
    borderRadius: 10,
    padding: 12,
  },
  resultText: { fontSize: 14, color: "#1565C0", lineHeight: 22 },
  resetBtn: { alignSelf: "center", paddingVertical: 8 },
  resetBtnText: { fontSize: 14, color: "#E53935", fontWeight: "600" },
  saveBar: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
});
