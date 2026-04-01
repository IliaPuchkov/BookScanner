import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, Pressable } from "react-native";
import { DashboardScreen } from "../screens/admin/Dashboard";
import { UserManagementScreen } from "../screens/admin/UserManagement";
import { StatisticsScreen } from "../screens/admin/Statistics";
import { BookDatabaseScreen } from "../screens/admin/BookDatabase";
import { PendingReviewScreen } from "../screens/admin/PendingReview";
import { ProductDetailScreen } from "../screens/admin/ProductDetail";
import { SettingsScreen } from "../screens/operator/SettingsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { CardsListScreen } from "../screens/operator/CardsList";
import { CreateCardScreen } from "../screens/operator/CreateCard";
import { CardDetailScreen } from "../screens/operator/CardDetail";
import { PhotoUploadScreen } from "../screens/operator/PhotoUpload";

export type AdminMainStackParamList = {
  Dashboard: undefined;
  UserManagement: undefined;
  Statistics: undefined;
  BookDatabase: { filterStatus?: string } | undefined;
  PendingReview: undefined;
  PhotoUpload: { bookId: string };
  CreateCard: { boxId?: string; sessionId?: string } | undefined;
  ProductDetail: { bookId: string; editable?: boolean };
};

export type AdminCardCreationParamList = {
  PendingReview: undefined;
  CardsList: undefined;
  CreateCard: { boxId?: string; sessionId?: string } | undefined;
  CardDetail: { bookId: string; editable?: boolean };
  PhotoUpload: { bookId: string };
  ProductDetail: { bookId: string; editable?: boolean };
};

const MainStack = createNativeStackNavigator<AdminMainStackParamList>();
const Tab = createBottomTabNavigator();
const CardStack = createNativeStackNavigator<AdminCardCreationParamList>();
const SettingsStack = createNativeStackNavigator();

const stackScreenOptions = ({ navigation }: { navigation: any }) => ({
  headerStyle: { backgroundColor: "#1976D2" } as const,
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "600" as const },
  headerBackVisible: false,
  headerLeft: ({ canGoBack }: { canGoBack?: boolean }) =>
    canGoBack ? (
      <Pressable
        onPress={() => navigation.goBack()}
        android_ripple={{ color: "transparent", borderless: true }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          width: 44,
          height: 44,
          backgroundColor: "#1976D2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 32 }}>‹</Text>
      </Pressable>
    ) : null,
});

function MainStackScreen() {
  return (
    <MainStack.Navigator screenOptions={stackScreenOptions}>
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
        name="PhotoUpload"
        component={PhotoUploadScreen}
        options={{ title: "Фото" }}
      />
      <MainStack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ title: "Товар" }}
      />
    </MainStack.Navigator>
  );
}

function CardsStack() {
  return (
    <CardStack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: "#1976D2" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "600" },
        headerBackVisible: false,
        headerLeft: ({ canGoBack }) =>
          canGoBack ? (
            <Pressable
              onPress={() => navigation.goBack()}
              android_ripple={{ color: "transparent", borderless: true }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 44,
                height: 44,
                backgroundColor: "#1976D2",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 32 }}>‹</Text>
            </Pressable>
          ) : null,
      })}
    >
      <CardStack.Screen
        name="PendingReview"
        component={PendingReviewScreen}
        options={{ title: "Ожидают проверки" }}
      />
      <CardStack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ title: "Товар" }}
      />
      <CardStack.Screen
        name="CardsList"
        component={CardsListScreen}
        options={{ title: "Мои карточки" }}
      />
      <CardStack.Screen
        name="CreateCard"
        component={CreateCardScreen}
        options={{ title: "Новая карточка" }}
      />
      <CardStack.Screen
        name="CardDetail"
        component={CardDetailScreen}
        options={{ title: "Карточка" }}
      />
      <CardStack.Screen
        name="PhotoUpload"
        component={PhotoUploadScreen}
        options={{ title: "Фото" }}
      />
    </CardStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
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
        name="CardCreationTab"
        component={CardsStack}
        options={{
          tabBarLabel: "Карточки",
          tabBarIcon: () => <TabIcon label="✏️" />,
          headerShown: false,
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
          headerStyle: { backgroundColor: "#1976D2" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "600" },
        }}
      />
    </Tab.Navigator>
  );
}
