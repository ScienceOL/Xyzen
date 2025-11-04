import type { EChartsOption } from "echarts";

// Basic chart data point interfaces
export interface ChartDataPoint {
  x: string | number;
  y: number;
  [key: string]: unknown;
}

export interface SeriesData {
  name: string;
  data: number[] | ChartDataPoint[];
  type?: "line" | "bar" | "pie" | "scatter" | "area";
}

export interface TimeSeriesPoint {
  timestamp: string | Date;
  value: number;
  [key: string]: unknown;
}

// Chart configuration interfaces
export interface ChartConfig {
  type: "line" | "bar" | "pie" | "scatter" | "area" | "heatmap";
  title?: string;
  data: ChartDataPoint[] | SeriesData[] | TimeSeriesPoint[] | number[];
  labels?: string[];
  xAxis?: {
    type?: "category" | "value" | "time";
    name?: string;
  };
  yAxis?: {
    type?: "category" | "value" | "log";
    name?: string;
  };
  options?: Partial<EChartsOption>;
}

// AI output interfaces that might contain charts
export interface ChartableOutput {
  // Direct ECharts configuration
  echarts?: EChartsOption;

  // Structured chart data
  chart?: ChartConfig;

  // Simple data arrays that could be charted
  data?: unknown[];

  // Chart type hint from AI
  chart_type?: string;
  visualization?: string;

  // Metadata
  title?: string;
  description?: string;
}

// Chart detection result
export interface ChartDetectionResult {
  isChartable: boolean;
  chartType: ChartConfig["type"] | null;
  confidence: number; // 0-1 score
  data: ChartConfig | null;
  reason?: string; // Why it was or wasn't detected as chartable
}

// Theme configuration
export interface ChartTheme {
  backgroundColor: string;
  textColor: string;
  axisColor: string;
  gridColor: string;
  colorPalette: string[];
}

// Component props
export interface ChartRendererProps {
  data: ChartConfig | EChartsOption;
  theme?: "light" | "dark";
  height?: string | number;
  width?: string | number;
  className?: string;
  onChartReady?: (chart: unknown) => void;
}

export interface ChartDisplayProps {
  data: unknown;
  compact?: boolean;
  variant?: "default" | "success" | "error";
  className?: string;
  fallbackToJson?: boolean;
}

// Utility types
export type ChartableData =
  | ChartDataPoint[]
  | SeriesData[]
  | TimeSeriesPoint[]
  | number[]
  | { [key: string]: number }[]
  | EChartsOption;

export type DetectionPattern = {
  name: string;
  test: (data: unknown) => boolean;
  transform: (data: unknown) => ChartConfig | null;
  confidence: number;
};
