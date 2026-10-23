import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  toasts: Toast[];
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let _toastId = 0;

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  toasts: [],

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

  addToast: (toast) => {
    const id = String(++_toastId);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 4000;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience: show a toast from anywhere without needing the hook. */
export const toast = {
  success: (message: string) => useUIStore.getState().addToast({ message, variant: 'success' }),
  error: (message: string) => useUIStore.getState().addToast({ message, variant: 'error', duration: 6000 }),
  warning: (message: string) => useUIStore.getState().addToast({ message, variant: 'warning' }),
  info: (message: string) => useUIStore.getState().addToast({ message, variant: 'info' }),
};
