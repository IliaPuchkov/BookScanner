import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - 48 - 16) / 3;

interface Props {
  photos: Array<{ uri: string; id?: string }>;
  onAdd?: () => void;
  onRemove?: (index: number) => void;
  maxPhotos?: number;
}

export function PhotoGrid({ photos, onAdd, onRemove, maxPhotos = 10 }: Props) {
  return (
    <View style={styles.grid}>
      {photos.map((photo, index) => (
        <View key={photo.id ?? index} style={styles.item}>
          <Image source={{ uri: photo.uri }} style={styles.image} />
          {onRemove && (
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
        </View>
      ))}
      {photos.length < maxPhotos && onAdd && (
        <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addText}>+</Text>
          <Text style={styles.addLabel}>Добавить</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
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
  addBtn: {
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
