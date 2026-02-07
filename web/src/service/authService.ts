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
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/auth/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async loginWithCasdoor(
    code: string,
    state?: string,
  ): Promise<{
    access_token: string;
    token_type: string;
    user_info: UserInfo;
  }> {
    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/auth/login/casdoor`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, state }),
      },
    );

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

  async getAuthConfig(): Promise<AuthProviderConfig> {
    const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/auth/config`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  logout(): void {
    this.removeToken();
  }

  async getLinkedAccounts(validate = false): Promise<LinkedAccountsResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const url = new URL(`${getBackendUrl()}/xyzen/api/v1/auth/linked-accounts`);
    if (validate) {
      url.searchParams.set("validate", "true");
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getLinkUrl(
    providerType: string,
    redirectUri: string,
  ): Promise<LinkUrlResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const url = new URL(`${getBackendUrl()}/xyzen/api/v1/auth/link-url`);
    url.searchParams.set("provider_type", providerType);
    url.searchParams.set("redirect_uri", redirectUri);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async uploadAvatar(file: File): Promise<AvatarUpdateResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/auth/avatar`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async updateDisplayName(
    displayName: string,
  ): Promise<DisplayNameUpdateResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error("No access token available");
    }

    const response = await fetch(
      `${getBackendUrl()}/xyzen/api/v1/auth/display-name`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ display_name: displayName }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

export const authService = new AuthService();
