import { useTranslation } from "react-i18next";

import { MotionCarousel } from "@/components/animate-ui/components/community/motion-carousel";
import type { MarketplaceListing } from "@/service/marketplaceService";
import AgentListingCard from "../AgentListingCard";
import { SectionHeader, SectionSkeleton } from "./SectionPrimitives";

interface TrendingSectionProps {
  listings: MarketplaceListing[] | undefined;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  onMouseEnterListing: (id: string) => void;
}

export default function TrendingSection({
  listings,
  isLoading,
  onSelectListing,
  onMouseEnterListing,
}: TrendingSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <SectionSkeleton title={t("marketplace.sections.trending")} />;
  }

  if (!listings || listings.length === 0) {
    return null;
  }

  return (
    <div>
      <SectionHeader title={t("marketplace.sections.trending")} />
      <MotionCarousel
        options={{ align: "start", loop: false, dragFree: true }}
        showDots={listings.length > 3}
      >
        {listings.map((listing) => (
          <AgentListingCard
            key={listing.id}
            listing={listing}
            onClick={() => onSelectListing(listing.id)}
            onMouseEnter={() => onMouseEnterListing(listing.id)}
          />
        ))}
      </MotionCarousel>
    </div>
  );
}
