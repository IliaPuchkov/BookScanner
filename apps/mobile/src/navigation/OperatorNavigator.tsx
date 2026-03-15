import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CardsListScreen } from "../screens/operator/CardsList";
import { CreateCardScreen } from "../screens/operator/CreateCard";
import { CardDetailScreen } from "../screens/operator/CardDetail";
import { PhotoUploadScreen } from "../screens/operator/PhotoUpload";
import { SettingsScreen } from "../screens/operator/SettingsScreen";
import { Text } from "react-native";

export type OperatorStackParamList = {
  CardsList: undefined;
  CreateCard: { boxId?: string } | undefined;
  CardDetail: { bookId: string };
  PhotoUpload: { bookId: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<OperatorStackParamList>();

function CardsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#1976D2" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen
        name="CardsList"
        component={CardsListScreen}
        options={{ title: "Мои карточки" }}
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

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 11, color: focused ? "#1976D2" : "#999" }}>
      {label}
    </Text>
  );
}

export function OperatorNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1976D2",
        tabBarInactiveTintColor: "#999",
      }}
    >
      <Tab.Screen
        name="CardsTab"
        component={CardsStack}
        options={{
          tabBarLabel: "Карточки",
          tabBarIcon: ({ focused }) => <TabIcon label="📚" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: "Настройки",
          tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
          headerShown: true,
          headerTitle: "Настройки",
          headerStyle: { backgroundColor: "#1976D2" },
          headerTintColor: "#fff",
        }}
      />
    </Tab.Navigator>
  );
}
