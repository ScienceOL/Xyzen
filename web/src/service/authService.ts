// Minimal service (pure HTTP + token storage). Higher-level orchestration lives in core/auth.ts
import { http, HttpError } from "@/service/http/client";

export interface AuthStatus {
  is_configured: boolean;
  provider?: string;
  message: string;
}

export interface AuthProviderConfig {
  provider: string;
  issuer?: string;
  audience?: string;
  jwks_uri?: string;
  algorithm?: string;
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

export interface LinkedAccount {
  provider_name: string; // e.g., "custom", "github"
  provider_display_name: string; // e.g., "Bohrium", "GitHub"
  provider_icon_url?: string; // Provider icon URL from backend config
  user_id: string;
  username?: string;
  email?: string;
  avatar_url?: string;
  is_valid?: boolean; // Token validation status (null = not checked)
}

export interface LinkedAccountsResponse {
  accounts: LinkedAccount[];
}

export interface LinkUrlResponse {
  url: string;
  provider_type: string;
}

export interface AvatarUpdateResponse {
  success: boolean;
  avatar_url?: string;
  message?: string;
}

export interface DisplayNameUpdateResponse {
  success: boolean;
  display_name?: string;
  message?: string;
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
    return http.get("/xyzen/api/v1/auth/status", { auth: false });
  }

  async loginWithCasdoor(
    code: string,
    state?: string,
  ): Promise<{
    access_token: string;
    token_type: string;
    user_info: UserInfo;
  }> {
    return http.post(
      "/xyzen/api/v1/auth/login/casdoor",
      { code, state },
      { auth: false },
    );
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

    try {
      return await http.post<AuthValidationResponse>(
        "/xyzen/api/v1/auth/validate",
        undefined,
        {
          auth: false,
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        this.removeToken();
      }
      throw error;
    }
  }

  async getAuthConfig(): Promise<AuthProviderConfig> {
    return http.get("/xyzen/api/v1/auth/config", { auth: false });
  }

  logout(): void {
    this.removeToken();
  }

  async getLinkedAccounts(validate = false): Promise<LinkedAccountsResponse> {
    return http.get("/xyzen/api/v1/auth/linked-accounts", {
      params: validate ? { validate: true } : undefined,
    });
  }

  async getLinkUrl(
    providerType: string,
    redirectUri: string,
  ): Promise<LinkUrlResponse> {
    return http.get("/xyzen/api/v1/auth/link-url", {
      params: { provider_type: providerType, redirect_uri: redirectUri },
    });
  }

  async uploadAvatar(file: File): Promise<AvatarUpdateResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return http.post("/xyzen/api/v1/auth/avatar", formData);
  }

  async updateDisplayName(
    displayName: string,
  ): Promise<DisplayNameUpdateResponse> {
    return http.post("/xyzen/api/v1/auth/display-name", {
      display_name: displayName,
    });
  }
}

export const authService = new AuthService();
