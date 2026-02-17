import { LAYOUT_STYLE, type LayoutStyle } from "@/store/slices/uiSlice/types";

const isDevelopment = import.meta.env.MODE === "development";
const isProduction = import.meta.env.MODE === "production";

console.log("=== Environment Debug ===");
console.log("MODE:", import.meta.env.MODE);
console.log("isDevelopment:", isDevelopment);
console.log("isProduction:", isProduction);
console.log("VITE_XYZEN_BACKEND_URL:", import.meta.env.VITE_XYZEN_BACKEND_URL);

/**
 * Smart backend URL configuration:
 * Priority:
 * 1. Explicit `VITE_XYZEN_BACKEND_URL` environment value
 * 2. Production: use current window origin
 * 3. Development fallback: http://localhost:48196
 * @returns Backend base URL string
 */
const getBackendURL = (): string => {
  if (import.meta.env.VITE_XYZEN_BACKEND_URL) {
    return import.meta.env.VITE_XYZEN_BACKEND_URL;
  }

  if (isProduction && window !== undefined) {
    return `${window.location.protocol}//${window.location.host}`;
  }

  return "http://localhost:48196";
};

export const DEFAULT_BACKEND_URL = getBackendURL();

console.log("Final DEFAULT_BACKEND_URL:", DEFAULT_BACKEND_URL);

/**
 * Resolve the default layout style for the application.
 * Preference order:
 * 1. `layoutStyle` stored in localStorage
 * 2. `VITE_XYZEN_LAYOUT_STYLE` environment value
 * 3. Fallback to `LAYOUT_STYLE.Fullscreen`
 * @returns LayoutStyle value
 */
const getLayoutStyle = (): LayoutStyle => {
  if (localStorage.getItem("layoutStyle") as LayoutStyle) {
    return localStorage.getItem("layoutStyle") as LayoutStyle;
  }

  if (import.meta.env.VITE_XYZEN_LAYOUT_STYLE) {
    return import.meta.env.VITE_XYZEN_LAYOUT_STYLE as LayoutStyle;
  }
  return LAYOUT_STYLE.Sidebar;
};

export const DEFAULT_LAYOUT_STYLE = getLayoutStyle();

console.log("Final DEFAULT_LAYOUT_STYLE:", DEFAULT_LAYOUT_STYLE);
