import { Platform } from "react-native";
import Constants from "expo-constants";

// IP компьютера в локальной сети (обновляется автоматически из Expo)
// Если не работает — укажи вручную: const DEV_MACHINE_IP = '172.20.10.2';
const DEV_MACHINE_IP =
  Constants.expoConfig?.hostUri?.split(":")[0] ?? "172.20.10.2";

const getBaseUrl = (): string => {
  if (__DEV__) {
    if (Platform.OS === "android") {
      // Android эмулятор — специальный адрес host machine
      return `http://10.0.2.2:3000/api`;
    }
    // iOS симулятор и реальное устройство — IP компьютера
    return `http://${DEV_MACHINE_IP}:3000/api`;
  }

  // Production URL — заменить на реальный адрес сервера
  return "https://api.bookscanner.app/api";
};

export const API_BASE_URL = getBaseUrl();
export { DEV_MACHINE_IP };
