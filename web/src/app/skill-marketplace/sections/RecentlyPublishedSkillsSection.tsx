"use client";

import { useTranslation } from "react-i18next";
import type { SkillMarketplaceListing } from "@/service/skillMarketplaceService";
import SkillListingCard from "../SkillListingCard";
import {
  SectionHeader,
  SectionSkeleton,
} from "@/app/marketplace/sections/SectionPrimitives";

interface RecentlyPublishedSkillsSectionProps {
  listings: SkillMarketplaceListing[] | undefined;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  onMouseEnterListing?: (id: string) => void;
}

export default function RecentlyPublishedSkillsSection({
  listings,
  isLoading,
  onSelectListing,
  onMouseEnterListing,
}: RecentlyPublishedSkillsSectionProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <SectionSkeleton
        title={t("skillMarketplace.sections.recentlyPublished")}
      />
    );
  }

  if (!listings || listings.length === 0) {
    return null;
  }

  return (
    <div>
      <SectionHeader title={t("skillMarketplace.sections.recentlyPublished")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <SkillListingCard
            key={listing.id}
            listing={listing}
            onClick={() => onSelectListing(listing.id)}
            onMouseEnter={() => onMouseEnterListing?.(listing.id)}
          />
        ))}
      </div>
    </div>
  );
}
