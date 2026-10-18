import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  onboardingComplete: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User, onboardingComplete: boolean) => void;
  logout: () => void;
  setOnboardingComplete: (complete?: boolean) => void;
  updateUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      onboardingComplete: false,
      isAuthenticated: false,

      login: (token, user, onboardingComplete) =>
        set({ token, user, onboardingComplete, isAuthenticated: true }),

      logout: () =>
        set({ token: null, user: null, onboardingComplete: false, isAuthenticated: false }),

      setOnboardingComplete: (complete = true) => set({ onboardingComplete: complete }),

      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : null,
        })),
    }),
    {
      name: 'fortis-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        onboardingComplete: state.onboardingComplete,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
