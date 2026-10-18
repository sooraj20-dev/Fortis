import { create } from 'zustand';
import { getCached } from '../services/api';
import { getLatestScan } from '../services/scanApi';
import type { ScanResult } from '../types/scan';

interface DashboardState {
  data: any | null;
  latestScan: ScanResult | null;
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  lastFetched: number | null;
  fetchDashboardData: (force?: boolean) => Promise<void>;
  fetchLatestScan: () => Promise<void>;
  setData: (data: any) => void;
  reset: () => void;
}

// 45 seconds stale threshold for background revalidation
const STALE_TIME_MS = 45_000;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  latestScan: null,
  loading: true,
  isFetching: false,
  error: null,
  lastFetched: null,

  fetchDashboardData: async (force = false) => {
    const { data, lastFetched, isFetching } = get();
    const now = Date.now();

    // If we have fresh data and not forcing, keep using it immediately with 0ms delay
    if (data && !force && lastFetched && now - lastFetched < STALE_TIME_MS) {
      return;
    }

    if (isFetching) return;

    // If we already have cached data, don't block the screen with full loading state
    const hasExistingData = Boolean(data);
    set({ isFetching: true, loading: !hasExistingData });

    try {
      const res = await getCached<any>('/api/dashboard');
      set({
        data: res.data,
        lastFetched: Date.now(),
        error: null,
        loading: false,
        isFetching: false,
      });
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      set({
        error: err?.message || 'Failed to load dashboard',
        loading: false,
        isFetching: false,
      });
    }
  },

  fetchLatestScan: async () => {
    try {
      const scan = await getLatestScan();
      set({ latestScan: scan });
    } catch {
      // scan is optional
    }
  },

  setData: (data: any) => set({ data }),
  reset: () => set({ data: null, latestScan: null, loading: true, lastFetched: null }),
}));
