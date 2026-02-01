import { authService, type AuthProviderConfig } from "@/service/authService";

/**
 * Build OAuth authorization URL based on provider configuration
 */
export function buildAuthorizeUrl(
  provider: string,
  cfg: AuthProviderConfig,
  state?: string,
): string | null {
  if (!cfg.issuer) return null;
  const redirectUri = encodeURIComponent(
    `${window.location.origin}${window.location.pathname}`,
  );
  const audience = cfg.audience ? encodeURIComponent(cfg.audience) : "";

  if (provider === "casdoor") {
    // Casdoor OAuth2 Authorization Code Flow
    const base = cfg.issuer
      .replace(/\/$/, "")
      .replace("host.docker.internal", "localhost");

    return `${base}/login/oauth/authorize?client_id=${audience}&response_type=code&redirect_uri=${redirectUri}&scope=openid%20profile%20email&state=${state}`;
  }
  if (provider === "bohrium") {
    // Best-effort: common authorize path; adjust if backend exposes a dedicated login endpoint
    const base = cfg.issuer.replace(/\/$/, "");
    return `${base}/oauth/authorize?client_id=${audience}&response_type=token&redirect_uri=${redirectUri}`;
  }
  return null;
}

/**
 * Initiate OAuth login flow
 * This will redirect the user to the OAuth provider
 */
export async function initiateOAuthLogin(): Promise<void> {
  try {
    const status = await authService.getAuthStatus();

    if (!status.is_configured || !status.provider) {
      throw new Error("Authentication is not configured");
    }

    const config = await authService.getAuthConfig();
    const provider = status.provider;

    let url: string | null = null;

    if (provider === "casdoor") {
      // Generate state for CSRF protection
      const state = Math.random().toString(36).substring(7);
      sessionStorage.setItem("auth_state", state);
      url = buildAuthorizeUrl(provider, config, state);
    } else {
      url = buildAuthorizeUrl(provider, config);
    }

    if (url) {
      window.location.href = url;
    } else {
      throw new Error(`Unsupported auth provider: ${provider}`);
    }
  } catch (error) {
    console.error("Failed to initiate OAuth login:", error);
    throw error;
  }
}
