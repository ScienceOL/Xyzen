import {
  useMarketplaceListings,
  useTrendingListings,
  useRecentlyPublishedListings,
} from "@/hooks/useMarketplace";
import OfficialPicksSection from "./sections/OfficialPicksSection";
import RecentlyPublishedSection from "./sections/RecentlyPublishedSection";
import TrendingSection from "./sections/TrendingSection";

interface MarketplaceSectionsProps {
  onSelectListing: (id: string) => void;
  onMouseEnterListing: (id: string) => void;
}

export default function MarketplaceSections({
  onSelectListing,
  onMouseEnterListing,
}: MarketplaceSectionsProps) {
  const { data: trendingListings, isLoading: isLoadingTrending } =
    useTrendingListings(8);
  const { data: officialListings, isLoading: isLoadingOfficial } =
    useMarketplaceListings({
      scope: "official",
      sort_by: "likes",
      limit: 8,
    });
  const { data: recentListings, isLoading: isLoadingRecent } =
    useRecentlyPublishedListings(6);

  return (
    <div className="space-y-10">
      <TrendingSection
        listings={trendingListings}
        isLoading={isLoadingTrending}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
      <OfficialPicksSection
        listings={officialListings}
        isLoading={isLoadingOfficial}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
      <RecentlyPublishedSection
        listings={recentListings}
        isLoading={isLoadingRecent}
        onSelectListing={onSelectListing}
        onMouseEnterListing={onMouseEnterListing}
      />
    </div>
  );
}
