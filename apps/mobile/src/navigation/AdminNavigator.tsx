import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { DashboardScreen } from "../screens/admin/Dashboard";
import { UserManagementScreen } from "../screens/admin/UserManagement";
import { StatisticsScreen } from "../screens/admin/Statistics";
import { BookDatabaseScreen } from "../screens/admin/BookDatabase";
import { PendingReviewScreen } from "../screens/admin/PendingReview";
import { CardDetailScreen } from "../screens/operator/CardDetail";
import { SettingsScreen } from "../screens/operator/SettingsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

export type AdminMainStackParamList = {
  Dashboard: undefined;
  UserManagement: undefined;
  Statistics: undefined;
  BookDatabase: { filterStatus?: string } | undefined;
  PendingReview: undefined;
  CardDetail: { bookId: string; editable?: boolean };
};

const MainStack = createNativeStackNavigator<AdminMainStackParamList>();
const Tab = createBottomTabNavigator();

const headerStyle = {
  headerStyle: { backgroundColor: "#1976D2" } as const,
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "600" as const },
};

function MainStackScreen() {
  return (
    <MainStack.Navigator screenOptions={headerStyle}>
      <MainStack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: "Панель управления" }}
      />
      <MainStack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{ title: "Статистика" }}
      />
      <MainStack.Screen
        name="BookDatabase"
        component={BookDatabaseScreen}
        options={{ title: "База книг" }}
      />
      <MainStack.Screen
        name="PendingReview"
        component={PendingReviewScreen}
        options={{ title: "Ожидают проверки" }}
      />
      <MainStack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{ title: "Карточка" }}
      />
    </MainStack.Navigator>
  );
}

const SettingsStack = createNativeStackNavigator();

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={headerStyle}>
      <SettingsStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Настройки" }}
      />
      <SettingsStack.Screen
        name="UserManagement"
        component={UserManagementScreen}
        options={{ title: "Управление пользователями" }}
      />
    </SettingsStack.Navigator>
  );
}

function TabIcon({ label }: { label: string }) {
  return <Text style={{ fontSize: 14 }}>{label}</Text>;
}

export function AdminNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1976D2",
        tabBarInactiveTintColor: "#999",
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="MainTab"
        component={MainStackScreen}
        options={{
          tabBarLabel: "Главная",
          tabBarIcon: () => <TabIcon label="📊" />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackScreen}
        options={{
          tabBarLabel: "Настройки",
          tabBarIcon: () => <TabIcon label="⚙️" />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Профиль",
          tabBarIcon: () => <TabIcon label="👤" />,
          headerShown: true,
          headerTitle: "Профиль",
          ...headerStyle,
        }}
      />
    </Tab.Navigator>
  );
}
