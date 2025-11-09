// Pure utility functions for auth token handling (no side-effects except controlled optional write)

export const ACCESS_TOKEN_KEY = "access_token";

/**
 * Extract a cookie value by name from a cookie string (defaults to document.cookie if available).
 * Pure: does not mutate any external state.
 */
export function extractCookieValue(
  name: string,
  cookieString?: string,
): string | null {
  const source =
    cookieString ?? (typeof document !== "undefined" ? document.cookie : "");
  if (!source) return null;
  const match = source.match(new RegExp("(^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Synchronize token from cookie to a provided storage-like target when local token absent.
 * Returns the token if synchronized (or already present when allowExisting true), else null.
 * Side effects are isolated to the provided storage interface (defaults to window.localStorage).
 */
export function syncTokenFromCookie(
  cookieKey: string,
  options: {
    storageKey?: string;
    storage?: Pick<Storage, "getItem" | "setItem">;
    cookieString?: string;
    allowExisting?: boolean; // if true returns existing token even if no sync performed
  } = {},
): string | null {
  const {
    storageKey = ACCESS_TOKEN_KEY,
    storage = typeof window !== "undefined" ? window.localStorage : undefined,
    cookieString,
    allowExisting = true,
  } = options;

  if (!storage) return null;
  const existing = storage.getItem(storageKey);
  if (existing && allowExisting) return existing;
  if (existing) return null; // already present, no sync needed

  const cookieToken = extractCookieValue(cookieKey, cookieString);
  if (cookieToken) {
    storage.setItem(storageKey, cookieToken);
    return cookieToken;
  }
  return null;
}
