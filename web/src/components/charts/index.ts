// Export all chart components for easy importing
export { ChartRenderer } from "./ChartRenderer";
export { ChartDisplay, SimpleChartDisplay } from "./ChartDisplay";

// Export chart utilities
export {
  detectChart,
  validateChartData,
  suggestChartType,
} from "../../utils/chartDetection";
export {
  createEChartsTheme,
  detectThemeFromDOM,
} from "../../utils/chartThemes";

// Export chart types
export type {
  ChartConfig,
  ChartDataPoint,
  SeriesData,
  TimeSeriesPoint,
  ChartableOutput,
  ChartDetectionResult,
  ChartTheme,
  ChartRendererProps,
  ChartDisplayProps,
  ChartableData,
  DetectionPattern,
} from "../../types/chartTypes";
