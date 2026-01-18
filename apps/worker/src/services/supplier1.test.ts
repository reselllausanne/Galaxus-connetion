import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const mockUpsert = vi.fn();
const mockFindUnique = vi.fn();
const mockSourceUpsert = vi.fn().mockResolvedValue({ id: "source-1" });

vi.mock("@resell-lausanne/db", () => ({
  prisma: {
    source: {
      upsert: mockSourceUpsert
    },
    supplierSkuMap: {
      findUnique: mockFindUnique
    },
    offer: {
      upsert: mockUpsert
    }
  }
}));

const buildCsv = async (dir: string) => {
  const content = [
    "providerKey,supplierSku,stockQty,cost,currency,leadTimeDays",
    "SKU-1,,5,100,CHF,3",
    ",SUP-1,2,80,CHF,2"
  ].join("\n");
  const filePath = path.join(dir, "supplier1.csv");
  await fs.writeFile(filePath, content);
  return filePath;
};

describe("supplier1 ingestion", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "supplier1-test-"));
    mockUpsert.mockReset();
    mockFindUnique.mockReset();
    mockSourceUpsert.mockClear();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("writes unmapped supplierSku rows to export file", async () => {
    const csvPath = await buildCsv(tempDir);
    process.env.SUPPLIER1_MODE = "csv";
    process.env.SUPPLIER1_CSV_PATH = csvPath;
    process.env.EXPORTS_PATH = tempDir;

    mockFindUnique.mockResolvedValueOnce(null);

    const { syncSupplier1Offers } = await import("./supplier1");
    await syncSupplier1Offers();

    const output = await fs.readFile(
      path.join(tempDir, "unmapped_supplier1_rows.csv"),
      "utf-8"
    );

    expect(output).toContain("SUP-1");
    expect(output).toContain("missing_provider_key");
  });

  it("uses upsert for repeated runs (idempotent)", async () => {
    const csvPath = await buildCsv(tempDir);
    process.env.SUPPLIER1_MODE = "csv";
    process.env.SUPPLIER1_CSV_PATH = csvPath;
    process.env.EXPORTS_PATH = tempDir;

    mockFindUnique.mockResolvedValueOnce({ providerKey: "SKU-2" });

    const { syncSupplier1Offers } = await import("./supplier1");
    await syncSupplier1Offers();
    await syncSupplier1Offers();

    expect(mockUpsert).toHaveBeenCalled();
    const firstCall = mockUpsert.mock.calls[0][0];
    expect(firstCall.where.providerKey_sourceId).toBeDefined();
  });
});

