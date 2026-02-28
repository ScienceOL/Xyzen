import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type { ProviderOption } from "@/service/redemptionService";
import { TIER_DISPLAY_NAMES } from "./constants";

const MIN_YEAR = 2026;
const MAX_YEAR = 2030;

const TIER_OPTIONS = [
  { value: "", label: "All Tiers" },
  { value: "ultra", label: "Ultra" },
  { value: "pro", label: "Pro" },
  { value: "standard", label: "Standard" },
  { value: "lite", label: "Lite" },
];

interface AdminFilterBarProps {
  year: number;
  onYearChange: (year: number) => void;
  selectedTier?: string;
  onTierChange?: (tier: string) => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  showTierFilter?: boolean;
  showModelFilter?: boolean;
  selectedProvider?: string;
  onProviderChange?: (provider: string) => void;
  providerOptions?: ProviderOption[];
  modelOptions?: string[];
  showProviderFilter?: boolean;
  selectedTool?: string;
  onToolChange?: (tool: string) => void;
  toolOptions?: string[];
  showToolFilter?: boolean;
  tierOptions?: string[];
}

export function AdminFilterBar({
  year,
  onYearChange,
  selectedTier = "",
  onTierChange,
  selectedModel = "",
  onModelChange,
  showTierFilter = false,
  showModelFilter = false,
  selectedProvider = "",
  onProviderChange,
  providerOptions = [],
  modelOptions = [],
  showProviderFilter = false,
  selectedTool = "",
  onToolChange,
  toolOptions = [],
  showToolFilter = false,
  tierOptions,
}: AdminFilterBarProps) {
  const mergedProviderOptions = useMemo(() => {
    const byLabel = new Map<string, string[]>();
    for (const p of providerOptions) {
      const existing = byLabel.get(p.label);
      if (existing) {
        existing.push(p.value);
      } else {
        byLabel.set(p.label, [p.value]);
      }
    }
    return Array.from(byLabel.entries()).map(([label, values]) => ({
      value: values.join(","),
      label,
    }));
  }, [providerOptions]);

  const effectiveTierOptions = tierOptions
    ? [
        { value: "", label: "All Tiers" },
        ...tierOptions.map((t) => ({
          value: t,
          label: TIER_DISPLAY_NAMES[t] ?? t,
        })),
      ]
    : TIER_OPTIONS;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Year selector */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onYearChange(year - 1)}
          disabled={year <= MIN_YEAR}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-400"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-sm font-semibold text-neutral-300">
          {year}
        </span>
        <button
          onClick={() => onYearChange(year + 1)}
          disabled={year >= MAX_YEAR}
          className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-400"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Tier filter */}
      {showTierFilter && onTierChange && (
        <select
          value={selectedTier}
          onChange={(e) => onTierChange(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {effectiveTierOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Provider filter */}
      {showProviderFilter && onProviderChange && (
        <select
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Providers</option>
          {mergedProviderOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      {/* Model filter */}
      {showModelFilter &&
        onModelChange &&
        (modelOptions.length > 0 ? (
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Models</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="Filter model..."
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
          />
        ))}

      {/* Tool filter */}
      {showToolFilter && onToolChange && (
        <select
          value={selectedTool}
          onChange={(e) => onToolChange(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Tools</option>
          {toolOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
