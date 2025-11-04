import type { ChartTheme } from "../types/chartTypes";
import type { EChartsOption } from "echarts";

/**
 * Chart themes matching the application's design system
 */
export const chartThemes: Record<"light" | "dark", ChartTheme> = {
  light: {
    backgroundColor: "transparent",
    textColor: "#374151", // gray-700 - better contrast on light backgrounds
    axisColor: "#9CA3AF", // gray-400
    gridColor: "#F3F4F6", // gray-100
    colorPalette: [
      "#2563EB", // blue-600 - professional blue
      "#059669", // emerald-600 - rich green
      "#DC2626", // red-600 - strong red
      "#9333EA", // purple-600 - vibrant purple
      "#EA580C", // orange-600 - warm orange
      "#0891B2", // cyan-600 - professional cyan
      "#65A30D", // lime-600 - natural green
      "#C2410C", // orange-700 - earthy orange
      "#BE185D", // pink-700 - deep pink
      "#4338CA", // indigo-700 - rich indigo
    ],
  },
  dark: {
    backgroundColor: "transparent",
    textColor: "#E5E7EB", // gray-200 - better contrast on dark backgrounds
    axisColor: "#6B7280", // gray-500
    gridColor: "#4B5563", // gray-600
    colorPalette: [
      "#3B82F6", // blue-500 - bright blue
      "#10B981", // emerald-500 - bright green
      "#EF4444", // red-500 - bright red
      "#A855F7", // purple-500 - vivid purple
      "#F97316", // orange-500 - vibrant orange
      "#06B6D4", // cyan-500 - bright cyan
      "#84CC16", // lime-500 - bright lime
      "#F59E0B", // amber-500 - golden yellow
      "#EC4899", // pink-500 - bright pink
      "#6366F1", // indigo-500 - bright indigo
    ],
  },
};

/**
 * Generate ECharts theme configuration
 */
export function createEChartsTheme(
  theme: "light" | "dark",
): Partial<EChartsOption> {
  const themeConfig = chartThemes[theme];

  return {
    backgroundColor: "transparent",
    color: themeConfig.colorPalette,

    // Clean typography - closer to ECharts defaults
    textStyle: {
      color: themeConfig.textColor,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },

    // Minimal grid - let ECharts handle most styling
    grid: {
      left: "10%",
      right: "5%",
      top: "10%",
      bottom: "10%",
      containLabel: true,
    },

    // Simple animations
    animation: true,
    animationDuration: 750,
    animationEasing: "cubicOut",

    // Clean tooltip - mostly ECharts defaults
    tooltip: {
      backgroundColor:
        theme === "dark" ? "rgba(50, 50, 50, 0.9)" : "rgba(255, 255, 255, 0.9)",
      borderWidth: 0,
      textStyle: {
        color: themeConfig.textColor,
      },
    },

    // Minimal customization for dark theme support
    ...(theme === "dark" && {
      xAxis: {
        axisLine: { lineStyle: { color: "#4B5563" } },
        axisTick: { lineStyle: { color: "#4B5563" } },
        axisLabel: { color: themeConfig.textColor },
        splitLine: { lineStyle: { color: "#374151" } },
        nameTextStyle: { color: themeConfig.textColor },
      },
      yAxis: {
        axisLine: { lineStyle: { color: "#4B5563" } },
        axisTick: { lineStyle: { color: "#4B5563" } },
        axisLabel: { color: themeConfig.textColor },
        splitLine: { lineStyle: { color: "#374151" } },
        nameTextStyle: { color: themeConfig.textColor },
      },
      legend: {
        textStyle: { color: themeConfig.textColor },
      },
      title: {
        textStyle: { color: themeConfig.textColor },
      },
    }),
  };
}

/**
 * Hook to detect system theme preference
 */
export function useSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery.matches ? "dark" : "light";
}

/**
 * Detect theme from DOM classes (common pattern in Tailwind apps)
 */
export function detectThemeFromDOM(): "light" | "dark" {
  if (typeof document === "undefined") return "light";

  const html = document.documentElement;
  const body = document.body;

  // Check for dark class on html or body
  if (html.classList.contains("dark") || body.classList.contains("dark")) {
    return "dark";
  }

  // Check for data attributes
  if (
    html.getAttribute("data-theme") === "dark" ||
    body.getAttribute("data-theme") === "dark"
  ) {
    return "dark";
  }

  // Fallback to system preference
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery.matches ? "dark" : "light";
}
