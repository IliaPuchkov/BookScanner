import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { CardsListScreen } from '../screens/operator/CardsList';
import { CreateCardScreen } from '../screens/operator/CreateCard';
import { CardDetailScreen } from '../screens/operator/CardDetail';
import { PhotoUploadScreen } from '../screens/operator/PhotoUpload';
import { ProfileScreen } from '../screens/operator/ProfileScreen';
import { DashboardScreen } from '../screens/admin/Dashboard';
import { UserManagementScreen } from '../screens/admin/UserManagement';
import { StatisticsScreen } from '../screens/admin/Statistics';
import { BookDatabaseScreen } from '../screens/admin/BookDatabase';

const SCREENS = [
  { key: 'Login', title: 'Login', group: 'Auth', component: LoginScreen },
  { key: 'Register', title: 'Register', group: 'Auth', component: RegisterScreen },
  { key: 'CardsList', title: 'CardsList', group: 'Operator', component: CardsListScreen },
  { key: 'CreateCard', title: 'CreateCard', group: 'Operator', component: CreateCardScreen },
  { key: 'CardDetail', title: 'CardDetail', group: 'Operator', component: CardDetailScreen, params: { bookId: 'dev-mock-id' } },
  { key: 'PhotoUpload', title: 'PhotoUpload', group: 'Operator', component: PhotoUploadScreen, params: { bookId: 'dev-mock-id' } },
  { key: 'Profile', title: 'Profile', group: 'Operator', component: ProfileScreen },
  { key: 'Dashboard', title: 'Dashboard', group: 'Admin', component: DashboardScreen },
  { key: 'UserManagement', title: 'UserManagement', group: 'Admin', component: UserManagementScreen },
  { key: 'Statistics', title: 'Statistics', group: 'Admin', component: StatisticsScreen },
  { key: 'BookDatabase', title: 'BookDatabase', group: 'Admin', component: BookDatabaseScreen },
] as const;

const Stack = createNativeStackNavigator();

function DevMenu({ onSelect }: { onSelect: (key: string) => void }) {
  const groups = ['Auth', 'Operator', 'Admin'] as const;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.header}>DEV PANEL</Text>
        <Text style={styles.hint}>Нажмите на экран для просмотра</Text>

        {groups.map((group) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            {SCREENS.filter((s) => s.group === group).map((screen) => (
              <TouchableOpacity
                key={screen.key}
                style={styles.item}
                onPress={() => onSelect(screen.key)}
                activeOpacity={0.6}
              >
                <Text style={styles.itemText}>{screen.title}</Text>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export function DevNavigator() {
  const [activeScreen, setActiveScreen] = useState<string | null>(null);

  if (!activeScreen) {
    return <DevMenu onSelect={setActiveScreen} />;
  }

  const screen = SCREENS.find((s) => s.key === activeScreen)!;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#FF6B00' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen
          name="DevScreen"
          component={screen.component}
          initialParams={(screen as any).params}
          options={{
            title: `[DEV] ${screen.title}`,
            headerLeft: () => (
              <TouchableOpacity onPress={() => setActiveScreen(null)}>
                <Text style={{ color: '#fff', fontSize: 16, marginRight: 12 }}>
                  ← Меню
                </Text>
              </TouchableOpacity>
            ),
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    padding: 20,
    paddingTop: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FF6B00',
    textAlign: 'center',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  group: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#e0e0e0',
  },
  arrow: {
    fontSize: 20,
    color: '#555',
  },
});
