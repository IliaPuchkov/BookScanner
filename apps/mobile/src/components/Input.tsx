import React, { type ReactNode } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  rightElement?: ReactNode;
}

export function Input({ label, error, style, rightElement, ...rest }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, error ? styles.inputError : undefined, rightElement ? styles.inputWithRight : undefined, style]}
          placeholderTextColor="#999"
          {...rest}
        />
        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  inputWithRight: {
    paddingRight: 48,
  },
  inputError: {
    borderColor: '#E53935',
  },
  rightElement: {
    position: 'absolute',
    right: 0,
    height: 48,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    fontSize: 12,
    color: '#E53935',
    marginTop: 4,
  },
});
