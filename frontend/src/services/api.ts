import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:8000` : '');

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Keep recent read responses available when users move between app pages.
// Requests are still refreshed after any successful write, and errors are never cached.
const GET_CACHE_MS = 60_000;
const getCache = new Map<string, { expiresAt: number; request: Promise<AxiosResponse> }>();

export function getCached<T = unknown>(url: string): Promise<AxiosResponse<T>> {
  const token = useAuthStore.getState().token || '';
  const key = `${token}:${url}`;
  const cached = getCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.request as Promise<AxiosResponse<T>>;
  if (cached) getCache.delete(key);

  const request = api.get<T>(url).catch((error) => {
    getCache.delete(key);
    throw error;
  });
  getCache.set(key, { expiresAt: Date.now() + GET_CACHE_MS, request });
  return request;
}

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear auth and redirect
api.interceptors.response.use(
  (res) => {
    if (res.config.method && res.config.method.toLowerCase() !== 'get') getCache.clear();
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

export default api;
