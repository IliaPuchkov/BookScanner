import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function AppText({ style, ...props }: TextProps) {
  const { fontScale } = useTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  const base = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  return <Text {...props} style={[style, { fontSize: base * fontScale }]} />;
}
