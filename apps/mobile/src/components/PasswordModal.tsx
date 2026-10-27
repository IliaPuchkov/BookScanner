import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Input } from './Input';
import { Button } from './Button';

/** Same rule as the backend's StrongPassword decorator. */
export function passwordRuleError(password: string): string | null {
  if (password.length < 8) return 'Пароль должен быть не менее 8 символов';
  if (password.length > 128) return 'Пароль слишком длинный';
  if (!/(?=.*[a-zа-яё])(?=.*[A-ZА-ЯЁ])(?=.*\d)/.test(password)) {
    return 'Пароль должен содержать строчные и заглавные буквы, а также цифры';
  }
  return null;
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Ask for the current password first (own password change). */
  askCurrent?: boolean;
  currentLabel?: string;
  submitTitle?: string;
  onSubmit: (newPassword: string, currentPassword: string) => Promise<void>;
  /** Called after a successful submit or extra action, and on cancel unless onCancel is given. */
  onClose: () => void;
  /** Replaces the cancel button's default (onClose), e.g. "Выйти". */
  cancelTitle?: string;
  onCancel?: () => void;
  /** A second way to finish, e.g. "Сгенерировать автоматически". */
  extraAction?: { title: string; onPress: () => Promise<void> };
}

export function PasswordModal({
  visible,
  title,
  subtitle,
  askCurrent = false,
  currentLabel = 'Текущий пароль',
  submitTitle = 'Сохранить',
  onSubmit,
  onClose,
  cancelTitle = 'Отмена',
  onCancel,
  extraAction,
}: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
    setShow(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const cancel = () => {
    if (!onCancel) return close();
    reset();
    onCancel();
  };

  const errorText = (err: any) => {
    const message = err?.response?.data?.message;
    return (Array.isArray(message) ? message[0] : message) || 'Не удалось изменить пароль';
  };

  const handleExtra = async () => {
    if (!extraAction) return;
    setSaving(true);
    setError(null);
    try {
      await extraAction.onPress();
      close();
    } catch (err: any) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (askCurrent && !current) {
      setError('Введите текущий пароль');
      return;
    }
    const ruleError = passwordRuleError(next);
    if (ruleError) {
      setError(ruleError);
      return;
    }
    if (next !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(next, current);
      close();
    } catch (err: any) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const eye = (
    <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={8}>
      <FontAwesome5 name={show ? 'eye-slash' : 'eye'} size={18} color="#999" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={cancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modal}>
          <AppText style={styles.title}>{title}</AppText>
          {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {askCurrent && (
              <Input
                label={currentLabel}
                value={current}
                onChangeText={setCurrent}
                secureTextEntry={!show}
                autoCapitalize="none"
                rightElement={eye}
              />
            )}
            <Input
              label="Новый пароль"
              value={next}
              onChangeText={setNext}
              secureTextEntry={!show}
              autoCapitalize="none"
              rightElement={askCurrent ? undefined : eye}
            />
            <Input
              label="Повторите новый пароль"
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry={!show}
              autoCapitalize="none"
            />
            <AppText style={styles.hint}>
              Минимум 8 символов, строчные и заглавные буквы и цифры
            </AppText>
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <Button title={submitTitle} onPress={handleSubmit} loading={saving} />
            {extraAction ? (
              <Button
                title={extraAction.title}
                onPress={handleExtra}
                disabled={saving}
                variant="secondary"
                style={{ marginTop: 8 }}
              />
            ) : null}
            <Button title={cancelTitle} onPress={cancel} variant="secondary" style={{ marginTop: 8 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: -8,
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    color: '#E53935',
    marginBottom: 12,
  },
});
