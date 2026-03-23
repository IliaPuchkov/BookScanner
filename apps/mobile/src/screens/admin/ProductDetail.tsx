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
import type { Book, UpdateBookDto } from "../../types";
import { BookStatus } from "../../types";
import type { AdminMainStackParamList } from "../../navigation/AdminNavigator";
import { formatPrice, formatDate } from "../../utils/format";

type Route = RouteProp<AdminMainStackParamList, "ProductDetail">;
type Nav = NativeStackNavigationProp<AdminMainStackParamList, "ProductDetail">;

const SCREEN_WIDTH = Dimensions.get("window").width;

// Ozon defaults (mirrored from @bookscanner/shared ozon.constants)
const DEFAULT_WIDTH_MM = 100;
const DEFAULT_LENGTH_MM = 100;
const DEFAULT_THICKNESS_MM = 35;
const DEFAULT_WEIGHT_G = 450;
const DEFAULT_BOOK_TYPE = "Печатная книга";
const DEFAULT_DIRECTION = "Проза";
const DEFAULT_CONDITION = "Хорошая";

interface OzonPreview {
  name: string;
  authorOnCover: string;
  brand: string;
  bookType: string;
  direction: string;
  condition: string;
  annotation: string;
  hashtags: string;
  dimWidth: number;
  dimLength: number;
  dimThickness: number;
  dimString: string;
  weight: number;
  price: number;
  offerId: string;
}

function computeOzonPreview(book: Book): OzonPreview {
  const raw = book.dimensions || { width: 0, height: 0, depth: 0 };
  const dimWidth = raw.width || DEFAULT_WIDTH_MM;
  const dimLength = raw.height || DEFAULT_LENGTH_MM;
  const dimThickness = raw.depth || DEFAULT_THICKNESS_MM;

  return {
    name: book.title,
    authorOnCover: book.author || "Не указан",
    brand: book.publisher || "Нет бренда",
    bookType: book.bookType || DEFAULT_BOOK_TYPE,
    direction: book.direction || DEFAULT_DIRECTION,
    condition: book.condition || DEFAULT_CONDITION,
    annotation: book.annotation || "",
    hashtags: (book.hashtags || []).join(" "),
    dimWidth,
    dimLength,
    dimThickness,
    dimString: `${dimLength}x${dimWidth}x${dimThickness} мм`,
    weight: book.weightGross || DEFAULT_WEIGHT_G,
    price: book.price || 0,
    offerId: book.sku,
  };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  [BookStatus.PENDING_REVIEW]: {
    label: "Ожидает проверки",
    color: "#F57C00",
    bg: "#FFF3E0",
  },
  [BookStatus.PENDING_PUBLICATION]: {
    label: "Ожидает публикации",
    color: "#1976D2",
    bg: "#E3F2FD",
  },
  [BookStatus.PUBLISHED]: {
    label: "Опубликовано",
    color: "#388E3C",
    bg: "#E8F5E9",
  },
  [BookStatus.PUBLICATION_FAILED]: {
    label: "Ошибка публикации",
    color: "#D32F2F",
    bg: "#FFEBEE",
  },
};

export function ProductDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { bookId } = route.params;
  const editable = (route.params as { editable?: boolean }).editable ?? false;

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editIsbn, setEditIsbn] = useState("");
  const [editPublisher, setEditPublisher] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editPages, setEditPages] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editDepth, setEditDepth] = useState("");
  const [editAnnotation, setEditAnnotation] = useState("");
  const [editHashtags, setEditHashtags] = useState("");

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
    setEditPrice(b.price?.toString() ?? "");
    setEditWeight(b.weightGross?.toString() ?? "");
    setEditWidth(b.dimensions?.width?.toString() ?? "");
    setEditHeight(b.dimensions?.height?.toString() ?? "");
    setEditDepth(b.dimensions?.depth?.toString() ?? "");
    setEditAnnotation(b.annotation ?? "");
    setEditHashtags((b.hashtags || []).join(" "));
  };

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      const hashtags = editHashtags.split(/\s+/).filter((h) => h.length > 0);
      const dto: UpdateBookDto = {
        title: editTitle || undefined,
        author: editAuthor || undefined,
        isbn: editIsbn || undefined,
        publisher: editPublisher || undefined,
        yearPublished: editYear ? parseInt(editYear, 10) : undefined,
        pageCount: editPages ? parseInt(editPages, 10) : undefined,
        price: editPrice ? parseFloat(editPrice) : undefined,
        weightGross: editWeight ? parseFloat(editWeight) : undefined,
        dimensions:
          editWidth || editHeight || editDepth
            ? {
                width: parseFloat(editWidth) || 0,
                height: parseFloat(editHeight) || 0,
                depth: parseFloat(editDepth) || 0,
              }
            : undefined,
        annotation: editAnnotation || undefined,
        hashtags: hashtags.length > 0 ? hashtags : undefined,
      };
      const updated = await booksService.updateBook(book.id, dto);
      setBook(updated);
      populateEditFields(updated);
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

  const handlePublish = () => {
    if (!book) return;
    Alert.alert(
      "Загрузить в Озон?",
      `"${book.title}" будет опубликована на Озоне`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Загрузить",
          onPress: async () => {
            setPublishing(true);
            try {
              await booksService.publishToOzon(book.id);
              const updated = await booksService.getBook(bookId);
              setBook(updated);
              Alert.alert("Готово", "Карточка отправлена на модерацию Ozon");
            } catch {
              Alert.alert("Ошибка", "Не удалось загрузить в Озон");
            } finally {
              setPublishing(false);
            }
          },
        },
      ],
    );
  };

  const handleCheckStatus = async () => {
    if (!book) return;
    setCheckingStatus(true);
    try {
      const result = await booksService.checkOzonStatus(book.id);
      const updated = await booksService.getBook(bookId);
      setBook(updated);
      Alert.alert("Статус Ozon", result.message || result.status);
    } catch {
      Alert.alert("Ошибка", "Не удалось проверить статус");
    } finally {
      setCheckingStatus(false);
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

  const ozon = computeOzonPreview(book);
  const sortedPhotos = [...(book.photos ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const statusCfg =
    STATUS_CONFIG[book.status] || STATUS_CONFIG[BookStatus.PENDING_REVIEW];

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
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.content}>
          {editing ? (
            <>
              <EditField
                label="Название"
                value={editTitle}
                onChangeText={setEditTitle}
              />
              <EditField
                label="Автор"
                value={editAuthor}
                onChangeText={setEditAuthor}
              />
              <EditField
                label="ISBN"
                value={editIsbn}
                onChangeText={setEditIsbn}
              />
              <EditField
                label="Издательство"
                value={editPublisher}
                onChangeText={setEditPublisher}
              />
              <EditField
                label="Год"
                value={editYear}
                onChangeText={setEditYear}
                keyboardType="numeric"
              />
              <EditField
                label="Страниц"
                value={editPages}
                onChangeText={setEditPages}
                keyboardType="numeric"
              />
              <EditField
                label="Цена (₽)"
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="numeric"
              />
              <EditField
                label="Вес (г)"
                value={editWeight}
                onChangeText={setEditWeight}
                keyboardType="numeric"
              />
              <Text style={styles.sectionTitle}>Размеры (мм)</Text>
              <View style={styles.dimRow}>
                <EditField
                  label="Ш"
                  value={editWidth}
                  onChangeText={setEditWidth}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <EditField
                  label="В"
                  value={editHeight}
                  onChangeText={setEditHeight}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <EditField
                  label="Г"
                  value={editDepth}
                  onChangeText={setEditDepth}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
              </View>
              <EditField
                label="Аннотация"
                value={editAnnotation}
                onChangeText={setEditAnnotation}
                multiline
              />
              <EditField
                label="Хэштеги (через пробел)"
                value={editHashtags}
                onChangeText={setEditHashtags}
                multiline
              />

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
            </>
          ) : (
            <>
              {/* Header */}
              <Text style={styles.title}>{ozon.name}</Text>
              <View style={styles.headerMeta}>
                <Text style={styles.sku}>SKU: {ozon.offerId}</Text>
                <View style={[styles.badge, { backgroundColor: statusCfg.bg }]}>
                  <Text style={[styles.badgeText, { color: statusCfg.color }]}>
                    {statusCfg.label}
                  </Text>
                </View>
              </View>

              {/* Ozon card attributes */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Карточка Озон</Text>
                <InfoRow label="Название" value={ozon.name} />
                <InfoRow label="Автор на обложке" value={ozon.authorOnCover} />
                <InfoRow label="Бренд" value={ozon.brand} />
                <InfoRow label="Тип" value={ozon.bookType} />
                <InfoRow label="Направление" value={ozon.direction} />
                <InfoRow label="Состояние" value={ozon.condition} />
                <InfoRow label="ISBN" value={book.isbn} />
                <InfoRow label="Издательство" value={book.publisher} />
                <InfoRow label="Год" value={book.yearPublished?.toString()} />
                <InfoRow label="Тип обложки" value={book.coverType} />
                <InfoRow label="Тип бумаги" value={book.paperType} />
                <InfoRow label="Страниц" value={book.pageCount?.toString()} />
                <InfoRow label="Язык" value={book.language} />
                <InfoRow label="Размеры (ДxШxВ)" value={ozon.dimString} />
                <InfoRow label="Вес" value={`${ozon.weight} г`} />
                <InfoRow
                  label="Цена"
                  value={ozon.price > 0 ? formatPrice(ozon.price) : undefined}
                />
              </View>

              {/* Annotation with prefix */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Аннотация (Озон)</Text>
                <View style={styles.annotationBox}>
                  <Text style={styles.annotationText}>{ozon.annotation}</Text>
                </View>
              </View>

              {/* Hashtags */}
              {ozon.hashtags.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Хэштеги</Text>
                  <Text style={styles.hashtagsText}>{ozon.hashtags}</Text>
                </View>
              )}

              {/* Metadata */}
              <View style={styles.metaSection}>
                {book.createdBy && (
                  <Text style={styles.metaText}>
                    Оператор: {book.createdBy.fullName}
                  </Text>
                )}
                <Text style={styles.metaText}>
                  Создана: {formatDate(book.createdAt)}
                </Text>
                {book.publishedToOzon && (
                  <Text style={styles.metaText}>
                    Опубликована: {formatDate(book.publishedToOzon)}
                  </Text>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                {editable && (
                  <Button
                    title="Редактировать"
                    onPress={() => setEditing(true)}
                    style={{ marginBottom: 8 }}
                  />
                )}
                {(book.status === BookStatus.PENDING_REVIEW ||
                  book.status === BookStatus.PUBLICATION_FAILED) && (
                  <Button
                    title="Загрузить в Озон"
                    onPress={handlePublish}
                    loading={publishing}
                    style={{ marginBottom: 8 }}
                  />
                )}
                {(book.status === BookStatus.PENDING_PUBLICATION ||
                  book.status === BookStatus.PUBLISHED) && (
                  <Button
                    title="Проверить статус"
                    onPress={handleCheckStatus}
                    loading={checkingStatus}
                    variant="secondary"
                    style={{ marginBottom: 8 }}
                  />
                )}
                <Button
                  title="Удалить"
                  onPress={handleDelete}
                  variant="danger"
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, !value && styles.rowValueEmpty]}>
        {value || "—"}
      </Text>
    </View>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "numeric" | "default";
  multiline?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.editField, style]}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={[styles.editInput, multiline && styles.editInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        placeholderTextColor="#999"
      />
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
    height: 250,
  },
  photo: {
    width: SCREEN_WIDTH,
    height: 250,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#222",
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 4,
  },
  sku: {
    fontSize: 13,
    color: "#999",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    marginTop: 20,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  rowLabel: {
    fontSize: 14,
    color: "#666",
  },
  rowValue: {
    fontSize: 14,
    color: "#222",
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  rowValueEmpty: {
    color: "#bbb",
    fontWeight: "400",
  },
  annotationBox: {
    backgroundColor: "#FFFDE7",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFF9C4",
  },
  annotationText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  hashtagsText: {
    fontSize: 14,
    color: "#1976D2",
    lineHeight: 20,
  },
  metaSection: {
    marginTop: 16,
  },
  metaText: {
    fontSize: 12,
    color: "#bbb",
    marginBottom: 2,
  },
  actions: {
    marginTop: 24,
  },
  editActions: {
    flexDirection: "row",
    marginTop: 16,
  },
  editField: {
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
    marginBottom: 4,
  },
  editInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#FAFAFA",
  },
  editInputMultiline: {
    height: "auto",
    textAlignVertical: "top",
    paddingTop: 10,
  },
  dimRow: {
    flexDirection: "row",
    gap: 8,
  },
});
