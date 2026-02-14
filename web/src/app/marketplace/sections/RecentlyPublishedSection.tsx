import { useTranslation } from "react-i18next";

import type { MarketplaceListing } from "@/service/marketplaceService";
import AgentListingCard from "../AgentListingCard";
import { SectionHeader, SectionSkeleton } from "./SectionPrimitives";

interface RecentlyPublishedSectionProps {
  listings: MarketplaceListing[] | undefined;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  onMouseEnterListing: (id: string) => void;
}

export default function RecentlyPublishedSection({
  listings,
  isLoading,
  onSelectListing,
  onMouseEnterListing,
}: RecentlyPublishedSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <SectionSkeleton title={t("marketplace.sections.recentlyPublished")} />
    );
  }

  if (!listings || listings.length === 0) {
    return null;
  }

  return (
    <div>
      <SectionHeader title={t("marketplace.sections.recentlyPublished")} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <AgentListingCard
            key={listing.id}
            listing={listing}
            onClick={() => onSelectListing(listing.id)}
            onMouseEnter={() => onMouseEnterListing(listing.id)}
          />
        ))}
      </div>
    </div>
  );
}
