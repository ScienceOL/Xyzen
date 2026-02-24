import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

const MIN_YEAR = 2026;
const MAX_YEAR = 2030;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  azure_openai: "Azure OpenAI",
  google: "Google",
  google_vertex: "Google Vertex",
  gpugeek: "GPUGeek",
  qwen: "Qwen",
};

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
  providerOptions?: string[];
  modelOptions?: string[];
  showProviderFilter?: boolean;
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
}: AdminFilterBarProps) {
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
          {TIER_OPTIONS.map((opt) => (
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
          {providerOptions.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_DISPLAY_NAMES[p] ?? p}
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
    </div>
  );
}
