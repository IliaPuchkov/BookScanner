import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppText } from "../../components/AppText";
import { adminService } from "../../services/admin.service";
import { settingsStyles as s } from "./settingsStyles";

const AI_PROMPT_KEY = "vision_ai_prompt";

export function AiPromptScreen() {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const settings = await adminService.getSettings();
      const value = settings.find((x) => x.key === AI_PROMPT_KEY)?.value ?? "";
      setSaved(value);
      setDraft(value);
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить промпт");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const dirty = draft.trim() !== saved.trim();

  const handleSave = async () => {
    const value = draft.trim();
    if (!value) {
      Alert.alert("Ошибка", "Промпт не может быть пустым");
      return;
    }
    setSaving(true);
    try {
      await adminService.upsertSetting({
        key: AI_PROMPT_KEY,
        value,
        description: "Кастомный промпт для AI-распознавания книг",
        valueType: "string",
      });
      setSaved(value);
      setDraft(value);
      Alert.alert("Готово", "Промпт сохранён");
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить промпт");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#1976D2" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#1976D2"]}
            tintColor="#1976D2"
          />
        }
      >
        <View style={s.card}>
          <AppText style={s.sectionTitle}>AI-промпт для распознавания</AppText>
          <AppText style={s.sectionDesc}>
            Этот промпт передаётся в ИИ при извлечении данных из фотографий
            книг. Изменения действуют для новых распознаваний.
          </AppText>
          <TextInput
            style={styles.promptInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Введите промпт..."
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
            editable={!saving}
          />
          <AppText style={styles.counter}>{draft.length} символов</AppText>
        </View>

        <TouchableOpacity
          style={[s.saveBtn, (!dirty || saving) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppText style={s.saveBtnText}>Сохранить</AppText>
          )}
        </TouchableOpacity>
        {dirty && !saving && (
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => setDraft(saved)}
            activeOpacity={0.8}
          >
            <AppText style={s.secondaryBtnText}>Отменить изменения</AppText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  promptInput: {
    minHeight: 320,
    borderWidth: 1.5,
    borderColor: "#1976D2",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#222",
    backgroundColor: "#FAFAFA",
  },
  counter: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
    textAlign: "right",
  },
});
