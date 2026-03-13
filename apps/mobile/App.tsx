import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { DevNavigator } from './src/navigation/DevNavigator';

// TODO: переключить на false перед релизом
const DEV_MODE = false;

export default function App() {
  if (DEV_MODE) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <DevNavigator />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
