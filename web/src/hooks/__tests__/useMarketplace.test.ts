import { describe, expect, it } from "vitest";

import { marketplaceKeys } from "../useMarketplace";

describe("marketplaceKeys", () => {
  it("keeps infinite listings key under listings base key", () => {
    const baseKey = marketplaceKeys.listings();
    const infiniteKey = marketplaceKeys.listingsInfinite(
      {
        query: "assistant",
        sort_by: "recent",
      },
      20,
    );

    expect(infiniteKey.slice(0, baseKey.length)).toEqual(baseKey);
  });

  it("stores filters and page size in infinite listings key", () => {
    const infiniteKey = marketplaceKeys.listingsInfinite(
      {
        query: "science",
        tags: ["tool"],
        sort_by: "likes",
      },
      40,
    );

    expect(infiniteKey).toEqual([
      "marketplace",
      "listings",
      "infinite",
      {
        query: "science",
        tags: ["tool"],
        sort_by: "likes",
        pageSize: 40,
      },
    ]);
  });
});
