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

export enum AuthState {
  NOT_CONFIGURED = "not_configured",
  NOT_AUTHENTICATED = "not_authenticated",
  AUTHENTICATED = "authenticated",
  ERROR = "error",
}

export interface AuthResult {
  state: AuthState;
  user?: UserInfo;
  message: string;
  provider?: string;
}

class AuthService {
  private static readonly TOKEN_KEY = "access_token";
  private static readonly COOKIE_TOKEN_KEY = "appAccessKey";
  private authCheckPromise: Promise<AuthResult> | null = null;
  private listeners: ((result: AuthResult) => void)[] = [];

  // 从 localStorage 或 cookie 获取 token，并作兜底
  getToken(): string | null {
    console.log("AuthService: 开始获取 token...");
    // 1. 优先从 localStorage 获取
    const tokenFromStorage = localStorage.getItem(AuthService.TOKEN_KEY);
    if (tokenFromStorage) {
      console.log("AuthService: 在 localStorage 中找到 token。");
      return tokenFromStorage;
    }

    console.log(
      "AuthService: localStorage 中未找到 token，尝试从 cookie 获取。",
    );
    // 2. 如果 localStorage 没有，则尝试从 cookie 获取 (兜底)
    const tokenFromCookie = this.getCookie(AuthService.COOKIE_TOKEN_KEY);
    if (tokenFromCookie) {
      // 为了统一管理，可以将 cookie 中的 token 同步到 localStorage
      console.log(
        "AuthService: 从 cookie 中获取到 token 并同步到 localStorage",
      );
      this.setToken(tokenFromCookie);
      return tokenFromCookie;
    }

    console.log("AuthService: 在 localStorage 和 cookie 中均未找到 token。");
    return null;
  }

  private getCookie(name: string): string | null {
    if (typeof document === "undefined") {
      console.log(
        "AuthService: getCookie - document is not defined (not in a browser environment).",
      );
      return null;
    }
    console.log(`AuthService: 正在从 cookie 中查找名为 "${name}" 的 token...`);
    console.log("AuthService: 当前 document.cookie:", document.cookie);

    // 使用更可靠的正则表达式来匹配 cookie
    const match = document.cookie.match(
      new RegExp("(^|;\\s*)" + name + "=([^;]+)"),
    );

    if (match) {
      const token = decodeURIComponent(match[2]);
      console.log(
        `AuthService: 成功在 cookie 中找到 token: ${token.substring(0, 20)}...`,
      );
      return token;
    }
    console.log(`AuthService: 未能在 cookie 中找到名为 "${name}" 的 token。`);
    return null;
  }

  // 设置 token 到 localStorage (默认都启用自动登录)
  setToken(token: string): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
  }

  // 移除 token
  removeToken(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
  }

  // 添加认证状态监听器
  addAuthStateListener(listener: (result: AuthResult) => void): void {
    this.listeners.push(listener);
  }

  // 移除认证状态监听器
  removeAuthStateListener(listener: (result: AuthResult) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 通知所有监听器
  private notifyListeners(result: AuthResult): void {
    this.listeners.forEach((listener) => {
      try {
        listener(result);
      } catch (error) {
        console.error("Auth listener error:", error);
      }
    });
  }

  // 检查认证服务状态
  async getAuthStatus(): Promise<AuthStatus> {
    console.log("AuthService: 检查认证服务状态...");
    try {
      const response = await fetch(
        `${getBackendUrl()}/xyzen/api/v1/auth/status`,
      );
      if (!response.ok) {
        console.error(`AuthService: 认证状态检查失败，HTTP ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const status = await response.json();
      console.log("AuthService: 认证状态:", status);
      return status;
    } catch (error) {
      console.error("AuthService: 获取认证状态失败:", error);
      throw error;
    }
  }

  // 验证 token
  async validateToken(token?: string): Promise<AuthValidationResponse> {
    const accessToken = token || this.getToken();
    console.log(
      "AuthService: 验证token...",
      accessToken ? "有token" : "无token",
    );

    if (!accessToken) {
      console.log("AuthService: 没有可用的访问令牌");
      return {
        success: false,
        error_code: "NO_TOKEN",
        error_message: "No access token available",
      };
    }

    console.log(
      `AuthService: 准备验证token (前20字符): ${accessToken.substring(0, 20)}...`,
    );

    try {
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

      console.log(`AuthService: token验证响应状态: ${response.status}`);

      if (!response.ok) {
        // 如果 token 无效，移除本地存储的 token
        if (response.status === 401) {
          console.log("AuthService: token无效，移除本地存储");
          this.removeToken();
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("AuthService: token验证结果:", result);
      return result;
    } catch (error) {
      console.error("AuthService: token验证失败:", error);
      return {
        success: false,
        error_code: "VALIDATION_ERROR",
        error_message:
          error instanceof Error ? error.message : "Token validation failed",
      };
    }
  }

  // 获取当前用户信息
  async getCurrentUser(): Promise<UserInfo | null> {
    const token = this.getToken();

    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/xyzen/api/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.removeToken();
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Failed to get current user:", error);
      return null;
    }
  }

  // 综合检查认证状态（带缓存和通知）
  async checkAuthState(force: boolean = false): Promise<AuthResult> {
    console.log("AuthService: 检查认证状态，force =", force);
    // 如果已经有进行中的检查且不强制刷新，返回现有的 Promise
    if (this.authCheckPromise && !force) {
      console.log("AuthService: 返回已存在的认证检查Promise");
      return this.authCheckPromise;
    }

    // 清除之前的Promise（如果force=true）
    if (force) {
      this.authCheckPromise = null;
    }

    this.authCheckPromise = this._performAuthCheck();
    const result = await this.authCheckPromise;

    console.log("AuthService: 认证检查完成，结果:", result);
    // 通知所有监听器
    this.notifyListeners(result);

    return result;
  }

  // 执行实际的认证检查
  private async _performAuthCheck(): Promise<AuthResult> {
    console.log("AuthService: 开始执行认证检查...");
    try {
      // 1. 先检查认证服务是否配置
      console.log("AuthService: 步骤1 - 检查认证服务配置");
      const authStatus = await this.getAuthStatus();

      if (!authStatus.is_configured) {
        console.log("AuthService: 认证服务未配置");
        return {
          state: AuthState.NOT_CONFIGURED,
          message: authStatus.message,
        };
      }

      // 2. 检查是否有 token
      console.log("AuthService: 步骤2 - 检查本地token");
      const token = this.getToken();
      if (!token) {
        console.log("AuthService: 没有本地token");
        return {
          state: AuthState.NOT_AUTHENTICATED,
          message: "请先登录",
          provider: authStatus.provider,
        };
      }

      console.log(
        `AuthService: 找到本地token (前20字符): ${token.substring(0, 20)}...`,
      );

      // 3. 验证 token
      console.log("AuthService: 步骤3 - 验证token");
      const validation = await this.validateToken(token);

      if (!validation.success) {
        console.log("AuthService: token验证失败:", validation.error_message);
        return {
          state: AuthState.NOT_AUTHENTICATED,
          message: validation.error_message || "令牌无效，请重新登录",
          provider: authStatus.provider,
        };
      }

      console.log(
        "AuthService: token验证成功，用户信息:",
        validation.user_info,
      );
      return {
        state: AuthState.AUTHENTICATED,
        user: validation.user_info,
        message: `已登录 (${authStatus.provider})`,
        provider: authStatus.provider,
      };
    } catch (error) {
      console.error("AuthService: 认证检查失败:", error);
      return {
        state: AuthState.ERROR,
        message: error instanceof Error ? error.message : "认证检查失败",
      };
    }
  }

  // 自动登录检查（应用启动时调用）
  async autoLogin(): Promise<AuthResult> {
    console.log("Performing auto-login check...");

    // 默认都启用自动登录，直接检查认证状态
    return this.checkAuthState(true);
  }

  // 手动登录（用户主动登录时调用）
  async login(token: string): Promise<AuthResult> {
    // 设置 token
    this.setToken(token);

    // 立即检查认证状态
    return this.checkAuthState(true);
  }

  // 登出
  logout(): void {
    this.removeToken();
    this.authCheckPromise = null;

    // 通知监听器登出状态
    this.notifyListeners({
      state: AuthState.NOT_AUTHENTICATED,
      message: "已登出",
    });
  }
}

// 导出单例实例
export const authService = new AuthService();
