import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "../../components/AppText";
import { DatePickerInput } from "../../components/DatePickerInput";
import {
  exportService,
  type ExportDateField,
  type ExportDescription,
  type ExportFileInfo,
} from "../../services/export.service";
import { getStoredJson, setStoredJson } from "../../utils/storage";
import { useUndoable } from "../../context/UndoContext";

const PREFS_KEY = "export.prefs";
const BLUE = "#1976D2";

interface Prefs {
  fields: string[];
  sheets: string[];
  dateField: ExportDateField;
}

const DATE_FIELDS: { key: ExportDateField; label: string }[] = [
  { key: "created", label: "Создание карточки" },
  { key: "published", label: "Публикация на Ozon" },
  { key: "updated", label: "Последнее изменение" },
];

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function localMidnight(isoDate: string, addDays = 0): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d + addDays);
}

function ru(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

type Preset = { key: string; label: string; range: () => [string, string] };

const PRESETS: Preset[] = [
  { key: "today", label: "Сегодня", range: () => [iso(new Date()), iso(new Date())] },
  {
    key: "yesterday",
    label: "Вчера",
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return [iso(d), iso(d)];
    },
  },
  {
    key: "week",
    label: "7 дней",
    range: () => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return [iso(d), iso(new Date())];
    },
  },
  {
    key: "month",
    label: "Этот месяц",
    range: () => {
      const n = new Date();
      return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)];
    },
  },
  {
    key: "prevMonth",
    label: "Прошлый месяц",
    range: () => {
      const n = new Date();
      return [
        iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        iso(new Date(n.getFullYear(), n.getMonth(), 0)),
      ];
    },
  },
  { key: "all", label: "Всё время", range: () => ["", ""] },
];

function ruDateTime(isoString: string): string {
  const d = new Date(isoString);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ruDay(isoString: string): string {
  return ruDateTime(isoString).slice(0, 10);
}

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

const DATE_FIELD_SHORT: Record<ExportDateField, string> = {
  created: "по созданию",
  published: "по публикации",
  updated: "по изменению",
};

/** "01.11.2026 – 30.11.2026, по созданию" from the saved request */
function describePeriod(f: ExportFileInfo): string {
  const { from, to, dateField } = f.params;
  let text: string;
  if (!from && !to) text = "Всё время";
  else {
    // `to` is the exclusive next midnight
    const last = to ? ruDay(new Date(new Date(to).getTime() - 1).toISOString()) : "сегодня";
    text = `${from ? ruDay(from) : "начало"} – ${last}`;
  }
  return `${text}, ${DATE_FIELD_SHORT[dateField] ?? dateField}`;
}

function Check({ on, partial }: { on: boolean; partial?: boolean }) {
  const name = on ? "checkbox" : partial ? "remove-circle" : "square-outline";
  return <Ionicons name={name} size={22} color={on || partial ? BLUE : "#9E9E9E"} />;
}

export function ExportScreen() {
  const [desc, setDesc] = useState<ExportDescription | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<Set<string>>(new Set());
  const [sheets, setSheets] = useState<Set<string>>(new Set());
  const [dateField, setDateField] = useState<ExportDateField>("created");
  const [from, setFrom] = useState(() => PRESETS[3].range()[0]);
  const [to, setTo] = useState(() => PRESETS[3].range()[1]);
  const [open, setOpen] = useState<Set<string>>(new Set(["book"]));
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<ExportFileInfo[] | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const undoable = useUndoable();
  const ready = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadFiles = useCallback(async () => {
    try {
      setFiles(await exportService.list());
    } catch {
      setFiles((prev) => prev ?? []);
    }
  }, []);

  const defaults = useCallback((d: ExportDescription) => {
    return {
      fields: d.groups.flatMap((g) => g.fields.filter((f) => f.default).map((f) => f.key)),
      sheets: d.sheets.filter((s) => s.default).map((s) => s.key),
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await exportService.describe();
      const known = new Set(d.groups.flatMap((g) => g.fields.map((f) => f.key)));
      const knownSheets = new Set(d.sheets.map((s) => s.key));
      let prefs: Prefs | null = null;
      try {
        prefs = await getStoredJson<Prefs>(PREFS_KEY);
      } catch {
        prefs = null;
      }
      const def = defaults(d);
      const savedFields = prefs?.fields.filter((k) => known.has(k)) ?? [];
      setFields(new Set(savedFields.length ? savedFields : def.fields));
      setSheets(new Set(prefs ? prefs.sheets.filter((k) => knownSheets.has(k)) : def.sheets));
      if (prefs?.dateField) setDateField(prefs.dateField);
      setDesc(d);
      ready.current = true;
    } catch (e: any) {
      setLoadError(e?.response?.data?.message ?? e?.message ?? "Не удалось загрузить список полей");
    }
  }, [defaults]);

  useEffect(() => {
    load();
    loadFiles();
  }, [load, loadFiles]);

  // remember the choice for next time
  useEffect(() => {
    if (!ready.current) return;
    setStoredJson(PREFS_KEY, {
      fields: [...fields],
      sheets: [...sheets],
      dateField,
    } as Prefs).catch(() => {});
  }, [fields, sheets, dateField]);

  const period = useMemo(
    () => ({
      from: from ? localMidnight(from).toISOString() : undefined,
      // "по 30.11" includes the whole day
      to: to ? localMidnight(to, 1).toISOString() : undefined,
      dateField,
    }),
    [from, to, dateField],
  );

  const badPeriod = !!from && !!to && from > to;

  useEffect(() => {
    if (badPeriod) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setCounting(true);
    const t = setTimeout(() => {
      exportService
        .count(period)
        .then((n) => !cancelled && setCount(n))
        .catch(() => !cancelled && setCount(null))
        .finally(() => !cancelled && setCounting(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [period, badPeriod]);

  const activePreset = PRESETS.find((p) => {
    const [a, b] = p.range();
    return a === from && b === to;
  })?.key;

  const toggleField = (key: string) =>
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleGroup = (keys: string[]) =>
    setFields((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });

  const toggleSheet = (key: string) =>
    setSheets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allKeys = useMemo(
    () => desc?.groups.flatMap((g) => g.fields.map((f) => f.key)) ?? [],
    [desc],
  );

  /** Android: copy into a folder the admin picks; iOS: share sheet («Сохранить в Файлы») */
  const deliver = async (file: ExportFileInfo) => {
    const uri = await exportService.download(file);
    if (Platform.OS === "android") {
      const saved = await exportService.saveToFolderAndroid(uri, file.fileName);
      if (saved) Alert.alert("Готово", `Файл ${file.fileName} сохранён в выбранную папку.`);
    } else {
      await Share.share({ url: uri, title: file.fileName });
    }
  };

  const handleExport = async () => {
    if (!desc || busy) return;
    if (!fields.size) {
      Alert.alert("Нет полей", "Отметьте хотя бы одно поле для выгрузки.");
      return;
    }
    if (badPeriod) {
      Alert.alert("Период", "Дата начала позже даты окончания.");
      return;
    }
    // keep the screen's order, not the tap order
    const orderedFields = allKeys.filter((k) => fields.has(k));
    const orderedSheets = desc.sheets.map((s) => s.key).filter((k) => sheets.has(k));

    setBusy(true);
    let file: ExportFileInfo;
    try {
      file = await exportService.create({ ...period, fields: orderedFields, sheets: orderedSheets });
      setFiles((prev) => [file, ...(prev ?? []).filter((f) => f.id !== file.id)]);
    } catch (e: any) {
      Alert.alert(
        "Не удалось выгрузить",
        e?.response?.data?.message ?? e?.message ?? "Попробуйте ещё раз",
      );
      return;
    } finally {
      setBusy(false);
    }
    // the file is only downloaded by its button in «Мои выгрузки»; scroll there so it's visible
    scrollRef.current?.scrollToEnd({ animated: true });
    Alert.alert(
      "Выгрузка готова",
      `${file.bookCount.toLocaleString("ru-RU")} карт. Файл в «Мои выгрузки» — скачайте его кнопкой со стрелкой.`,
    );
  };

  const handleDownload = async (file: ExportFileInfo) => {
    if (downloadingId) return;
    setDownloadingId(file.id);
    try {
      await deliver(file);
    } catch (e: any) {
      Alert.alert("Не удалось скачать", e?.message ?? "Попробуйте ещё раз");
      loadFiles();
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (file: ExportFileInfo) => {
    Alert.alert("Удалить выгрузку?", `${file.fileName} удалится с сервера.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () =>
          undoable({
            message: `Выгрузка ${file.fileName} будет удалена`,
            action: async () => {
              try {
                await exportService.remove(file.id);
                setFiles((prev) => (prev ?? []).filter((f) => f.id !== file.id));
              } catch (e: any) {
                Alert.alert("Не удалось удалить", e?.response?.data?.message ?? e?.message ?? "");
              }
            },
          }),
      },
    ]);
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <AppText style={styles.errorText}>{loadError}</AppText>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <AppText style={styles.retryText}>Повторить</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!desc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BLUE} />
      </View>
    );
  }

  const periodText =
    from || to
      ? `${from ? `с ${ru(from)}` : ""}${from && to ? " " : ""}${to ? `по ${ru(to)}` : ""}`
      : "за всё время";

  return (
    <View style={styles.flex}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
        {/* Period */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Период</AppText>
          <View style={styles.chips}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, activePreset === p.key && styles.chipActive]}
                onPress={() => {
                  const [a, b] = p.range();
                  setFrom(a);
                  setTo(b);
                }}
              >
                <AppText style={[styles.chipText, activePreset === p.key && styles.chipTextActive]}>
                  {p.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.dateRow}>
            <View style={styles.flex}>
              <AppText style={styles.fieldLabel}>С</AppText>
              <DatePickerInput value={from} onChange={setFrom} placeholder="Начало" maximumDate={new Date()} />
            </View>
            <View style={styles.flex}>
              <AppText style={styles.fieldLabel}>По (включительно)</AppText>
              <DatePickerInput value={to} onChange={setTo} placeholder="Сегодня" />
            </View>
          </View>
          {badPeriod && <AppText style={styles.errorText}>Дата начала позже даты окончания</AppText>}

          <AppText style={[styles.fieldLabel, { marginTop: 12 }]}>Отбирать карточки по дате</AppText>
          <View style={styles.segment}>
            {DATE_FIELDS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.segmentItem, dateField === f.key && styles.segmentItemActive]}
                onPress={() => setDateField(f.key)}
              >
                <AppText
                  style={[styles.segmentText, dateField === f.key && styles.segmentTextActive]}
                  numberOfLines={2}
                >
                  {f.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
          <AppText style={styles.countText}>
            {counting
              ? "Считаем карточки…"
              : count === null
                ? " "
                : `${periodText}: ${count.toLocaleString("ru-RU")} карт.`}
          </AppText>
        </View>

        {/* Fields */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText style={styles.sectionTitle}>Что включить</AppText>
            <AppText style={styles.muted}>
              {fields.size} из {allKeys.length}
            </AppText>
          </View>
          <View style={styles.chips}>
            <TouchableOpacity style={styles.chip} onPress={() => setFields(new Set(allKeys))}>
              <AppText style={styles.chipText}>Все поля</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => setFields(new Set(defaults(desc).fields))}>
              <AppText style={styles.chipText}>Основные</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => setFields(new Set())}>
              <AppText style={styles.chipText}>Снять всё</AppText>
            </TouchableOpacity>
          </View>

          {desc.groups.map((g) => {
            const keys = g.fields.map((f) => f.key);
            const picked = keys.filter((k) => fields.has(k)).length;
            const isOpen = open.has(g.id);
            return (
              <View key={g.id} style={styles.group}>
                <View style={styles.groupHeader}>
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => toggleGroup(keys)}
                    accessibilityLabel={`Выбрать всю группу ${g.title}`}
                  >
                    <Check on={picked === keys.length} partial={picked > 0} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.groupTitleBtn} onPress={() => toggleOpen(g.id)}>
                    <AppText style={styles.groupTitle}>{g.title}</AppText>
                    <AppText style={styles.muted}>
                      {picked}/{keys.length}
                    </AppText>
                    <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#757575" />
                  </TouchableOpacity>
                </View>
                {isOpen &&
                  g.fields.map((f) => (
                    <TouchableOpacity key={f.key} style={styles.fieldRow} onPress={() => toggleField(f.key)}>
                      <Check on={fields.has(f.key)} />
                      <AppText style={styles.fieldText}>{f.label}</AppText>
                    </TouchableOpacity>
                  ))}
              </View>
            );
          })}
        </View>

        {/* Extra sheets */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Дополнительные листы</AppText>
          <AppText style={styles.sectionDesc}>
            Итоги по тем же карточкам: сколько создал и опубликовал каждый оператор, сколько товаров в
            каждом магазине, сколько карточек за каждый день.
          </AppText>
          {desc.sheets.map((s) => (
            <TouchableOpacity key={s.key} style={styles.fieldRow} onPress={() => toggleSheet(s.key)}>
              <Check on={sheets.has(s.key)} />
              <AppText style={styles.fieldText}>{s.label}</AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Saved exports */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <AppText style={styles.sectionTitle}>Мои выгрузки</AppText>
            <TouchableOpacity hitSlop={8} onPress={loadFiles} accessibilityLabel="Обновить список">
              <Ionicons name="refresh" size={18} color={BLUE} />
            </TouchableOpacity>
          </View>
          <AppText style={styles.sectionDesc}>
            Хранятся на сервере {desc.ttlDays} дней, потом удаляются. Видны только вам.
          </AppText>
          {files === null ? (
            <ActivityIndicator color={BLUE} />
          ) : files.length === 0 ? (
            <AppText style={styles.muted}>Пока нет выгрузок</AppText>
          ) : (
            files.map((f) => (
              <View key={f.id} style={styles.fileRow}>
                <Ionicons name="document-text-outline" size={26} color="#2E7D32" />
                <View style={styles.flex}>
                  <AppText style={styles.fileTitle}>{describePeriod(f)}</AppText>
                  <AppText style={styles.muted}>
                    {f.bookCount.toLocaleString("ru-RU")} карт. · {f.params.fields.length} полей ·{" "}
                    {fileSize(f.sizeBytes)}
                  </AppText>
                  <AppText style={styles.muted}>
                    {ruDateTime(f.createdAt)} · удалится {ruDay(f.expiresAt)}
                  </AppText>
                </View>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleDownload(f)}
                  disabled={!!downloadingId}
                  accessibilityLabel="Скачать"
                >
                  {downloadingId === f.id ? (
                    <ActivityIndicator size="small" color={BLUE} />
                  ) : (
                    <Ionicons name="download-outline" size={22} color={BLUE} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleDelete(f)}
                  accessibilityLabel="Удалить"
                >
                  <Ionicons name="trash-outline" size={22} color="#D32F2F" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.exportBtn, (busy || !fields.size || badPeriod || count === 0) && styles.exportBtnDisabled]}
          disabled={busy || !fields.size || badPeriod || count === 0}
          onPress={handleExport}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <AppText style={styles.exportBtnText}>
                {count === 0 ? "Нет карточек за период" : "Сформировать выгрузку"}
              </AppText>
            </>
          )}
        </TouchableOpacity>
        {busy && (
          <AppText style={styles.footerHint}>
            Готовим файл на сервере, на больших периодах это до минуты…
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#F5F5F5" },
  container: { padding: 16, paddingBottom: 32, backgroundColor: "#F5F5F5", flexGrow: 1 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#212121", marginBottom: 8 },
  sectionDesc: { fontSize: 13, color: "#757575", marginBottom: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  muted: { fontSize: 13, color: "#757575" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BBDEFB",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontSize: 13, color: BLUE },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  dateRow: { flexDirection: "row", gap: 12 },
  fieldLabel: { fontSize: 12, color: "#757575", marginBottom: 4 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: BLUE, borderRadius: 8, overflow: "hidden" },
  segmentItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  segmentItemActive: { backgroundColor: BLUE },
  segmentText: { fontSize: 12, color: BLUE, textAlign: "center" },
  segmentTextActive: { color: "#fff", fontWeight: "600" },
  countText: { marginTop: 12, fontSize: 14, color: "#424242" },
  group: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E0E0E0" },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  groupTitleBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: "#212121" },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingLeft: 4 },
  fieldText: { flex: 1, fontSize: 14, color: "#212121" },
  footer: {
    padding: 12,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0E0E0",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 14,
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  footerHint: { marginTop: 6, fontSize: 12, color: "#757575", textAlign: "center" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0E0E0",
  },
  fileTitle: { fontSize: 14, fontWeight: "600", color: "#212121" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#D32F2F", fontSize: 13, marginTop: 6, textAlign: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: BLUE, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});
