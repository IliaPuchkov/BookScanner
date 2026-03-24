import React, { useRef, useState } from "react";
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const ITEM_SIZE = (SCREEN_WIDTH - 48 - 16) / 3;
const GAP = 8;
const COLS = 3;

interface PhotoItem {
  uri: string;
  id?: string;
}

interface Props {
  photos: PhotoItem[];
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  onReorder?: (photos: PhotoItem[]) => void;
  onRotate?: (index: number) => void;
  onPress?: (index: number) => void;
  maxPhotos?: number;
}

function cellXY(idx: number) {
  return {
    x: (idx % COLS) * (ITEM_SIZE + GAP),
    y: Math.floor(idx / COLS) * (ITEM_SIZE + GAP),
  };
}

function indexAtPoint(rx: number, ry: number, count: number): number | null {
  if (rx < 0 || ry < 0) return null;
  const col = Math.floor(rx / (ITEM_SIZE + GAP));
  const row = Math.floor(ry / (ITEM_SIZE + GAP));
  if (col < 0 || col >= COLS) return null;
  const idx = row * COLS + col;
  return idx >= 0 && idx < count ? idx : null;
}

export function PhotoGrid({
  photos,
  onAdd,
  onRemove,
  onReorder,
  onRotate,
  onPress,
  maxPhotos = 10,
}: Props) {
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const fromIdxRef = useRef<number | null>(null);
  const toIdxRef = useRef<number | null>(null);
  const containerPage = useRef({ x: 0, y: 0 });
  const containerRef = useRef<View>(null);

  // Offset from finger to top-left of the item at drag start
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const floatAnim = useRef(new Animated.ValueXY()).current;
  const floatScale = useRef(new Animated.Value(1)).current;

  const [fromIdx, setFromIdx] = useState<number | null>(null);
  const [toIdx, setToIdx] = useState<number | null>(null);

  const isDragging = fromIdx !== null;

  const hasAdd = photos.length < maxPhotos && !!onAdd;
  const totalCells = photos.length + (hasAdd ? 1 : 0);
  const rows = Math.max(1, Math.ceil(totalCells / COLS));
  const gridHeight = rows * ITEM_SIZE + (rows - 1) * GAP;

  const updateContainerPage = (cb?: () => void) => {
    containerRef.current?.measureInWindow((x, y) => {
      containerPage.current = { x, y };
      cb?.();
    });
  };

  // Called from onLongPress on the photo item — receives the page-coordinates of the finger
  const startDrag = (
    index: number,
    fingerPageX: number,
    fingerPageY: number,
  ) => {
    updateContainerPage(() => {
      const pos = cellXY(index);
      // Compute offset so the item stays "under" the finger at the exact touch point
      const relX = fingerPageX - containerPage.current.x;
      const relY = fingerPageY - containerPage.current.y;
      dragOffsetRef.current = {
        x: relX - pos.x,
        y: relY - pos.y,
      };
      floatAnim.setValue({ x: pos.x, y: pos.y });
      Animated.spring(floatScale, {
        toValue: 1.08,
        useNativeDriver: true,
      }).start();
      fromIdxRef.current = index;
      toIdxRef.current = index;
      setFromIdx(index);
      setToIdx(index);
    });
  };

  const endDrag = () => {
    Animated.spring(floatScale, { toValue: 1, useNativeDriver: true }).start();
    const from = fromIdxRef.current;
    const to = toIdxRef.current;
    fromIdxRef.current = null;
    toIdxRef.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
    setFromIdx(null);
    setToIdx(null);

    if (from !== null && to !== null && from !== to && onReorderRef.current) {
      const arr = [...photosRef.current];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      onReorderRef.current(arr);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Capture move events as soon as drag is active
      onMoveShouldSetPanResponder: () => fromIdxRef.current !== null,
      onMoveShouldSetPanResponderCapture: () => fromIdxRef.current !== null,

      onPanResponderMove: (_evt, gs) => {
        if (fromIdxRef.current === null) return;
        // Position float so the finger stays at the same relative point it held on long-press
        const relX =
          gs.moveX - containerPage.current.x - dragOffsetRef.current.x;
        const relY =
          gs.moveY - containerPage.current.y - dragOffsetRef.current.y;
        floatAnim.setValue({ x: relX, y: relY });

        const hoverX = gs.moveX - containerPage.current.x;
        const hoverY = gs.moveY - containerPage.current.y;
        const newTo = indexAtPoint(hoverX, hoverY, photosRef.current.length);
        if (newTo !== null && newTo !== toIdxRef.current) {
          toIdxRef.current = newTo;
          setToIdx(newTo);
        }
      },

      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }),
  ).current;

  const dragPhoto = fromIdx !== null ? photos[fromIdx] : null;

  return (
    <View
      ref={containerRef}
      style={[styles.grid, { height: gridHeight }]}
      onLayout={() => updateContainerPage()}
      {...(onReorder ? panResponder.panHandlers : {})}
    >
      {photos.map((photo, index) => {
        const { x, y } = cellXY(index);
        const isFrom = index === fromIdx;
        const isTo = index === toIdx && index !== fromIdx;
        return (
          <View
            key={photo.id ?? `photo-${index}`}
            style={[
              styles.item,
              { left: x, top: y },
              isTo && styles.itemTarget,
            ]}
          >
            <Image source={{ uri: photo.uri }} style={styles.image} />
            {/* Ghost overlay: uses backgroundColor instead of opacity on the container View.
                Avoids Android bug where overflow:hidden + opacity change leaves view invisible. */}
            {isFrom && (
              <View style={styles.ghostOverlay} pointerEvents="none" />
            )}
            {(onReorder || onPress) && (
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => !isDragging && onPress?.(index)}
                onLongPress={(e) =>
                  onReorder &&
                  startDrag(index, e.nativeEvent.pageX, e.nativeEvent.pageY)
                }
                delayLongPress={250}
              />
            )}
            {index < 2 && (
              <View style={styles.badge} pointerEvents="none">
                <Text style={styles.badgeText}>
                  {index === 0 ? "Обложка" : "Инфо"}
                </Text>
              </View>
            )}
            {onRemove && !isDragging && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(index)}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            )}
            {onRotate && !isDragging && (
              <TouchableOpacity
                style={styles.rotateBtn}
                onPress={() => onRotate(index)}
              >
                <Text style={styles.rotateBtnText}>↻</Text>
              </TouchableOpacity>
            )}
            {onReorder && (
              <View style={styles.dragIndicator} pointerEvents="none">
                <Text style={styles.dragIndicatorIcon}>⠿</Text>
              </View>
            )}
          </View>
        );
      })}

      {hasAdd && !isDragging && (
        <TouchableOpacity
          style={[
            styles.addBtn,
            { left: cellXY(photos.length).x, top: cellXY(photos.length).y },
          ]}
          onPress={onAdd}
        >
          <Text style={styles.addText}>+</Text>
          <Text style={styles.addLabel}>Добавить</Text>
        </TouchableOpacity>
      )}

      {dragPhoto && (
        <Animated.View
          style={[
            styles.floatingItem,
            {
              width: ITEM_SIZE,
              height: ITEM_SIZE,
              transform: [
                { translateX: floatAnim.x },
                { translateY: floatAnim.y },
                { scale: floatScale },
              ],
            },
          ]}
          pointerEvents="none"
        >
          {/* borderRadius on Image avoids Android Animated.View + overflow:hidden bug */}
          <Image source={{ uri: dragPhoto.uri }} style={styles.floatingImage} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    position: "relative",
  },
  item: {
    position: "absolute",
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
    //overflow: "hidden",
  },
  itemGhost: {
    opacity: 0.45,
  },
  ghostOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  itemTarget: {
    borderWidth: 2.5,
    borderColor: "#1976D2",
  },
  floatingItem: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 100,
    elevation: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    //overflow: "hidden", //— causes images to vanish on Android with elevation
  },
  floatingImage: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  rotateBtn: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  rotateBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 16,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 2,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  dragIndicator: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  dragIndicatorIcon: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 14,
  },
  addBtn: {
    position: "absolute",
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    fontSize: 28,
    color: "#999",
  },
  addLabel: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },
});
