import axios from 'axios';
import type { AxiosError } from 'axios';

const AUTH_KEY = 'boardgame.auth.token';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器：注入 JWT
apiClient.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string; description?: string }>) => {
    if (error.response?.status === 401) {
      window.localStorage.removeItem(AUTH_KEY);
      // 仅当不在登录页时刷新
      if (!window.location.hash.includes('login')) {
        window.location.reload();
      }
    }
    const body = error.response?.data;
    const message = body?.message || body?.description || body?.error || error.message || '请求失败';
    return Promise.reject(new Error(message));
  },
);

export function setAuthToken(token: string) {
  window.localStorage.setItem(AUTH_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_KEY);
}

export function getAuthToken(): string {
  return window.localStorage.getItem(AUTH_KEY) || '';
}
