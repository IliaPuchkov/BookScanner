import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

type LegalDocumentRouteProp = RouteProp<AuthStackParamList, 'LegalDocument'>;

export function LegalDocumentScreen() {
  const { params } = useRoute<LegalDocumentRouteProp>();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.body}>{params.text}</Text>
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
    padding: 20,
    paddingBottom: 40,
  },
  body: {
    fontSize: 13,
    color: '#333',
    lineHeight: 22,
  },
});
