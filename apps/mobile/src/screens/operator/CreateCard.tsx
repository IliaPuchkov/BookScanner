import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PhotoGrid } from '../../components/PhotoGrid';
import { LoadingOverlay } from '../../components/LoadingOverlay';
import { booksService } from '../../services/books.service';
import { boxesService } from '../../services/boxes.service';
import { photosService } from '../../services/photos.service';
import { visionService } from '../../services/vision.service';
import type { Box } from '../../types';
import type { OperatorStackParamList } from '../../navigation/OperatorNavigator';

type Route = RouteProp<OperatorStackParamList, 'CreateCard'>;

interface PhotoItem {
  uri: string;
  id?: string;
}

export function CreateCardScreen() {
  const route = useRoute<Route>();

  const [step, setStep] = useState<'box' | 'photos'>('box');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Box
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(
    route.params?.boxId ?? null,
  );
  const [newBoxNumber, setNewBoxNumber] = useState('');

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  useEffect(() => {
    boxesService.getBoxes(1, 100).then((res) => setBoxes(res.data)).catch(() => {});
  }, []);

  const handleCreateBox = async () => {
    if (!newBoxNumber.trim()) {
      Alert.alert('Ошибка', 'Введите номер коробки');
      return;
    }
    setLoading(true);
    try {
      const box = await boxesService.createBox({ boxNumber: newBoxNumber.trim() });
      setBoxes((prev) => [box, ...prev]);
      setSelectedBoxId(box.id);
      setNewBoxNumber('');
      setStep('photos');
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.message || 'Не удалось создать коробку');
    } finally {
      setLoading(false);
    }
  };

  const handlePickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10 - photos.length,
    });

    if (!result.canceled) {
      setPhotos((prev) => [
        ...prev,
        ...result.assets.map((a) => ({ uri: a.uri })),
      ]);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение на камеру');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos((prev) => [...prev, { uri: result.assets[0].uri }]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitForProcessing = async () => {
    if (!selectedBoxId) {
      Alert.alert('Ошибка', 'Выберите коробку');
      return;
    }
    if (photos.length < 2) {
      Alert.alert('Ошибка', 'Нужно минимум 2 фото (обложка и страница с информацией)');
      return;
    }

    setLoading(true);
    setLoadingMessage('Создание карточки...');
    try {
      const book = await booksService.createBook({
        title: 'Новая книга',
        boxId: selectedBoxId,
      });

      setLoadingMessage('Загрузка фотографий...');
      await photosService.uploadPhotos(
        book.id,
        photos.map((p) => p.uri),
      );

      // Запускаем AI-обработку в фоне — не ждём результата
      visionService.extract(book.id).catch(() => {});

      setPhotos([]);
      Alert.alert('Отправлено', 'Фотографии загружены. ИИ обрабатывает их в фоне.');
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.message || 'Ошибка создания');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  return (
    <View style={styles.container}>
      {loading && <LoadingOverlay message={loadingMessage} />}

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'box' && (
          <View>
            <Text style={styles.stepTitle}>Шаг 1: Выберите коробку</Text>

            {boxes.length > 0 && (
              <View style={styles.boxList}>
                {boxes.map((box) => (
                  <TouchableOpacity
                    key={box.id}
                    style={[
                      styles.boxItem,
                      selectedBoxId === box.id && styles.boxItemSelected,
                    ]}
                    onPress={() => setSelectedBoxId(box.id)}
                  >
                    <Text
                      style={[
                        styles.boxItemText,
                        selectedBoxId === box.id && styles.boxItemTextSelected,
                      ]}
                    >
                      {box.boxNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.orDivider}>или создайте новую</Text>

            <Input
              label="Номер коробки"
              value={newBoxNumber}
              onChangeText={setNewBoxNumber}
              placeholder="Например: BOX-001"
            />
            <Button title="Создать коробку" onPress={handleCreateBox} />

            {selectedBoxId && (
              <Button
                title="Далее"
                onPress={() => setStep('photos')}
                style={{ marginTop: 16 }}
              />
            )}
          </View>
        )}

        {step === 'photos' && (
          <View>
            <Text style={styles.stepTitle}>Шаг 2: Фотографии</Text>
            <Text style={styles.hint}>
              Фото 1 — обложка с линейкой. Фото 2 — страница с информацией.
            </Text>

            <PhotoGrid
              photos={photos}
              onAdd={handlePickPhotos}
              onRemove={handleRemovePhoto}
            />

            <View style={styles.photoActions}>
              <Button
                title="Камера"
                onPress={handleTakePhoto}
                variant="secondary"
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Галерея"
                onPress={handlePickPhotos}
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>

            <Button
              title="Отправить в обработку"
              onPress={handleSubmitForProcessing}
              disabled={photos.length < 2}
              style={{ marginTop: 16 }}
            />
            <Button
              title="Назад"
              onPress={() => setStep('box')}
              variant="secondary"
              style={{ marginTop: 8 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    lineHeight: 18,
  },
  boxList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  boxItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
  },
  boxItemSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  boxItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  boxItemTextSelected: {
    color: '#1976D2',
  },
  orDivider: {
    textAlign: 'center',
    color: '#aaa',
    marginVertical: 12,
    fontSize: 13,
  },
  photoActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
