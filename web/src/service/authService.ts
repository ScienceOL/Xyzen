// Minimal service (pure HTTP + token storage). Higher-level orchestration lives in core/auth.ts
import { useXyzen } from "@/store";

const getBackendUrl = () => {
  const url = useXyzen.getState().backendUrl;
  if (!url || url === "") {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  return url;
};

export interface AuthStatus {
  is_configured: boolean;
  provider?: string;
  message: string;
}

export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  roles?: string[];
}

export interface AuthValidationResponse {
  success: boolean;
  user_info?: UserInfo;
  error_message?: string;
  error_code?: string;
}

class AuthService {
  private static readonly TOKEN_KEY = "access_token";

  getToken(): string | null {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(AuthService.TOKEN_KEY)
      : null;
  }

  setToken(token: string): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AuthService.TOKEN_KEY, token);
    }
  }

  removeToken(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AuthService.TOKEN_KEY);
    }
  }

  async getAuthStatus(): Promise<AuthStatus> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/auth/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async validateToken(token?: string): Promise<AuthValidationResponse> {
    const accessToken = token || this.getToken();
    if (!accessToken) {
      return {
        success: false,
        error_code: "NO_TOKEN",
        error_message: "No access token available",
      };
    }

    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/auth/validate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        this.removeToken();
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  logout(): void {
    this.removeToken();
  }
}

export const authService = new AuthService();
