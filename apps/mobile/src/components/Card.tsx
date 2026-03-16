import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { BookStatus } from '../types';
import type { Book } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  book: Book;
  onPress: () => void;
}

export function BookCard({ book, onPress }: Props) {
  const coverPhoto = book.photos?.find((p) => p.sortOrder === 0);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {coverPhoto ? (
        <Image source={{ uri: coverPhoto.fileUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>Нет фото</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        {book.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
        <Text style={styles.sku}>{book.sku}</Text>
        {book.price != null && Number(book.price) > 0 && (
          <Text style={styles.price}>{Number(book.price).toFixed(0)} ₽</Text>
        )}
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: book.status === BookStatus.PUBLISHED ? '#43A047' : '#FB8C00' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: book.status === BookStatus.PUBLISHED ? '#43A047' : '#FB8C00' },
            ]}
          >
            {book.status === BookStatus.PUBLISHED
              ? 'Создана на Озоне'
              : 'Ожидает подтверждения'}
          </Text>
        </View>
        <View style={styles.meta}>
          {book.createdBy?.fullName ? (
            <Text style={styles.metaText} numberOfLines={1}>
              {book.createdBy.fullName}
            </Text>
          ) : null}
          <Text style={styles.metaText}>{formatDate(book.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: 70,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 10,
    color: '#999',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  author: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  sku: {
    fontSize: 12,
    color: '#999',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
    marginTop: 4,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#aaa',
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
  },
});
