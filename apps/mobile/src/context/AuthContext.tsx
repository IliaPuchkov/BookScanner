import React, { createContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, decodeJwtPayload, notifyServerUnreachable } from '../services/api';
import { authService } from '../services/auth.service';
import type { User } from '../types';
import { UserRole } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        if (token) {
          const user = await authService.getMe();
          setState({ user, isLoading: false, isAuthenticated: true });
        } else {
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      } catch (error: unknown) {
        const hasResponse = !!(error as { response?: unknown })?.response;
        if (!hasResponse) {
          // Network error — server unreachable, keep user logged in using JWT payload
          notifyServerUnreachable();
          const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
          const payload = token ? decodeJwtPayload(token) : null;
          if (payload?.sub) {
            const offlineUser: User = {
              id: payload.sub as string,
              role: payload.role as UserRole,
              fullName: '',
              phone: '',
              email: '',
              isApproved: true,
            };
            setState({ user: offlineUser, isLoading: false, isAuthenticated: true });
            return;
          }
        }
        // Real auth failure (401) or no valid token — log out
        await AsyncStorage.multiRemove([STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN]);
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    })();
  }, []);

  const login = useCallback(async (phoneOrEmail: string, password: string) => {
    const response = await authService.login(phoneOrEmail, password);
    await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.accessToken);
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refreshToken);
    setState({ user: response.user, isLoading: false, isAuthenticated: true });
  }, []);

  const register = useCallback(
    async (fullName: string, phone: string, email: string, password: string) => {
      await authService.register(fullName, phone, email, password);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors
    }
    await AsyncStorage.multiRemove([STORAGE_KEYS.ACCESS_TOKEN, STORAGE_KEYS.REFRESH_TOKEN]);
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await authService.getMe();
      setState((prev) => ({ ...prev, user }));
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
