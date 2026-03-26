import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  useRoute,
  useNavigation,
  type RouteProp,
} from "@react-navigation/native";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { booksService } from "../../services/books.service";
import { visionService } from "../../services/vision.service";
import type { Book, UpdateBookDto } from "../../types";
import type { OperatorStackParamList } from "../../navigation/OperatorNavigator";

type Route = RouteProp<OperatorStackParamList, "CardDetail">;
type Nav = NativeStackNavigationProp<OperatorStackParamList, "CardDetail">;

const SCREEN_WIDTH = Dimensions.get("window").width;

export function CardDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { bookId } = route.params;
  const editable = route.params.editable ?? false;

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [editing, setEditing] = useState(editable);
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editIsbn, setEditIsbn] = useState("");
  const [editPublisher, setEditPublisher] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editPages, setEditPages] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editDepth, setEditDepth] = useState("");
  const [editLanguage, setEditLanguage] = useState("");

  useEffect(() => {
    booksService
      .getBook(bookId)
      .then((b) => {
        setBook(b);
        populateEditFields(b);
      })
      .catch(() => Alert.alert("Ошибка", "Не удалось загрузить карточку"))
      .finally(() => setLoading(false));
  }, [bookId]);

  const populateEditFields = (b: Book) => {
    setEditTitle(b.title ?? "");
    setEditAuthor(b.author ?? "");
    setEditIsbn(b.isbn ?? "");
    setEditPublisher(b.publisher ?? "");
    setEditYear(b.yearPublished?.toString() ?? "");
    setEditPages(b.pageCount?.toString() ?? "");
    setEditWeight(b.weightGross?.toString() ?? "");
    setEditWidth(b.dimensions?.width?.toString() ?? "");
    setEditHeight(b.dimensions?.height?.toString() ?? "");
    setEditDepth(b.dimensions?.depth?.toString() ?? "");
    setEditLanguage(b.language ?? "");
  };

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      const dto: UpdateBookDto = {
        title: editTitle || undefined,
        author: editAuthor || undefined,
        isbn: editIsbn || undefined,
        publisher: editPublisher || undefined,
        yearPublished: editYear ? parseInt(editYear, 10) : undefined,
        pageCount: editPages ? parseInt(editPages, 10) : undefined,
        weightGross: editWeight ? parseFloat(editWeight) : undefined,
        dimensions:
          editWidth || editHeight || editDepth
            ? {
                width: parseFloat(editWidth) || 0,
                height: parseFloat(editHeight) || 0,
                depth: parseFloat(editDepth) || 0,
              }
            : undefined,
        language: editLanguage || undefined,
      };
      const updated = await booksService.updateBook(book.id, dto);
      setBook(updated);
      setEditing(false);
      Alert.alert("Готово", "Карточка обновлена");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (book) populateEditFields(book);
    setEditing(false);
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await visionService.extract(bookId);
      const updated = await booksService.getBook(bookId);
      setBook(updated);
      populateEditFields(updated);
      Alert.alert("Готово", "Данные обновлены");
    } catch {
      Alert.alert("Ошибка", "Не удалось распознать");
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Удалить карточку?", "Это действие необратимо", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            await booksService.deleteBook(bookId);
            navigation.goBack();
          } catch {
            Alert.alert("Ошибка", "Не удалось удалить");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#999" }}>Карточка не найдена</Text>
      </View>
    );
  }

  const sortedPhotos = [...(book.photos ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const dimValue = editing
    ? `${editHeight} × ${editWidth} × ${editDepth}`
    : book.dimensions
      ? `${book.dimensions.height} × ${book.dimensions.width} × ${book.dimensions.depth} мм`
      : "";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scroll}
      >
        {sortedPhotos.length > 0 && (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.photoScroll}
          >
            {sortedPhotos.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photo.fileUrl }}
                style={styles.photo}
                resizeMode="contain"
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.content}>
          {/* Meta info — always read-only */}
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Артикул</Text>
              <Text style={styles.metaValue}>{book.sku ?? "—"}</Text>
            </View>
            <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Коробка</Text>
              <Text style={styles.metaValue}>{book.box?.boxNumber ?? "—"}</Text>
            </View>
          </View>

          {/* Editable fields */}
          <View style={styles.fieldsBlock}>
            <Field
              label="Название"
              value={editing ? editTitle : book.title}
              editing={editing}
              onChangeText={setEditTitle}
              placeholder="Введите название"
            />
            <Field
              label="Автор"
              value={editing ? editAuthor : book.author}
              editing={editing}
              onChangeText={setEditAuthor}
              placeholder="Введите автора"
            />
            <Field
              label="ISBN"
              value={editing ? editIsbn : book.isbn}
              editing={editing}
              onChangeText={setEditIsbn}
              placeholder="Введите ISBN"
            />
            <Field
              label="Издательство"
              value={editing ? editPublisher : book.publisher}
              editing={editing}
              onChangeText={setEditPublisher}
              placeholder="Введите издательство"
            />
            <Field
              label="Год издания"
              value={editing ? editYear : book.yearPublished?.toString()}
              editing={editing}
              onChangeText={setEditYear}
              keyboardType="numeric"
              placeholder="Например: 2005"
            />
            <Field
              label="Количество страниц"
              value={editing ? editPages : book.pageCount?.toString()}
              editing={editing}
              onChangeText={setEditPages}
              keyboardType="numeric"
              placeholder="Например: 320"
            />
            {/* Dimensions — split into 3 inputs when editing */}
            {editing ? (
              <View>
                <Text style={styles.fieldLabel}>Размеры (мм)</Text>
                <Text style={styles.fieldLabelDimNames}>
                  Длина х Ширина х Высота
                </Text>
                <View style={styles.dimRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editHeight}
                    onChangeText={setEditHeight}
                    keyboardType="numeric"
                    placeholder="В"
                    placeholderTextColor="#bbb"
                  />
                  <Text style={styles.dimSep}>×</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editWidth}
                    onChangeText={setEditWidth}
                    keyboardType="numeric"
                    placeholder="Ш"
                    placeholderTextColor="#bbb"
                  />
                  <Text style={styles.dimSep}>×</Text>

                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editDepth}
                    onChangeText={setEditDepth}
                    keyboardType="numeric"
                    placeholder="Г"
                    placeholderTextColor="#bbb"
                  />
                </View>
              </View>
            ) : (
              <Field
                label="Размеры (Д×Ш×Г)"
                value={dimValue}
                editing={false}
                onChangeText={() => {}}
              />
            )}
            <Field
              label="Вес"
              value={
                editing
                  ? editWeight
                  : book.weightGross
                    ? `${book.weightGross} г`
                    : undefined
              }
              editing={editing}
              onChangeText={setEditWeight}
              keyboardType="numeric"
              placeholder="Например: 450"
              last
            />
            <Field
              label="Язык"
              value={editing ? editLanguage : book.language}
              editing={editing}
              onChangeText={setEditLanguage}
              placeholder="Например: русский"
              last
            />
          </View>

          {/* Action buttons */}
          {editing ? (
            <View style={styles.editActions}>
              <Button
                title="Сохранить"
                onPress={handleSave}
                loading={saving}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Отмена"
                onPress={handleCancelEdit}
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                title="Изменить фото"
                onPress={() => navigation.navigate("PhotoUpload", { bookId })}
                style={{ marginBottom: 10 }}
              />
              {/* <Button
                title="Повторное распознавание"
                onPress={handleExtract}
                loading={extracting}
                variant="secondary"
                style={{ marginBottom: 10 }}
              />
              <Button
                title="Редактировать"
                onPress={() => setEditing(true)}
                style={{ marginBottom: 10 }}
              /> */}
              <Button title="Удалить" onPress={handleDelete} variant="danger" />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  editing,
  onChangeText,
  keyboardType,
  placeholder,
  last,
}: {
  label: string;
  value?: string;
  editing: boolean;
  onChangeText: (t: string) => void;
  keyboardType?: "numeric" | "default";
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editing ? (
        <TextInput
          style={styles.input}
          value={value ?? ""}
          onChangeText={onChangeText}
          keyboardType={keyboardType ?? "default"}
          placeholder={placeholder}
          placeholderTextColor="#bbb"
        />
      ) : (
        <Text style={styles.fieldValue}>{value || "—"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoScroll: {
    height: 450,
  },
  photo: {
    width: SCREEN_WIDTH,
    height: 450,
  },
  content: {
    padding: 16,
  },
  metaBlock: {
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#D0D8F0",
  },
  metaLabel: {
    fontSize: 13,
    color: "#5C6BC0",
    fontWeight: "500",
  },
  metaValue: {
    fontSize: 14,
    color: "#1A237E",
    fontWeight: "700",
  },
  fieldsBlock: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 24,
  },
  fieldRow: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  fieldLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldLabelDimNames: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
    fontWeight: "500",
    letterSpacing: 0.4,
  },

  fieldValue: {
    fontSize: 15,
    color: "#222",
    fontWeight: "400",
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: "#1976D2",
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fff",
    marginTop: 2,
  },
  dimRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dimSep: {
    fontSize: 16,
    color: "#999",
  },
  actions: {
    marginTop: 4,
  },
  editActions: {
    flexDirection: "row",
    marginTop: 4,
  },
});
