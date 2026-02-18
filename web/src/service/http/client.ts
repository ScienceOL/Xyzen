import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  signal?: AbortSignal;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    // Handle 204 No Content
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  let message: string;
  try {
    const data = await response.json();
    message = data.detail?.msg || data.detail || `HTTP ${response.status}`;
  } catch {
    try {
      const text = await response.text();
      message = text || `HTTP ${response.status}`;
    } catch {
      message = `HTTP ${response.status}`;
    }
  }

  throw new HttpError(response.status, message);
}

class HttpClient {
  get baseUrl(): string {
    const url = useXyzen.getState().backendUrl;
    if (!url || url === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return url;
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private buildHeaders(
    body: unknown,
    options?: RequestOptions,
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    // Auth header
    if (options?.auth !== false) {
      const token = authService.getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    // Content-Type for JSON (skip for FormData — browser sets boundary)
    if (body !== undefined && body !== null && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    // Merge extra headers
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.buildHeaders(body, options);

    const init: RequestInit = { method, headers };
    if (options?.signal) init.signal = options.signal;

    if (body !== undefined && body !== null) {
      init.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    const response = await fetch(url, init);
    return handleResponse<T>(response);
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  delete<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>("DELETE", path, body, options);
  }

  /**
   * Return a raw Response (no JSON parsing).
   * Useful for blob / text downloads where the caller needs `.blob()` or `.text()`.
   */
  async raw(path: string, options?: RequestOptions): Promise<Response> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.buildHeaders(undefined, options);
    const init: RequestInit = { method: "GET", headers };
    if (options?.signal) init.signal = options.signal;
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status}`);
    }
    return response;
  }
}

export const http = new HttpClient();
