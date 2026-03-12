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
} from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { booksService } from '../../services/books.service';
import { visionService } from '../../services/vision.service';
import type { Book } from '../../types';
import type { OperatorStackParamList } from '../../navigation/OperatorNavigator';
import { formatPrice, formatDate } from '../../utils/format';

type Route = RouteProp<OperatorStackParamList, 'CardDetail'>;
type Nav = NativeStackNavigationProp<OperatorStackParamList, 'CardDetail'>;

const SCREEN_WIDTH = Dimensions.get('window').width;

export function CardDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { bookId } = route.params;

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    booksService
      .getBook(bookId)
      .then(setBook)
      .catch(() => Alert.alert('Ошибка', 'Не удалось загрузить карточку'))
      .finally(() => setLoading(false));
  }, [bookId]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await visionService.extract(bookId);
      const updated = await booksService.getBook(bookId);
      setBook(updated);
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
          <InfoRow label="Цена" value={book.price > 0 ? formatPrice(book.price) : undefined} />
          {book.dimensions && (
            <InfoRow
              label="Размеры"
              value={`${book.dimensions.width}x${book.dimensions.height}x${book.dimensions.depth} мм`}
            />
          )}
          {book.weightGross && (
            <InfoRow label="Вес" value={`${book.weightGross} г`} />
          )}
        </View>

        {book.annotation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Аннотация</Text>
            <Text style={styles.annotationText}>{book.annotation}</Text>
          </View>
        )}

        <Text style={styles.date}>
          Создана: {formatDate(book.createdAt)}
        </Text>

        <View style={styles.actions}>
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
      </View>
    </ScrollView>
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
  annotationText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  date: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 16,
  },
  actions: {
    marginTop: 24,
  },
});
