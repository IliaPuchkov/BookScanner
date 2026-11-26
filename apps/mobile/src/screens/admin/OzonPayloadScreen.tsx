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
import {
  AttributeEditor,
  clone,
  sourceSummary,
  toInt,
  type Catalog,
  type Dicts,
} from "../../components/OzonAttributeEditor";
import {
  cardPipelineService,
  type OzonAttrRule,
  type OzonPayloadConfig,
  type OzonPayloadPreview,
  configCategories,
} from "../../services/cardPipeline.service";
import { CategoryRuleEditor } from "../../components/OzonCategoryEditor";
import { settingsStyles as s } from "./settingsStyles";

// ─── Screen ──────────────────────────────────────────────────────────────────

export function OzonPayloadScreen() {
  const [saved, setSaved] = useState<OzonPayloadConfig | null>(null);
  const [standard, setStandard] = useState<OzonPayloadConfig | null>(null);
  const [draft, setDraft] = useState<OzonPayloadConfig | null>(null);
  const [dicts, setDicts] = useState<Dicts>({ fields: {}, builtins: {}, ops: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ index: number; rule: OzonAttrRule } | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);
  const [vatText, setVatText] = useState("");
  const [maxImagesText, setMaxImagesText] = useState("");

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const loadCatalog = useCallback(async (): Promise<boolean> => {
    if (catalog) return true;
    try {
      setCatalog(await cardPipelineService.getOzonAttributes());
      return true;
    } catch (e: any) {
      Alert.alert("Атрибуты Ozon", e?.response?.data?.message ?? "Не удалось получить список атрибутов от Ozon");
      return false;
    }
  }, [catalog]);

  const [sku, setSku] = useState("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<OzonPayloadPreview | null>(null);
  const [showJson, setShowJson] = useState(false);

  const applyLoaded = (c: OzonPayloadConfig) => {
    setSaved(clone(c));
    setDraft(clone(c));
    setVatText(c.vat);
    setMaxImagesText(String(c.maxImages));
  };

  const load = useCallback(async () => {
    try {
      const res = await cardPipelineService.getOzonPayloadConfig();
      applyLoaded(res.config);
      setStandard(res.standard);
      setDicts({ fields: res.fields, builtins: res.builtins, ops: res.ops ?? {} });
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить настройку сборки карточки");
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

  /** The draft with the text inputs of the general block applied */
  const current = (): OzonPayloadConfig | null =>
    draft && { ...draft, vat: vatText.trim().replace(",", "."), maxImages: toInt(maxImagesText) ?? 0 };

  const dirty = !!saved && JSON.stringify(current()) !== JSON.stringify(saved);

  const update = (patch: Partial<OzonPayloadConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const handleSave = async () => {
    const c = current();
    if (!c) return;
    setSaving(true);
    try {
      applyLoaded(await cardPipelineService.saveOzonPayloadConfig(c));
      Alert.alert("Готово", "Настройка сохранена. Новые публикации пойдут по ней.");
    } catch (e: any) {
      Alert.alert("Не сохранено", e?.response?.data?.message ?? "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    const c = current();
    if (!c || !sku.trim()) {
      Alert.alert("Проверка", "Введите SKU книги");
      return;
    }
    setChecking(true);
    try {
      setPreview(await cardPipelineService.previewOzonPayload({ sku: sku.trim(), config: c }));
      setShowJson(false);
    } catch (e: any) {
      setPreview(null);
      Alert.alert("Не удалось проверить", e?.response?.data?.message ?? "Попробуйте ещё раз");
    } finally {
      setChecking(false);
    }
  };

  if (loading || !draft) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#1976D2" />
      </View>
    );
  }

  const item = preview?.payload.items?.[0] as Record<string, any> | undefined;

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
          <AppText style={s.sectionTitle}>Сборка карточки Ozon</AppText>
          <AppText style={s.sectionDesc}>
            Как готовая карточка превращается в товар Ozon: категория, атрибуты и их значения. Пустые поля
            карточки уже заполнены «Значениями по умолчанию». Изменения действуют на новые публикации.
          </AppText>
        </View>

        {/* General */}
        <View style={s.card}>
          <AppText style={s.sectionTitle}>Общее</AppText>
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <AppText style={styles.fieldLabel}>НДС (0, 0.1, 0.2…)</AppText>
              <TextInput style={styles.input} value={vatText} onChangeText={setVatText} keyboardType="decimal-pad" />
            </View>
            <View style={styles.gridCell}>
              <AppText style={styles.fieldLabel}>Фото, не больше</AppText>
              <TextInput style={styles.input} value={maxImagesText} onChangeText={setMaxImagesText} keyboardType="number-pad" />
            </View>
          </View>
          <AppText style={styles.fieldLabel}>Префикс аннотации</AppText>
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            value={draft.annotation.prefix}
            onChangeText={(prefix) => update({ annotation: { ...draft.annotation, prefix } })}
            multiline
          />
          <View style={styles.switchRow}>
            <AppText style={styles.switchLabel}>Убирать ссылки из аннотации</AppText>
            <Switch
              value={draft.annotation.stripLinks}
              onValueChange={(stripLinks) => update({ annotation: { ...draft.annotation, stripLinks } })}
            />
          </View>
        </View>

        {/* Attributes */}
        <View style={s.card}>
          <AppText style={s.sectionTitle}>Атрибуты ({draft.attributes.filter((a) => a.enabled).length} из {draft.attributes.length})</AppText>
          <AppText style={s.sectionDesc}>Нажмите на атрибут, чтобы изменить. Обязательные помечены ★.</AppText>
          <TouchableOpacity style={styles.attrRow} onPress={() => setEditingCategory(true)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.attrTitle}>★ Категория Ozon</AppText>
              <AppText style={styles.attrSource} numberOfLines={2}>
                {draft.category.default.label}
                {draft.category.conditions?.length ? ` · условий: ${draft.category.conditions.length}` : ""}
              </AppText>
            </View>
            <AppText style={styles.chevron}>›</AppText>
          </TouchableOpacity>
          {draft.attributes.map((a, i) => (
            <TouchableOpacity key={a.key} style={styles.attrRow} onPress={() => setEditing({ index: i, rule: a })} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.attrTitle, !a.enabled && styles.attrOff]}>
                  {a.system ? "★ " : ""}
                  {a.label} <AppText style={styles.attrId}>· {a.id}</AppText>
                </AppText>
                <AppText style={styles.attrSource} numberOfLines={1}>
                  {sourceSummary(a.source, dicts)}
                  {a.conditions?.length ? ` · условий: ${a.conditions.length}` : ""}
                  {a.valueMap?.length ? ` · замен: ${a.valueMap.length}` : ""}
                </AppText>
              </View>
              <Switch
                value={a.enabled}
                disabled={a.system}
                onValueChange={(enabled) =>
                  update({ attributes: draft.attributes.map((x, j) => (j === i ? { ...x, enabled } : x)) })
                }
              />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() =>
              setEditing({
                index: -1,
                rule: {
                  key: `custom_${Date.now().toString(36)}`,
                  id: 0,
                  label: "",
                  enabled: true,
                  source: { kind: "const", value: "" },
                  skipIfEmpty: true,
                },
              })
            }
          >
            <AppText style={styles.link}>+ Атрибут</AppText>
          </TouchableOpacity>
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
          <TouchableOpacity style={s.secondaryBtn} onPress={() => saved && applyLoaded(saved)} activeOpacity={0.8}>
            <AppText style={s.secondaryBtnText}>Отменить изменения</AppText>
          </TouchableOpacity>
        )}
        {standard && !saving && (
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => {
              setDraft(clone(standard));
              setVatText(standard.vat);
              setMaxImagesText(String(standard.maxImages));
            }}
            activeOpacity={0.8}
          >
            <AppText style={s.secondaryBtnText}>Вернуть стандартную настройку</AppText>
          </TouchableOpacity>
        )}

        {/* Check on a book */}
        <View style={s.card}>
          <AppText style={s.sectionTitle}>Проверить на книге</AppText>
          <AppText style={s.sectionDesc}>
            Покажет, что уйдёт на Ozon для этой книги с текущими (в том числе несохранёнными) настройками. Ничего не
            отправляется.
          </AppText>
          <View style={styles.checkRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={sku}
              onChangeText={setSku}
              placeholder="SKU, например 12_ABCDEF"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.checkBtn} onPress={handleCheck} disabled={checking}>
              {checking ? <ActivityIndicator size="small" color="#fff" /> : <AppText style={styles.checkBtnText}>Проверить</AppText>}
            </TouchableOpacity>
          </View>

          {preview && item && (
            <View style={{ marginTop: 14 }}>
              <AppText style={styles.previewTitle}>
                {preview.title} · {preview.sku}
              </AppText>
              <AppText style={styles.previewMeta}>
                Категория {item.description_category_id} / тип {item.type_id} · цена {item.price} · НДС {item.vat} · вес{" "}
                {item.weight} г · {item.width}×{item.height}×{item.depth} мм · фото {item.images?.length ?? 0}
              </AppText>
              {preview.category && (
                <AppText style={styles.previewMeta}>
                  Категория: {preview.category.label} ({preview.category.note})
                </AppText>
              )}
              {preview.defaultedFields.length > 0 && (
                <AppText style={styles.previewMeta}>По умолчанию в карточке: {preview.defaultedFields.join(", ")}</AppText>
              )}
              {preview.warnings.map((w, i) => (
                <AppText key={i} style={[styles.warning, w.startsWith("Ошибка") && styles.error]}>
                  ⚠ {w}
                </AppText>
              ))}
              {preview.notes?.map((n, i) => (
                <AppText key={`n${i}`} style={styles.previewMeta}>
                  ⓘ {n}
                </AppText>
              ))}
              {preview.rows.map((r) => (
                <View key={r.id} style={styles.previewRow}>
                  <AppText style={styles.previewLabel}>
                    {r.label} · {r.id}
                    {r.note ? ` · ${r.note}` : ""}
                  </AppText>
                  <AppText style={styles.previewValue} numberOfLines={4}>
                    {r.value || "—"}
                  </AppText>
                </View>
              ))}
              <TouchableOpacity onPress={() => setShowJson((v) => !v)}>
                <AppText style={styles.link}>{showJson ? "Скрыть JSON" : "Показать JSON"}</AppText>
              </TouchableOpacity>
              {showJson && (
                <ScrollView horizontal style={styles.jsonBox}>
                  <AppText style={styles.json} selectable>
                    {JSON.stringify(preview.payload, null, 2)}
                  </AppText>
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {editingCategory && (
        <CategoryRuleEditor
          category={draft.category}
          dicts={dicts}
          attributes={draft.attributes}
          onCancel={() => setEditingCategory(false)}
          onDone={(category) => {
            update({ category });
            setEditingCategory(false);
          }}
        />
      )}

      {editing && (
        <AttributeEditor
          rule={editing.rule}
          isNew={editing.index < 0}
          dicts={dicts}
          allAttributes={draft.attributes}
          categoryLabels={configCategories(draft).map((c) => c.label)}
          catalog={catalog}
          loadCatalog={loadCatalog}
          onCancel={() => setEditing(null)}
          onDone={(rule) => {
            const attrs = [...draft.attributes];
            if (editing.index < 0) attrs.push(rule);
            else attrs[editing.index] = rule;
            update({ attributes: attrs });
            setEditing(null);
          }}
          onDelete={() => {
            update({ attributes: draft.attributes.filter((_, j) => j !== editing.index) });
            setEditing(null);
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#888", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#333",
    backgroundColor: "#FAFAFA",
  },
  link: { color: "#1976D2", fontSize: 14, fontWeight: "600", marginTop: 12 },
  remove: { color: "#E53935", fontSize: 18, fontWeight: "700" },
  hint: { fontSize: 12, color: "#999", textAlign: "center" },
  pickBtn: {
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    alignItems: "center",
  },
  pickBtnText: { color: "#1976D2", fontWeight: "600", fontSize: 14 },
  metaLine: { fontSize: 12, color: "#2E7D32", marginTop: 8 },
  dictIcon: { fontSize: 18 },
  grid: { flexDirection: "row", gap: 10 },
  gridCell: { flex: 1 },
  category: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10, marginTop: 10 },
  categoryHead: { flexDirection: "row", alignItems: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  switchLabel: { fontSize: 14, color: "#333", flex: 1, marginRight: 12 },
  chevron: { fontSize: 20, color: "#1976D2", marginLeft: 8 },
  attrRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  attrTitle: { fontSize: 14, fontWeight: "600", color: "#222" },
  attrOff: { color: "#aaa" },
  attrId: { fontSize: 12, color: "#999", fontWeight: "400" },
  attrSource: { fontSize: 12, color: "#888", marginTop: 2 },
  segmented: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: "#1976D2", overflow: "hidden", marginTop: 6 },
  segment: { flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: "#fff" },
  segmentActive: { backgroundColor: "#1976D2" },
  segmentText: { fontSize: 13, color: "#1976D2" },
  segmentTextActive: { color: "#fff", fontWeight: "600" },
  optionList: { marginTop: 10, gap: 6 },
  option: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#e0e0e0" },
  optionActive: { borderColor: "#1976D2", backgroundColor: "#E3F2FD" },
  optionText: { fontSize: 13, color: "#444" },
  optionTextActive: { color: "#1976D2", fontWeight: "600" },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  mapInput: { flex: 1, paddingHorizontal: 8 },
  mapDict: { width: 64, paddingHorizontal: 6 },
  arrow: { color: "#888" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkBtn: { backgroundColor: "#1976D2", borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14 },
  checkBtnText: { color: "#fff", fontWeight: "600" },
  previewTitle: { fontSize: 15, fontWeight: "700", color: "#222" },
  previewMeta: { fontSize: 12, color: "#666", marginTop: 4 },
  warning: { fontSize: 13, color: "#E65100", marginTop: 6 },
  error: { color: "#C62828", fontWeight: "600" },
  previewRow: { paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#f0f0f0", marginTop: 4 },
  previewLabel: { fontSize: 12, color: "#888" },
  previewValue: { fontSize: 14, color: "#222", marginTop: 2 },
  jsonBox: { marginTop: 8, backgroundColor: "#263238", borderRadius: 8, padding: 10, maxHeight: 400 },
  json: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, color: "#ECEFF1" },
});
