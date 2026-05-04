import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { CardsListScreen } from "../screens/operator/CardsList";
import { CreateCardScreen } from "../screens/operator/CreateCard";
import { CardDetailScreen } from "../screens/operator/CardDetail";
import { PhotoUploadScreen } from "../screens/operator/PhotoUpload";
import { SettingsScreen } from "../screens/operator/SettingsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { Pressable } from "react-native";
import { AppText } from '../components/AppText';

export type OperatorStackParamList = {
  CardsList: undefined;
  CreateCard: { boxId?: string; sessionId?: string } | undefined;
  CardDetail: { bookId: string; editable?: boolean };
  PhotoUpload: { bookId: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<OperatorStackParamList>();

function CardsStack() {
  return (
    <Stack.Navigator
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
              <AppText style={{ color: "#fff", fontSize: 32 }}>‹</AppText>
            </Pressable>
          ) : null,
      })}
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
    <AppText style={{ fontSize: 11, color: focused ? "#1976D2" : "#999" }}>
      {label}
    </AppText>
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
        component={ProfileScreen}
        options={{
          tabBarLabel: "Профиль",
          tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
          headerShown: true,
          headerTitle: "Профиль",
          headerStyle: { backgroundColor: "#1976D2" },
          headerTintColor: "#fff",
        }}
      />
    </Tab.Navigator>
  );
}
