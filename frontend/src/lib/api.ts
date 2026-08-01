/**
 * API Service Layer
 * Centralized async/await fetch wrapper with error handling,
 * token management, and type-safe responses.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/* ========================================
   TYPES
   ======================================== */

export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
  /**
   * Mã lỗi của backend (`middleware/error.ts`). Cần khi cùng một mã HTTP mang
   * hai ý nghĩa khác nhau — ví dụ 429 vừa là "thiết bị gửi quá nhanh"
   * (`TOO_MANY_REQUESTS`) vừa là "tài khoản bị khóa" (`ACCOUNT_LOCKED`).
   */
  code?: string;
  /** ISO timestamp: thời điểm hết khóa tài khoản (`code === "ACCOUNT_LOCKED"`). */
  locked_until?: string;
  retry_after_seconds?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/* ========================================
   TOKEN MANAGEMENT
   ======================================== */

const ACCESS_KEY = "nova_access_token";
const REFRESH_KEY = "nova_refresh_token";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ACCESS_KEY, token);
  else localStorage.removeItem(ACCESS_KEY);
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem(ACCESS_KEY);
  }
  return accessToken;
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export function getRefreshToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
}

export function clearTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
}

/* ========================================
   LÀM MỚI PHIÊN
   ======================================== */

/**
 * Access token sống 2 giờ. Không có bước làm mới, người dùng đang gõ dở một
 * nhận xét sẽ bị đá về trang đăng nhập và mất bài — refresh token đổi trải
 * nghiệm đó thành một request phụ mà họ không hề thấy.
 *
 * Biến `refreshing` gom mọi request 401 xảy ra cùng lúc vào CHUNG một lần làm
 * mới. Không có nó, một trang gọi năm API song song sẽ kích hoạt năm lượt
 * refresh; backend xoay vòng token nên bốn lượt sau dùng token đã bị thu hồi và
 * tất cả cùng thất bại.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refresh_token = getRefreshToken();
    if (!refresh_token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token }),
      });
      if (!response.ok) return false;

      const body = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
      };
      setAccessToken(body.access_token);
      if (body.refresh_token) setRefreshToken(body.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      // Mở khoá cho lần hết hạn kế tiếp, dù thành công hay không.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();

  return refreshing;
}

/* ========================================
   CORE FETCH WRAPPER
   ======================================== */

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAccessToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // Remove Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) {
    delete (headers as Record<string, string>)["Content-Type"];
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    // Backend chưa chạy hoặc mất mạng. Phân biệt rõ với lỗi do server trả về,
    // vì cách xử lý của người dùng khác hẳn nhau.
    throw {
      message: "Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.",
      status: 0,
    } as ApiError;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Tệp tải về (PDF/XLSX) không phải JSON — trả nguyên phản hồi cho người gọi.
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && !contentType.includes("application/json")) {
    return response as unknown as T;
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Token hết hạn: thử làm mới một lần rồi gọi lại đúng request đó.
    // Bỏ qua nhóm `/auth/` để thông báo lỗi đăng nhập hiển thị được như cũ.
    if (response.status === 401 && !retried && !endpoint.startsWith("/auth/")) {
      if (await refreshSession()) {
        return request<T>(endpoint, options, true);
      }
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/?auth=login";
    }

    throw {
      message: body.message || body.detail || "Đã xảy ra lỗi",
      status: response.status,
      errors: body.errors,
      code: body.code,
      // Backend trải các trường này ở cấp gốc của thân lỗi (`HttpError.public`).
      locked_until: body.locked_until,
      retry_after_seconds: body.retry_after_seconds,
    } as ApiError;
  }

  return body as T;
}

/* ========================================
   HTTP METHODS
   ======================================== */

export const api = {
  async get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) url += `?${queryString}`;
    }
    return request<T>(url, { method: "GET" });
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: "POST",
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: "PUT",
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: "PATCH",
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  async delete<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: "DELETE" });
  },

  /**
   * Upload file with progress tracking
   * Uses XMLHttpRequest for progress events (fetch doesn't support upload progress)
   */
  upload<T>(
    endpoint: string,
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${API_BASE_URL}${endpoint}`;
      const token = getAccessToken();

      xhr.open("POST", url);
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const body = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body as T);
          } else {
            reject({
              message: body.message || "Upload thất bại",
              status: xhr.status,
              errors: body.errors,
            } as ApiError);
          }
        } catch {
          reject({
            message: "Lỗi phản hồi từ server",
            status: xhr.status,
          } as ApiError);
        }
      });

      xhr.addEventListener("error", () => {
        reject({
          message: "Lỗi kết nối mạng",
          status: 0,
        } as ApiError);
      });

      xhr.send(formData);
    });
  },
};

/* ========================================
   HELPER: Check if error is an ApiError
   ======================================== */

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    "status" in error
  );
}
