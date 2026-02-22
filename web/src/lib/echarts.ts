/**
 * Shared ECharts registration module (tree-shakeable).
 *
 * Registers only the chart types / components used by
 * ConsumptionAnalytics. Other files that need the full echarts
 * bundle (e.g. Markdown preview) import "echarts-for-react" directly.
 *
 * If a new consumer needs additional chart types, register them here.
 */

import * as echarts from "echarts/core";

import { HeatmapChart, PieChart } from "echarts/charts";
import {
  CalendarComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  PieChart,
  HeatmapChart,
  CalendarComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
  SVGRenderer,
  CanvasRenderer,
]);

export { echarts };
