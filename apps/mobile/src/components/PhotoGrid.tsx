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

/** Pixel position of cell at index relative to the grid container */
function cellXY(idx: number) {
  return {
    x: (idx % COLS) * (ITEM_SIZE + GAP),
    y: Math.floor(idx / COLS) * (ITEM_SIZE + GAP),
  };
}

/** Which photo index does a container-relative point map to? */
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
  // Stable refs for PanResponder (avoids stale closures)
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

  // Grid needs explicit height for absolute layout
  const hasAdd = photos.length < maxPhotos && !!onAdd;
  const totalCells = photos.length + (hasAdd ? 1 : 0);
  const rows = Math.max(1, Math.ceil(totalCells / COLS));
  const gridHeight = rows * ITEM_SIZE + (rows - 1) * GAP;

  const panResponder = useRef(
    PanResponder.create({
      // Don't steal taps — let TouchableOpacity children handle them
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Activate once the finger starts moving
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (_evt, gs) => {
        // gs.x0/y0 = page coords of the very first touch (set at touch-start)
        const relX = gs.x0 - containerPage.current.x;
        const relY = gs.y0 - containerPage.current.y;
        const idx = indexAtPoint(relX, relY, photosRef.current.length);
        if (idx === null) return;

        const pos = cellXY(idx);
        floatAnim.setValue({ x: pos.x, y: pos.y });
        Animated.spring(floatScale, {
          toValue: 1.08,
          useNativeDriver: true,
        }).start();

        fromIdxRef.current = idx;
        toIdxRef.current = idx;
        setFromIdx(idx);
        setToIdx(idx);
      },

      onPanResponderMove: (_evt, gs) => {
        if (fromIdxRef.current === null) return;

        const startPos = cellXY(fromIdxRef.current);
        floatAnim.setValue({
          x: startPos.x + gs.dx,
          y: startPos.y + gs.dy,
        });

        const relX = gs.moveX - containerPage.current.x;
        const relY = gs.moveY - containerPage.current.y;
        const newTo = indexAtPoint(relX, relY, photosRef.current.length);
        if (newTo !== null && newTo !== toIdxRef.current) {
          toIdxRef.current = newTo;
          setToIdx(newTo);
        }
      },

      onPanResponderRelease: () => {
        Animated.spring(floatScale, {
          toValue: 1,
          useNativeDriver: true,
        }).start();

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
      },

      onPanResponderTerminate: () => {
        Animated.spring(floatScale, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
        fromIdxRef.current = null;
        toIdxRef.current = null;
        setFromIdx(null);
        setToIdx(null);
      },
    }),
  ).current;

  const dragPhoto = fromIdx !== null ? photos[fromIdx] : null;

  return (
    <View
      ref={containerRef}
      style={[styles.grid, { height: gridHeight }]}
      onLayout={() => {
        containerRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
          containerPage.current = { x: px, y: py };
        });
      }}
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
              <View style={styles.dragHandle} pointerEvents="none">
                <Text style={styles.dragHandleIcon}>⠿</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Add button */}
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

      {/* Floating copy that follows the finger */}
      {dragPhoto && (
        <Animated.View
          style={[
            styles.item,
            styles.floatingItem,
            {
              transform: [
                { translateX: floatAnim.x },
                { translateY: floatAnim.y },
                { scale: floatScale },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Image source={{ uri: dragPhoto.uri }} style={styles.image} />
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
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    borderRadius: 8,
    overflow: 'hidden',
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
    width: 20,
    height: 20,
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
