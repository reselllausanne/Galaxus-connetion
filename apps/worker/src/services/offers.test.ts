import { describe, expect, it } from "vitest";
import { selectBestOffer, OfferWithSource } from "./offers";

const makeOffer = (
  sourceName: string,
  overrides?: Partial<OfferWithSource>
): OfferWithSource => ({
  id: "offer-1",
  providerKey: "SKU-1",
  sourceId: "source-1",
  stockQty: 5,
  cost: "100",
  currency: "CHF",
  leadTimeDays: 3,
  lastSeenAt: new Date(),
  rawJson: {},
  source: {
    id: "source-1",
    name: sourceName
  },
  ...overrides
});

describe("selectBestOffer", () => {
  it("prefers own_stock source regardless of stock", () => {
    const winner = selectBestOffer([
      makeOffer("supplierA", { stockQty: 20, cost: "50" }),
      makeOffer("own_stock", { stockQty: 1, cost: "60" })
    ]);

    expect(winner?.source.name).toBe("own_stock");
  });

  it("uses stock as tiebreaker for equal priority", () => {
    const winner = selectBestOffer([
      makeOffer("supplierA", { stockQty: 5 }),
      makeOffer("supplierA", { stockQty: 10 })
    ]);

    expect(winner?.stockQty).toBe(10);
  });

  it("prefers lower cost when source and stock match", () => {
    const winner = selectBestOffer([
      makeOffer("supplierB", { stockQty: 5, cost: "100" }),
      makeOffer("supplierB", { stockQty: 5, cost: "90" })
    ]);

    expect(winner?.cost).toBe("90");
  });
});

