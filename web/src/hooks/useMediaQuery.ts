import { useSyncExternalStore } from "react";

/**
 * High-performance media query hook using useSyncExternalStore
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mediaQuery = window.matchMedia(query);

    // Modern browsers support addEventListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(callback);
      return () => mediaQuery.removeListener(callback);
    }
  };

  const getSnapshot = () => {
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => {
    return false;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Convenience hook for mobile detection
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
