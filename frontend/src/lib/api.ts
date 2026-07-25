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

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) {
    if (typeof window !== "undefined") {
      localStorage.setItem("nova_access_token", token);
    }
  } else {
    if (typeof window !== "undefined") {
      localStorage.removeItem("nova_access_token");
    }
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("nova_access_token");
  }
  return accessToken;
}

/* ========================================
   CORE FETCH WRAPPER
   ======================================== */

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
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

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json();

  if (!response.ok) {
    const error: ApiError = {
      message: body.message || body.detail || "Đã xảy ra lỗi",
      status: response.status,
      errors: body.errors,
    };

    // Handle 401 – Token expired (skip for auth endpoints so login error messages can be displayed)
    if (response.status === 401 && !endpoint.includes("/auth/")) {
      setAccessToken(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    throw error;
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
