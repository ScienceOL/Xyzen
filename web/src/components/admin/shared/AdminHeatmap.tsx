import { echarts } from "@/lib/echarts";
import ReactECharts from "echarts-for-react/lib/core";
import { useMemo, useRef } from "react";

const CANVAS_OPTS = { renderer: "canvas" } as const;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ColorScheme = "green" | "orange" | "blue" | "purple";

const COLOR_SCHEMES: Record<
  ColorScheme,
  { levels: string[]; empty: string; border: string }
> = {
  green: {
    levels: ["#0b2a1f", "#0f3d2a", "#14532d", "#16a34a", "#4ade80"],
    empty: "#161b22",
    border: "#1b1f23",
  },
  orange: {
    levels: ["#2a1a0b", "#53391a", "#a36416", "#de9a4a", "#fbbf24"],
    empty: "#161b22",
    border: "#1b1f23",
  },
  blue: {
    levels: ["#0b1a2a", "#0f2a3d", "#142d53", "#1664a3", "#4a9ade"],
    empty: "#161b22",
    border: "#1b1f23",
  },
  purple: {
    levels: ["#1a0b2a", "#2a0f3d", "#2d1453", "#6416a3", "#9a4ade"],
    empty: "#161b22",
    border: "#1b1f23",
  },
};

interface AdminHeatmapProps {
  data: [string, number][];
  year: number;
  selectedDate: string | null;
  onDateClick: (date: string | null) => void;
  tooltipLabel?: string;
  colorScheme?: ColorScheme;
  isLoading?: boolean;
  levelCount?: 4 | 5;
}

export function AdminHeatmap({
  data,
  year,
  selectedDate,
  onDateClick,
  tooltipLabel = "Value",
  colorScheme = "green",
  isLoading = false,
  levelCount = 4,
}: AdminHeatmapProps) {
  const chartRef = useRef<ReactECharts>(null);
  const scheme = COLOR_SCHEMES[colorScheme];

  const option = useMemo(() => {
    const maxVal = Math.max(...data.map(([, v]) => v), 1);
    const allLevels = scheme.levels;
    // Pick evenly-spaced colors from the scheme's 5-level palette
    const usedLevels =
      levelCount >= allLevels.length
        ? allLevels
        : levelCount === 4
          ? [allLevels[0], allLevels[1], allLevels[3], allLevels[4]]
          : allLevels.slice(0, levelCount);
    const seg = maxVal / usedLevels.length;

    const selectedHighlight = {
      borderColor: "#38bdf8",
      borderWidth: 2,
      borderRadius: 2,
      shadowBlur: 12,
      shadowColor: "rgba(56,189,248,0.6)",
    };

    const heatData = data.map(([date, value]) =>
      date === selectedDate
        ? { value: [date, value], itemStyle: selectedHighlight }
        : [date, value],
    );

    const pieces = [
      { min: 0, max: 0, color: scheme.empty },
      ...usedLevels.map((color, i) => ({
        min: i === 0 ? 1 : Math.round(i * seg) + 1,
        max: i === usedLevels.length - 1 ? maxVal : Math.round((i + 1) * seg),
        color,
      })),
    ];

    return {
      backgroundColor: "transparent",
      tooltip: {
        formatter: (params: { value: [string, number] }) => {
          const [date, val] = params.value;
          return `<strong>${escapeHtml(String(date))}</strong><br/>${escapeHtml(tooltipLabel)}: ${val.toLocaleString()}`;
        },
      },
      visualMap: {
        type: "piecewise",
        show: true,
        orient: "vertical",
        right: 0,
        top: "middle",
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 3,
        padding: 0,
        showLabel: false,
        text: ["High", "Low"],
        textGap: 5,
        textStyle: { color: "#8b949e", fontSize: 12 },
        pieces,
        itemSymbol: "roundRect",
      },
      calendar: {
        range: String(year),
        cellSize: ["auto", 13],
        top: 24,
        left: 40,
        right: 50,
        bottom: 0,
        dayLabel: {
          nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
          color: "#8b949e",
          fontSize: 12,
        },
        monthLabel: { color: "#8b949e", fontSize: 12 },
        yearLabel: { show: false },
        itemStyle: {
          borderColor: scheme.border,
          borderWidth: 3,
          borderRadius: 2,
          color: scheme.empty,
        },
        splitLine: { show: false },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: heatData,
          selectedMode: false,
          itemStyle: { borderRadius: 2 },
          emphasis: {
            itemStyle: {
              borderColor: "#38bdf8",
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: "rgba(56,189,248,0.5)",
            },
          },
        },
      ],
    };
  }, [data, year, selectedDate, tooltipLabel, scheme, levelCount]);

  const events = useMemo(
    () => ({
      click: (params: { componentType: string; value: [string, number] }) => {
        if (params.componentType === "series") {
          const clickedDate = params.value[0];
          onDateClick(selectedDate === clickedDate ? null : clickedDate);
        }
      },
    }),
    [selectedDate, onDateClick],
  );

  if (isLoading) {
    return (
      <div className="h-[140px] animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
    );
  }

  return (
    <ReactECharts
      ref={chartRef}
      echarts={echarts}
      option={option}
      lazyUpdate
      style={{ height: "140px" }}
      opts={CANVAS_OPTS}
      onEvents={events}
    />
  );
}
