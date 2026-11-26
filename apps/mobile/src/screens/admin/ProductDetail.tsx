import React, { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  ScrollView,
  StyleSheet,
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
import { Ionicons } from "@expo/vector-icons";
import { AppText } from '../../components/AppText';
import {
  useRoute,
  useNavigation,
  type RouteProp,
} from "@react-navigation/native";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { CopySetPicker } from "../../components/CopySetPicker";
import { booksService } from "../../services/books.service";
import { visionService } from "../../services/vision.service";
import type { ExtractPreviewResult } from "../../services/vision.service";
import { adminService } from "../../services/admin.service";
import type { OzonStore, OzonStoreLimits } from "../../services/admin.service";
import type { Book, UpdateBookDto } from "../../types";
import { BookStatus, PaperType, CoverType } from "../../types";
import type { AdminCardCreationParamList } from "../../navigation/AdminNavigator";
import { formatPrice, formatDate, formatPrintRun, libraryLabel, isParkedCopy, PARKED_COPY_LABEL } from "../../utils/format";
import { bookEvents } from "../../utils/bookEvents";
import { useUndoable } from "../../context/UndoContext";
import {
  cardPipelineService,
  DEFAULTED_FIELD_LABELS,
  type OzonPayloadPreview,
} from "../../services/cardPipeline.service";

type Route = RouteProp<AdminCardCreationParamList, "ProductDetail">;
type Nav = NativeStackNavigationProp<
  AdminCardCreationParamList,
  "ProductDetail"
>;

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

function normalizeCoverType(
  value: string | null | undefined,
): CoverType | undefined {
  if (!value) return undefined;
  return value.toLowerCase().includes("мягк")
    ? CoverType.SOFTCOVER
    : CoverType.HARDCOVER;
}

function normalizePaperType(
  value: string | null | undefined,
): PaperType | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v.includes("глянц")) return PaperType.GLOSSY;
  if (v.includes("матов")) return PaperType.MATTE;
  return PaperType.OFFSET;
}

interface DiffField {
  key: string;
  label: string;
  current: (b: Book) => string;
  suggested: (p: ExtractPreviewResult, b: Book) => string;
  multiline?: boolean;
}

const DIFF_FIELDS: DiffField[] = [
  {
    key: "title",
    label: "Название",
    current: (b) => b.title ?? "",
    suggested: (p) => p.extractedData.title ?? "",
  },
  {
    key: "author",
    label: "Автор",
    current: (b) => b.author ?? "",
    suggested: (p) => p.extractedData.author ?? "",
  },
  {
    key: "isbn",
    label: "ISBN",
    current: (b) => b.isbn ?? "",
    suggested: (p) => p.extractedData.isbn ?? "",
  },
  {
    key: "publisher",
    label: "Издательство",
    current: (b) => b.publisher ?? "",
    suggested: (p) => p.extractedData.publisher ?? "",
  },
  {
    key: "year",
    label: "Год",
    current: (b) => b.yearPublished?.toString() ?? "",
    suggested: (p) => p.extractedData.yearPublished?.toString() ?? "",
  },
  {
    key: "pages",
    label: "Страниц",
    current: (b) => b.pageCount?.toString() ?? "",
    suggested: (p) => p.extractedData.pageCount?.toString() ?? "",
  },
  {
    key: "printRun",
    label: "Тираж",
    current: (b) => formatPrintRun(b.printRun) ?? "",
    suggested: (p) =>
      formatPrintRun(p.extractedData.printRun ?? undefined) ?? "",
  },
  {
    key: "aiPrice",
    label: "Рыночная цена (ИИ)",
    current: () => "",
    suggested: (p) =>
      p.extractedData.price != null ? formatPrice(p.extractedData.price) : "",
  },
  {
    key: "price",
    label: "Цена (расчётная)",
    current: (b) => formatPrice(b.price),
    suggested: (p) => formatPrice(p.calculatedPrice),
  },
  {
    key: "weight",
    label: "Вес (г)",
    current: (b) => b.weightGross?.toString() ?? "",
    suggested: (p) => p.extractedData.weightGross?.toString() ?? "",
  },
  {
    key: "dimensions",
    label: "Размеры (мм)",
    current: (b) =>
      b.dimensions
        ? `${b.dimensions.height}×${b.dimensions.width}×${b.dimensions.depth}`
        : "",
    suggested: (p, b) => {
      const d = p.extractedData;
      const cur = b.dimensions;
      if (d.width != null || d.height != null || d.depth != null)
        return `${d.height ?? cur?.height ?? 0}×${d.width ?? cur?.width ?? 0}×${d.depth ?? cur?.depth ?? 0}`;
      return cur ? `${cur.height}×${cur.width}×${cur.depth}` : "";
    },
  },
  {
    key: "cover",
    label: "Переплёт",
    current: (b) => b.coverType ?? "",
    suggested: (p) => normalizeCoverType(p.extractedData.coverType) ?? "",
  },
  {
    key: "paper",
    label: "Бумага",
    current: (b) => b.paperType ?? "",
    suggested: (p) => normalizePaperType(p.extractedData.paperType) ?? "",
  },
  {
    key: "annotation",
    label: "Аннотация",
    current: (b) => b.annotation ?? "",
    // The card keeps the AI text; the «book is not new» prefix is added for Ozon
    suggested: (p, b) => p.extractedData.annotation || (b.annotation ?? ""),
    multiline: true,
  },
  {
    key: "hashtags",
    label: "Хэштеги",
    current: (b) => (b.hashtags ?? []).join(" "),
    suggested: (p) => (p.extractedData.hashtags ?? []).join(" "),
    multiline: true,
  },
];

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
  [BookStatus.IN_LIBRARY]: {
    label: "Домашняя книга",
    color: "#6A1B9A",
    bg: "#F3E5F5",
  },
};

const PARKED_COPY_STATUS = {
  label: PARKED_COPY_LABEL,
  color: "#616161",
  bg: "#EEEEEE",
};

export function ProductDetailScreen() {
  const undoable = useUndoable();
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { bookId } = route.params;
  const editable = (route.params as { editable?: boolean }).editable ?? false;

  const [book, setBook] = useState<Book | null>(null);
  const [aiPrice, setAiPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingFromLibrary, setRemovingFromLibrary] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  // «Добавить в набор копий» picker
  const [copySetOpen, setCopySetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [previewData, setPreviewData] = useState<ExtractPreviewResult | null>(
    null,
  );
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [ozonPreview, setOzonPreview] = useState<OzonPayloadPreview | null>(null);
  const [ozonPreviewLoading, setOzonPreviewLoading] = useState(false);
  // Keys of changed DIFF_FIELDS the admin unticked — those keep the card's value.
  const [rejectedFields, setRejectedFields] = useState<Set<string>>(new Set());
  const [stores, setStores] = useState<OzonStore[]>([]);
  const [storeLimits, setStoreLimits] = useState<
    Record<string, OzonStoreLimits | null | undefined>
  >({});
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxScrollRef = useRef<ScrollView>(null);
  const [previewLightboxIndex, setPreviewLightboxIndex] = useState<number | null>(null);
  const previewLightboxScrollRef = useRef<ScrollView>(null);

  // Edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editIsbn, setEditIsbn] = useState("");
  const [editPublisher, setEditPublisher] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editPages, setEditPages] = useState("");
  const [editPrintRun, setEditPrintRun] = useState("");
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
    setEditPrintRun(b.printRun?.toString() ?? "");
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
        printRun: editPrintRun ? parseInt(editPrintRun, 10) : undefined,
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
        return {
          blocked: true,
          label: `${createLine}\n${totalLine}`,
          warn: true,
        };
      }
      return {
        blocked: false,
        label: `${createLine}\n${totalLine}`,
        warn: false,
      };
    }

    return {
      blocked: false,
      label: `Создание: не ограничено\n${totalLine}`,
      warn: false,
    };
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
      const res = await booksService.publishToOzon(book.id, storeId);
      const updated = await booksService.getBook(bookId);
      setBook(updated);
      Alert.alert("Готово", res.alreadyPublished ? res.message : "Карточка отправлена на модерацию Ozon");
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить в Озон");
    } finally {
      setPublishing(false);
    }
  };

  const handleAddToLibrary = () => {
    if (!book) return;
    Alert.alert(
      "Добавить в мою библиотеку?",
      `"${book.title}" станет книгой вашей домашней библиотеки и не будет публиковаться на Ozon.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Добавить",
          onPress: () =>
            undoable({
              message: `«${book.title}» будет добавлена в библиотеку`,
              action: async () => {
                setAddingToLibrary(true);
                try {
                  await adminService.addToLibrary(book.id);
                  const updated = await booksService.getBook(bookId);
                  setBook(updated);
                  bookEvents.emitBookUpdated(updated);
                } catch {
                  Alert.alert("Ошибка", "Не удалось добавить книгу в библиотеку");
                } finally {
                  setAddingToLibrary(false);
                }
              },
            }),
        },
      ],
    );
  };

  const handleRemoveFromLibrary = () => {
    if (!book) return;
    Alert.alert(
      "Вернуть на проверку?",
      "Книга будет убрана из библиотеки и снова появится в списке на проверке.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          onPress: () =>
            undoable({
              message: "Книга вернётся на проверку",
              action: async () => {
                setRemovingFromLibrary(true);
                try {
                  await adminService.removeFromLibrary(book.id);
                  const updated = await booksService.getBook(bookId);
                  setBook(updated);
                  bookEvents.emitBookUpdated(updated);
                } catch {
                  Alert.alert("Ошибка", "Не удалось вернуть книгу на проверку");
                } finally {
                  setRemovingFromLibrary(false);
                }
              },
            }),
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

  /** What the server would send to Ozon now (payload settings + card defaults), nothing is sent */
  const handleOzonPreview = async () => {
    if (!book) return;
    setOzonPreviewLoading(true);
    try {
      setOzonPreview(await cardPipelineService.previewOzonPayload({ bookId: book.id }));
    } catch (e: any) {
      Alert.alert("Не удалось собрать карточку Ozon", e?.response?.data?.message ?? "Попробуйте ещё раз");
    } finally {
      setOzonPreviewLoading(false);
    }
  };

  const handleReExtract = async () => {
    if (!book) return;
    Alert.alert(
      "Повторное распознавание?",
      "ИИ проанализирует фотографии. Вы сможете просмотреть результат перед сохранением.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Распознать",
          onPress: async () => {
            setReExtracting(true);
            try {
              const result = await visionService.extractPreview(book.id);
              setRejectedFields(new Set());
              setPreviewData(result);
              setPreviewModalVisible(true);
            } catch (e: any) {
              // 429/503 carry a readable reason ("Сервис распознавания перегружен…")
              const status = e?.response?.status;
              const serverMessage = e?.response?.data?.message;
              Alert.alert(
                "Не удалось выполнить распознавание",
                (status === 429 || status === 503) && typeof serverMessage === "string"
                  ? serverMessage
                  : "Попробуйте ещё раз",
              );
            } finally {
              setReExtracting(false);
            }
          },
        },
      ],
    );
  };

  const changedKeys =
    previewData && book
      ? DIFF_FIELDS.filter(
          (f) => f.current(book) !== f.suggested(previewData, book),
        ).map((f) => f.key)
      : [];
  const acceptedCount = changedKeys.filter((k) => !rejectedFields.has(k)).length;

  const toggleField = (key: string) =>
    setRejectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleAcceptPreview = async () => {
    if (!book || !previewData) return;
    setSaving(true);
    try {
      const d = previewData.extractedData;
      const num = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
      const take = (key: string) => !rejectedFields.has(key);
      const dto: UpdateBookDto = {
        ...(take("title") && d.title != null && { title: d.title }),
        ...(take("author") && d.author != null && { author: d.author }),
        ...(take("isbn") && d.isbn != null && { isbn: String(d.isbn) }),
        ...(take("publisher") && d.publisher != null && { publisher: d.publisher }),
        ...(take("year") && num(d.yearPublished) != null && { yearPublished: num(d.yearPublished)! }),
        ...(take("pages") && num(d.pageCount) != null && { pageCount: num(d.pageCount)! }),
        ...(take("printRun") && num(d.printRun) != null && { printRun: num(d.printRun)! }),
        ...(take("price") && previewData.calculatedPrice > 0 && {
          price: previewData.calculatedPrice,
        }),
        ...(take("weight") && num(d.weightGross) != null && { weightGross: num(d.weightGross)! }),
        ...(take("dimensions") && (d.width != null || d.height != null || d.depth != null) && {
          dimensions: {
            width: num(d.width) ?? book.dimensions?.width ?? 0,
            height: num(d.height) ?? book.dimensions?.height ?? 0,
            depth: num(d.depth) ?? book.dimensions?.depth ?? 0,
          },
        }),
        ...(take("annotation") && d.annotation && { annotation: d.annotation }),
        ...(take("hashtags") && d.hashtags?.length && { hashtags: d.hashtags }),
        ...(take("cover") && d.coverType != null && {
          coverType: normalizeCoverType(d.coverType),
        }),
        ...(take("paper") && d.paperType != null && {
          paperType: normalizePaperType(d.paperType),
        }),
      };
      const updated = await booksService.updateBook(book.id, dto);
      setBook(updated);
      populateEditFields(updated);
      if (take("aiPrice")) {
        setAiPrice(typeof d.price === "number" ? d.price : null);
      }
      bookEvents.emitBookUpdated(updated);
      setPreviewModalVisible(false);
      setPreviewData(null);
      Alert.alert("Готово", "Данные обновлены из фотографий");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? (err instanceof Error ? err.message : "Неизвестная ошибка");
      Alert.alert("Ошибка сохранения", String(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Удалить карточку?", "Это действие необратимо", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () =>
          undoable({
            message: "Карточка будет удалена",
            action: async () => {
              try {
                await booksService.deleteBook(bookId);
                // The user may have left the card during the undo countdown
                if (navigation.isFocused()) navigation.goBack();
              } catch {
                Alert.alert("Ошибка", "Не удалось удалить");
              }
            },
          }),
      },
    ]);
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  };

  useEffect(() => {
    if (lightboxVisible) {
      setTimeout(() => {
        lightboxScrollRef.current?.scrollTo({
          x: lightboxIndex * SCREEN_WIDTH,
          animated: false,
        });
      }, 50);
    }
  }, [lightboxVisible, lightboxIndex]);

  useEffect(() => {
    if (previewLightboxIndex !== null) {
      setTimeout(() => {
        previewLightboxScrollRef.current?.scrollTo({
          x: previewLightboxIndex * SCREEN_WIDTH,
          animated: false,
        });
      }, 50);
    }
  }, [previewLightboxIndex]);

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
        <AppText style={{ color: "#999" }}>Карточка не найдена</AppText>
      </View>
    );
  }

  const defaulted = new Set(book.defaultedFields ?? []);
  const dflt = (...fields: string[]) => fields.some((f) => defaulted.has(f));
  const dims = book.dimensions;
  const sortedPhotos = [...(book.photos ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const baseStatusCfg = isParkedCopy(book)
    ? PARKED_COPY_STATUS
    : STATUS_CONFIG[book.status] || STATUS_CONFIG[BookStatus.PENDING_REVIEW];
  const statusCfg = {
    ...baseStatusCfg,
    label: libraryLabel(book) ?? baseStatusCfg.label,
  };

  return (
    <>
      <CopySetPicker
        book={copySetOpen ? book : null}
        onClose={() => setCopySetOpen(false)}
        onMoved={(updated) => setBook((prev) => (prev ? { ...prev, ...updated } : updated))}
      />
      <Modal
        visible={lightboxVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setLightboxVisible(false)}
      >
        <View style={styles.lightboxContainer}>
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setLightboxVisible(false)}
          >
            <AppText style={styles.lightboxCloseText}>✕</AppText>
          </TouchableOpacity>
          <ScrollView
            ref={lightboxScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          >
            {sortedPhotos.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photo.fileUrl }}
                style={styles.lightboxPhoto}
                resizeMode="contain"
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
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
                <AppText style={styles.storePickerTitle}>
                  Выберите магазин Ozon
                </AppText>
                {stores.map((store) => {
                  const { blocked, label, warn } = getLimitStatus(store.id);
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[
                        styles.storeItem,
                        blocked && styles.storeItemBlocked,
                      ]}
                      activeOpacity={blocked ? 1 : 0.7}
                      disabled={blocked}
                      onPress={() => {
                        setStorePickerVisible(false);
                        Alert.alert(
                          "Подтверждение",
                          `Загрузить книгу в магазин "${store.name}"?`,
                          [
                            { text: "Отмена", style: "cancel" },
                            {
                              text: "Загрузить",
                              onPress: () =>
                                undoable({
                                  message: `Книга будет загружена в «${store.name}»`,
                                  action: () => executePublish(store.id),
                                }),
                            },
                          ],
                        );
                      }}
                    >
                      <AppText
                        style={[
                          styles.storeItemName,
                          blocked && styles.storeItemBlockedText,
                        ]}
                      >
                        {store.name}
                      </AppText>
                      <AppText
                        style={[
                          styles.storeItemLimits,
                          warn && styles.storeItemLimitWarn,
                        ]}
                      >
                        {label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        visible={!!ozonPreview}
        transparent
        animationType="slide"
        onRequestClose={() => setOzonPreview(null)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <AppText style={styles.previewTitle}>Карточка для Ozon</AppText>
            <ScrollView style={styles.previewScroll}>
              {ozonPreview?.warnings.map((w, i) => (
                <AppText key={i} style={[styles.ozonWarning, w.startsWith("Ошибка") && styles.ozonError]}>
                  ⚠ {w}
                </AppText>
              ))}
              {ozonPreview?.rows.map((r) => (
                <InfoRow key={r.id} label={r.label} value={r.value} />
              ))}
            </ScrollView>
            <Button title="Закрыть" onPress={() => setOzonPreview(null)} variant="secondary" />
          </View>
        </View>
      </Modal>
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPreviewModalVisible(false);
          setPreviewData(null);
        }}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <AppText style={styles.previewTitle}>Результат распознавания</AppText>
            {sortedPhotos.length > 0 && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.previewPhotoScroll}
              >
                {sortedPhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={photo.id}
                    onPress={() => setPreviewLightboxIndex(index)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: photo.fileUrl }}
                      style={styles.previewPhoto}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {changedKeys.length > 0 && (
              <View style={styles.diffToolbar}>
                <AppText style={styles.diffHint}>
                  Отметьте, что сохранить
                </AppText>
                <TouchableOpacity
                  onPress={() =>
                    setRejectedFields(
                      acceptedCount === changedKeys.length
                        ? new Set(changedKeys)
                        : new Set(),
                    )
                  }
                  hitSlop={8}
                >
                  <AppText style={styles.diffToggleAll}>
                    {acceptedCount === changedKeys.length
                      ? "Снять все"
                      : "Выбрать все"}
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView
              style={styles.previewScroll}
              showsVerticalScrollIndicator={false}
            >
              {previewData &&
                book &&
                DIFF_FIELDS.map((field) => {
                  const cur = field.current(book);
                  const sug = field.suggested(previewData, book);
                  const changed = cur !== sug;
                  const accepted = changed && !rejectedFields.has(field.key);
                  const lines = field.multiline ? undefined : 3;
                  const content = (
                    <>
                      {changed && (
                        <Ionicons
                          name={accepted ? "checkbox" : "square-outline"}
                          size={22}
                          color={accepted ? "#1976D2" : "#999"}
                          style={styles.diffCheck}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <AppText style={styles.diffLabel}>{field.label}</AppText>
                        <View style={styles.diffValues}>
                          <AppText
                            style={[
                              styles.diffCurrent,
                              changed && !accepted && styles.diffKept,
                            ]}
                            numberOfLines={lines}
                          >
                            {cur || "—"}
                          </AppText>
                          {changed && (
                            <>
                              <AppText style={styles.diffArrow}> → </AppText>
                              <AppText
                                style={[
                                  styles.diffSuggested,
                                  !accepted && styles.diffRejected,
                                ]}
                                numberOfLines={lines}
                              >
                                {sug || "—"}
                              </AppText>
                            </>
                          )}
                        </View>
                      </View>
                    </>
                  );
                  if (!changed) {
                    return (
                      <View key={field.key} style={styles.diffRow}>
                        {content}
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={field.key}
                      activeOpacity={0.7}
                      onPress={() => toggleField(field.key)}
                      style={[
                        styles.diffRow,
                        accepted ? styles.diffRowChanged : styles.diffRowRejected,
                      ]}
                    >
                      {content}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
            <View style={[styles.previewActions, { paddingBottom: insets.bottom }]}>
              <Button
                title={
                  changedKeys.length === 0 || acceptedCount === changedKeys.length
                    ? "Принять"
                    : `Принять (${acceptedCount} из ${changedKeys.length})`
                }
                onPress={handleAcceptPreview}
                loading={saving}
                disabled={changedKeys.length > 0 && acceptedCount === 0}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Отменить"
                onPress={() => {
                  setPreviewModalVisible(false);
                  setPreviewData(null);
                }}
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>
            {previewLightboxIndex !== null && (
              <View style={styles.previewLightbox}>
                <TouchableOpacity
                  style={styles.lightboxClose}
                  onPress={() => setPreviewLightboxIndex(null)}
                >
                  <AppText style={styles.lightboxCloseText}>✕</AppText>
                </TouchableOpacity>
                <ScrollView
                  ref={previewLightboxScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                >
                  {sortedPhotos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.fileUrl }}
                      style={styles.lightboxPhoto}
                      resizeMode="contain"
                    />
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
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
              {sortedPhotos.map((photo, index) => (
                <TouchableOpacity
                  key={photo.id}
                  onPress={() => openLightbox(index)}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: photo.fileUrl }}
                    style={styles.photo}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
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
                  label="Тираж"
                  value={editPrintRun}
                  onChangeText={setEditPrintRun}
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
                <AppText style={styles.sectionTitle}>Размеры (мм)</AppText>
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
                <AppText style={styles.title}>{book.title}</AppText>
                <View style={styles.headerMeta}>
                  <AppText style={styles.sku}>SKU: {book.sku}</AppText>
                  <View
                    style={[styles.badge, { backgroundColor: statusCfg.bg }]}
                  >
                    <AppText
                      style={[styles.badgeText, { color: statusCfg.color }]}
                    >
                      {statusCfg.label}
                    </AppText>
                  </View>
                </View>

                {/* Card fields; «по умолчанию» = filled from the card defaults, not by the AI or a person */}
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>Карточка</AppText>
                  <InfoRow label="Название" value={book.title} />
                  <InfoRow label="Автор" value={book.author} />
                  <InfoRow label="ISBN" value={book.isbn} />
                  <InfoRow label="Издательство" value={book.publisher} />
                  <InfoRow label="Год" value={book.yearPublished?.toString()} />
                  <InfoRow label="Тираж" value={formatPrintRun(book.printRun)} />
                  <InfoRow label="Тип обложки" value={book.coverType} defaulted={dflt("coverType")} />
                  <InfoRow label="Тип бумаги" value={book.paperType} defaulted={dflt("paperType")} />
                  <InfoRow label="Страниц" value={book.pageCount?.toString()} />
                  <InfoRow label="Язык" value={book.language} defaulted={dflt("language")} />
                  <InfoRow label="Сохранность" value={book.condition} defaulted={dflt("condition")} />
                  <InfoRow label="Тип книги" value={book.bookType} defaulted={dflt("bookType")} />
                  <InfoRow label="Направление" value={book.direction} defaulted={dflt("direction")} />
                  <InfoRow
                    label="Размеры (ДxШxВ), мм"
                    value={dims ? `${dims.height}x${dims.width}x${dims.depth}` : undefined}
                    defaulted={dflt("width", "height", "depth")}
                  />
                  <InfoRow
                    label="Вес"
                    value={book.weightGross ? `${Math.round(Number(book.weightGross))} г` : undefined}
                    defaulted={dflt("weightGross")}
                  />
                  <InfoRow
                    label="Рекомендованная цена от ИИ"
                    value={aiPrice != null ? formatPrice(aiPrice) : undefined}
                  />
                  <InfoRow
                    label="Цена"
                    value={book.price > 0 ? formatPrice(book.price) : undefined}
                  />
                  {defaulted.size > 0 && (
                    <AppText style={styles.defaultedNote}>
                      «по умолчанию» — ИИ не определил поле, подставлено значение из настроек:{" "}
                      {[...defaulted].map((f) => DEFAULTED_FIELD_LABELS[f] ?? f).join(", ")}
                    </AppText>
                  )}
                  <TouchableOpacity
                    style={styles.ozonPreviewBtn}
                    onPress={handleOzonPreview}
                    disabled={ozonPreviewLoading}
                    activeOpacity={0.7}
                  >
                    {ozonPreviewLoading ? (
                      <ActivityIndicator size="small" color="#1976D2" />
                    ) : (
                      <AppText style={styles.ozonPreviewBtnText}>Как уйдёт на Ozon</AppText>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Annotation (the card's text; Ozon gets it with the prefix from the payload settings) */}
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>Аннотация</AppText>
                  <View style={styles.annotationBox}>
                    <AppText style={styles.annotationText}>{book.annotation || "—"}</AppText>
                  </View>
                </View>

                {/* Hashtags (as the AI gave them; the hashtag rules apply when sent to Ozon) */}
                {(book.hashtags?.length ?? 0) > 0 && (
                  <View style={styles.section}>
                    <AppText style={styles.sectionTitle}>Хэштеги</AppText>
                    <AppText style={styles.hashtagsText}>{book.hashtags!.join(" ")}</AppText>
                  </View>
                )}

                {/* Metadata */}
                <View style={styles.metaSection}>
                  {book.createdBy && (
                    <AppText style={styles.metaText}>
                      Оператор: {book.createdBy.fullName}
                    </AppText>
                  )}
                  <AppText style={styles.metaText}>
                    Создана: {formatDate(book.createdAt)}
                  </AppText>
                  {book.publishedToOzon && (
                    <AppText style={styles.metaText}>
                      Опубликована: {formatDate(book.publishedToOzon)}
                    </AppText>
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
                    onPress={() =>
                      navigation.navigate("PhotoUpload", { bookId })
                    }
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
                  {book.status === BookStatus.PENDING_REVIEW &&
                    !book.publishedToOzon && (
                      <Button
                        title="Добавить в мою библиотеку"
                        onPress={handleAddToLibrary}
                        loading={addingToLibrary}
                        variant="secondary"
                        style={{ marginBottom: 8 }}
                      />
                    )}
                  <Button
                    title={book.copyGroupId ? "Перенести в другой набор копий" : "Добавить в набор копий"}
                    onPress={() => setCopySetOpen(true)}
                    variant="secondary"
                    style={{ marginBottom: 8 }}
                  />
                  {book.status === BookStatus.IN_LIBRARY && (
                    <Button
                      title="Вернуть на проверку"
                      onPress={handleRemoveFromLibrary}
                      loading={removingFromLibrary}
                      variant="secondary"
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

function InfoRow({ label, value, defaulted }: { label: string; value?: string; defaulted?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={[styles.rowValue, !value && styles.rowValueEmpty]}>
        {value || "—"}
        {defaulted && value ? <AppText style={styles.defaultedMark}>{"  по умолчанию"}</AppText> : null}
      </AppText>
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
      <AppText style={styles.editLabel}>{label}</AppText>
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
            <AppText
              style={[
                styles.segmentText,
                value === opt && styles.segmentTextActive,
              ]}
            >
              {opt}
            </AppText>
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
      <AppText style={styles.editLabel}>{label}</AppText>
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
  defaultedMark: {
    fontSize: 11,
    color: "#9E9E9E",
    fontStyle: "italic",
  },
  defaultedNote: {
    fontSize: 12,
    color: "#9E9E9E",
    marginTop: 8,
  },
  ozonPreviewBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    alignItems: "center",
  },
  ozonPreviewBtnText: {
    color: "#1976D2",
    fontWeight: "600",
    fontSize: 14,
  },
  ozonWarning: {
    fontSize: 13,
    color: "#E65100",
    marginBottom: 6,
  },
  ozonError: {
    color: "#C62828",
    fontWeight: "600",
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
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  previewContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "85%",
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
    marginBottom: 12,
    textAlign: "center",
  },
  previewScroll: {
    flexGrow: 0,
  },
  diffRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  diffRowRejected: {
    backgroundColor: "#F5F5F5",
    borderRadius: 6,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  diffCheck: {
    marginRight: 8,
    marginTop: 2,
  },
  diffKept: {
    color: "#222",
    fontWeight: "600",
  },
  diffRejected: {
    color: "#999",
    fontWeight: "400",
    textDecorationLine: "line-through",
  },
  diffToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  diffHint: {
    fontSize: 12,
    color: "#888",
  },
  diffToggleAll: {
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "600",
  },
  diffRowChanged: {
    backgroundColor: "#FFF9C4",
    borderRadius: 6,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  diffLabel: {
    fontSize: 11,
    color: "#888",
    marginBottom: 2,
  },
  diffValues: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  diffCurrent: {
    fontSize: 13,
    color: "#555",
    flex: 1,
  },
  diffArrow: {
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "700",
    marginHorizontal: 4,
  },
  diffSuggested: {
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "600",
    flex: 1,
  },
  previewActions: {
    flexDirection: "row",
    marginTop: 16,
  },
  previewPhotoScroll: {
    height: 420,
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  previewPhoto: {
    width: SCREEN_WIDTH - 32,
    height: 220,
    backgroundColor: "#f5f5f5",
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  lightboxClose: {
    position: "absolute",
    top: 52,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  lightboxPhoto: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  previewLightbox: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    zIndex: 100,
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "center",
  },
});
