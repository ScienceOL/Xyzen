import { DEFAULT_TIMEZONE } from "@/configs/common";
import {
  redemptionService,
  type ConsumptionHeatmapEntry,
} from "@/service/redemptionService";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AdminFilterBar } from "./shared/AdminFilterBar";
import { AdminHeatmap } from "./shared/AdminHeatmap";
import { AdminStatCards } from "./shared/AdminStatCards";
import {
  formatCompact,
  MODEL_OPTIONS,
  PROVIDER_OPTIONS,
  TIER_BADGE_COLORS,
  TIER_DISPLAY_NAMES,
} from "./shared/constants";

type HeatmapMetric = "cost_usd" | "total_tokens" | "credits";

const METRIC_LABELS: Record<HeatmapMetric, string> = {
  cost_usd: "Cost (USD)",
  total_tokens: "Total Tokens",
  credits: "Credits",
};

interface ConsumptionAnalyticsTabProps {
  adminSecret: string;
}

export function ConsumptionAnalyticsTab({
  adminSecret,
}: ConsumptionAnalyticsTabProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedTier, setSelectedTier] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("credits");
  const [heatmapData, setHeatmapData] = useState<ConsumptionHeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHeatmap = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await redemptionService.getConsumptionHeatmap(
          adminSecret,
          year,
          DEFAULT_TIMEZONE,
          selectedTier || undefined,
          selectedModel || undefined,
          selectedProvider || undefined,
        );
        if (!signal?.aborted) setHeatmapData(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [adminSecret, year, selectedTier, selectedModel, selectedProvider],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHeatmap(controller.signal);
    return () => controller.abort();
  }, [fetchHeatmap]);

  const chartData = useMemo<[string, number][]>(
    () =>
      heatmapData.map((d) => [
        d.date,
        heatmapMetric === "cost_usd"
          ? Math.round(d.cost_usd * 100)
          : d[heatmapMetric],
      ]),
    [heatmapData, heatmapMetric],
  );

  const summaryStats = useMemo(() => {
    const source = selectedDate
      ? heatmapData.filter((d) => d.date === selectedDate)
      : heatmapData;
    return source.reduce(
      (acc, d) => ({
        total_tokens: acc.total_tokens + d.total_tokens,
        input_tokens: acc.input_tokens + d.input_tokens,
        output_tokens: acc.output_tokens + d.output_tokens,
        credits: acc.credits + d.credits,
        cost_usd: acc.cost_usd + d.cost_usd,
        record_count: acc.record_count + d.record_count,
        llm_count: acc.llm_count + (d.llm_count ?? 0),
        tool_call_count: acc.tool_call_count + (d.tool_call_count ?? 0),
        cache_creation_input_tokens:
          acc.cache_creation_input_tokens +
          (d.cache_creation_input_tokens ?? 0),
        cache_read_input_tokens:
          acc.cache_read_input_tokens + (d.cache_read_input_tokens ?? 0),
      }),
      {
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        credits: 0,
        cost_usd: 0,
        record_count: 0,
        llm_count: 0,
        tool_call_count: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    );
  }, [heatmapData, selectedDate]);

  const handleProviderChange = useCallback((provider: string) => {
    setSelectedProvider(provider);
    setSelectedModel("");
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-red-950/30 p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  const cacheTotal =
    summaryStats.cache_creation_input_tokens +
    summaryStats.cache_read_input_tokens;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminFilterBar
          year={year}
          onYearChange={(y) => {
            setYear(y);
            setSelectedDate(null);
          }}
          selectedTier={selectedTier}
          onTierChange={setSelectedTier}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedProvider={selectedProvider}
          onProviderChange={handleProviderChange}
          providerOptions={PROVIDER_OPTIONS}
          modelOptions={MODEL_OPTIONS}
          showTierFilter
          showModelFilter
          showProviderFilter
        />
        <select
          value={heatmapMetric}
          onChange={(e) => setHeatmapMetric(e.target.value as HeatmapMetric)}
          className="rounded-md bg-neutral-800 border border-neutral-600 text-neutral-200 text-sm px-2 py-1.5"
        >
          {(Object.keys(METRIC_LABELS) as HeatmapMetric[]).map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {/* Stat Cards */}
      <AdminStatCards
        isLoading={loading}
        columns={7}
        cards={[
          {
            label: "Cost (USD)",
            value: `$${summaryStats.cost_usd.toFixed(2)}`,
          },
          {
            label: "Total Tokens",
            value: formatCompact(summaryStats.total_tokens),
          },
          {
            label: "Input Tokens/Cache",
            value: `${formatCompact(summaryStats.input_tokens)} / ${formatCompact(cacheTotal)}`,
          },
          {
            label: "Output Tokens",
            value: formatCompact(summaryStats.output_tokens),
          },
          { label: "Credits", value: formatCompact(summaryStats.credits) },
          { label: "LLM Calls", value: summaryStats.llm_count },
          { label: "Tool Calls", value: summaryStats.tool_call_count },
        ]}
      />

      {/* Heatmap */}
      <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-300">
            Daily {METRIC_LABELS[heatmapMetric]}
          </h3>
          {selectedDate && (
            <span className="text-xs text-indigo-400 flex items-center gap-1.5">
              Showing: {selectedDate}
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="hover:text-indigo-300 text-indigo-500"
                aria-label="Clear date selection"
              >
                ✕
              </button>
            </span>
          )}
        </div>
        <AdminHeatmap
          data={chartData}
          year={year}
          selectedDate={selectedDate}
          onDateClick={setSelectedDate}
          tooltipLabel={METRIC_LABELS[heatmapMetric]}
          colorScheme="green"
          isLoading={loading}
        />
      </div>

      {/* Daily summary table */}
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-700">
          <h3 className="text-sm font-semibold text-white">Daily Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-700 text-sm">
            <thead className="bg-neutral-800 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-neutral-400">
                  Date
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Tokens
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Input
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Output
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Credits
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Cost
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  LLM
                </th>
                <th className="px-4 py-2 text-right text-xs text-neutral-400">
                  Tool
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {[...heatmapData].reverse().map((d) => (
                <Fragment key={d.date}>
                  <tr
                    data-date={d.date}
                    className={`hover:bg-neutral-800/50 cursor-pointer ${
                      selectedDate === d.date ? "bg-indigo-900/20" : ""
                    }`}
                    onClick={() =>
                      setSelectedDate(selectedDate === d.date ? null : d.date)
                    }
                  >
                    <td className="px-4 py-2 text-neutral-300">
                      <span className="mr-1.5 text-neutral-500">
                        {selectedDate === d.date ? "▼" : "▶"}
                      </span>
                      {d.date}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-300">
                      {formatCompact(d.total_tokens)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatCompact(d.input_tokens)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-500">
                      {formatCompact(d.output_tokens)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-indigo-400">
                      {formatCompact(d.credits)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-neutral-300">
                      ${d.cost_usd.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {d.llm_count ?? 0}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {d.tool_call_count ?? 0}
                    </td>
                  </tr>
                  {selectedDate === d.date &&
                    d.by_tier &&
                    Object.entries(d.by_tier).map(([tier, data]) => (
                      <tr
                        key={`${d.date}-${tier}`}
                        className="bg-neutral-800/30"
                      >
                        <td className="px-4 py-1.5 pl-10 text-xs">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_BADGE_COLORS[tier] ?? TIER_BADGE_COLORS.unknown}`}
                          >
                            {TIER_DISPLAY_NAMES[tier] ?? tier}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-neutral-400">
                          {formatCompact(data.total_tokens ?? 0)}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-neutral-500">
                          {formatCompact(data.input_tokens ?? 0)}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-neutral-500">
                          {formatCompact(data.output_tokens ?? 0)}
                        </td>
                        <td className="px-4 py-1.5 text-right font-semibold text-xs text-indigo-400">
                          {formatCompact(data.credits ?? 0)}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-neutral-400">
                          ${(data.cost_usd ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-xs text-neutral-400">
                          {data.llm_count ?? 0}
                        </td>
                        <td className="px-4 py-1.5 text-right text-xs text-neutral-400">
                          {data.tool_call_count ?? 0}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
