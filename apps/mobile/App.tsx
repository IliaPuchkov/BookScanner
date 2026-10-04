import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { MaintenanceProvider } from './src/context/MaintenanceContext';
import { ServerStatusProvider } from './src/context/ServerStatusContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { UndoProvider } from './src/context/UndoContext';
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
      <ThemeProvider>
        <ServerStatusProvider>
          <MaintenanceProvider>
            <AuthProvider>
              <UndoProvider>
                <StatusBar style="light" />
                <AppNavigator />
              </UndoProvider>
            </AuthProvider>
          </MaintenanceProvider>
        </ServerStatusProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
