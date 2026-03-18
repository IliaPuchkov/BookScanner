import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { booksService } from '../../services/books.service';
import { visionService } from '../../services/vision.service';
import type { Book, UpdateBookDto } from '../../types';
import { CoverType, PaperType } from '../../types';
import type { OperatorStackParamList } from '../../navigation/OperatorNavigator';
import { formatDate } from '../../utils/format';

type Route = RouteProp<OperatorStackParamList, 'CardDetail'>;
type Nav = NativeStackNavigationProp<OperatorStackParamList, 'CardDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;

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

  // Edit fields
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editPublisher, setEditPublisher] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editPages, setEditPages] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editDepth, setEditDepth] = useState('');
  const [editCoverType, setEditCoverType] = useState('');
  const [editPaperType, setEditPaperType] = useState('');
  const [editLanguage, setEditLanguage] = useState('');

  useEffect(() => {
    booksService
      .getBook(bookId)
      .then((b) => {
        setBook(b);
        populateEditFields(b);
      })
      .catch(() => Alert.alert('Ошибка', 'Не удалось загрузить карточку'))
      .finally(() => setLoading(false));
  }, [bookId]);

  const populateEditFields = (b: Book) => {
    setEditTitle(b.title ?? '');
    setEditAuthor(b.author ?? '');
    setEditIsbn(b.isbn ?? '');
    setEditPublisher(b.publisher ?? '');
    setEditYear(b.yearPublished?.toString() ?? '');
    setEditPages(b.pageCount?.toString() ?? '');
    setEditWeight(b.weightGross?.toString() ?? '');
    setEditWidth(b.dimensions?.width?.toString() ?? '');
    setEditHeight(b.dimensions?.height?.toString() ?? '');
    setEditDepth(b.dimensions?.depth?.toString() ?? '');
    setEditCoverType(b.coverType ?? '');
    setEditPaperType(b.paperType ?? '');
    setEditLanguage(b.language ?? '');
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
        coverType: (editCoverType as CoverType) || undefined,
        paperType: (editPaperType as PaperType) || undefined,
        language: editLanguage || undefined,
      };
      const updated = await booksService.updateBook(book.id, dto);
      setBook(updated);
      setEditing(false);
      Alert.alert('Готово', 'Карточка обновлена');
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить');
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
      Alert.alert('Готово', 'Данные обновлены');
    } catch {
      Alert.alert('Ошибка', 'Не удалось распознать');
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Удалить карточку?', 'Это действие необратимо', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await booksService.deleteBook(bookId);
            navigation.goBack();
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить');
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
        <Text style={{ color: '#999' }}>Карточка не найдена</Text>
      </View>
    );
  }

  const sortedPhotos = [...(book.photos ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
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
              <EditField label="Название" value={editTitle} onChangeText={setEditTitle} placeholder="Введите название" />
              <EditField label="Автор" value={editAuthor} onChangeText={setEditAuthor} placeholder="Введите автора" />
              <EditField label="ISBN" value={editIsbn} onChangeText={setEditIsbn} placeholder="Введите ISBN" />
              <EditField label="Издательство" value={editPublisher} onChangeText={setEditPublisher} placeholder="Введите издательство" />
              <EditField label="Год издания" value={editYear} onChangeText={setEditYear} keyboardType="numeric" placeholder="Например: 2005" />
              <EditField label="Количество страниц" value={editPages} onChangeText={setEditPages} keyboardType="numeric" placeholder="Например: 320" />
              <EditField label="Вес (г)" value={editWeight} onChangeText={setEditWeight} keyboardType="numeric" placeholder="Например: 450" />

              <Text style={styles.sectionTitle}>Размеры (мм)</Text>
              <View style={styles.dimRow}>
                <EditField label="Ширина" value={editWidth} onChangeText={setEditWidth} keyboardType="numeric" style={{ flex: 1 }} placeholder="Ш" />
                <EditField label="Высота" value={editHeight} onChangeText={setEditHeight} keyboardType="numeric" style={{ flex: 1 }} placeholder="В" />
                <EditField label="Глубина" value={editDepth} onChangeText={setEditDepth} keyboardType="numeric" style={{ flex: 1 }} placeholder="Г" />
              </View>

              <Text style={styles.editLabel}>Тип обложки</Text>
              <View style={styles.optionsRow}>
                {Object.values(CoverType).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, editCoverType === val && styles.optionBtnSelected]}
                    onPress={() => setEditCoverType(val)}
                  >
                    <Text style={[styles.optionText, editCoverType === val && styles.optionTextSelected]}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.editLabel}>Тип бумаги</Text>
              <View style={styles.optionsRow}>
                {Object.values(PaperType).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.optionBtn, editPaperType === val && styles.optionBtnSelected]}
                    onPress={() => setEditPaperType(val)}
                  >
                    <Text style={[styles.optionText, editPaperType === val && styles.optionTextSelected]}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <EditField label="Язык" value={editLanguage} onChangeText={setEditLanguage} placeholder="Например: русский" />

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
              <Text style={styles.title}>{book.title}</Text>
              {book.author && <Text style={styles.author}>{book.author}</Text>}
              <Text style={styles.sku}>SKU: {book.sku}</Text>

              <View style={styles.section}>
                <InfoRow label="ISBN" value={book.isbn} />
                <InfoRow label="Издательство" value={book.publisher} />
                <InfoRow label="Год" value={book.yearPublished?.toString()} />
                <InfoRow label="Страниц" value={book.pageCount?.toString()} />
                <InfoRow label="Тип обложки" value={book.coverType} />
                <InfoRow label="Тип бумаги" value={book.paperType} />
                <InfoRow label="Язык" value={book.language} />
                <InfoRow label="Состояние" value={book.condition} />
                {book.dimensions && (
                  <InfoRow
                    label="Размеры"
                    value={`${book.dimensions.width}x${book.dimensions.height}x${book.dimensions.depth} мм`}
                  />
                )}
                {book.weightGross ? (
                  <InfoRow label="Вес" value={`${book.weightGross} г`} />
                ) : null}
              </View>

              <Text style={styles.date}>
                Создана: {formatDate(book.createdAt)}
              </Text>

              <View style={styles.actions}>
                <Button
                  title="Редактировать"
                  onPress={() => setEditing(true)}
                  style={{ marginBottom: 8 }}
                />
                <Button
                  title="Фото"
                  onPress={() => navigation.navigate('PhotoUpload', { bookId })}
                  variant="secondary"
                  style={{ marginBottom: 8 }}
                />
                <Button
                  title="Распознать заново"
                  onPress={handleExtract}
                  loading={extracting}
                  variant="secondary"
                  style={{ marginBottom: 8 }}
                />
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
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'numeric' | 'default';
  multiline?: boolean;
  style?: object;
  placeholder?: string;
}) {
  return (
    <View style={[styles.editField, style]}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={[styles.editInput, multiline && styles.editInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor="#bbb"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    color: '#222',
  },
  author: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  sku: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 14,
    color: '#666',
  },
  rowValue: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  date: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 16,
  },
  actions: {
    marginTop: 24,
  },
  editActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  editField: {
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  editInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  editInputMultiline: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  dimRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#FAFAFA',
  },
  optionBtnSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  optionText: {
    fontSize: 14,
    color: '#555',
  },
  optionTextSelected: {
    color: '#1976D2',
    fontWeight: '600',
  },
});
