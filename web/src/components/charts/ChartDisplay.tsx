import React, { useMemo, useState } from 'react';
import clsx from 'clsx';

import { ChartRenderer } from './ChartRenderer';
import { JsonDisplay } from '../shared/JsonDisplay';
import { detectChart, validateChartData } from '../../utils/chartDetection';
import type { ChartDisplayProps } from '../../types/chartTypes';

/**
 * High-level component that decides whether to render data as a chart or JSON
 */
export const ChartDisplay: React.FC<ChartDisplayProps> = ({
  data,
  compact = false,
  variant = 'default',
  className,
  fallbackToJson = true,
}) => {
  const [forceJsonView, setForceJsonView] = useState(false);

  // Detect if data can be rendered as a chart
  const detection = useMemo(() => detectChart(data), [data]);

  // Determine what to render
  const shouldRenderChart = useMemo(() => {
    console.log('🔍 ChartDisplay shouldRenderChart check:');
    console.log('  forceJsonView:', forceJsonView);
    console.log('  detection.isChartable:', detection.isChartable);
    console.log('  detection.data:', detection.data);

    if (forceJsonView) {
      console.log('  ❌ Forced JSON view');
      return false;
    }
    if (!detection.isChartable || !detection.data) {
      console.log('  ❌ Not chartable or no data');
      return false;
    }

    const validationResult = validateChartData(detection.data);
    console.log('  validateChartData result:', validationResult);
    console.log('  validation details:');
    console.log('    - config exists:', !!detection.data);
    console.log('    - type exists:', !!detection.data?.type);
    console.log('    - data exists:', !!detection.data?.data);
    console.log('    - data length:', Array.isArray(detection.data?.data) ? detection.data.data.length : 'not array');

    if (validationResult) {
      console.log('  ✅ Should render chart!');
    } else {
      console.log('  ❌ Validation failed');
    }

    return validationResult;
  }, [detection, forceJsonView]);

  const renderContent = () => {
    if (shouldRenderChart && detection.data) {
      return (
        <div className="space-y-3">
          {/* Chart controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Chart View
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {detection.chartType}
              </span>
              <span className="text-xs text-gray-500">
                Confidence: {Math.round(detection.confidence * 100)}%
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setForceJsonView(!forceJsonView)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Toggle JSON view"
              >
                View JSON
              </button>
            </div>
          </div>

          {/* Chart renderer */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <ChartRenderer
              data={detection.data}
              height={compact ? 300 : 400}
              className="bg-white dark:bg-gray-800"
            />
          </div>

          {/* Chart info */}
          {detection.reason && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {detection.reason}
            </div>
          )}
        </div>
      );
    }

    // Fallback to JSON display
    if (fallbackToJson) {
      return (
        <div className="space-y-2">
          {detection.isChartable && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  JSON View
                </span>
                {detection.chartType && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Chartable as {detection.chartType}
                  </span>
                )}
              </div>

              {detection.isChartable && (
                <button
                  onClick={() => setForceJsonView(false)}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  title="Switch to chart view"
                >
                  View Chart
                </button>
              )}
            </div>
          )}

          <JsonDisplay
            data={data}
            compact={compact}
            variant={variant}
          />
        </div>
      );
    }

    // No valid data to display
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        No displayable data
      </div>
    );
  };

  return (
    <div className={clsx('chart-display', className)}>
      {renderContent()}
    </div>
  );
};

/**
 * Simplified chart display component for cases where you know the data is chartable
 */
export const SimpleChartDisplay: React.FC<{
  data: unknown;
  title?: string;
  height?: number;
  className?: string;
}> = ({
  data,
  title,
  height = 400,
  className,
}) => {
  const detection = useMemo(() => detectChart(data), [data]);

  if (!detection.isChartable || !detection.data || !validateChartData(detection.data)) {
    return (
      <div className={clsx('text-sm text-gray-500 dark:text-gray-400', className)}>
        Unable to render chart
      </div>
    );
  }

  const chartData = title ? { ...detection.data, title } : detection.data;

  return (
    <div className={clsx('simple-chart-display', className)}>
      <ChartRenderer
        data={chartData}
        height={height}
        className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
      />
    </div>
  );
};

export default ChartDisplay;
