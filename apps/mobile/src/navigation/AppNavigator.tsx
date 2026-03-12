import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types';
import { AuthNavigator } from './AuthNavigator';
import { OperatorNavigator } from './OperatorNavigator';
import { AdminNavigator } from './AdminNavigator';

export type RootStackParamList = {
  Auth: undefined;
  OperatorTabs: undefined;
  AdminTabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : user?.role === UserRole.ADMIN ? (
          <Stack.Screen name="AdminTabs" component={AdminNavigator} />
        ) : (
          <Stack.Screen name="OperatorTabs" component={OperatorNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
