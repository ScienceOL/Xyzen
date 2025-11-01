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
    // If data is already an EChartsOption, merge with theme
    if ('series' in data || 'xAxis' in data || 'yAxis' in data) {
      const themeConfig = createEChartsTheme(detectedTheme);
      return {
        ...themeConfig,
        ...(data as EChartsOption),
      };
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

    // Handle different chart types
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
        console.warn(`Unsupported chart type: ${config.type}`);
        option = {
          ...option,
          ...generateCartesianChart({ ...config, type: 'line' }, detectedTheme),
        };
    }

    // Merge custom options if provided
    if (config.options) {
      option = mergeOptions(option, config.options);
    }

    return option;
  }, [data, detectedTheme]);

  // Handle chart ready event
  useEffect(() => {
    if (onChartReady && chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance();
      onChartReady(chartInstance);
    }
  }, [onChartReady]);

  return (
    <div className={clsx('chart-renderer', className)}>
      <ReactECharts
        ref={chartRef}
        option={echartsOption}
        style={{ height, width }}
        opts={{
          renderer: 'canvas',
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
      data: dataPoints.map(point => [point.x, point.y]),
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
  // This would need more sophisticated data structure for heatmaps
  console.warn('Heatmap chart type is not fully implemented yet');

  return generateCartesianChart({ ...config, type: 'bar' }, _theme);
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
