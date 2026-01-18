import { describe, expect, it } from "vitest";
import { toCsv } from "./exporter";

describe("exporter toCsv helper", () => {
  const headers = ["providerKey", "price", "currency"];

  it("renders headers and rows in the provided order", () => {
    const rows = [
      { providerKey: "ABC-1", price: 10, currency: "CHF" },
      { providerKey: "ABC-2", price: 12, currency: "EUR" }
    ];

    const csv = toCsv(headers, rows);
    expect(csv).toBe(
      "providerKey,price,currency\nABC-1,10,CHF\nABC-2,12,EUR"
    );
  });

  it("outputs empty values when fields are missing", () => {
    const rows = [{ providerKey: "ABC-3" }];
    const csv = toCsv(headers, rows);
    expect(csv).toBe("providerKey,price,currency\nABC-3,,");
  });
});

