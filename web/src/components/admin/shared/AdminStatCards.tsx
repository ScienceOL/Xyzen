import { formatCompact } from "./constants";

interface StatCard {
  label: string;
  value: string | number;
  colorClass?: string;
  subLabel?: string;
}

interface AdminStatCardsProps {
  cards: StatCard[];
  isLoading?: boolean;
  columns?: number;
}

const DEFAULT_GRADIENTS = [
  "from-blue-950/30 to-blue-900/30 border-blue-800",
  "from-green-950/30 to-green-900/30 border-green-800",
  "from-purple-950/30 to-purple-900/30 border-purple-800",
  "from-orange-950/30 to-orange-900/30 border-orange-800",
  "from-cyan-950/30 to-cyan-900/30 border-cyan-800",
  "from-indigo-950/30 to-indigo-900/30 border-indigo-800",
];

export function AdminStatCards({
  cards,
  isLoading = false,
  columns = 3,
}: AdminStatCardsProps) {
  const colsClass =
    columns === 7
      ? "grid-cols-4 lg:grid-cols-7"
      : columns === 6
        ? "grid-cols-3 lg:grid-cols-6"
        : columns === 5
          ? "grid-cols-3 lg:grid-cols-5"
          : columns === 4
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 md:grid-cols-3";

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`bg-linear-to-br ${card.colorClass ?? DEFAULT_GRADIENTS[i % DEFAULT_GRADIENTS.length]} rounded-lg p-4 border`}
        >
          <h3 className="text-xs font-medium text-neutral-400 mb-1">
            {card.label}
          </h3>
          {isLoading ? (
            <div className="h-8 w-20 animate-pulse rounded bg-neutral-700" />
          ) : (
            <>
              <p className="text-2xl font-bold text-white">
                {typeof card.value === "number"
                  ? formatCompact(card.value)
                  : card.value}
              </p>
              {card.subLabel && (
                <p className="text-xs text-neutral-500 mt-0.5">
                  {card.subLabel}
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
