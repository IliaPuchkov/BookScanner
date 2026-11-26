import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppText } from "./AppText";
import {
  cardPipelineService,
  type OzonCatalogAttribute,
  type OzonDictionaryValue,
} from "../services/cardPipeline.service";

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <AppText style={styles.headerTitle}>{title}</AppText>
      <TouchableOpacity onPress={onClose} hitSlop={10}>
        <AppText style={styles.close}>Закрыть</AppText>
      </TouchableOpacity>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <AppText style={[styles.badgeText, { color }]}>{text}</AppText>
    </View>
  );
}

/**
 * Picks an attribute from Ozon's catalogue (all categories of the payload config). Attributes
 * already in the config and parts of complex attributes are shown but can't be picked.
 */
export function OzonAttributePicker({
  attributes,
  categories,
  currentId,
  onPick,
  onClose,
}: {
  attributes: OzonCatalogAttribute[];
  categories: string[];
  /** the attribute being edited — it may keep its own id */
  currentId?: number;
  onPick: (a: OzonCatalogAttribute) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return attributes;
    return attributes.filter(
      (a) => a.name.toLowerCase().includes(needle) || String(a.id) === needle || a.groupName.toLowerCase().includes(needle),
    );
  }, [attributes, q]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header title="Атрибуты Ozon" onClose={onClose} />
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Поиск по названию или ID"
            placeholderTextColor="#aaa"
            autoCorrect={false}
          />
          <AppText style={styles.meta}>
            {list.length} из {attributes.length} · категории: {categories.join(", ")}
          </AppText>
        </View>
        <FlatList
          data={list}
          keyExtractor={(a) => String(a.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item: a }) => {
            const taken = !!a.usedBy && a.id !== currentId;
            const disabled = taken || a.complex;
            const partial = a.categories.length < categories.length;
            return (
              <TouchableOpacity
                style={[styles.row, disabled && styles.rowDisabled]}
                onPress={() => onPick(a)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <AppText style={styles.rowTitle}>
                  {a.name} <AppText style={styles.rowId}>· {a.id}</AppText>
                </AppText>
                <View style={styles.badges}>
                  {a.isRequired && <Badge text={`обязательный${a.requiredIn.length < categories.length ? `: ${a.requiredIn.join(", ")}` : ""}`} color="#C62828" />}
                  {a.dictionaryId > 0 && <Badge text="словарь" color="#1976D2" />}
                  {a.isCollection && <Badge text="несколько значений" color="#6A1B9A" />}
                  {partial && <Badge text={`только: ${a.categories.join(", ")}`} color="#E65100" />}
                  {taken && <Badge text="уже отправляется" color="#2E7D32" />}
                  {a.complex && <Badge text="сложный — нельзя" color="#757575" />}
                </View>
                {!!a.description && (
                  <AppText style={styles.desc} numberOfLines={3}>
                    {a.description}
                  </AppText>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Picks a value from the dictionary of an Ozon attribute (search from 2 characters). */
export function OzonValuePicker({
  attributeId,
  attributeName,
  onPick,
  onClose,
}: {
  attributeId: number;
  attributeName: string;
  onPick: (v: OzonDictionaryValue) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [values, setValues] = useState<OzonDictionaryValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await cardPipelineService.searchOzonValues(attributeId, q);
          if (my === seq.current) setValues(res.values);
        } catch (e: any) {
          if (my === seq.current) {
            setValues([]);
            setError(e?.response?.data?.message ?? "Не удалось загрузить словарь");
          }
        } finally {
          if (my === seq.current) setLoading(false);
        }
      },
      q ? 400 : 0,
    );
    return () => clearTimeout(t);
  }, [attributeId, q]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header title={`Словарь: ${attributeName}`} onClose={onClose} />
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Начните вводить значение (от 2 букв)"
            placeholderTextColor="#aaa"
            autoCorrect={false}
            autoFocus
          />
        </View>
        {loading ? (
          <ActivityIndicator color="#1976D2" style={{ marginTop: 24 }} />
        ) : error ? (
          <AppText style={styles.error}>{error}</AppText>
        ) : (
          <FlatList
            data={values}
            keyExtractor={(v) => String(v.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<AppText style={styles.empty}>Ничего не найдено</AppText>}
            renderItem={({ item: v }) => (
              <TouchableOpacity style={styles.row} onPress={() => onPick(v)} activeOpacity={0.7}>
                <AppText style={styles.rowTitle}>{v.value}</AppText>
                <AppText style={styles.rowId}>ID {v.id}{v.info ? ` · ${v.info}` : ""}</AppText>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: "#1976D2",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600", flex: 1, marginRight: 12 },
  close: { color: "#fff", fontSize: 15 },
  searchWrap: { padding: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    backgroundColor: "#FAFAFA",
    color: "#222",
  },
  meta: { fontSize: 12, color: "#888", marginTop: 6 },
  row: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  rowDisabled: { opacity: 0.45 },
  rowTitle: { fontSize: 15, color: "#222", fontWeight: "600" },
  rowId: { fontSize: 12, color: "#999", fontWeight: "400" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  desc: { fontSize: 12, color: "#777", marginTop: 6 },
  error: { color: "#C62828", textAlign: "center", margin: 24 },
  empty: { color: "#999", textAlign: "center", margin: 24 },
});
