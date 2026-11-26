import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  Switch,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppText } from "./AppText";
import { OzonAttributePicker, OzonValuePicker } from "./OzonPickers";
import { settingsStyles as s } from "../screens/admin/settingsStyles";
import {
  OZON_UNARY_OPS,
  type OzonAttrCondition,
  type OzonAttrRule,
  type OzonAttrSource,
  type OzonCatalogAttribute,
  type OzonCondAction,
  type OzonCondCheck,
  type OzonCondOperand,
} from "../services/cardPipeline.service";

/** Labels from GET /ozon/payload-config */
export type Dicts = {
  fields: Record<string, string>;
  builtins: Record<string, string>;
  ops: Record<string, string>;
};

/** Ozon's attribute catalogue, loaded on first use */
export type Catalog = { attributes: OzonCatalogAttribute[]; categories: string[] };

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const toInt = (t: string): number | null => {
  const n = parseInt(t.replace(/\s/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

/** What each comparison means, shown in the list of comparisons */
const OP_DESCRIPTIONS: Record<string, string> = {
  eq: "равно",
  ne: "не равно",
  lt: "меньше (числа)",
  lte: "меньше или равно (числа)",
  gt: "больше (числа)",
  gte: "больше или равно (числа)",
  contains: "содержит текст",
  notContains: "не содержит текст",
  empty: "значения нет",
  notEmpty: "значение есть",
};

export function sourceSummary(src: OzonCondAction, dicts: Dicts): string {
  switch (src.kind) {
    case "skip":
      return "не отправлять";
    case "field":
      return `поле «${dicts.fields[src.field] ?? src.field}»`;
    case "const":
      return `«${src.value}»${src.dictionaryValueId ? ` [${src.dictionaryValueId}]` : ""}`;
    case "dictionary":
      return `словарь: «${src.value}» [${src.dictionaryValueId}]`;
    default:
      return `встроенное: ${dicts.builtins[src.builtin]?.split(" (")[0] ?? src.builtin}`;
  }
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.chip, o.value === value && styles.chipActive]}
          onPress={() => onChange(o.value)}
          activeOpacity={0.7}
        >
          <AppText style={[styles.chipText, o.value === value && styles.chipTextActive]}>{o.label}</AppText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** A list of choices in a modal (fields of the card / attributes / built-ins). */
function ChoiceModal({
  title,
  sections,
  onPick,
  onClose,
}: {
  title: string;
  sections: Array<{ title: string; items: Array<{ key: string; label: string; hint?: string }> }>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalHeader}>
        <AppText style={styles.modalTitle}>{title}</AppText>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <AppText style={styles.modalClose}>Закрыть</AppText>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ backgroundColor: "#F5F5F5" }} contentContainerStyle={{ paddingBottom: 32 }}>
        {sections.map((sec) => (
          <View key={sec.title}>
            <AppText style={styles.sectionLabel}>{sec.title}</AppText>
            {sec.items.map((it) => (
              <TouchableOpacity key={it.key} style={styles.choiceRow} onPress={() => onPick(it.key)} activeOpacity={0.7}>
                <AppText style={styles.choiceText}>{it.label}</AppText>
                {!!it.hint && <AppText style={styles.choiceHint}>{it.hint}</AppText>}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </Modal>
  );
}

type SourceKind = OzonCondAction["kind"];

/**
 * Where a value comes from — for the attribute itself and for a condition's action (which may
 * also be «не отправлять»).
 */
function SourceEditor({
  source,
  onChange,
  dicts,
  meta,
  allowSkip,
  onPickDictionary,
}: {
  source: OzonCondAction;
  onChange: (s: OzonCondAction) => void;
  dicts: Dicts;
  meta?: OzonCatalogAttribute;
  allowSkip?: boolean;
  /** opens the dictionary picker; the chosen value comes back through onChange */
  onPickDictionary: () => void;
}) {
  const [choosing, setChoosing] = useState<"field" | "builtin" | null>(null);
  const kinds: Array<{ value: SourceKind; label: string }> = [
    { value: "field", label: "Поле карточки" },
    { value: "const", label: "Значение" },
    { value: "dictionary", label: "Словарь Ozon" },
    { value: "builtin", label: "Встроенное" },
    ...(allowSkip ? [{ value: "skip" as const, label: "Не отправлять" }] : []),
  ];
  const setKind = (kind: SourceKind) => {
    if (kind === source.kind) return;
    if (kind === "field") onChange({ kind, field: Object.keys(dicts.fields)[0] });
    else if (kind === "const") onChange({ kind, value: "" });
    else if (kind === "dictionary") onChange({ kind, value: "", dictionaryValueId: 0 });
    else if (kind === "builtin") onChange({ kind, builtin: Object.keys(dicts.builtins)[0] });
    else onChange({ kind: "skip" });
  };
  const hasDictionary = !!meta && meta.dictionaryId > 0;

  return (
    <View>
      <Chips options={kinds} value={source.kind} onChange={setKind} />

      {source.kind === "field" && (
        <TouchableOpacity style={styles.selectBtn} onPress={() => setChoosing("field")}>
          <AppText style={styles.selectText}>{dicts.fields[source.field] ?? source.field}</AppText>
          <AppText style={styles.selectArrow}>›</AppText>
        </TouchableOpacity>
      )}

      {source.kind === "builtin" && (
        <TouchableOpacity style={styles.selectBtn} onPress={() => setChoosing("builtin")}>
          <AppText style={styles.selectText}>{dicts.builtins[source.builtin] ?? source.builtin}</AppText>
          <AppText style={styles.selectArrow}>›</AppText>
        </TouchableOpacity>
      )}

      {source.kind === "const" && (
        <>
          <TextInput
            style={[styles.input, { minHeight: 44, textAlignVertical: "top" }]}
            value={source.value}
            onChangeText={(value) => onChange({ ...source, value })}
            placeholder="Текст, который уйдёт на Ozon"
            placeholderTextColor="#aaa"
            multiline
          />
          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            value={source.dictionaryValueId ? String(source.dictionaryValueId) : ""}
            onChangeText={(t) => onChange({ ...source, dictionaryValueId: toInt(t) })}
            placeholder="ID значения в словаре (необязательно)"
            placeholderTextColor="#aaa"
            keyboardType="number-pad"
          />
        </>
      )}

      {source.kind === "dictionary" &&
        (hasDictionary ? (
          <TouchableOpacity style={styles.selectBtn} onPress={onPickDictionary}>
            <AppText style={[styles.selectText, !source.value && { color: "#aaa" }]}>
              {source.value ? `${source.value} [${source.dictionaryValueId}]` : "Выбрать значение из словаря"}
            </AppText>
            <AppText style={styles.selectArrow}>›</AppText>
          </TouchableOpacity>
        ) : (
          <AppText style={styles.warn}>
            {meta
              ? "У этого атрибута нет словаря Ozon — используйте «Значение»"
              : "Сначала выберите атрибут из списка Ozon — словарь берётся оттуда"}
          </AppText>
        ))}

      {choosing && (
        <ChoiceModal
          title={choosing === "field" ? "Поле карточки" : "Встроенная логика"}
          sections={[
            {
              title: choosing === "field" ? "Поля" : "Логика",
              items: Object.entries(choosing === "field" ? dicts.fields : dicts.builtins).map(([key, label]) => ({
                key,
                label,
              })),
            },
          ]}
          onClose={() => setChoosing(null)}
          onPick={(key) => {
            onChange(choosing === "field" ? { kind: "field", field: key } : { kind: "builtin", builtin: key });
            setChoosing(null);
          }}
        />
      )}
    </View>
  );
}

type Picking =
  | { kind: "attr" }
  | { kind: "dict"; target: "main" | number }
  | { kind: "map"; index: number }
  | { kind: "operand"; cond: number; check: number }
  | { kind: "op"; cond: number; check: number }
  | null;

/** The attribute editor modal of «Сборка карточки Ozon». */
export function AttributeEditor({
  rule,
  isNew,
  dicts,
  allAttributes,
  catalog,
  loadCatalog,
  onDone,
  onDelete,
  onCancel,
}: {
  rule: OzonAttrRule;
  isNew: boolean;
  dicts: Dicts;
  /** the draft's attributes — conditions may look at them */
  allAttributes: OzonAttrRule[];
  catalog: Catalog | null;
  /** loads the catalogue (once); resolves false when Ozon could not be reached */
  loadCatalog: () => Promise<boolean>;
  onDone: (r: OzonAttrRule) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState<OzonAttrRule>(clone(rule));
  const [idText, setIdText] = useState(rule.id ? String(rule.id) : "");
  const [picking, setPicking] = useState<Picking>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const meta = catalog?.attributes.find((a) => a.id === toInt(idText));
  const isDictionary = !!meta && meta.dictionaryId > 0;
  const conditions = r.conditions ?? [];
  const otherAttributes = allAttributes.filter((a) => a.key !== r.key);

  useEffect(() => {
    // the catalogue tells whether the attribute has a dictionary
    if (!catalog && idText) loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAttributePicker = async () => {
    if (!catalog) {
      setLoadingCatalog(true);
      const ok = await loadCatalog();
      setLoadingCatalog(false);
      if (!ok) return;
    }
    setPicking({ kind: "attr" });
  };

  const setConditions = (next: OzonAttrCondition[]) => setR((cur) => ({ ...cur, conditions: next }));
  const setCondition = (i: number, patch: Partial<OzonAttrCondition>) =>
    setConditions(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setCheck = (ci: number, ki: number, patch: Partial<OzonCondCheck>) =>
    setCondition(ci, { checks: conditions[ci].checks.map((k, j) => (j === ki ? { ...k, ...patch } : k)) });
  const moveCondition = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= conditions.length) return;
    const next = [...conditions];
    [next[i], next[j]] = [next[j], next[i]];
    setConditions(next);
  };

  const operandLabel = (o: OzonCondOperand): string => {
    if (o.kind === "field") return dicts.fields[o.field] ?? o.field;
    const a = allAttributes.find((x) => x.id === o.attrId);
    return a ? `атрибут «${a.label}» (${a.id})` : `атрибут ${o.attrId}`;
  };

  const sourceError = (src: OzonCondAction): string | null => {
    if (src.kind === "const" && !src.value.trim()) return "пустое значение";
    if (src.kind === "dictionary" && (!src.value || !src.dictionaryValueId)) return "не выбрано значение из словаря";
    return null;
  };

  const done = () => {
    const id = toInt(idText);
    if (!id || id <= 0) {
      Alert.alert("Ошибка", "ID атрибута — целое число из справочника Ozon");
      return;
    }
    if (!r.label.trim()) {
      Alert.alert("Ошибка", "Укажите название");
      return;
    }
    const srcErr = sourceError(r.source);
    if (srcErr) {
      Alert.alert("Ошибка", `Откуда значение: ${srcErr}`);
      return;
    }
    for (const [i, c] of conditions.entries()) {
      for (const k of c.checks) {
        if (!OZON_UNARY_OPS.includes(k.op) && !(k.value ?? "").trim()) {
          Alert.alert("Ошибка", `Условие ${i + 1}: укажите, с чем сравнивать`);
          return;
        }
      }
      const actErr = sourceError(c.action);
      if (actErr) {
        Alert.alert("Ошибка", `Условие ${i + 1}: ${actErr}`);
        return;
      }
      if (r.system && c.action.kind === "skip") {
        Alert.alert("Ошибка", `Условие ${i + 1}: обязательный атрибут нельзя не отправлять`);
        return;
      }
    }
    const out: OzonAttrRule = {
      ...r,
      id,
      label: r.label.trim(),
      valueMap: (r.valueMap ?? []).filter((m) => m.from.trim()),
    };
    if (!conditions.length) delete out.conditions;
    onDone(out);
  };

  const valueMap = r.valueMap ?? [];
  const setMap = (i: number, patch: Partial<(typeof valueMap)[0]>) =>
    setR({ ...r, valueMap: valueMap.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const opLabel = (op: string) => `${dicts.ops[op] ?? op}  ${OP_DESCRIPTIONS[op] ?? ""}`.trim();

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          {/* Attribute */}
          <View style={s.card}>
            <AppText style={s.sectionTitle}>{isNew ? "Новый атрибут" : r.label}</AppText>
            {r.system && (
              <AppText style={s.sectionDesc}>Обязательный атрибут: его можно изменить, но не удалить и не выключить.</AppText>
            )}
            <AppText style={styles.fieldLabel}>Название (для себя)</AppText>
            <TextInput style={styles.input} value={r.label} onChangeText={(label) => setR({ ...r, label })} maxLength={100} />
            <AppText style={styles.fieldLabel}>ID атрибута Ozon</AppText>
            <TextInput style={styles.input} value={idText} onChangeText={setIdText} keyboardType="number-pad" />
            <TouchableOpacity style={styles.pickBtn} onPress={openAttributePicker} disabled={loadingCatalog}>
              {loadingCatalog ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <AppText style={styles.pickBtnText}>Выбрать из списка Ozon</AppText>
              )}
            </TouchableOpacity>
            {meta ? (
              <AppText style={styles.metaLine}>
                Ozon: {meta.name}
                {meta.isRequired ? " · обязательный" : ""}
                {isDictionary ? " · значения из словаря" : " · свободный текст"}
                {meta.isCollection ? " · можно несколько" : ""}
                {meta.categories.length < (catalog?.categories.length ?? 0) ? ` · только в: ${meta.categories.join(", ")}` : ""}
              </AppText>
            ) : catalog && toInt(idText) ? (
              <AppText style={styles.warn}>⚠ Такого атрибута нет в категориях из настройки — Ozon может отклонить товар</AppText>
            ) : null}
            {meta?.complex && <AppText style={styles.warn}>⚠ Это часть сложного атрибута — так его отправить нельзя</AppText>}
          </View>

          {/* Source */}
          <View style={s.card}>
            <AppText style={s.sectionTitle}>Откуда значение</AppText>
            <AppText style={s.sectionDesc}>
              {conditions.length ? "Используется, если ни одно условие ниже не сработало." : "Для всех книг."}
            </AppText>
            <SourceEditor
              source={r.source}
              onChange={(source) => setR({ ...r, source: source as OzonAttrSource })}
              dicts={dicts}
              meta={meta}
              onPickDictionary={() => setPicking({ kind: "dict", target: "main" })}
            />
          </View>

          {/* Conditions */}
          <View style={s.card}>
            <AppText style={s.sectionTitle}>Условия</AppText>
            <AppText style={s.sectionDesc}>
              Проверяются сверху вниз, срабатывает первое подходящее. Другие атрибуты проверяются по значению из их
              источника и замен — без их собственных условий.
            </AppText>
            {conditions.map((c, ci) => (
              <View key={ci} style={styles.condition}>
                <View style={styles.condHead}>
                  <AppText style={styles.condTitle}>Условие {ci + 1}</AppText>
                  <View style={styles.condTools}>
                    <TouchableOpacity onPress={() => moveCondition(ci, -1)} hitSlop={8} disabled={ci === 0}>
                      <AppText style={[styles.tool, ci === 0 && styles.toolOff]}>↑</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveCondition(ci, 1)} hitSlop={8} disabled={ci === conditions.length - 1}>
                      <AppText style={[styles.tool, ci === conditions.length - 1 && styles.toolOff]}>↓</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConditions(conditions.filter((_, j) => j !== ci))} hitSlop={8}>
                      <AppText style={styles.remove}>✕</AppText>
                    </TouchableOpacity>
                  </View>
                </View>

                {c.checks.map((k, ki) => (
                  <View key={ki} style={styles.check}>
                    <AppText style={styles.condWord}>{ki === 0 ? "Если" : "и"}</AppText>
                    <TouchableOpacity
                      style={styles.selectBtn}
                      onPress={() => setPicking({ kind: "operand", cond: ci, check: ki })}
                    >
                      <AppText style={styles.selectText}>{operandLabel(k.operand)}</AppText>
                      <AppText style={styles.selectArrow}>›</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.selectBtn}
                      onPress={() => setPicking({ kind: "op", cond: ci, check: ki })}
                    >
                      <AppText style={styles.selectText}>{opLabel(k.op)}</AppText>
                      <AppText style={styles.selectArrow}>›</AppText>
                    </TouchableOpacity>
                    {!OZON_UNARY_OPS.includes(k.op) && (
                      <TextInput
                        style={[styles.input, { marginTop: 6 }]}
                        value={k.value ?? ""}
                        onChangeText={(value) => setCheck(ci, ki, { value })}
                        placeholder="значение, например 2011"
                        placeholderTextColor="#aaa"
                      />
                    )}
                    {c.checks.length > 1 && (
                      <TouchableOpacity
                        onPress={() => setCondition(ci, { checks: c.checks.filter((_, j) => j !== ki) })}
                        hitSlop={8}
                      >
                        <AppText style={styles.removeText}>Убрать проверку</AppText>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() =>
                    setCondition(ci, {
                      checks: [...c.checks, { operand: { kind: "field", field: "yearPublished" }, op: "eq", value: "" }],
                    })
                  }
                >
                  <AppText style={styles.link}>+ И ещё проверка</AppText>
                </TouchableOpacity>

                <AppText style={[styles.condWord, { marginTop: 10 }]}>То</AppText>
                <SourceEditor
                  source={c.action}
                  onChange={(action) => setCondition(ci, { action })}
                  dicts={dicts}
                  meta={meta}
                  allowSkip={!r.system}
                  onPickDictionary={() => setPicking({ kind: "dict", target: ci })}
                />
              </View>
            ))}
            <TouchableOpacity
              onPress={() =>
                setConditions([
                  ...conditions,
                  {
                    checks: [{ operand: { kind: "field", field: "yearPublished" }, op: "lte", value: "" }],
                    action: isDictionary ? { kind: "dictionary", value: "", dictionaryValueId: 0 } : { kind: "const", value: "" },
                  },
                ])
              }
            >
              <AppText style={styles.link}>+ Условие</AppText>
            </TouchableOpacity>
          </View>

          {/* Replacements */}
          <View style={s.card}>
            <AppText style={s.sectionTitle}>Замены значений</AppText>
            <AppText style={s.sectionDesc}>
              Значение целиком (без учёта регистра) заменяется на другое: «было» → «стало» + ID в словаре Ozon. Например
              «мягкий переплет» → «Мягкая обложка». Действуют и для значений из условий.
            </AppText>
            {valueMap.map((m, i) => (
              <View key={i} style={styles.mapRow}>
                <TextInput style={[styles.input, styles.mapInput]} value={m.from} placeholder="было" onChangeText={(from) => setMap(i, { from })} />
                <AppText style={styles.arrow}>→</AppText>
                <TextInput style={[styles.input, styles.mapInput]} value={m.to} placeholder="стало" onChangeText={(to) => setMap(i, { to })} />
                <TextInput
                  style={[styles.input, styles.mapDict]}
                  value={m.dictionaryValueId ? String(m.dictionaryValueId) : ""}
                  placeholder="ID"
                  keyboardType="number-pad"
                  onChangeText={(t) => setMap(i, { dictionaryValueId: toInt(t) })}
                />
                {isDictionary && (
                  <TouchableOpacity onPress={() => setPicking({ kind: "map", index: i })} hitSlop={8}>
                    <AppText style={styles.dictIcon}>📖</AppText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setR({ ...r, valueMap: valueMap.filter((_, j) => j !== i) })} hitSlop={8}>
                  <AppText style={styles.remove}>✕</AppText>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setR({ ...r, valueMap: [...valueMap, { from: "", to: "" }] })}>
              <AppText style={styles.link}>+ Замена</AppText>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <View style={styles.switchRow}>
              <AppText style={styles.switchLabel}>Не отправлять, если пусто</AppText>
              <Switch value={r.skipIfEmpty} onValueChange={(skipIfEmpty) => setR({ ...r, skipIfEmpty })} />
            </View>
            {!r.system && (
              <View style={styles.switchRow}>
                <AppText style={styles.switchLabel}>Отправлять атрибут</AppText>
                <Switch value={r.enabled} onValueChange={(enabled) => setR({ ...r, enabled })} />
              </View>
            )}
          </View>

          <TouchableOpacity style={s.saveBtn} onPress={done} activeOpacity={0.8}>
            <AppText style={s.saveBtnText}>Готово</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={onCancel} activeOpacity={0.8}>
            <AppText style={s.secondaryBtnText}>Отмена</AppText>
          </TouchableOpacity>
          {!r.system && !isNew && (
            <TouchableOpacity style={[s.secondaryBtn, { borderColor: "#E53935" }]} onPress={onDelete} activeOpacity={0.8}>
              <AppText style={[s.secondaryBtnText, { color: "#E53935" }]}>Удалить атрибут</AppText>
            </TouchableOpacity>
          )}
          <AppText style={styles.hint}>Изменения попадут на сервер после «Сохранить» на основном экране.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>

      {picking?.kind === "attr" && catalog && (
        <OzonAttributePicker
          attributes={catalog.attributes}
          categories={catalog.categories}
          currentId={rule.id || undefined}
          onPick={(a) => {
            setIdText(String(a.id));
            if (isNew || !r.label.trim()) setR((cur) => ({ ...cur, label: a.name }));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {(picking?.kind === "dict" || picking?.kind === "map") && meta && (
        <OzonValuePicker
          attributeId={meta.id}
          attributeName={meta.name}
          onClose={() => setPicking(null)}
          onPick={(v) => {
            const chosen = { kind: "dictionary" as const, value: v.value, dictionaryValueId: v.id };
            if (picking.kind === "map") {
              const i = picking.index;
              setR((cur) => ({
                ...cur,
                valueMap: (cur.valueMap ?? []).map((m, j) => (j === i ? { ...m, to: v.value, dictionaryValueId: v.id } : m)),
              }));
            } else if (picking.target === "main") {
              setR((cur) => ({ ...cur, source: chosen }));
            } else {
              const ci = picking.target;
              setR((cur) => ({
                ...cur,
                conditions: (cur.conditions ?? []).map((c, j) => (j === ci ? { ...c, action: chosen } : c)),
              }));
            }
            setPicking(null);
          }}
        />
      )}

      {picking?.kind === "op" && (
        <ChoiceModal
          title="Сравнение"
          sections={[
            {
              title: "Числа и текст",
              items: ["eq", "ne"].map((op) => ({ key: op, label: opLabel(op) })),
            },
            {
              title: "Только числа (год, страницы, тираж, вес…)",
              items: ["lt", "lte", "gt", "gte"].map((op) => ({ key: op, label: opLabel(op) })),
            },
            {
              title: "Текст",
              items: ["contains", "notContains"].map((op) => ({ key: op, label: opLabel(op) })),
            },
            {
              title: "Есть ли значение",
              items: ["empty", "notEmpty"].map((op) => ({ key: op, label: opLabel(op), hint: "сравнивать ни с чем не нужно" })),
            },
          ]}
          onClose={() => setPicking(null)}
          onPick={(op) => {
            setCheck(picking.cond, picking.check, { op });
            setPicking(null);
          }}
        />
      )}

      {picking?.kind === "operand" && (
        <ChoiceModal
          title="Что проверять"
          sections={[
            {
              title: "Поле карточки",
              items: Object.entries(dicts.fields).map(([key, label]) => ({ key: `field:${key}`, label })),
            },
            {
              title: "Значение другого атрибута (как уйдёт на Ozon, без его условий)",
              items: otherAttributes.map((a) => ({
                key: `attr:${a.id}`,
                label: a.label,
                hint: `${a.id}${a.enabled ? "" : " · выключен"}`,
              })),
            },
          ]}
          onClose={() => setPicking(null)}
          onPick={(key) => {
            const [kind, v] = key.split(":");
            const operand: OzonCondOperand = kind === "field" ? { kind: "field", field: v } : { kind: "attr", attrId: Number(v) };
            setCheck(picking.cond, picking.check, { operand });
            setPicking(null);
          }}
        />
      )}
    </Modal>
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
  removeText: { color: "#E53935", fontSize: 12, marginTop: 6 },
  hint: { fontSize: 12, color: "#999", textAlign: "center" },
  warn: { fontSize: 12, color: "#C62828", marginTop: 8 },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: "#ccc", backgroundColor: "#fff" },
  chipActive: { borderColor: "#1976D2", backgroundColor: "#E3F2FD" },
  chipText: { fontSize: 12, color: "#555" },
  chipTextActive: { color: "#1976D2", fontWeight: "600" },
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
  selectText: { flex: 1, fontSize: 14, color: "#333" },
  selectArrow: { fontSize: 18, color: "#1976D2" },
  condition: { borderWidth: 1, borderColor: "#E3F2FD", backgroundColor: "#FAFCFF", borderRadius: 10, padding: 12, marginTop: 10 },
  condHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  condTitle: { fontSize: 14, fontWeight: "700", color: "#1976D2" },
  condTools: { flexDirection: "row", alignItems: "center", gap: 14 },
  tool: { fontSize: 18, color: "#1976D2", fontWeight: "700" },
  toolOff: { color: "#ccc" },
  check: { marginTop: 8 },
  condWord: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  mapRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  mapInput: { flex: 1, paddingHorizontal: 8 },
  mapDict: { width: 64, paddingHorizontal: 6 },
  arrow: { color: "#888" },
  dictIcon: { fontSize: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  switchLabel: { fontSize: 14, color: "#333", flex: 1, marginRight: 12 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: "#1976D2",
  },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "600", flex: 1, marginRight: 12 },
  modalClose: { color: "#fff", fontSize: 15 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", margin: 16, marginBottom: 6 },
  choiceRow: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  choiceText: { fontSize: 15, color: "#222" },
  choiceHint: { fontSize: 12, color: "#999", marginTop: 2 },
});
