import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { DashboardScreen } from "../screens/admin/Dashboard";
import { UserManagementScreen } from "../screens/admin/UserManagement";
import { StatisticsScreen } from "../screens/admin/Statistics";
import { BookDatabaseScreen } from "../screens/admin/BookDatabase";
import { CardsListScreen } from "../screens/operator/CardsList";
import { CreateCardScreen } from "../screens/operator/CreateCard";
import { CardDetailScreen } from "../screens/operator/CardDetail";
import { PhotoUploadScreen } from "../screens/operator/PhotoUpload";
import { SettingsScreen } from "../screens/operator/SettingsScreen";

export type AdminMainStackParamList = {
  Dashboard: undefined;
  UserManagement: undefined;
  Statistics: undefined;
  BookDatabase: undefined;
  CardsList: undefined;
  CreateCard: { boxId?: string } | undefined;
  CardDetail: { bookId: string };
  PhotoUpload: { bookId: string };
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
        name="UserManagement"
        component={UserManagementScreen}
        options={{ title: "Пользователи" }}
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
        name="CardsList"
        component={CardsListScreen}
        options={{ title: "Карточки" }}
      />
      <MainStack.Screen
        name="CreateCard"
        component={CreateCardScreen}
        options={{ title: "Новая карточка" }}
      />
      <MainStack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{ title: "Карточка" }}
      />
      <MainStack.Screen
        name="PhotoUpload"
        component={PhotoUploadScreen}
        options={{ title: "Фото" }}
      />
    </MainStack.Navigator>
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
        name="ProfileTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: "Настройки",
          tabBarIcon: () => <TabIcon label="👤" />,
          headerShown: true,
          headerTitle: "Настройки",
          ...headerStyle,
        }}
      />
    </Tab.Navigator>
  );
}
