import type { ChartTheme } from '../types/chartTypes';
import type { EChartsOption } from 'echarts';

/**
 * Chart themes matching the application's design system
 */
export const chartThemes: Record<'light' | 'dark', ChartTheme> = {
  light: {
    backgroundColor: '#ffffff',
    textColor: '#374151', // gray-700
    axisColor: '#9CA3AF', // gray-400
    gridColor: '#F3F4F6', // gray-100
    colorPalette: [
      '#3B82F6', // blue-500
      '#10B981', // emerald-500
      '#F59E0B', // amber-500
      '#EF4444', // red-500
      '#8B5CF6', // violet-500
      '#F97316', // orange-500
      '#06B6D4', // cyan-500
      '#84CC16', // lime-500
    ],
  },
  dark: {
    backgroundColor: '#1F2937', // gray-800
    textColor: '#F9FAFB', // gray-50
    axisColor: '#6B7280', // gray-500
    gridColor: '#374151', // gray-700
    colorPalette: [
      '#60A5FA', // blue-400
      '#34D399', // emerald-400
      '#FBBF24', // amber-400
      '#F87171', // red-400
      '#A78BFA', // violet-400
      '#FB923C', // orange-400
      '#22D3EE', // cyan-400
      '#A3E635', // lime-400
    ],
  },
};

/**
 * Generate ECharts theme configuration
 */
export function createEChartsTheme(theme: 'light' | 'dark'): Partial<EChartsOption> {
  const themeConfig = chartThemes[theme];

  return {
    backgroundColor: themeConfig.backgroundColor,
    textStyle: {
      color: themeConfig.textColor,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    },
    color: themeConfig.colorPalette,
    grid: {
      borderColor: themeConfig.gridColor,
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      axisLine: {
        lineStyle: {
          color: themeConfig.axisColor,
        },
      },
      axisTick: {
        lineStyle: {
          color: themeConfig.axisColor,
        },
      },
      axisLabel: {
        color: themeConfig.textColor,
      },
      splitLine: {
        lineStyle: {
          color: themeConfig.gridColor,
        },
      },
    },
    yAxis: {
      axisLine: {
        lineStyle: {
          color: themeConfig.axisColor,
        },
      },
      axisTick: {
        lineStyle: {
          color: themeConfig.axisColor,
        },
      },
      axisLabel: {
        color: themeConfig.textColor,
      },
      splitLine: {
        lineStyle: {
          color: themeConfig.gridColor,
        },
      },
    },
    legend: {
      textStyle: {
        color: themeConfig.textColor,
      },
    },
    title: {
      textStyle: {
        color: themeConfig.textColor,
      },
    },
    tooltip: {
      backgroundColor: theme === 'dark' ? '#374151' : '#FFFFFF',
      borderColor: themeConfig.axisColor,
      textStyle: {
        color: themeConfig.textColor,
      },
    },
  };
}

/**
 * Hook to detect system theme preference
 */
export function useSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery.matches ? 'dark' : 'light';
}

/**
 * Detect theme from DOM classes (common pattern in Tailwind apps)
 */
export function detectThemeFromDOM(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';

  const html = document.documentElement;
  const body = document.body;

  // Check for dark class on html or body
  if (html.classList.contains('dark') || body.classList.contains('dark')) {
    return 'dark';
  }

  // Check for data attributes
  if (html.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark') {
    return 'dark';
  }

  // Fallback to system preference
  return useSystemTheme();
}
