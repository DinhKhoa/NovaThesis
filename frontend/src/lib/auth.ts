/**
 * Auth Store (Zustand)
 * Global authentication state management.
 * Mirrors ERD: users table (id, email, role, status, avatar_url)
 */

import { create } from "zustand";
import { api, setAccessToken, getAccessToken, isApiError } from "./api";

/* ========================================
   TYPES (matching ERD)
   ======================================== */

export type UserRole = "ADMIN" | "LECTURER" | "STUDENT";

export interface User {
  id: number;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED";
  avatar_url: string | null;
  full_name: string;
  thesis_id?: number | null;
  // Lecturer-specific
  lecturer_code?: string;
  department?: string;
  max_students?: number;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}

interface LoginResponse {
  access_token: string;
  user: User;
}

/* ========================================
   AUTH STORE
   ======================================== */

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  login: async (payload: LoginPayload) => {
    set({ loading: true });
    try {
      const response = await api.post<LoginResponse>("/auth/login", payload);
      setAccessToken(response.access_token);
      set({ user: response.user, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (payload: RegisterPayload) => {
    set({ loading: true });
    try {
      await api.post("/auth/register", payload);
      set({ loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    setAccessToken(null);
    set({ user: null });
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  },

  fetchProfile: async () => {
    try {
      const user = await api.get<User>("/auth/me");
      set({ user });
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        set({ user: null });
      }
    }
  },

  updateProfile: async (data: Partial<User>) => {
    const user = await api.patch<User>("/auth/profile", data);
    set({ user });
  },

  initialize: async () => {
    const token = getAccessToken();
    if (token) {
      try {
        const user = await api.get<User>("/auth/me");
        set({ user, initialized: true });
      } catch {
        setAccessToken(null);
        set({ user: null, initialized: true });
      }
    } else {
      set({ initialized: true });
    }
  },
}));

export function isStudent(user: User | null): boolean {
  return user?.role === "STUDENT";
}

export function isLecturer(user: User | null): boolean {
  return user?.role === "LECTURER";
}

export function isAdmin(user: User | null): boolean {
  return user?.role === "ADMIN";
}
