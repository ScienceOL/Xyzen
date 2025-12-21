import { useXyzen } from "@/store";
import type { MarketplaceListing } from "@/service/marketplaceService";

/**
 * Hook to detect if the current user owns a marketplace listing
 *
 * @param listing - The marketplace listing to check ownership for
 * @returns boolean - true if the current user owns the listing
 */
export const useIsMarketplaceOwner = (
  listing: MarketplaceListing | undefined,
) => {
  const { user } = useXyzen();

  if (!listing || !user?.username) return false;

  // Handle multiple ID formats for flexible ownership comparison
  return (
    listing.user_id === user.username ||
    (user.id && listing.user_id === user.id) ||
    listing.user_id.split("@")[0] === user.username.split("@")[0]
  );
};
