import Constants from "expo-constants";

// IP компьютера в локальной сети (обновляется автоматически из Expo)
// Если не работает — укажи вручную: const DEV_MACHINE_IP = '172.20.10.2';
const DEV_MACHINE_IP =
  Constants.expoConfig?.hostUri?.split(":")[0] ?? "172.20.10.2";

const getBaseUrl = (): string => {
  if (__DEV__) {
    // Реальное устройство (iOS и Android) — IP компьютера из Expo
    return `http://${DEV_MACHINE_IP}:3000/api`;
    //return "https://bookscanner.duckdns.org/api";
  }

  // Production URL — заменить на реальный адрес сервера
  return "https://bookscanner.duckdns.org/api";
};

export const API_BASE_URL = getBaseUrl();
export { DEV_MACHINE_IP };
