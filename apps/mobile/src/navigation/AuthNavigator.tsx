import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  LegalDocument: { title: string; text: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params.title,
          headerStyle: { backgroundColor: '#1976D2' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        })}
      />
    </Stack.Navigator>
  );
}
