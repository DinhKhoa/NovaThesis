/**
 * Auth Store (Zustand)
 * Global authentication state management.
 * Mirrors ERD: users table (id, email, role, status, avatar_url)
 */

import { create } from "zustand";
import { api, setAccessToken, clearTokens, isApiError, refreshSession } from "./api";

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
      // Refresh token không đi qua đây: backend đặt nó vào cookie `httpOnly`.
      setAccessToken(response.access_token);
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
    /* Thu hồi phiên ở server trước khi xoá cục bộ. Backend đọc refresh token từ
       cookie và tự xoá cookie đó, nên ở đây không cần gửi gì lên.

       Không await: người dùng bấm Đăng xuất là phải thấy mình đăng xuất ngay,
       còn việc dọn phiên phía server thất bại thì token vẫn tự hết hạn. */
    void api.post("/auth/logout").catch(() => undefined);
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

    /* Access token chỉ nằm trong bộ nhớ nên tải lại trang là mất. Bước đầu tiên
       vì thế phải là đổi cookie refresh thành token mới.

       Trước đây chỗ này đọc token từ `localStorage`; giờ không còn chỗ nào trên
       máy người dùng lưu thứ đăng nhập được, nên cái giá là thêm một request mỗi
       lần tải trang. Cookie `httpOnly` đi kèm tự động, người dùng không thấy gì.

       Cookie không tồn tại hoặc đã bị thu hồi thì `refreshSession()` trả `false`
       và đây là khách chưa đăng nhập — không phải lỗi. */
    const restored = await refreshSession();
    if (!restored) {
      set({ user: null, initialized: true });
      return;
    }

    try {
      const user = await api.get<User>("/auth/me");
      set({ user, initialized: true });
    } catch {
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
