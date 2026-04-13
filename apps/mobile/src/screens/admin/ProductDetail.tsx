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
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
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
import { adminService } from "../../services/admin.service";
import type { OzonStore, OzonStoreLimits } from "../../services/admin.service";
import type { Book, UpdateBookDto } from "../../types";
import { BookStatus, PaperType, CoverType } from "../../types";
import type { AdminCardCreationParamList } from "../../navigation/AdminNavigator";
import { formatPrice, formatDate } from "../../utils/format";
import { bookEvents } from "../../utils/bookEvents";

type Route = RouteProp<AdminCardCreationParamList, "ProductDetail">;
type Nav = NativeStackNavigationProp<AdminCardCreationParamList, "ProductDetail">;

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
    label: "Ожидает проверки администратора",
    color: "#F57C00",
    bg: "#FFF3E0",
  },
  [BookStatus.PENDING_PUBLICATION]: {
    label: "Загружается в Ozon",
    color: "#1976D2",
    bg: "#E3F2FD",
  },
  [BookStatus.PUBLISHED]: {
    label: "Загружено в Ozon",
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
  const [aiPrice, setAiPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<
    Record<string, OzonStoreLimits | null | undefined>
  >({});
  const [storePickerVisible, setStorePickerVisible] = useState(false);

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
  const [editCoverType, setEditCoverType] = useState<CoverType | undefined>(
    undefined,
  );
  const [editPaperType, setEditPaperType] = useState<PaperType | undefined>(
    undefined,
  );

  const refreshStoreLimits = async (storeList: OzonStore[]) => {
    // Reset to undefined (loading) before fetching
    setStoreLimits(Object.fromEntries(storeList.map((s) => [s.id, undefined])));
    const entries = await Promise.all(
      storeList.map(async (store) => {
        try {
          const limits = await adminService.getOzonStoreLimits(store.id);
          return [store.id, limits] as const;
        } catch {
          return [store.id, null] as const;
        }
      }),
    );
    setStoreLimits(Object.fromEntries(entries));
  };

  useEffect(() => {
    adminService
      .getOzonStores()
      .then(({ stores: s }) => setStores(s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      booksService.getBook(bookId),
      visionService.getResult(bookId).catch(() => null),
    ])
      .then(([b, ocr]) => {
        setBook(b);
        populateEditFields(b);
        const raw = ocr?.extractedData?.price;
        setAiPrice(typeof raw === "number" ? raw : null);
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
    setEditCoverType(b.coverType as CoverType | undefined);
    setEditPaperType(b.paperType as PaperType | undefined);
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
        coverType: editCoverType,
        paperType: editPaperType,
      };
      const updated = await booksService.updateBook(book.id, dto);
      setBook(updated);
      populateEditFields(updated);
      setEditing(false);
      bookEvents.emitBookUpdated(updated);
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

  const getLimitStatus = (storeId: string) => {
    const limits = storeLimits[storeId];
    if (limits === undefined)
      return { blocked: false, label: "Загрузка...", warn: false };
    if (limits === null)
      return { blocked: false, label: "Лимиты недоступны", warn: false };

    const totalRemaining =
      limits.total.limit > 0 ? limits.total.limit - limits.total.usage : null;
    const totalExhausted = totalRemaining !== null && totalRemaining <= 0;
    const totalLine =
      totalRemaining !== null
        ? `Ассортимент: ${totalRemaining} / ${limits.total.limit} осталось мест`
        : "Ассортимент: не ограничен";

    if (totalExhausted) {
      return { blocked: true, label: totalLine, warn: true };
    }

    if (limits.daily_create.limit > 0) {
      const remaining = limits.daily_create.limit - limits.daily_create.usage;
      const createLine = `Создание: ${remaining} / ${limits.daily_create.limit} сегодня`;
      if (remaining <= 0) {
        return { blocked: true, label: `${createLine}\n${totalLine}`, warn: true };
      }
      return { blocked: false, label: `${createLine}\n${totalLine}`, warn: false };
    }

    return { blocked: false, label: `Создание: не ограничено\n${totalLine}`, warn: false };
  };

  const handlePublish = () => {
    if (!book) return;
    if (stores.length === 0) {
      Alert.alert("Нет магазинов", "Добавьте магазин Ozon в настройках");
      return;
    }
    refreshStoreLimits(stores);
    setStorePickerVisible(true);
  };

  const executePublish = async (storeId: string) => {
    if (!book) return;
    setPublishing(true);
    try {
      await booksService.publishToOzon(book.id, storeId);
      const updated = await booksService.getBook(bookId);
      setBook(updated);
      Alert.alert("Готово", "Карточка отправлена на модерацию Ozon");
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить в Озон");
    } finally {
      setPublishing(false);
    }
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

  const handleReExtract = async () => {
    if (!book) return;
    Alert.alert(
      "Повторное распознавание?",
      "ИИ заново обработает фотографии и перезапишет данные карточки",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Распознать",
          onPress: async () => {
            setReExtracting(true);
            try {
              await visionService.extract(book.id);
              const [updated, freshOcr] = await Promise.all([
                booksService.getBook(bookId),
                visionService.getResult(bookId).catch(() => null),
              ]);
              setBook(updated);
              populateEditFields(updated);
              const raw = freshOcr?.extractedData?.price;
              setAiPrice(typeof raw === "number" ? raw : null);
              bookEvents.emitBookUpdated(updated);
              Alert.alert("Готово", "Данные обновлены из фотографий");
            } catch {
              Alert.alert("Ошибка", "Не удалось выполнить распознавание");
            } finally {
              setReExtracting(false);
            }
          },
        },
      ],
    );
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
    <>
      <Modal
        visible={storePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStorePickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStorePickerVisible(false)}>
          <View style={styles.storeOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.storeContainer}>
                <Text style={styles.storePickerTitle}>Выберите магазин Ozon</Text>
                {stores.map((store) => {
                  const { blocked, label, warn } = getLimitStatus(store.id);
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[styles.storeItem, blocked && styles.storeItemBlocked]}
                      activeOpacity={blocked ? 1 : 0.7}
                      disabled={blocked}
                      onPress={() => {
                        setStorePickerVisible(false);
                        Alert.alert(
                          "Подтверждение",
                          `Загрузить книгу в магазин "${store.name}"?`,
                          [
                            { text: "Отмена", style: "cancel" },
                            { text: "Загрузить", onPress: () => executePublish(store.id) },
                          ],
                        );
                      }}
                    >
                      <Text style={[styles.storeItemName, blocked && styles.storeItemBlockedText]}>
                        {store.name}
                      </Text>
                      <Text style={[styles.storeItemLimits, warn && styles.storeItemLimitWarn]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
                  label="Д"
                  value={editHeight}
                  onChangeText={setEditHeight}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <EditField
                  label="Ш"
                  value={editWidth}
                  onChangeText={setEditWidth}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
                <EditField
                  label="В"
                  value={editDepth}
                  onChangeText={setEditDepth}
                  keyboardType="numeric"
                  style={{ flex: 1 }}
                />
              </View>
              <SegmentPicker
                label="Тип переплета"
                options={Object.values(CoverType)}
                value={editCoverType}
                onChange={(v) => setEditCoverType(v as CoverType)}
              />
              <SegmentPicker
                label="Тип бумаги"
                options={Object.values(PaperType)}
                value={editPaperType}
                onChange={(v) => setEditPaperType(v as PaperType)}
              />
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
                  label="Рекомендованная цена от ИИ"
                  value={aiPrice != null ? formatPrice(aiPrice) : undefined}
                />
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
                <Button
                  title="Изменить фото"
                  onPress={() => navigation.navigate("PhotoUpload", { bookId })}
                  style={{ marginBottom: 10 }}
                />
                <Button
                  title="Распознать заново"
                  onPress={handleReExtract}
                  loading={reExtracting}
                  style={{ marginBottom: 8 }}
                />
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
    </>
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

function SegmentPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.segmentOption,
              value === opt && styles.segmentOptionActive,
            ]}
            onPress={() => onChange(opt)}
          >
            <Text
              style={[
                styles.segmentText,
                value === opt && styles.segmentTextActive,
              ]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
    height: 450,
    backgroundColor: "#f5f5f5",
  },
  photo: {
    width: SCREEN_WIDTH,
    height: 450,
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
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#FAFAFA",
  },
  segmentOptionActive: {
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  segmentText: {
    fontSize: 14,
    color: "#555",
  },
  segmentTextActive: {
    color: "#1976D2",
    fontWeight: "600",
  },
  storeOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  storeContainer: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    width: "80%",
  },
  storePickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 12,
  },
  storeItem: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  storeItemBlocked: {
    opacity: 0.5,
    backgroundColor: "#fafafa",
  },
  storeItemName: {
    fontSize: 15,
    color: "#1976D2",
    fontWeight: "600",
  },
  storeItemBlockedText: {
    color: "#aaa",
  },
  storeItemLimits: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 2,
  },
  storeItemLimitWarn: {
    color: "#E53935",
    fontWeight: "600",
  },
});
