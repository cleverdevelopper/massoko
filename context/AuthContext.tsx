/**
 * AuthContext.tsx
 *
 * Changes from original:
 * - On signIn / checkSession, generates a stable device_id stored in SQLite
 *   app_settings and registers it with the backend (/api/v1/signal/register-device).
 * - On signOut, local SQLite message data is preserved (Signal keys are cleared
 *   by clearStore, but message history is not wiped unless the user explicitly
 *   requests it — mirrors WhatsApp behavior).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import axios from 'axios';
import axiosInstance from '../utils/axiosInstance';
import { setAccessToken } from '../utils/tokenStorage';
import { signalService } from '../utils/signal/SignalService';
import { getSetting, setSetting } from '../utils/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  surname?: string;
  phone_number: string;
  profile_photo?: string;
  about?: string;
  is_online?: number;
  last_seen?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (tokens: { access_token: string; refresh_token: string }, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshUser: () => Promise<User | null>;
}

// ─── Device ID Helpers ────────────────────────────────────────────────────────

/**
 * Returns a stable device_id stored in SQLite app_settings.
 * Generated once on first launch using a timestamp-based ID.
 * This is the numeric device_id the backend tracks per user_device row.
 */
async function getOrCreateDeviceId(): Promise<number> {
  const stored = await getSetting('device_id');
  if (stored) return parseInt(stored, 10);

  // Generate a stable ID: random int in [1, 2^31-1]
  const newId = Math.floor(Math.random() * 2_000_000_000) + 1;
  await setSetting('device_id', String(newId));
  return newId;
}

/**
 * Registers this device with the backend. Safe to call on every login/session
 * restore — the backend does UPSERT so repeated calls are idempotent.
 */
async function registerDeviceWithBackend(): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    await axiosInstance.post('/api/v1/signal/register-device', {
      device_id: deviceId,
      platform: 'android',
    });
    console.log(`[Auth] Device registered: ${deviceId}`);
  } catch (e: any) {
    // Non-fatal — device registration failure should not block the user
    console.warn('[Auth] Device registration failed (non-fatal):', e?.message);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // ── signIn ─────────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (tokens: { access_token: string; refresh_token: string }, userData: User) => {
      setAccessToken(tokens.access_token);
      await SecureStore.setItemAsync('access_token', tokens.access_token);
      await SecureStore.setItemAsync('refresh_token', tokens.refresh_token);
      await SecureStore.setItemAsync('user', JSON.stringify(userData));
      setUser(userData);

      // Register device first (needed before key upload to link them)
      await registerDeviceWithBackend();

      try {
        // generateAndUploadKeys is a no-op if keys already exist
        await signalService.generateAndUploadKeys();
        await signalService.checkKeyStatusAndReplenish();
      } catch (error) {
        console.error('[Auth] Signal key init failed:', error);
      }
    },
    []
  );

  // ── refreshUser ────────────────────────────────────────────────────────────

  const refreshUser = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/api/v1/auth/me');
      if (response.data.success) {
        const freshUser = response.data.user;
        setUser(freshUser);
        await SecureStore.setItemAsync('user', JSON.stringify(freshUser));
        return freshUser;
      }
    } catch (error) {
      console.error('[Auth] refreshUser failed:', error);
    }
    return null;
  }, []);

  // ── signOut ────────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) {
        await axiosInstance.post('/api/v1/auth/logout', { refresh_token: refreshToken });
      }
    } catch (error) {
      console.error('[Auth] Logout API error:', error);
    } finally {
      setAccessToken(null);
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      await SecureStore.deleteItemAsync('user');
      setUser(null);
      // Clear Signal crypto material (keys + sessions) but NOT message history
      await signalService.clearStore();
      router.replace('/auth/phone-registration');
    }
  }, [router]);

  // ── checkSession ───────────────────────────────────────────────────────────

  const checkSession = useCallback(async () => {
    try {
      // 1. Fast restore from cache
      const storedUser = await SecureStore.getItemAsync('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }

      // 2. Check for refresh token
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      // 3. Validate / refresh in background
      const response = await axiosInstance.post('/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      });

      if (response.data.success) {
        const { tokens } = response.data;
        setAccessToken(tokens.access_token);
        await SecureStore.setItemAsync('access_token', tokens.access_token);
        await SecureStore.setItemAsync('refresh_token', tokens.refresh_token);

        await refreshUser();

        // Register device on session restore (idempotent backend UPSERT)
        await registerDeviceWithBackend();

        try {
          // generateAndUploadKeys is a no-op if keys already exist
          await signalService.generateAndUploadKeys();
          await signalService.checkKeyStatusAndReplenish();
        } catch (error) {
          console.error('[Auth] Signal key check failed during session restore:', error);
        }
      } else {
        throw new Error('Refresh failed');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log('[Auth] Session expired or invalid (401), clearing session and logging out...');
        setAccessToken(null);
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        await SecureStore.deleteItemAsync('user');
        setUser(null);
      } else {
        console.error('[Auth] checkSession failed:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // ── Route Protection ───────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoading) return;

    const segmentsList = segments as any;
    const inAuthGroup = segmentsList[0] === 'auth';
    const isRoot = segmentsList.length === 0 || segmentsList[0] === 'index' || segmentsList[0] === '';

    if (!user) {
      if (!inAuthGroup && !isRoot) {
        router.replace('/auth/phone-registration');
      }
    } else {
      if (inAuthGroup || isRoot) {
        router.replace('/(tabs)');
      }
    }
  }, [user, segments, isLoading, router]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signIn, signOut, isAuthenticated: !!user, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
