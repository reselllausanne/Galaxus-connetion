import { config, logger } from "@resell-lausanne/shared";

export interface GoldenSneakersOffer {
  providerKey: string;
  stockQty: number;
  cost: number;
  currency: string;
  leadTimeDays?: number;
  raw: Record<string, unknown>;
}

const buildUrl = () => {
  const url = new URL(config.GOLDENSNEAKERS_BASE_URL);
  url.searchParams.set("search", config.GOLDENSNEAKERS_SEARCH_QUERY);
  url.searchParams.set("markup_percentage", String(config.GOLDENSNEAKERS_MARKUP));
  url.searchParams.set("vat_percentage", String(config.GOLDENSNEAKERS_VAT));
  url.searchParams.set("rounding_type", config.GOLDENSNEAKERS_ROUNDING);
  url.searchParams.set(
    "show_only_products_with_ean",
    String(config.GOLDENSNEAKERS_ONLY_EAN)
  );
  return url.toString();
};

const pickCost = (raw: Record<string, unknown>) => {
  const candidates = [
    "cost",
    "price",
    "price_chf",
    "wholesale_price",
    "supplier_price"
  ];
  for (const key of candidates) {
    const value = raw[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const pickCurrency = (raw: Record<string, unknown>) => {
  const value = raw.currency;
  if (typeof value === "string" && value.trim().length) return value;
  return "CHF";
};

export async function fetchGoldenSneakersOffers(): Promise<GoldenSneakersOffer[]> {
  const token = config.GOLDENSNEAKERS_TOKEN?.trim();
  if (!token) {
    logger.warn("GoldenSneakers token missing; skipping fetch");
    return [];
  }

  const response = await fetch(buildUrl(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body }, "GoldenSneakers fetch failed");
    throw new Error("GoldenSneakers API error");
  }

  const payload = await response.json();
  const items: Record<string, unknown>[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
    ? payload.results
    : [];

  return items
    .map((item) => {
      const providerKey = String(item.sku ?? "").trim();
      if (!providerKey) return null;
      const stockQty = Number(item.available_summary_quantity ?? 0);
      return {
        providerKey,
        stockQty: Number.isFinite(stockQty) ? stockQty : 0,
        cost: pickCost(item),
        currency: pickCurrency(item),
        raw: item,
        leadTimeDays: undefined
      } as GoldenSneakersOffer;
    })
    .filter(Boolean) as GoldenSneakersOffer[];
}

