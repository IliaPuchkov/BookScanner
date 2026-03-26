import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import type { AuthStackParamList } from "../../navigation/AuthNavigator";

type Nav = NativeStackNavigationProp<AuthStackParamList, "Login">;

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { login } = useAuth();

  const [phoneOrEmail, setPhoneOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handlePasswordVisibilityIn = () => setShowPassword(true);
  const handlePasswordVisibilityOut = () => setShowPassword(false);

  const handleLogin = async () => {
    if (!phoneOrEmail.trim() || !password.trim()) {
      Alert.alert("Ошибка", "Заполните все поля");
      return;
    }

    setLoading(true);
    try {
      await login(phoneOrEmail.trim(), password);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Неверный логин или пароль";
      Alert.alert("Ошибка входа", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image
            source={require("../../media/images/logos/jolly-book-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Jolly Book</Text>
          <Text style={styles.subtitle}>Вход в систему</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Телефон или Email"
            value={phoneOrEmail}
            onChangeText={setPhoneOrEmail}
            placeholder="+7XXXXXXXXXX или email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            placeholder="Введите пароль"
            secureTextEntry={!showPassword}
            rightElement={
              <TouchableOpacity
                onPressIn={handlePasswordVisibilityIn}
                onPressOut={handlePasswordVisibilityOut}
              >
                <FontAwesome5
                  name={showPassword ? "eye-slash" : "eye"}
                  size={18}
                  color="#999"
                />
              </TouchableOpacity>
            }
          />
          <Button
            title="Войти"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: 8 }}
          />
          <Button
            title="Регистрация"
            onPress={() => navigation.navigate("Register")}
            variant="secondary"
            style={{ marginTop: 12 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1976D2",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 8,
  },
});
