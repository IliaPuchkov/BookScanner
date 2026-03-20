import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PhotoGrid } from '../../components/PhotoGrid';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { booksService } from '../../services/books.service';
import { photosService } from '../../services/photos.service';
import { adminService } from '../../services/admin.service';
import type { OperatorStackParamList } from '../../navigation/OperatorNavigator';

type Route = RouteProp<OperatorStackParamList, 'PhotoUpload'>;

const DEFAULT_MAX_PHOTOS = 10;
const MAX_PHOTOS_KEY = 'max_photo_count';

export function PhotoUploadScreen() {
  const route = useRoute<Route>();
  const { bookId } = route.params;

  const [photos, setPhotos] = useState<Array<{ uri: string; id?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [maxPhotos, setMaxPhotos] = useState(DEFAULT_MAX_PHOTOS);

  useEffect(() => {
    const init = async () => {
      try {
        const [book, settings] = await Promise.all([
          booksService.getBook(bookId),
          adminService.getSettings().catch(() => []),
        ]);

        const sorted = [...(book.photos ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        setPhotos(sorted.map((p) => ({ uri: p.fileUrl, id: p.id })));

        const maxSetting = settings.find((s) => s.key === MAX_PHOTOS_KEY);
        if (maxSetting) {
          const parsed = parseInt(maxSetting.value, 10);
          if (!isNaN(parsed) && parsed > 0) setMaxPhotos(parsed);
        }
      } catch {
        Alert.alert('Ошибка', 'Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [bookId]);

  const handleAdd = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение на доступ к галерее');
      return;
    }
    const remaining = maxPhotos - photos.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: remaining,
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

  const handleRotate = async (index: number) => {
    const photo = photos[index];
    setUploading(true);
    try {
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.rotate(90);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      if (photo.id) {
        const updated = await photosService.replacePhoto(bookId, photo.id, saved.uri);
        setPhotos((prev) =>
          prev.map((p, i) => (i === index ? { uri: updated.fileUrl, id: updated.id } : p)),
        );
      } else {
        setPhotos((prev) =>
          prev.map((p, i) => (i === index ? { ...p, uri: saved.uri } : p)),
        );
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось повернуть фото');
    } finally {
      setUploading(false);
    }
  };

  const handleReorder = async (newPhotos: Array<{ uri: string; id?: string }>) => {
    setPhotos(newPhotos);
    const ids = newPhotos.map((p) => p.id).filter(Boolean) as string[];
    if (ids.length > 0) {
      await photosService.reorderPhotos(bookId, ids).catch(() => {});
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
        <PhotoGrid
          photos={photos}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onReorder={handleReorder}
          onRotate={handleRotate}
          maxPhotos={maxPhotos}
        />
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
