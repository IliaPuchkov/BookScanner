import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import { AppText } from './AppText';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

interface Props {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  placeholder: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

function toDisplayDate(iso: string): string {
  // Parse as local date to avoid UTC-offset shifting the day
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function toLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePickerInput({
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
}: Props) {
  const [show, setShow] = useState(false);
  // iOS only: temp selection before "Готово"
  const [iosTemp, setIosTemp] = useState<Date | null>(null);

  const selectedDate = value ? toLocalDate(value) : new Date();

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && date) {
        onChange(toIsoDate(date));
      }
    } else {
      if (date) setIosTemp(date);
    }
  };

  const handleIosDone = () => {
    setShow(false);
    if (iosTemp) onChange(toIsoDate(iosTemp));
    setIosTemp(null);
  };

  const handleIosCancel = () => {
    setShow(false);
    setIosTemp(null);
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.input, value ? styles.inputFilled : null]}
        onPress={() => { setIosTemp(null); setShow(true); }}
        activeOpacity={0.7}
      >
        <AppText style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
          {value ? toDisplayDate(value) : placeholder}
        </AppText>
        {value ? (
          <TouchableOpacity
            onPress={() => onChange('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <AppText style={styles.clearIcon}>✕</AppText>
          </TouchableOpacity>
        ) : (
          <AppText style={styles.calIcon}>📅</AppText>
        )}
      </TouchableOpacity>

      {/* Android: renders as native dialog, no wrapping needed */}
      {Platform.OS === 'android' && show && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {/* iOS: bottom sheet modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={show}
          transparent
          animationType="slide"
          onRequestClose={handleIosCancel}
        >
          <TouchableWithoutFeedback onPress={handleIosCancel}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View style={styles.sheet}>
                  <View style={styles.sheetHeader}>
                    <TouchableOpacity onPress={handleIosCancel}>
                      <AppText style={styles.cancelBtn}>Отмена</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleIosDone}>
                      <AppText style={styles.doneBtn}>Готово</AppText>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={iosTemp ?? selectedDate}
                    mode="date"
                    display="spinner"
                    onChange={handleChange}
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    locale="ru-RU"
                    style={styles.picker}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
  },
  inputFilled: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginRight: 4,
  },
  placeholder: {
    color: '#aaa',
  },
  clearIcon: {
    fontSize: 12,
    color: '#999',
    fontWeight: '700',
  },
  calIcon: {
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancelBtn: {
    fontSize: 16,
    color: '#999',
  },
  doneBtn: {
    fontSize: 16,
    color: '#1976D2',
    fontWeight: '600',
  },
  picker: {
    width: '100%',
  },
});
