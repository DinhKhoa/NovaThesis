/**
 * Auth Store (Zustand)
 * Global authentication state management.
 * Mirrors ERD: users table (id, email, role, status, avatar_url)
 */

import { create } from "zustand";
import {
  api,
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  isApiError,
} from "./api";

/* ========================================
   TYPES (matching ERD)
   ======================================== */

export type UserRole = "ADMIN" | "LECTURER" | "STUDENT";

export interface User {
  id: number;
  email: string;
  role: UserRole;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
  avatar_url: string | null;
  full_name: string;
  email_verified?: boolean;
  created_at?: string;
  last_login_at?: string | null;
  // Student-specific
  student_id?: number;
  student_code?: string | null;
  thesis_id?: number | null;
  // Lecturer-specific
  lecturer_id?: number;
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
  refresh_token: string;
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
      setRefreshToken(response.refresh_token);
      set({ user: response.user, loading: false, initialized: true });
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
    // Thu hồi refresh token ở server trước khi xoá cục bộ. Không await: người
    // dùng bấm Đăng xuất là phải thấy mình đăng xuất ngay, còn việc dọn phiên
    // phía server thất bại thì token vẫn tự hết hạn.
    const refresh_token = getRefreshToken();
    if (refresh_token) {
      void api.post("/auth/logout", { refresh_token }).catch(() => undefined);
    }
    clearTokens();
    set({ user: null });
    if (typeof window !== "undefined") {
      window.location.href = "/?auth=login";
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
    // Đã khởi tạo rồi thì không gọi lại: `DashboardLayout` chạy effect này mỗi
    // lần mount, và mỗi lần điều hướng giữa các trang dashboard sẽ thành một
    // request /auth/me thừa.
    if (get().initialized) return;

    const token = getAccessToken();
    if (!token) {
      set({ initialized: true });
      return;
    }

    try {
      const user = await api.get<User>("/auth/me");
      set({ user, initialized: true });
    } catch {
      // `api.ts` đã thử làm mới token trước khi ném lỗi tới đây, nên tới bước
      // này nghĩa là phiên thực sự đã hết hiệu lực.
      clearTokens();
      set({ user: null, initialized: true });
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
