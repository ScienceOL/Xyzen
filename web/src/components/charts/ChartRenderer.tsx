import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import clsx from 'clsx';

import type { ChartConfig, ChartRendererProps } from '../../types/chartTypes';
import { createEChartsTheme, detectThemeFromDOM } from '../../utils/chartThemes';

/**
 * Core chart rendering component using ECharts
 */
export const ChartRenderer: React.FC<ChartRendererProps> = ({
  data,
  theme,
  height = 400,
  width = '100%',
  className,
  onChartReady,
}) => {
  const chartRef = useRef<ReactECharts>(null);
  const detectedTheme = theme || detectThemeFromDOM();

  // Convert ChartConfig to EChartsOption
  const echartsOption = useMemo((): EChartsOption => {
    try {
      // If data is already an EChartsOption (must have series), merge with theme
      if ('series' in data && !('type' in data) && !('data' in data)) {
        const themeConfig = createEChartsTheme(detectedTheme);
        const merged = {
          ...themeConfig,
          ...(data as EChartsOption),
        };
        return merged;
      }

      // Convert ChartConfig to EChartsOption
      const config = data as ChartConfig;

    const themeConfig = createEChartsTheme(detectedTheme);

    let option: EChartsOption = {
      ...themeConfig,
      title: config.title ? {
        text: config.title,
        left: 'center',
      } : undefined,
    };

    // Check if agent has generated ECharts-ready series data
    const hasEChartsReadyData = Array.isArray(config.data) &&
      config.data.length > 0 &&
      typeof config.data[0] === 'object' &&
      'name' in config.data[0] &&
      'data' in config.data[0] &&
      Array.isArray(config.data[0].data) &&
      config.data[0].data.length > 0 &&
      typeof config.data[0].data[0] === 'object' &&
      'x' in config.data[0].data[0] &&
      'y' in config.data[0].data[0];

    if (hasEChartsReadyData) {
      // Agent generated ECharts-ready data, use it directly
      const seriesData = config.data as Array<{
        name: string;
        data: Array<{ x: string | number; y: number }>;
        stack?: string;
        lineStyle?: Record<string, unknown>;
        itemStyle?: Record<string, unknown>;
        areaStyle?: Record<string, unknown>;
        emphasis?: Record<string, unknown>;
      }>;

      // Convert agent's series data to ECharts format
      const series = seriesData.map(series => {
        const isStackedArea = config.type === 'line' && series.stack;
        const seriesType = config.type === 'area' || isStackedArea ? 'line' as const : config.type;

        const baseSeries = {
          name: series.name,
          data: config.xAxis?.type === 'category' ?
            series.data.map(point => point.y) :
            series.data.map(point => [point.x, point.y]),
        };

        if (seriesType === 'line') {
          return {
            ...baseSeries,
            type: 'line' as const,
            stack: series.stack,
            areaStyle: series.areaStyle || (config.type === 'area' || isStackedArea ? {} : undefined),
            lineStyle: series.lineStyle,
            itemStyle: series.itemStyle,
            emphasis: series.emphasis,
          };
        } else if (seriesType === 'bar') {
          return {
            ...baseSeries,
            type: 'bar' as const,
            stack: series.stack,
            itemStyle: series.itemStyle,
            emphasis: series.emphasis,
          };
        } else if (seriesType === 'scatter') {
          return {
            ...baseSeries,
            type: 'scatter' as const,
            itemStyle: series.itemStyle,
            emphasis: series.emphasis,
          };
        } else {
          return {
            ...baseSeries,
            type: 'line' as const,
            lineStyle: series.lineStyle,
            itemStyle: series.itemStyle,
            emphasis: series.emphasis,
          };
        }
      });

      // Set up axes
      const categories = config.xAxis?.type === 'category' ?
        (seriesData[0]?.data.map(point => point.x) || []) : undefined;

      option.xAxis = {
        type: config.xAxis?.type || 'category',
        name: config.xAxis?.name,
        data: categories,
      };

      option.yAxis = {
        type: config.yAxis?.type || 'value',
        name: config.yAxis?.name,
      };

      option.series = series;
      option.legend = {
        show: true,
        top: 'bottom',
      };
      option.tooltip = {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
      };

    } else {
      // Use existing chart generation logic for simple data
      switch (config.type) {
        case 'line':
        case 'bar':
        case 'area':
          option = {
            ...option,
            ...generateCartesianChart(config, detectedTheme),
          };
          break;

        case 'pie':
          option = {
            ...option,
            ...generatePieChart(config, detectedTheme),
          };
          break;

        case 'scatter':
          option = {
            ...option,
            ...generateScatterChart(config, detectedTheme),
          };
          break;

        case 'heatmap':
          option = {
            ...option,
            ...generateHeatmapChart(config, detectedTheme),
          };
          break;

        default:
          option = {
            ...option,
            ...generateCartesianChart({ ...config, type: 'line' }, detectedTheme),
          };
      }
    }

    // Merge custom options if provided (agent can override any styling)
    if (config.options) {
      option = mergeOptions(option, config.options);

      // Special handling for series-level styling from agent
      if (config.options.series && option.series && Array.isArray(option.series)) {
        const seriesOverrides = config.options.series as Record<string, unknown>;

        option.series = option.series.map((series) => {
          const updatedSeries = { ...series } as Record<string, unknown>;

          // Only apply relevant series properties based on chart type
          if (config.type === 'scatter') {
            // For scatter plots, only apply itemStyle and emphasis
            if (seriesOverrides.itemStyle && typeof seriesOverrides.itemStyle === 'object') {
              updatedSeries.itemStyle = { ...(updatedSeries.itemStyle as Record<string, unknown> || {}), ...seriesOverrides.itemStyle };
            }
            if (seriesOverrides.emphasis && typeof seriesOverrides.emphasis === 'object') {
              updatedSeries.emphasis = { ...(updatedSeries.emphasis as Record<string, unknown> || {}), ...seriesOverrides.emphasis };
            }
          } else if (config.type === 'line' || config.type === 'area') {
            // For line charts, apply lineStyle, itemStyle, areaStyle, emphasis
            if (seriesOverrides.lineStyle && typeof seriesOverrides.lineStyle === 'object') {
              updatedSeries.lineStyle = { ...(updatedSeries.lineStyle as Record<string, unknown> || {}), ...seriesOverrides.lineStyle };
            }
            if (seriesOverrides.itemStyle && typeof seriesOverrides.itemStyle === 'object') {
              updatedSeries.itemStyle = { ...(updatedSeries.itemStyle as Record<string, unknown> || {}), ...seriesOverrides.itemStyle };
            }
            if (seriesOverrides.areaStyle && typeof seriesOverrides.areaStyle === 'object') {
              updatedSeries.areaStyle = { ...(updatedSeries.areaStyle as Record<string, unknown> || {}), ...seriesOverrides.areaStyle };
            }
            if (seriesOverrides.emphasis && typeof seriesOverrides.emphasis === 'object') {
              updatedSeries.emphasis = { ...(updatedSeries.emphasis as Record<string, unknown> || {}), ...seriesOverrides.emphasis };
            }
          } else if (config.type === 'bar') {
            // For bar charts, apply itemStyle and emphasis
            if (seriesOverrides.itemStyle && typeof seriesOverrides.itemStyle === 'object') {
              updatedSeries.itemStyle = { ...(updatedSeries.itemStyle as Record<string, unknown> || {}), ...seriesOverrides.itemStyle };
            }
            if (seriesOverrides.emphasis && typeof seriesOverrides.emphasis === 'object') {
              updatedSeries.emphasis = { ...(updatedSeries.emphasis as Record<string, unknown> || {}), ...seriesOverrides.emphasis };
            }
          }

          return updatedSeries;
        });
      }
    }

    return option;
    } catch (error) {
      // Return a basic error option
      return {
        title: { text: 'Chart Error', left: 'center' },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: `Chart conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            fontSize: 14,
            fill: '#ff0000'
          }
        }
      };
    }
  }, [data, detectedTheme]);

  // Handle chart ready event
  useEffect(() => {
    if (onChartReady && chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance();
      onChartReady(chartInstance);
    }
  }, [onChartReady]);

  // Verify the option is a valid object for ECharts
  const isValidOption = echartsOption &&
    typeof echartsOption === 'object' &&
    !Array.isArray(echartsOption) &&
    Object.keys(echartsOption).length > 0;

  // Additional safety checks for ECharts
  const hasRequiredProperties = isValidOption && (
    'series' in echartsOption ||
    'xAxis' in echartsOption ||
    'yAxis' in echartsOption ||
    'title' in echartsOption
  );

  // Render error state if option is invalid
  if (!isValidOption || !hasRequiredProperties) {
    return (
      <div className={clsx('chart-renderer', className)} style={{ height, width }}>
        <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/30
                        border border-red-200 dark:border-red-800 rounded-lg backdrop-blur-sm">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          {/* Error Message */}
          <div className="text-center max-w-sm">
            <h3 className="text-red-800 dark:text-red-300 font-semibold text-lg mb-2">
              Chart Rendering Error
            </h3>
            <p className="text-red-600 dark:text-red-400 text-sm leading-relaxed">
              Unable to render chart data. The data format may be invalid or unsupported.
            </p>
          </div>

          {/* Debug Info (only in development) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4 max-w-md">
              <summary className="text-xs text-red-500 cursor-pointer hover:text-red-700">
                Debug Information
              </summary>
              <pre className="mt-2 text-xs text-red-600 bg-red-100 dark:bg-red-900/20 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify({ isValidOption, hasRequiredProperties, data }, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('chart-renderer', className)}>
      <ReactECharts
        ref={chartRef}
        option={echartsOption}
        style={{ height, width }}
        opts={{
          renderer: 'canvas',
          locale: 'en',
        }}
      />
    </div>
  );
};

/**
 * Generate options for cartesian coordinate charts (line, bar, area)
 */
function generateCartesianChart(config: ChartConfig, _theme: 'light' | 'dark'): Partial<EChartsOption> {
  const isSeriesData = Array.isArray(config.data) && config.data.length > 0 &&
    typeof config.data[0] === 'object' && 'name' in config.data[0] && 'data' in config.data[0];

  if (isSeriesData) {
    // Multiple series
    const seriesData = config.data as Array<{ name: string; data: number[]; type?: string }>;

    return {
      xAxis: {
        type: 'category',
        data: config.labels || seriesData[0].data.map((_, index) => index.toString()),
        name: config.xAxis?.name,
      },
      yAxis: {
        type: 'value',
        name: config.yAxis?.name,
      },
      series: seriesData.map(series => {
        const seriesType = series.type || (config.type === 'area' ? 'line' : config.type);
        const baseConfig = {
          name: series.name,
          data: series.data,
          areaStyle: config.type === 'area' ? {} : undefined,
        };

        // Type-specific series configuration
        if (seriesType === 'line') {
          return { ...baseConfig, type: 'line' as const };
        } else if (seriesType === 'bar') {
          return { ...baseConfig, type: 'bar' as const };
        } else if (seriesType === 'scatter') {
          return { ...baseConfig, type: 'scatter' as const };
        } else if (seriesType === 'pie') {
          // Pie charts need different data structure
          return {
            ...baseConfig,
            type: 'pie' as const,
            data: series.data.map((value, index) => ({
              name: `Item ${index + 1}`,
              value: value
            }))
          };
        } else {
          return { ...baseConfig, type: 'line' as const };
        }
      }),
      legend: {
        show: true,
        top: 'bottom',
      },
      tooltip: {
        trigger: 'axis',
      },
    };
  } else {
    // Single series
    const dataPoints = config.data as Array<{ x: string | number; y: number }>;
    const xData = dataPoints.map(point => point.x);
    const yData = dataPoints.map(point => point.y);

    return {
      xAxis: {
        type: config.xAxis?.type || 'category',
        data: config.xAxis?.type === 'category' ? xData : undefined,
        name: config.xAxis?.name,
      },
      yAxis: {
        type: config.yAxis?.type || 'value',
        name: config.yAxis?.name,
      },
      series: (() => {
        const chartType = config.type === 'area' ? 'line' : config.type;
        const seriesData = config.xAxis?.type === 'value' ? dataPoints.map(p => [p.x, p.y]) : yData;
        const baseConfig = {
          data: seriesData,
          areaStyle: config.type === 'area' ? {} : undefined,
        };

        if (chartType === 'line') {
          return [{ ...baseConfig, type: 'line' as const }];
        } else if (chartType === 'bar') {
          return [{ ...baseConfig, type: 'bar' as const }];
        } else if (chartType === 'scatter') {
          return [{ ...baseConfig, type: 'scatter' as const }];
        } else if (chartType === 'pie') {
          return [{
            type: 'pie' as const,
            data: dataPoints.map(point => ({
              name: String(point.x),
              value: point.y
            })),
            areaStyle: undefined
          }];
        } else {
          return [{ ...baseConfig, type: 'line' as const }];
        }
      })(),
      tooltip: {
        trigger: 'axis',
      },
    };
  }
}

/**
 * Generate options for pie charts
 */
function generatePieChart(config: ChartConfig, _theme: 'light' | 'dark'): Partial<EChartsOption> {
  const dataPoints = config.data as Array<{ x: string; y: number }>;

  return {
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '60%'],
      data: dataPoints.map(point => ({
        name: String(point.x),
        value: point.y,
      })),
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
        },
      },
    }],
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'vertical',
      left: 'left',
    },
  };
}

/**
 * Generate options for scatter charts
 */
function generateScatterChart(config: ChartConfig, _theme: 'light' | 'dark'): Partial<EChartsOption> {
  const dataPoints = config.data as Array<{ x: number; y: number }>;
  const convertedData = dataPoints.map(point => [point.x, point.y]);

  return {
    xAxis: {
      type: 'value',
      name: config.xAxis?.name,
    },
    yAxis: {
      type: 'value',
      name: config.yAxis?.name,
    },
    series: [{
      type: 'scatter',
      data: convertedData,
      symbolSize: 6,
    }],
    tooltip: {
      trigger: 'item',
      formatter: '{b0}: {c0}' + (config.yAxis?.name ? `<br/>${config.yAxis.name}: {c1}` : ''),
    },
  };
}

/**
 * Generate options for heatmap charts
 */
function generateHeatmapChart(config: ChartConfig, _theme: 'light' | 'dark'): Partial<EChartsOption> {
  // Handle different heatmap data formats
  let heatmapData: Array<[number, number, number]> = [];
  let xAxisData: string[] = [];
  let yAxisData: string[] = [];

  if (Array.isArray(config.data)) {
    // Check if data is in matrix format or coordinate format
    const firstItem = config.data[0];

    if (typeof firstItem === 'object' && firstItem !== null && 'x' in firstItem && 'y' in firstItem && 'value' in firstItem) {
      // Data format: [{x: "Mon", y: "12a", value: 10}, ...]
      const dataPoints = (config.data as unknown[]).filter((item): item is {x: string; y: string; value: number} => {
        if (typeof item !== 'object' || item === null || !('x' in item) || !('y' in item) || !('value' in item)) {
          return false;
        }
        const candidate = item as Record<string, unknown>;
        return typeof candidate.x === 'string' && typeof candidate.y === 'string' && typeof candidate.value === 'number';
      });

      // Extract unique x and y values
      const xValues = [...new Set(dataPoints.map(d => d.x))];
      const yValues = [...new Set(dataPoints.map(d => d.y))];

      xAxisData = xValues;
      yAxisData = yValues;

      // Convert to ECharts heatmap format [xIndex, yIndex, value]
      heatmapData = dataPoints.map(d => [
        xValues.indexOf(d.x),
        yValues.indexOf(d.y),
        d.value
      ]);

    } else if (Array.isArray(firstItem)) {
      // Data format: [[row0], [row1], [row2], ...] - matrix format
      const matrix = (config.data as unknown[]).filter((item): item is number[] =>
        Array.isArray(item) && item.every(val => typeof val === 'number')
      );

      // Generate default axis labels
      xAxisData = Array.from({length: matrix[0]?.length || 0}, (_, i) => `Col ${i + 1}`);
      yAxisData = Array.from({length: matrix.length}, (_, i) => `Row ${i + 1}`);

      // Convert matrix to ECharts heatmap format
      heatmapData = [];
      matrix.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
          heatmapData.push([colIndex, rowIndex, value]);
        });
      });

    } else {
      // Fallback: assume simple x,y,value format
      const dataPoints = (config.data as unknown[]).filter((item): item is {x: string | number; y: string | number; value?: number} =>
        typeof item === 'object' && item !== null && 'x' in item && 'y' in item
      );

      // Generate basic axis data
      const xValues = [...new Set(dataPoints.map(d => String(d.x)))];
      const yValues = [...new Set(dataPoints.map(d => String(d.y)))];

      xAxisData = xValues;
      yAxisData = yValues;

      heatmapData = dataPoints.map(d => [
        xValues.indexOf(String(d.x)),
        yValues.indexOf(String(d.y)),
        d.value || (typeof d.y === 'number' ? d.y : 0) || 0
      ]);
    }
  }

  // Calculate min/max for visual map
  const values = heatmapData.map(d => d[2]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  return {
    xAxis: {
      type: 'category',
      data: xAxisData,
      name: config.xAxis?.name,
    },
    yAxis: {
      type: 'category',
      data: yAxisData,
      name: config.yAxis?.name,
    },
    grid: {
      left: '10%',
      right: '5%',
      top: '10%',
      bottom: '20%', // Space for visual map
      containLabel: true,
    },
    visualMap: {
      min: minValue,
      max: maxValue,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true,
      },
    }],
    tooltip: {
      trigger: 'item',
      formatter: function(params: unknown) {
        const typedParams = params as { seriesType?: string; data?: [number, number, number]; name?: string; value?: number };
        if (typedParams.seriesType === 'heatmap' && typedParams.data) {
          const xLabel = xAxisData[typedParams.data[0]] || typedParams.data[0];
          const yLabel = yAxisData[typedParams.data[1]] || typedParams.data[1];
          const value = typedParams.data[2];
          return `${xLabel} / ${yLabel}<br/>Value: ${value}`;
        }
        return `${typedParams.name || 'Unknown'}: ${typedParams.value || 0}`;
      },
    },
  };
}

/**
 * Deep merge ECharts options
 */
function mergeOptions(base: EChartsOption, override: Partial<EChartsOption>): EChartsOption {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      const optionKey = key as keyof EChartsOption;
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        const existingValue = merged[optionKey];
        if (typeof existingValue === 'object' && !Array.isArray(existingValue) && existingValue !== null) {
          merged[optionKey] = {
            ...existingValue,
            ...value,
          } as EChartsOption[typeof optionKey];
        } else {
          merged[optionKey] = value as EChartsOption[typeof optionKey];
        }
      } else {
        merged[optionKey] = value as EChartsOption[typeof optionKey];
      }
    }
  }

  return merged;
}
