/**
 * Toast Store (Zustand)
 * Global toast notification management.
 */

import { create } from "zustand";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: ToastData[];
  addToast: (type: ToastType, message: string) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/* Convenience helpers */
export const toast = {
  success: (msg: string) => useToastStore.getState().addToast("success", msg),
  error: (msg: string) => useToastStore.getState().addToast("error", msg),
  warning: (msg: string) => useToastStore.getState().addToast("warning", msg),
  info: (msg: string) => useToastStore.getState().addToast("info", msg),
};
