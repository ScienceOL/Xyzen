import { checkAuthState, login, logout } from "@/core/auth";
import { useXyzen } from "@/store";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

export function useAuth() {
  // Use useShallow to avoid creating a new object reference every render,
  // which can cause unnecessary updates or loops in strict/dev modes.
  const { user, token, status } = useXyzen(
    useShallow((state) => ({
      user: state.user,
      token: state.token,
      status: state.status,
    })),
  );

  const isAuthenticated = status === "succeeded" && !!user;
  const isLoading = status === "loading";

  const memoizedLogin = useCallback(async (token: string) => {
    await login(token);
  }, []);

  const memoizedLogout = useCallback(() => {
    logout();
  }, []);

  const memoizedCheckAuth = useCallback(async (force: boolean = false) => {
    await checkAuthState(force);
  }, []);

  return {
    user,
    token,
    status,
    isLoading,
    isAuthenticated,
    login: memoizedLogin,
    logout: memoizedLogout,
    checkAuth: memoizedCheckAuth,
  };
}
