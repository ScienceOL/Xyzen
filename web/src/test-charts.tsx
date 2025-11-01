import React from 'react';
import { JsonDisplay } from './components/shared/JsonDisplay';
import { SimpleChartDisplay } from './components/charts/ChartDisplay';

// Test data samples
const testData = {
  // Simple line chart data
  lineData: [
    { x: "Jan", y: 100 },
    { x: "Feb", y: 150 },
    { x: "Mar", y: 120 },
    { x: "Apr", y: 180 },
    { x: "May", y: 200 }
  ],

  // Time series data
  timeSeriesData: [
    { timestamp: "2024-01-01", value: 100 },
    { timestamp: "2024-01-02", value: 150 },
    { timestamp: "2024-01-03", value: 120 },
    { timestamp: "2024-01-04", value: 180 },
    { timestamp: "2024-01-05", value: 200 }
  ],

  // Multi-series data
  multiSeriesData: [
    { name: "Series A", data: [100, 150, 120, 180, 200] },
    { name: "Series B", data: [80, 120, 140, 160, 180] }
  ],

  // Pie chart data
  pieData: [
    { x: "Chrome", y: 45 },
    { x: "Firefox", y: 25 },
    { x: "Safari", y: 20 },
    { x: "Edge", y: 10 }
  ],

  // Direct ECharts config
  echartsConfig: {
    xAxis: {
      type: 'category',
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      data: [120, 200, 150, 80, 70, 110, 130],
      type: 'bar'
    }]
  },

  // Structured chart config
  structuredChart: {
    chart: {
      type: 'line' as const,
      title: 'Monthly Sales',
      data: [
        { x: "Q1", y: 1200 },
        { x: "Q2", y: 1800 },
        { x: "Q3", y: 1600 },
        { x: "Q4", y: 2000 }
      ],
      xAxis: { name: 'Quarter' },
      yAxis: { name: 'Sales ($)' }
    }
  },

  // Non-chart data (should fall back to JSON)
  nonChartData: {
    message: "Hello World",
    status: "success",
    metadata: {
      version: "1.0.0",
      author: "AI Assistant"
    }
  }
};

/**
 * Test component to verify chart rendering works
 */
export const ChartTestComponent: React.FC = () => {
  return (
    <div className="p-8 space-y-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        ECharts Integration Test
      </h1>

      {/* Test JsonDisplay with chart detection enabled */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
          JsonDisplay with Chart Detection
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Line Chart Data</h3>
            <JsonDisplay data={testData.lineData} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Time Series Data</h3>
            <JsonDisplay data={testData.timeSeriesData} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Multi-Series Data</h3>
            <JsonDisplay data={testData.multiSeriesData} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Pie Chart Data</h3>
            <JsonDisplay data={testData.pieData} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Direct ECharts Config</h3>
            <JsonDisplay data={testData.echartsConfig} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Structured Chart Config</h3>
            <JsonDisplay data={testData.structuredChart} enableCharts={true} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Non-Chart Data (JSON Fallback)</h3>
            <JsonDisplay data={testData.nonChartData} enableCharts={true} />
          </div>
        </div>
      </section>

      {/* Test SimpleChartDisplay component */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
          SimpleChartDisplay Component
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Sales Dashboard</h3>
            <SimpleChartDisplay
              data={testData.lineData}
              title="Monthly Sales Performance"
              height={300}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Browser Usage</h3>
            <SimpleChartDisplay
              data={testData.pieData}
              title="Browser Market Share"
              height={300}
            />
          </div>
        </div>
      </section>

      {/* Test regular JsonDisplay (without charts) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
          Regular JsonDisplay (Charts Disabled)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Chart Data as JSON</h3>
            <JsonDisplay data={testData.lineData} enableCharts={false} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Regular JSON Data</h3>
            <JsonDisplay data={testData.nonChartData} enableCharts={false} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default ChartTestComponent;
