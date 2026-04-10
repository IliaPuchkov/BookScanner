import Constants from "expo-constants";

// IP компьютера в локальной сети.
// Expo автоматически подставляет адрес девсервера через hostUri.
// Если не работает — заменить на статический IP вручную (например "192.168.1.100").
const DEV_MACHINE_IP =
  Constants.expoConfig?.hostUri?.split(":")[0] ??
  Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(":")[0] ??
  "172.20.10.2";

const getBaseUrl = (): string => {
  if (__DEV__) {
    // Реальное устройство (iOS и Android) — IP компьютера из Expo
    return `http://192.168.1.3:3000/api`;
    //return "https://bookscanner.duckdns.org/api";
    //return "https://jollybook.duckdns.org/api";
  }

  // Production URL — заменить на реальный адрес сервера
  return "https://jollybook.duckdns.org/api";
};

export const API_BASE_URL = getBaseUrl();
export { DEV_MACHINE_IP };
