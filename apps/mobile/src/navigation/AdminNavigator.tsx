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
import { ProfileScreen } from "../screens/operator/ProfileScreen";
import type { OperatorStackParamList } from "./OperatorNavigator";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<OperatorStackParamList>();

const headerStyle = {
  headerStyle: { backgroundColor: "#1976D2" } as const,
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "600" as const },
};

function CardsStack() {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen
        name="CardsList"
        component={CardsListScreen}
        options={{
          title: "Карточки",
        }}
      />
      <Stack.Screen
        name="CreateCard"
        component={CreateCardScreen}
        options={{ title: "Новая карточка" }}
      />
      <Stack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{ title: "Карточка" }}
      />
      <Stack.Screen
        name="PhotoUpload"
        component={PhotoUploadScreen}
        options={{ title: "Фото" }}
      />
    </Stack.Navigator>
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
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          tabBarLabel: "Главная",
          tabBarIcon: () => <TabIcon label="📊" />,
          headerShown: true,
          headerTitle: "Панель управления",
          ...headerStyle,
        }}
      />
      <Tab.Screen
        name="CardsTab"
        component={CardsStack}
        options={{
          tabBarLabel: "Карточки",
          tabBarIcon: () => <TabIcon label="📚" />,
        }}
      />
      <Tab.Screen
        name="UsersTab"
        component={UserManagementScreen}
        options={{
          tabBarLabel: "Пользователи",
          tabBarIcon: () => <TabIcon label="👥" />,
          headerShown: true,
          headerTitle: "Пользователи",
          ...headerStyle,
        }}
      />
      <Tab.Screen
        name="StatsTab"
        component={StatisticsScreen}
        options={{
          tabBarLabel: "Статистика",
          tabBarIcon: () => <TabIcon label="📈" />,
          headerShown: true,
          headerTitle: "Статистика",
          ...headerStyle,
        }}
      />
      <Tab.Screen
        name="DatabaseTab"
        component={BookDatabaseScreen}
        options={{
          tabBarLabel: "База",
          tabBarIcon: () => <TabIcon label="🗄️" />,
          headerShown: true,
          headerTitle: "База книг",
          ...headerStyle,
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
