"use client";

import { useTranslation } from "react-i18next";
import type { SkillMarketplaceListing } from "@/service/skillMarketplaceService";
import SkillListingCard from "../SkillListingCard";
import {
  SectionHeader,
  SectionSkeleton,
} from "@/app/marketplace/sections/SectionPrimitives";

interface TrendingSkillsSectionProps {
  listings: SkillMarketplaceListing[] | undefined;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  onMouseEnterListing?: (id: string) => void;
}

export default function TrendingSkillsSection({
  listings,
  isLoading,
  onSelectListing,
  onMouseEnterListing,
}: TrendingSkillsSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <SectionSkeleton title={t("skillMarketplace.sections.trending")} />;
  }

  if (!listings || listings.length === 0) {
    return null;
  }

  return (
    <div>
      <SectionHeader title={t("skillMarketplace.sections.trending")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {listings.slice(0, 6).map((listing) => (
          <SkillListingCard
            key={listing.id}
            listing={listing}
            compact
            onClick={() => onSelectListing(listing.id)}
            onMouseEnter={() => onMouseEnterListing?.(listing.id)}
          />
        ))}
      </div>
    </div>
  );
}
