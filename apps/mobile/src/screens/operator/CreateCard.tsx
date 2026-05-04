import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { AppText } from '../../components/AppText';
import { useRoute, type RouteProp } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import ImageCropPicker from "react-native-image-crop-picker";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { PhotoGrid } from "../../components/PhotoGrid";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { booksService } from "../../services/books.service";
import { boxesService } from "../../services/boxes.service";
import { visionService } from "../../services/vision.service";
import { sessionStore } from "../../utils/sessionStore";
import type { Box } from "../../types";
import type { OperatorStackParamList } from "../../navigation/OperatorNavigator";

type Route = RouteProp<OperatorStackParamList, "CreateCard">;

interface PhotoItem {
  uri: string;
  id?: string;
  isSmall?: boolean;
}

const OZON_MIN_PX = 200;

function warnIfSmallPhotos(items: Array<{ width: number; height: number }>) {
const small = items.filter((i) => i.width < OZON_MIN_PX || i.height < OZON_MIN_PX);
  if (small.length > 0) {
    Alert.alert(
      "Маленькое разрешение фото",
      `${small.length === 1 ? "1 фото" : `${small.length} фото`} имеют разрешение меньше 200×200 пикселей. Ozon не примет такие фото — сделайте снимок с большего расстояния.`,
      [{ text: "Понятно" }],
    );
  }
}

export function CreateCardScreen() {
  const route = useRoute<Route>();

  const [step, setStep] = useState<"box" | "photos">("box");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Box
  const sessionId = route.params?.sessionId;
  const [boxes, setBoxes] = useState<Box[]>(() =>
    sessionId ? sessionStore.getBoxes(sessionId) : [],
  );
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(
    route.params?.boxId ?? null,
  );
  const [newBoxNumber, setNewBoxNumber] = useState("");
  const [boxesLoading, setBoxesLoading] = useState(true);

  useEffect(() => {
    boxesService
      .getBoxes(1, 100)
      .then(({ data }) => {
        setBoxes((prev) => {
          const prevIds = new Set(prev.map((b) => b.id));
          const fresh = data.filter((b) => !prevIds.has(b.id));
          return [...prev, ...fresh];
        });
      })
      .catch(() => {})
      .finally(() => setBoxesLoading(false));
  }, []);

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const handleCreateBox = async () => {
    if (!newBoxNumber.trim()) {
      Alert.alert("Ошибка", "Введите номер коробки");
      return;
    }
    setLoading(true);
    try {
      const box = await boxesService.createBox({
        boxNumber: newBoxNumber.trim(),
      });
      if (sessionId) sessionStore.addBox(box);
      setBoxes((prev) => [box, ...prev]);
      setSelectedBoxId(box.id);
      setNewBoxNumber("");
      setStep("photos");
    } catch (err: any) {
      Alert.alert(
        "Ошибка",
        err?.response?.data?.message || "Не удалось создать коробку",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePickPhotos = async () => {
    try {
      const results = await ImageCropPicker.openPicker({
        multiple: true,
        maxFiles: 10 - photos.length,
        mediaType: "photo",
        compressImageQuality: 0.8,
      });
      warnIfSmallPhotos(results);
      setPhotos((prev) => [
        ...prev,
        ...results.map((r) => ({
          uri: r.path,
          isSmall: r.width < OZON_MIN_PX || r.height < OZON_MIN_PX,
        })),
      ]);
    } catch (err: any) {
      if (err?.code !== "E_PICKER_CANCELLED") {
        Alert.alert("Ошибка", "Не удалось выбрать фото");
      }
    }
  };

  const handleTakePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      warnIfSmallPhotos(result.assets);
      setPhotos((prev) => [
        ...prev,
        { uri: asset.uri, isSmall: asset.width < OZON_MIN_PX || asset.height < OZON_MIN_PX },
      ]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRotatePhoto = async (index: number) => {
    const photo = photos[index];
    try {
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.resize({ width: 2000 });
      ctx.rotate(90);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      setPhotos((prev) =>
        prev.map((p, i) => (i === index ? { ...p, uri: saved.uri } : p)),
      );
    } catch {
      Alert.alert("Ошибка", "Не удалось повернуть фото");
    }
  };

  const handleRetakePhoto = async (index: number) => {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const asset = result.assets[0];
      warnIfSmallPhotos(result.assets);
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === index
            ? { uri: asset.uri, isSmall: asset.width < OZON_MIN_PX || asset.height < OZON_MIN_PX }
            : p,
        ),
      );
    }
  };

  const handleCropPhoto = async (index: number) => {
    const photo = photos[index];
    try {
      const result = await ImageCropPicker.openCropper({
        path: photo.uri,
        mediaType: "photo",
        freeStyleCropEnabled: true,
        cropping: true,
        compressImageQuality: 0.8,
        cropperToolbarTitle: "Кадрировать",
      });
      setPhotos((prev) =>
        prev.map((p, i) => (i === index ? { uri: result.path } : p)),
      );
    } catch (err: any) {
      if (err?.code !== "E_PICKER_CANCELLED") {
        Alert.alert("Ошибка", "Не удалось кадрировать фото");
      }
    }
  };

  const handlePhotoPress = (index: number) => {
    Alert.alert("Действие с фото", undefined, [
      { text: "Повернуть", onPress: () => handleRotatePhoto(index) },
      { text: "Кадрировать", onPress: () => handleCropPhoto(index) },
      { text: "Переснять", onPress: () => handleRetakePhoto(index) },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => handleRemovePhoto(index),
      },
      { text: "Отмена", style: "cancel" },
    ]);
  };

  const handleSubmitForProcessing = async () => {
    if (!selectedBoxId) {
      Alert.alert("Ошибка", "Выберите коробку");
      return;
    }
    if (photos.length < 2) {
      Alert.alert(
        "Ошибка",
        "Нужно минимум 2 фото (обложка и страница с информацией)",
      );
      return;
    }
    if (photos.some((p) => p.isSmall)) {
      Alert.alert(
        "Маленькое разрешение",
        "Одно или несколько фото имеют разрешение меньше 200×200 пикселей. Замените их перед отправкой.",
        [{ text: "Понятно" }],
      );
      return;
    }

    setLoading(true);
    setLoadingMessage("Создание карточки и загрузка фотографий...");
    try {
      const book = await booksService.createBookWithPhotos(
        {
          title: "Новая книга",
          boxId: selectedBoxId,
          workSessionId: sessionId,
        },
        photos.map((p) => p.uri),
      );

      // Запускаем AI-обработку в фоне — не ждём результата
      visionService.extract(book.id).catch(() => {});

      setPhotos([]);
      Alert.alert(
        "Отправлено, артикул: " + book.sku,
        "Карточка создана. Можете приступать к созданию следующей.",
      );
    } catch (err: any) {
      Alert.alert("Ошибка", err?.response?.data?.message || "Ошибка создания");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <View style={styles.container}>
      {loading && <LoadingOverlay message={loadingMessage} />}

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {step === "box" && (
          <View>
            <AppText style={styles.stepTitle}>
              Выберите коробку в которой работаете
            </AppText>

            {boxesLoading && (
              <ActivityIndicator
                size="small"
                color="#1976D2"
                style={{ marginBottom: 12 }}
              />
            )}

            {boxes.length > 0 && (
              <>
                <View style={styles.boxList}>
                  {boxes.map((box) => (
                    <TouchableOpacity
                      key={box.id}
                      style={[
                        styles.boxItem,
                        selectedBoxId === box.id && styles.boxItemSelected,
                      ]}
                      onPress={() => {
                        selectedBoxId === box.id
                          ? setSelectedBoxId(null)
                          : setSelectedBoxId(box.id);
                        setNewBoxNumber("");
                      }}
                    >
                      <AppText
                        style={[
                          styles.boxItemText,
                          selectedBoxId === box.id &&
                            styles.boxItemTextSelected,
                        ]}
                      >
                        {box.boxNumber}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedBoxId && (
                  <Button
                    title="Далее"
                    onPress={() => setStep("photos")}
                    style={{ marginTop: 16 }}
                  />
                )}
                <AppText style={styles.orDivider}>Или создайте новую:</AppText>
              </>
            )}

            <Input
              label="Номер коробки"
              value={newBoxNumber}
              onChangeText={setNewBoxNumber}
              placeholder="Например: 123"
              onKeyPress={() => setSelectedBoxId(null)}
            />
            {newBoxNumber && (
              <Button title="Создать коробку" onPress={handleCreateBox} />
            )}
          </View>
        )}

        {step === "photos" && (
          <View>
            <AppText style={styles.stepTitle}>Загрузка фотографий</AppText>
            <AppText style={styles.attention}>
              {""}
              Вы работаете с коробкой №
              {boxes.find((b) => b.id === selectedBoxId)?.boxNumber}
              {""}
            </AppText>
            <AppText style={styles.hint}>
              Фото 1 — обложка с линейкой. Фото 2 — страница с информацией.
            </AppText>

            <PhotoGrid
              photos={photos}
              onAdd={handlePickPhotos}
              onRemove={handleRemovePhoto}
              onReorder={setPhotos}
              onRotate={handleRotatePhoto}
              onPress={handlePhotoPress}
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
              title="Создать карточку книги"
              onPress={handleSubmitForProcessing}
              disabled={photos.length < 2}
              style={{ marginTop: 16 }}
            />
            <Button
              title="Назад"
              onPress={() => setStep("box")}
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
    backgroundColor: "#fff",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    marginBottom: 16,
    lineHeight: 18,
  },
  attention: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#D32F2F",
    marginBottom: 16,
    lineHeight: 18,
  },
  boxList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  boxItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#ddd",
  },
  boxItemSelected: {
    borderColor: "#1976D2",
    backgroundColor: "#E3F2FD",
  },
  boxItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },
  boxItemTextSelected: {
    color: "#1976D2",
  },
  orDivider: {
    textAlign: "center",
    // color: "#aaa",
    marginVertical: 20,
    // fontSize: 13,
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  photoActions: {
    flexDirection: "row",
    marginTop: 16,
  },
});
