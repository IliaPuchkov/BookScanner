import React, { useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  PanResponder,
  Animated,
  Pressable,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
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

  const floatAnim = useRef(new Animated.ValueXY()).current;
  const floatScale = useRef(new Animated.Value(1)).current;

  const [fromIdx, setFromIdx] = useState<number | null>(null);
  const [toIdx, setToIdx] = useState<number | null>(null);

  const isDragging = fromIdx !== null;

  const hasAdd = photos.length < maxPhotos && !!onAdd;
  const totalCells = photos.length + (hasAdd ? 1 : 0);
  const rows = Math.max(1, Math.ceil(totalCells / COLS));
  const gridHeight = rows * ITEM_SIZE + (rows - 1) * GAP;

  const updateContainerPage = () => {
    containerRef.current?.measureInWindow((x, y) => {
      containerPage.current = { x, y };
    });
  };

  // Called by long-press on drag handle — activates drag mode before PanResponder moves
  const startDrag = (index: number) => {
    updateContainerPage();
    const pos = cellXY(index);
    floatAnim.setValue({ x: pos.x, y: pos.y });
    Animated.spring(floatScale, { toValue: 1.08, useNativeDriver: true }).start();
    fromIdxRef.current = index;
    toIdxRef.current = index;
    setFromIdx(index);
    setToIdx(index);
  };

  const endDrag = () => {
    Animated.spring(floatScale, { toValue: 1, useNativeDriver: true }).start();
    const from = fromIdxRef.current;
    const to = toIdxRef.current;
    fromIdxRef.current = null;
    toIdxRef.current = null;
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
      // Never capture at start — let Pressable.onLongPress fire first
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Only take move events once drag is active (set by onLongPress)
      onMoveShouldSetPanResponder: () => fromIdxRef.current !== null,
      onMoveShouldSetPanResponderCapture: () => fromIdxRef.current !== null,

      onPanResponderGrant: (_evt, gs) => {
        if (fromIdxRef.current === null) return;
        // Adjust float to current finger offset from the long-press start
        const startPos = cellXY(fromIdxRef.current);
        floatAnim.setValue({ x: startPos.x + gs.dx, y: startPos.y + gs.dy });
      },

      onPanResponderMove: (_evt, gs) => {
        if (fromIdxRef.current === null) return;
        const startPos = cellXY(fromIdxRef.current);
        floatAnim.setValue({ x: startPos.x + gs.dx, y: startPos.y + gs.dy });

        const relX = gs.moveX - containerPage.current.x;
        const relY = gs.moveY - containerPage.current.y;
        const newTo = indexAtPoint(relX, relY, photosRef.current.length);
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
      onLayout={updateContainerPage}
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
              isFrom && styles.itemGhost,
              isTo && styles.itemTarget,
            ]}
          >
            <Image source={{ uri: photo.uri }} style={styles.image} />
            {onRemove && !isDragging && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(index)}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            )}
            {index < 2 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {index === 0 ? 'Обложка' : 'Инфо'}
                </Text>
              </View>
            )}
            {onReorder && (
              <Pressable
                style={styles.dragHandle}
                onLongPress={() => startDrag(index)}
                delayLongPress={250}
              >
                <Text style={styles.dragHandleIcon}>⠿</Text>
              </Pressable>
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
          <Image
            source={{ uri: dragPhoto.uri }}
            style={styles.floatingImage}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    position: 'relative',
  },
  item: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
  },
  itemGhost: {
    opacity: 0.25,
  },
  itemTarget: {
    borderWidth: 2.5,
    borderColor: '#1976D2',
  },
  floatingItem: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 100,
    elevation: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    // No overflow:'hidden' — causes images to vanish on Android with elevation
  },
  floatingImage: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  dragHandle: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleIcon: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
  },
  addBtn: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 28,
    color: '#999',
  },
  addLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
});
