import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";
import {
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_TEXT,
  PUBLIC_OFFER_TITLE,
  PUBLIC_OFFER_TEXT,
} from "../../constants/legal";

type NavProp = NativeStackNavigationProp<AuthStackParamList>;

export function RegisterScreen() {
  const navigation = useNavigation<NavProp>();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentOffer, setConsentOffer] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = consentPrivacy && consentOffer;

  const handleRegister = async () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      Alert.alert("Ошибка", "Заполните все поля");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Ошибка", "Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Ошибка", "Пароль должен быть не менее 8 символов");
      return;
    }
    if (!/(?=.*[a-zа-яё])(?=.*[A-ZА-ЯЁ])(?=.*\d)/.test(password)) {
      Alert.alert(
        "Ошибка",
        "Пароль должен содержать строчные и заглавные буквы, а также цифры",
      );
      return;
    }
    if (!canSubmit) {
      Alert.alert(
        "Ошибка",
        "Необходимо принять политику конфиденциальности и пользовательское соглашение",
      );
      return;
    }

    setLoading(true);
    try {
      await register(fullName.trim(), phone.trim(), email.trim(), password);
      Alert.alert(
        "Регистрация",
        "Заявка отправлена. Ожидайте подтверждения администратора.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const raw = err?.response?.data?.message;
      const message = Array.isArray(raw)
        ? raw.join("\n")
        : raw || "Ошибка регистрации";
      Alert.alert("Ошибка", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Регистрация</Text>
        <Text style={styles.subtitle}>
          После регистрации необходимо подтверждение администратора
        </Text>

        <View style={styles.form}>
          <Input
            label="ФИО"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Иванов Иван Иванович"
          />
          <Input
            label="Телефон"
            value={phone}
            onChangeText={setPhone}
            placeholder="+7XXXXXXXXXX"
            keyboardType="phone-pad"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="example@mail.ru"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            placeholder="Минимум 8 символов"
            secureTextEntry
          />
          <Input
            label="Подтверждение пароля"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Повторите пароль"
            secureTextEntry
          />

          <View style={styles.consentBlock}>
            <ConsentRow
              checked={consentPrivacy}
              onToggle={() => setConsentPrivacy((v) => !v)}
              label="Я ознакомился(-ась) с "
              linkText="Политикой конфиденциальности"
              onLinkPress={() =>
                navigation.navigate("LegalDocument", {
                  title: PRIVACY_POLICY_TITLE,
                  text: PRIVACY_POLICY_TEXT,
                })
              }
              suffix=" и принимаю её"
            />
            <ConsentRow
              checked={consentOffer}
              onToggle={() => setConsentOffer((v) => !v)}
              label="Я принимаю условия "
              linkText="Пользовательского соглашения"
              onLinkPress={() =>
                navigation.navigate("LegalDocument", {
                  title: PUBLIC_OFFER_TITLE,
                  text: PUBLIC_OFFER_TEXT,
                })
              }
            />
          </View>

          <Button
            title="Зарегистрироваться"
            onPress={handleRegister}
            loading={loading}
            disabled={!canSubmit}
            style={{ marginTop: 8 }}
          />
          <Button
            title="Назад к входу"
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={{ marginTop: 12 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ConsentRow({
  checked,
  onToggle,
  label,
  linkText,
  onLinkPress,
  suffix,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  linkText: string;
  onLinkPress: () => void;
  suffix?: string;
}) {
  return (
    <View style={styles.consentRow}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={styles.checkboxWrapper}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
      <Text style={styles.consentText}>
        <Text onPress={onToggle}>{label}</Text>
        <Text style={styles.consentLink} onPress={onLinkPress} suppressHighlighting>
          {linkText}
        </Text>
        {suffix ? <Text onPress={onToggle}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1976D2",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  form: {
    width: "100%",
  },
  consentBlock: {
    marginTop: 20,
    marginBottom: 4,
    gap: 12,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkboxWrapper: {
    paddingTop: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#1976D2",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: "#1976D2",
  },
  checkmark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: "#444",
    lineHeight: 20,
  },
  consentLink: {
    color: "#1976D2",
    textDecorationLine: "underline",
  },
});
