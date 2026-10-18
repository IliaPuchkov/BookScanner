import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  StyleSheet,
} from "react-native";
import { AppText } from "./AppText";
import { adminService, type CopySetOption } from "../services/admin.service";
import type { Book } from "../types";
import { thumbUri } from "../utils/photos";
import { pluralRu } from "../utils/format";
import { bookEvents } from "../utils/bookEvents";
import { useUndoable } from "../context/UndoContext";

/**
 * Adds a book to an existing copy set by hand (book card, book database). Opens with the sets
 * that look like the book; the search finds any set by title, author, ISBN or SKU. The server
 * moves the book out of its own set and carries the set's "not copies" over to it.
 */
export function CopySetPicker({
  book,
  onClose,
  onMoved,
}: {
  /** The book to add; null hides the picker */
  book: Book | null;
  onClose: () => void;
  onMoved?: (updated: Book) => void;
}) {
  const undoable = useUndoable();
  const [search, setSearch] = useState("");
  const [sets, setSets] = useState<CopySetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (book) setSearch("");
  }, [book]);

  useEffect(() => {
    if (!book) return;
    const request = ++requestRef.current;
    setLoading(true);
    setFailed(false);
    const t = setTimeout(
      () => {
        adminService
          .findCopySets(book.id, search.trim() || undefined)
          .then((res) => {
            if (requestRef.current === request) setSets(res.sets);
          })
          .catch(() => {
            if (requestRef.current === request) setFailed(true);
          })
          .finally(() => {
            if (requestRef.current === request) setLoading(false);
          });
      },
      search ? 400 : 0,
    );
    return () => clearTimeout(t);
  }, [book, search]);

  const choose = (set: CopySetOption) => {
    if (!book) return;
    const target = book;
    const notes = [
      `«${target.title}» станет копией набора «${set.title}» (${set.count} ${pluralRu(set.count, "книга", "книги", "книг")}).`,
      "Решения «не копия» этого набора перейдут на книгу.",
      target.copyGroupId ? "Из своего текущего набора книга будет убрана." : "",
      target.isCopyMaster ? "Она была основной копией — основной в старом наборе станет другая книга." : "",
    ].filter(Boolean);
    Alert.alert("Добавить в набор копий?", notes.join(" "), [
      { text: "Отмена", style: "cancel" },
      {
        text: "Добавить",
        onPress: () => {
          onClose();
          undoable({
            message: `«${target.title}» будет добавлена в набор копий`,
            action: async () => {
              try {
                const res = await adminService.moveToCopySet(target.id, set.copyGroupId);
                bookEvents.emitBookUpdated(res.book);
                onMoved?.(res.book);
                if (res.oldSetMaster) {
                  Alert.alert("Готово", `Основной копией в старом наборе стала ${res.oldSetMaster}.`);
                }
              } catch {
                Alert.alert("Ошибка", "Не удалось добавить книгу в набор копий");
              }
            },
          });
        },
      },
    ]);
  };

  return (
    <Modal visible={book !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <View style={styles.header}>
                  <AppText style={styles.title}>Добавить в набор копий</AppText>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <AppText style={styles.close}>Закрыть</AppText>
                  </TouchableOpacity>
                </View>
                {book ? (
                  <AppText style={styles.subtitle} numberOfLines={2}>
                    {book.title} · {book.sku}
                  </AppText>
                ) : null}
                <TextInput
                  style={styles.search}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Название, автор, ISBN или SKU набора"
                  placeholderTextColor="#aaa"
                  clearButtonMode="while-editing"
                />
                {!search && sets.length > 0 && (
                  <AppText style={styles.hint}>Похожие на эту книгу наборы</AppText>
                )}
                {loading && sets.length === 0 ? (
                  <ActivityIndicator style={{ marginVertical: 24 }} color="#00838F" />
                ) : (
                  <FlatList
                    data={sets}
                    keyExtractor={(s) => s.copyGroupId}
                    keyboardShouldPersistTaps="handled"
                    style={styles.list}
                    renderItem={({ item }) => {
                      const cover = item.books[0]?.photos?.find((p) => p.sortOrder === 0);
                      return (
                        <TouchableOpacity style={styles.row} onPress={() => choose(item)} activeOpacity={0.7}>
                          {cover ? (
                            <Image source={{ uri: thumbUri(cover) }} style={styles.thumb} />
                          ) : (
                            <View style={[styles.thumb, styles.thumbEmpty]}>
                              <AppText style={styles.thumbEmptyText}>Нет фото</AppText>
                            </View>
                          )}
                          <View style={styles.info}>
                            <AppText style={styles.setTitle} numberOfLines={2}>
                              {item.title}
                            </AppText>
                            {item.author ? (
                              <AppText style={styles.setAuthor} numberOfLines={1}>
                                {item.author}
                              </AppText>
                            ) : null}
                            <View style={styles.metaRow}>
                              <AppText style={styles.count}>
                                {item.count} {pluralRu(item.count, "книга", "книги", "книг")}
                              </AppText>
                              {item.suggested && (
                                <View style={styles.suggested}>
                                  <AppText style={styles.suggestedText}>Похож</AppText>
                                </View>
                              )}
                            </View>
                            <AppText style={styles.skus} numberOfLines={1}>
                              {item.books.map((b) => b.sku).join(" · ")}
                            </AppText>
                          </View>
                          <AppText style={styles.arrow}>›</AppText>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      loading ? null : (
                        <AppText style={styles.empty}>
                          {failed
                            ? "Не удалось загрузить наборы. Проверьте связь и попробуйте ещё раз."
                            : search
                              ? "Наборов не найдено. Попробуйте другое слово или SKU."
                              : "Похожих наборов не нашлось. Найдите набор по названию, автору, ISBN или SKU."}
                        </AppText>
                      )
                    }
                  />
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "85%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 17, fontWeight: "700", color: "#222" },
  close: { fontSize: 15, color: "#1976D2", fontWeight: "600" },
  subtitle: { fontSize: 13, color: "#777", marginBottom: 12 },
  search: {
    height: 40,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#FAFAFA",
    marginBottom: 10,
  },
  hint: { fontSize: 11, fontWeight: "700", color: "#8A8A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e5e5",
  },
  thumb: { width: 44, height: 62, borderRadius: 6, backgroundColor: "#f0f0f0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { fontSize: 8, color: "#bbb" },
  info: { flex: 1, minWidth: 0, gap: 2 },
  setTitle: { fontSize: 14, fontWeight: "600", color: "#222" },
  setAuthor: { fontSize: 12, color: "#888" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  count: { fontSize: 12, color: "#2E7D32", fontWeight: "600" },
  suggested: { backgroundColor: "#E0F2F1", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  suggestedText: { fontSize: 11, fontWeight: "700", color: "#00796B" },
  skus: { fontSize: 11, color: "#aaa" },
  arrow: { fontSize: 22, color: "#bbb" },
  empty: { fontSize: 14, color: "#888", textAlign: "center", marginVertical: 24, paddingHorizontal: 8 },
});
