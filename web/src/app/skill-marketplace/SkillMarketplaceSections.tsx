"use client";

import {
  useTrendingSkillListings,
  useRecentlyPublishedSkillListings,
} from "@/hooks/useSkillMarketplace";
import TrendingSkillsSection from "./sections/TrendingSkillsSection";
import OfficialSkillsSection from "./sections/OfficialSkillsSection";
import RecentlyPublishedSkillsSection from "./sections/RecentlyPublishedSkillsSection";

interface SkillMarketplaceSectionsProps {
  onSelectListing: (id: string) => void;
  onMouseEnterListing?: (id: string) => void;
}

export default function SkillMarketplaceSections({
  onSelectListing,
  onMouseEnterListing,
}: SkillMarketplaceSectionsProps) {
  const { data: trendingListings, isLoading: isTrendingLoading } =
    useTrendingSkillListings(10);
  const {
    data: recentlyPublishedListings,
    isLoading: isRecentlyPublishedLoading,
  } = useRecentlyPublishedSkillListings(6);

  return (
    <div className="space-y-8">
      <TrendingSkillsSection
        listings={trendingListings}
        isLoading={isTrendingLoading}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
      <OfficialSkillsSection
        listings={trendingListings?.filter((l) => l.scope === "official")}
        isLoading={isTrendingLoading}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
      <RecentlyPublishedSkillsSection
        listings={recentlyPublishedListings}
        isLoading={isRecentlyPublishedLoading}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
    </div>
  );
}
