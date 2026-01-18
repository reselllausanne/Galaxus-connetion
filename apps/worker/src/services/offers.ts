import { Offer, Source } from "@prisma/client";
import Decimal from "decimal.js";

export type OfferWithSource = Offer & {
  source: Source;
};

const SOURCE_PRIORITY: Record<string, number> = {
  own_stock: 1,
  supplier1: 2,
  own: 3,
  friend: 4,
  suppliera: 5,
  supplierb: 6,
  stockx: 7
};

const getSourceRank = (name?: string) =>
  SOURCE_PRIORITY[name?.toLowerCase() ?? ""] ?? 99;

export function selectBestOffer(
  offers: OfferWithSource[]
): OfferWithSource | null {
  if (!offers || offers.length === 0) return null;

  return offers.reduce<OfferWithSource | null>((best, candidate) => {
    if (!best) return candidate;
    const bestPriority = getSourceRank(best.source.name);
    const candidatePriority = getSourceRank(candidate.source.name);

    if (candidatePriority !== bestPriority) {
      return candidatePriority < bestPriority ? candidate : best;
    }

    if (candidate.stockQty !== best.stockQty) {
      return candidate.stockQty > best.stockQty ? candidate : best;
    }

    if (candidate.cost !== best.cost) {
      const candidateCost = new Decimal(candidate.cost);
      const bestCost = new Decimal(best.cost);
      return candidateCost.lt(bestCost) ? candidate : best;
    }

    return best;
  }, null);
}

