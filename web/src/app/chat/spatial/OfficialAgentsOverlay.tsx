import { DOCK_SAFE_AREA } from "@/components/layouts/BottomDock";
import { useMarketplaceListings } from "@/hooks/useMarketplace";
import { useXyzen } from "@/store";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface OfficialAgentsOverlayProps {
  onNavigateToMarketplace: (listingId: string) => void;
}

export function OfficialAgentsOverlay({
  onNavigateToMarketplace,
}: OfficialAgentsOverlayProps) {
  const { t } = useTranslation();
  const setShowOfficialRecommendations = useXyzen(
    (s) => s.setShowOfficialRecommendations,
  );

  const { data: listings, isLoading } = useMarketplaceListings({
    scope: "official",
    sort_by: "likes",
    limit: 4,
  });

  if (isLoading || !listings || listings.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute left-1/2 z-20 w-full max-w-[700px] -translate-x-1/2 px-4"
      style={{ bottom: DOCK_SAFE_AREA + 8 }}
    >
      <div className="rounded-xl border border-neutral-200/60 bg-white/90 px-5 py-4 shadow-lg backdrop-blur-md dark:border-neutral-700/60 dark:bg-neutral-900/90">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("app.workspace.recommendations.title")}
          </h3>
          <button
            type="button"
            onClick={() => setShowOfficialRecommendations(false)}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Agent cards row */}
        <div className="flex gap-3 overflow-x-auto">
          {listings.map((listing) => (
            <button
              key={listing.id}
              type="button"
              onClick={() => onNavigateToMarketplace(listing.id)}
              className="flex min-w-[140px] flex-1 cursor-pointer items-start gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2.5 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
            >
              <img
                src={
                  listing.avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${listing.name}`
                }
                alt={listing.name}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  {listing.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {listing.description ||
                    t("app.workspace.recommendations.viewInMarketplace")}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
