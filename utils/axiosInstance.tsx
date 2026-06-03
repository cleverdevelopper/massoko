import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, setAccessToken } from './tokenStorage';
import { CustomAxiosRequestConfig } from './axiosInstance.types';

const axiosInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_SERVER_URI,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

const onRefreshSuccess = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

// Request Interceptor
axiosInstance.interceptors.request.use(
  async (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(axiosInstance(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(`${process.env.EXPO_PUBLIC_SERVER_URI}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const newAccessToken = response.data.tokens.access_token;
        const newRefreshToken = response.data.tokens.refresh_token;

        setAccessToken(newAccessToken);
        await SecureStore.setItemAsync('access_token', newAccessToken);
        await SecureStore.setItemAsync('refresh_token', newRefreshToken);

        isRefreshing = false;
        onRefreshSuccess(newAccessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        
        // Broadcast logout or clear local state
        setAccessToken(null);
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
