import type {
  ChartDetectionResult,
  ChartConfig,
  DetectionPattern,
  ChartableOutput,
  ChartDataPoint,
  SeriesData,
  TimeSeriesPoint,
} from '../types/chartTypes';
import type { EChartsOption } from 'echarts';

/**
 * Detects if data can be rendered as a chart and transforms it accordingly
 */
export function detectChart(data: unknown): ChartDetectionResult {
  if (!data || typeof data !== 'object') {
    return {
      isChartable: false,
      chartType: null,
      confidence: 0,
      data: null,
      reason: 'Data is not an object',
    };
  }

  // Run through detection patterns in order of confidence
  const patterns = getDetectionPatterns();

  for (const pattern of patterns) {
    if (pattern.test(data)) {
      const chartConfig = pattern.transform(data);
      if (chartConfig) {
        return {
          isChartable: true,
          chartType: chartConfig.type,
          confidence: pattern.confidence,
          data: chartConfig,
          reason: `Detected as ${pattern.name}`,
        };
      }
    }
  }

  return {
    isChartable: false,
    chartType: null,
    confidence: 0,
    data: null,
    reason: 'No matching chart patterns found',
  };
}

/**
 * Detection patterns ordered by confidence (highest first)
 */
function getDetectionPatterns(): DetectionPattern[] {
  return [
    // Direct ECharts configuration (highest confidence)
    {
      name: 'Direct ECharts Config',
      confidence: 0.95,
      test: (data: unknown) => {
        return typeof data === 'object' && data !== null &&
               ('echarts' in data || ('xAxis' in data && 'yAxis' in data && 'series' in data));
      },
      transform: (data: unknown) => {
        const obj = data as ChartableOutput;
        if (obj.echarts) {
          return {
            type: 'line', // Default type, will be overridden by ECharts config
            data: [],
            options: obj.echarts,
          };
        }

        // Direct ECharts option format
        return {
          type: 'line',
          data: [],
          options: data as EChartsOption,
        };
      },
    },

    // Structured chart object
    {
      name: 'Structured Chart Config',
      confidence: 0.9,
      test: (data: unknown) => {
        return typeof data === 'object' && data !== null && 'chart' in data;
      },
      transform: (data: unknown) => {
        const obj = data as ChartableOutput;
        return obj.chart || null;
      },
    },

    // Time series data
    {
      name: 'Time Series Data',
      confidence: 0.85,
      test: (data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return false;

        const firstItem = data[0];
        return typeof firstItem === 'object' && firstItem !== null &&
               ('timestamp' in firstItem || 'time' in firstItem || 'date' in firstItem) &&
               ('value' in firstItem || 'y' in firstItem);
      },
      transform: (data: unknown) => {
        const points = data as TimeSeriesPoint[];
        return {
          type: 'line' as const,
          data: points.map(point => {
            // Type-safe access to alternative property names
            const pointRecord = point as Record<string, unknown>;
            return {
              x: (point.timestamp || pointRecord.time || pointRecord.date) as string | number,
              y: (point.value || (typeof pointRecord.y === 'number' ? pointRecord.y : 0)) as number,
            };
          }),
          xAxis: { type: 'time' },
          yAxis: { type: 'value' },
        };
      },
    },

    // Array of coordinate objects
    {
      name: 'Coordinate Data',
      confidence: 0.8,
      test: (data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return false;

        const firstItem = data[0];
        return typeof firstItem === 'object' && firstItem !== null &&
               ('x' in firstItem && 'y' in firstItem) &&
               typeof firstItem.y === 'number';
      },
      transform: (data: unknown) => {
        const points = data as ChartDataPoint[];
        return {
          type: 'line' as const,
          data: points,
          xAxis: { type: isNumericSeries(points.map(p => p.x)) ? 'value' : 'category' },
          yAxis: { type: 'value' },
        };
      },
    },

    // Array of series data
    {
      name: 'Series Data',
      confidence: 0.75,
      test: (data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return false;

        const firstItem = data[0];
        return typeof firstItem === 'object' && firstItem !== null &&
               'name' in firstItem && 'data' in firstItem &&
               Array.isArray(firstItem.data);
      },
      transform: (data: unknown) => {
        const series = data as SeriesData[];
        return {
          type: series[0].type || 'line' as const,
          data: series,
        };
      },
    },

    // Array of objects with numeric values (table-like data)
    {
      name: 'Tabular Data',
      confidence: 0.7,
      test: (data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return false;

        const firstItem = data[0];
        if (typeof firstItem !== 'object' || firstItem === null) return false;

        const numericKeys = Object.keys(firstItem).filter(key =>
          typeof firstItem[key as keyof typeof firstItem] === 'number'
        );

        return numericKeys.length >= 1 && Object.keys(firstItem).length >= 2;
      },
      transform: (data: unknown) => {
        const rows = data as Record<string, unknown>[];
        const keys = Object.keys(rows[0]);
        const numericKeys = keys.filter(key => typeof rows[0][key] === 'number');
        const categoryKey = keys.find(key => typeof rows[0][key] === 'string') || keys[0];

        if (numericKeys.length === 1) {
          // Single series
          return {
            type: 'bar' as const,
            data: rows.map(row => ({
              x: row[categoryKey] as string,
              y: row[numericKeys[0]] as number,
            })),
            xAxis: { type: 'category' },
            yAxis: { type: 'value' },
          };
        } else {
          // Multiple series
          const series: SeriesData[] = numericKeys.map(key => ({
            name: key,
            data: rows.map(row => row[key] as number),
            type: 'bar',
          }));

          return {
            type: 'bar' as const,
            data: series,
            labels: rows.map(row => String(row[categoryKey])),
          };
        }
      },
    },

    // Simple numeric array
    {
      name: 'Numeric Array',
      confidence: 0.6,
      test: (data: unknown) => {
        return Array.isArray(data) && data.length > 0 &&
               data.every(item => typeof item === 'number');
      },
      transform: (data: unknown) => {
        const numbers = data as number[];
        return {
          type: 'line' as const,
          data: numbers.map((value, index) => ({ x: index, y: value })),
          xAxis: { type: 'category' },
          yAxis: { type: 'value' },
        };
      },
    },

    // Object with hint keywords
    {
      name: 'Hinted Chart Data',
      confidence: 0.65,
      test: (data: unknown) => {
        if (typeof data !== 'object' || data === null) return false;

        const obj = data as Record<string, unknown>;
        const hintKeys = ['chart_type', 'visualization', 'plot', 'graph'];
        const dataKeys = ['data', 'values', 'points'];

        const hasHint = hintKeys.some(key => key in obj);
        const hasData = dataKeys.some(key => key in obj && Array.isArray(obj[key]));

        return hasHint && hasData;
      },
      transform: (data: unknown) => {
        const obj = data as ChartableOutput;
        const chartType = extractChartType(obj.chart_type || obj.visualization);
        // Type-safe access to alternative data property names
        const objRecord = obj as Record<string, unknown>;
        const chartData = obj.data || objRecord.values || objRecord.points;

        if (!Array.isArray(chartData)) return null;

        // Recursively detect the data format
        const dataDetection = detectChart(chartData);
        if (dataDetection.isChartable && dataDetection.data) {
          return {
            ...dataDetection.data,
            type: chartType || dataDetection.data.type,
            title: obj.title,
          };
        }

        return null;
      },
    },
  ];
}

/**
 * Helper function to determine if a series is numeric
 */
function isNumericSeries(values: (string | number)[]): boolean {
  return values.every(val => typeof val === 'number' || !isNaN(Number(val)));
}

/**
 * Extract chart type from AI hints
 */
function extractChartType(hint: string | undefined): ChartConfig['type'] | null {
  if (!hint) return null;

  const normalizedHint = hint.toLowerCase();

  if (normalizedHint.includes('line')) return 'line';
  if (normalizedHint.includes('bar') || normalizedHint.includes('column')) return 'bar';
  if (normalizedHint.includes('pie') || normalizedHint.includes('donut')) return 'pie';
  if (normalizedHint.includes('scatter') || normalizedHint.includes('point')) return 'scatter';
  if (normalizedHint.includes('area')) return 'area';
  if (normalizedHint.includes('heatmap') || normalizedHint.includes('heat')) return 'heatmap';

  return null;
}

/**
 * Validate that chart data is safe to render
 */
export function validateChartData(config: ChartConfig): boolean {
  try {
    // Basic validation
    if (!config || !config.type || !config.data) {
      return false;
    }

    // Prevent extremely large datasets that could freeze the browser
    if (Array.isArray(config.data) && config.data.length > 10000) {
      console.warn('Chart data exceeds recommended size limit');
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get chart type suggestions based on data characteristics
 */
export function suggestChartType(data: unknown): ChartConfig['type'][] {
  const suggestions: ChartConfig['type'][] = [];

  if (Array.isArray(data)) {
    if (data.length <= 10) {
      suggestions.push('pie', 'bar');
    }

    if (data.every(item => typeof item === 'object' && 'x' in item && 'y' in item)) {
      suggestions.push('line', 'scatter');
    }

    if (data.every(item => typeof item === 'number')) {
      suggestions.push('line', 'bar');
    }
  }

  return suggestions.length > 0 ? suggestions : ['line'];
}
