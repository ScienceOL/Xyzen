import type { AuthResult, UserInfo } from "@/service/authService";
import { authService, AuthState } from "@/service/authService";
import { useCallback, useEffect, useState } from "react";

export interface UseAuthReturn {
  authState: AuthState;
  user: UserInfo | undefined;
  message: string;
  provider: string | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  checkAuth: (force?: boolean) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [authResult, setAuthResult] = useState<AuthResult>({
    state: AuthState.NOT_AUTHENTICATED,
    message: "检查中...",
  });
  const [isLoading, setIsLoading] = useState(true);

  // 处理认证状态变化 - 使用useCallback并稳定依赖
  const handleAuthChange = useCallback((result: AuthResult) => {
    setAuthResult(result);
    setIsLoading(false);
  }, []);

  // 检查认证状态
  const checkAuth = useCallback(async (force: boolean = false) => {
    setIsLoading(true);
    try {
      const result = await authService.checkAuthState(force);
      setAuthResult(result);
    } catch (error) {
      console.error("Auth check failed:", error);
      setAuthResult({
        state: AuthState.ERROR,
        message: error instanceof Error ? error.message : "认证检查失败",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 登录
  const login = useCallback(async (token: string) => {
    setIsLoading(true);
    try {
      const result = await authService.login(token);
      setAuthResult(result);
    } catch (error) {
      console.error("Login failed:", error);
      setAuthResult({
        state: AuthState.ERROR,
        message: error instanceof Error ? error.message : "登录失败",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 登出
  const logout = useCallback(() => {
    authService.logout();
  }, []);

  // 组件挂载时进行自动登录检查 - 只执行一次
  useEffect(() => {
    let mounted = true;

    const performAutoLogin = async () => {
      if (!mounted) return;

      setIsLoading(true);
      try {
        const result = await authService.autoLogin();
        if (mounted) {
          setAuthResult(result);
        }
      } catch (error) {
        console.error("Auto-login failed:", error);
        if (mounted) {
          setAuthResult({
            state: AuthState.ERROR,
            message: error instanceof Error ? error.message : "自动登录失败",
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // 只在第一次挂载时执行自动登录
    performAutoLogin();

    // 添加认证状态监听器
    authService.addAuthStateListener(handleAuthChange);

    // 清理监听器
    return () => {
      mounted = false;
      authService.removeAuthStateListener(handleAuthChange);
    };
  }, [handleAuthChange]);

  return {
    authState: authResult.state,
    user: authResult.user,
    message: authResult.message,
    provider: authResult.provider,
    isLoading,
    isAuthenticated: authResult.state === AuthState.AUTHENTICATED,
    isConfigured: authResult.state !== AuthState.NOT_CONFIGURED,
    login,
    logout,
    checkAuth,
  };
}
