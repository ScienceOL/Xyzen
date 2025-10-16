import { authService } from "@/service/authService";
import type { StateCreator } from "zustand";
import type { User, XyzenState } from "../types";

export interface AuthSlice {
  user: User | null;
  token: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  login: (token: string) => Promise<void>;
  logout: () => void;
  fetchUserByToken: () => Promise<void>;
}

// 辅助函数：将authService的用户信息转换为Zustand store格式
const mapUserInfo = (userInfo: {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}): User => ({
  id: userInfo.id,
  username: userInfo.username || userInfo.display_name || "Unknown",
  avatar: userInfo.avatar_url || `https://i.pravatar.cc/40?u=${userInfo.id}`,
});

export const createAuthSlice: StateCreator<
  XyzenState,
  [["zustand/immer", never]],
  [],
  AuthSlice
> = (set, _) => {
  // 设置authService监听器，当认证状态变化时同步到Zustand store
  authService.addAuthStateListener((authResult) => {
    if (authResult.state === "authenticated" && authResult.user) {
      const token = authService.getToken();
      set({
        token,
        user: mapUserInfo(authResult.user),
        status: "succeeded",
      });
    } else if (
      authResult.state === "not_authenticated" ||
      authResult.state === "error"
    ) {
      set({ user: null, token: null, status: "failed" });
    }
  });

  return {
    user: null, // 移除mock用户，初始为null
    token: null,
    status: "idle",
    login: async (token: string) => {
      set({ status: "loading" });
      try {
        const authResult = await authService.login(token);
        if (authResult.state === "authenticated" && authResult.user) {
          set({
            token,
            user: mapUserInfo(authResult.user),
            status: "succeeded",
          });
        } else {
          throw new Error(authResult.message);
        }
      } catch (error) {
        set({ status: "failed" });
        console.error("Login failed:", error);
      }
    },
    logout: () => {
      authService.logout();
      set({ user: null, token: null, status: "idle" });
    },
    fetchUserByToken: async () => {
      const token = authService.getToken();
      if (token) {
        set({ status: "loading" });
        try {
          // 使用非强制的检查，避免重复调用
          const authResult = await authService.checkAuthState(false);
          if (authResult.state === "authenticated" && authResult.user) {
            set({
              token,
              user: mapUserInfo(authResult.user),
              status: "succeeded",
            });
          } else {
            set({ status: "failed" });
            authService.removeToken();
          }
        } catch (error) {
          set({ status: "failed" });
          authService.removeToken();
          console.error("Failed to fetch user by token:", error);
        }
      }
    },
  };
};
