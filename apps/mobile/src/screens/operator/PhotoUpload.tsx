import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoGrid } from '../../components/PhotoGrid';
import { Button } from '../../components/Button';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { booksService } from '../../services/books.service';
import { photosService } from '../../services/photos.service';
import type { BookPhoto } from '../../types';
import type { OperatorStackParamList } from '../../navigation/OperatorNavigator';

type Route = RouteProp<OperatorStackParamList, 'PhotoUpload'>;

export function PhotoUploadScreen() {
  const route = useRoute<Route>();
  const { bookId } = route.params;

  const [photos, setPhotos] = useState<Array<{ uri: string; id?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    booksService
      .getBook(bookId)
      .then((book) => {
        const sorted = [...(book.photos ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        setPhotos(sorted.map((p) => ({ uri: p.fileUrl, id: p.id })));
      })
      .catch(() => Alert.alert('Ошибка', 'Не удалось загрузить фото'))
      .finally(() => setLoading(false));
  }, [bookId]);

  const handleAdd = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10 - photos.length,
    });

    if (!result.canceled && result.assets.length > 0) {
      setUploading(true);
      try {
        const uris = result.assets.map((a) => a.uri);
        const uploaded = await photosService.uploadPhotos(bookId, uris);
        setPhotos((prev) => [
          ...prev,
          ...uploaded.map((p) => ({ uri: p.fileUrl, id: p.id })),
        ]);
      } catch {
        Alert.alert('Ошибка', 'Не удалось загрузить фото');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleRemove = async (index: number) => {
    const photo = photos[index];
    if (!photo.id) {
      setPhotos((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    Alert.alert('Удалить фото?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await photosService.deletePhoto(bookId, photo.id!);
            setPhotos((prev) => prev.filter((_, i) => i !== index));
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

  return (
    <View style={styles.container}>
      {uploading && <LoadingOverlay message="Загрузка фото..." />}
      <View style={styles.content}>
        <PhotoGrid photos={photos} onAdd={handleAdd} onRemove={handleRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
