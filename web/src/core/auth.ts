import type { UserInfo } from "@/service/authService";
import { authService } from "@/service/authService";
import { useXyzen } from "@/store";
import { syncTokenFromCookie } from "@/utils/auth";

// 辅助函数：将API返回的用户信息映射为Store中的用户格式
const mapUserInfo = (userInfo: UserInfo) => ({
  id: userInfo.id,
  username: userInfo.display_name || userInfo.username || "Unknown",
  avatar:
    userInfo.avatar_url ||
    `https://storage.sciol.ac.cn/library/default_avatar.png`,
});

/**
 * 检查并同步认证状态到Zustand Store
 * 这是所有认证逻辑的核心入口
 * @param force - 是否强制重新从服务器验证，忽略缓存
 */
export const checkAuthState = async (_force: boolean = false) => {
  const { setStatus, setUser, setToken } = useXyzen.getState();
  setStatus("loading");

  try {
    // 1) 检查认证服务配置
    const status = await authService.getAuthStatus();
    if (!status.is_configured) {
      setStatus("failed");
      return;
    }

    // 2) 获取 token（优先 localStorage，如无则从 cookie 同步）
    let token = authService.getToken();
    if (!token) {
      token = syncTokenFromCookie("appAccessKey") ?? null;
    }

    if (!token) {
      setUser(null);
      setToken(null);
      setStatus("failed");
      return;
    }

    // 3) 验证 token
    const validation = await authService.validateToken(token);
    if (!validation.success || !validation.user_info) {
      authService.removeToken();
      setUser(null);
      setToken(null);
      setStatus("failed");
      return;
    }

    console.log("Auth validation succeeded:", validation);

    // 4) 成功，写入 store
    const mapped = mapUserInfo(validation.user_info);
    // 仅在开发环境打印用户信息（生产构建中 import.meta.env.DEV 会被替换为 false，代码被裁剪）
    if (import.meta.env.DEV) {
      console.info("[Auth] 用户验证成功", {
        raw: validation.user_info,
        mapped,
      });
    }
    setUser(mapped);
    setToken(token);
    setStatus("succeeded");
  } catch (error) {
    console.error("Auth check failed in Core:", error);
    setUser(null);
    setToken(null);
    setStatus("failed");
    authService.removeToken();
  }
};

/**
 * 处理用户登录
 * @param token - 从认证流程中获取的token
 */
export const login = async (token: string) => {
  const { setStatus, setUser, setToken } = useXyzen.getState();
  setStatus("loading");

  try {
    // 先写入 token，再进行校验并同步用户信息
    authService.setToken(token);
    await checkAuthState(true);
  } catch (error) {
    console.error("Login failed in Core:", error);
    setUser(null);
    setToken(null);
    setStatus("failed");
  }
};

/**
 * 处理用户登出
 */
export const logout = () => {
  const { setStatus, setUser, setToken } = useXyzen.getState();

  authService.logout();

  setUser(null);
  setToken(null);
  setStatus("failed"); // Set to "failed" to show landing page instead of loading screen
};

/**
 * 应用启动时执行的自动登录检查
 */
export const autoLogin = async () => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const tokenFromQuery =
      params.get("access_token") ?? params.get("access_toekn");

    if (tokenFromQuery && tokenFromQuery.trim()) {
      // 清理 URL，避免 token 长期暴露在地址栏/历史记录里
      params.delete("access_token");
      params.delete("access_toekn");
      const next = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ""
      }${window.location.hash}`;
      window.history.replaceState({}, "", next);

      await login(tokenFromQuery.trim());
      return;
    }
  }

  await checkAuthState(true);
};
