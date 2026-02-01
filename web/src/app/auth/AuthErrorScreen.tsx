import { Input } from "@/components/base/Input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  authService,
  type AuthProviderConfig,
  type AuthStatus,
} from "@/service/authService";
import { buildAuthorizeUrl } from "@/utils/authFlow";
import { InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";

function useAuthProvider() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [config, setConfig] = useState<AuthProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await authService.getAuthStatus();
        if (!mounted) return;
        setStatus(s);
        if (s?.is_configured) {
          const c = await authService.getAuthConfig();
          if (!mounted) return;
          setConfig(c);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { status, config, loading, error };
}

interface AuthErrorScreenProps {
  onRetry: () => void;
  variant?: "fullscreen" | "inline"; // inline renders inside sidebar panel only
}

function AuthErrorScreen({
  onRetry,
  variant = "fullscreen",
}: AuthErrorScreenProps) {
  const { login } = useAuth();
  const { status, config, loading } = useAuthProvider();
  const [appAccessKey, setAppAccessKey] = useState("");

  // Handle Authorization Code Flow callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code) {
      // Optional: Verify state matches what we stored
      const storedState = sessionStorage.getItem("auth_state");
      if (state && storedState && state !== storedState) {
        console.error("State mismatch during authentication");
        return;
      }

      // Clear query params to look cleaner
      window.history.replaceState({}, document.title, window.location.pathname);

      // Exchange code for token
      authService
        .loginWithCasdoor(code, state || undefined)
        .then((response) => {
          void login(response.access_token);
        })
        .catch((err) => {
          console.error("Failed to exchange code for token:", err);
        });
    }
  }, [login]);

  // Legacy Implicit Flow handling (optional, can be removed if strictly code flow)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const token = params.get("access_token");
      if (token) {
        // Clear hash to avoid repeated parsing
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        void login(token); // will validate and set store
      }
    }
  }, [login]);

  const provider = config?.provider ?? status?.provider ?? undefined;

  const handleOAuthLogin = () => {
    if (!provider || !config) return;

    let url: string | null = null;

    if (provider === "casdoor") {
      // Generate state only when user clicks login
      const state = Math.random().toString(36).substring(7);
      sessionStorage.setItem("auth_state", state);
      url = buildAuthorizeUrl(provider, config, state);
    } else {
      url = buildAuthorizeUrl(provider, config);
    }

    if (url) {
      window.location.href = url;
    }
  };

  // Container classes vary by layout variant
  const outerCls =
    variant === "fullscreen"
      ? "flex min-h-screen items-center justify-center bg-linear-to-br from-background via-muted/40 to-background p-4"
      : "p-3";
  const cardCls =
    variant === "fullscreen"
      ? "w-full max-w-xl rounded-sm border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg shadow-black/5 dark:shadow-black/30 p-8 flex flex-col gap-6"
      : "rounded-lg border border-border/60 bg-card/70 backdrop-blur-sm shadow-sm p-5 flex flex-col gap-5";

  return (
    <div className={outerCls}>
      <div className={cardCls}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-9 flex items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <circle cx="12" cy="16" r="1" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              自动登录失败
            </h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            当前会话未能自动获取有效的凭证。请选择以下登录方式继续，或稍后重试。
          </p>
          {provider && (
            <div className="text-xs text-muted-foreground">
              后端鉴权提供商：
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 font-medium uppercase text-foreground/80">
                {provider}
              </span>
            </div>
          )}
        </div>

        {/* Provider-aware login options */}
        {!loading && status?.is_configured && provider && (
          <div className="space-y-5">
            {provider === "bohr_app" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-medium">使用 AccessKey 登录</h2>
                  <p className="text-xs text-muted-foreground">
                    请输入 Bohrium App 的{" "}
                    <code className="font-mono">appAccessKey</code>。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={appAccessKey}
                    onChange={(e) =>
                      setAppAccessKey((e.target as HTMLInputElement).value)
                    }
                    autoComplete="off"
                    type="password"
                    placeholder="粘贴 appAccessKey"
                    className="w-full"
                  />
                  <Button
                    disabled={!appAccessKey}
                    onClick={() => {
                      void login(appAccessKey);
                    }}
                  >
                    登录
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <InfoIcon className="inline-block size-4 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    在 Bohrium APP
                    中出现此问题通常是因为浏览器的策略限制，请在浏览器 设置 →
                    隐私/安全 中开启「允许第三方 Cookie」
                  </p>
                </div>
              </div>
            )}

            {provider === "bohrium" && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium">Bohrium OAuth 登录</h2>
                <p className="text-xs text-muted-foreground">
                  跳转至 Bohrium 授权页面完成登录。
                </p>
                <div>
                  <Button className="w-full" onClick={handleOAuthLogin}>
                    前往 Bohrium 授权
                  </Button>
                </div>
              </div>
            )}

            {provider === "casdoor" && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium">Casdoor OAuth 登录</h2>
                <p className="text-xs text-muted-foreground">
                  跳转至 Casdoor 授权页面完成登录。
                </p>
                <div>
                  <Button className="w-full" onClick={handleOAuthLogin}>
                    前往 Casdoor 授权
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom action buttons */}
        <div
          className={
            variant === "fullscreen"
              ? "mt-6 flex justify-end gap-2"
              : "mt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"
          }
        >
          <Button
            variant="outline"
            onClick={onRetry}
            className={variant === "fullscreen" ? "w-fit" : "sm:w-auto"}
          >
            重试自动登录
          </Button>
          <Button
            onClick={() => window.location.reload()}
            className={variant === "fullscreen" ? "w-fit" : "sm:w-auto"}
          >
            刷新页面
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AuthErrorScreen;
