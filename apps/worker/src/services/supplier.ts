import { parse } from "csv-parse/sync";
import { promises as fs } from "fs";
import path from "path";
import Decimal from "decimal.js";
import { config, logger } from "@resell-lausanne/shared";
import { prisma } from "@resell-lausanne/db";

interface SupplierRow {
  providerKey?: string;
  supplierSku?: string;
  stockQty?: string;
  cost?: string;
  currency?: string;
  leadTimeDays?: string;
  source?: string;
}

const parseCsvFile = async (filePath: string) => {
  const raw = await fs.readFile(filePath, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as SupplierRow[];
};

const loadMapping = async () => {
  try {
    const mappingCsv = await fs.readFile(config.SUPPLIER_MAPPING_PATH, "utf-8");
    const rows = parse(mappingCsv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<{ supplierSku?: string; providerKey?: string }>;

    return rows.reduce<Record<string, string>>((acc, row) => {
      if (row.supplierSku && row.providerKey) {
        acc[row.supplierSku] = row.providerKey;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const normalizeStock = (value?: string) => {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function syncSupplierOffers() {
  logger.info({ path: config.SUPPLIER_CSV_PATH }, "Importing supplier CSV");
  const rows = await parseCsvFile(config.SUPPLIER_CSV_PATH);
  const mapping = await loadMapping();
  const tasks = [];
  for (const raw of rows) {
    const providerKey =
      raw.providerKey || (raw.supplierSku && mapping[raw.supplierSku]) || null;
    if (!providerKey) {
      logger.warn({ row: raw }, "Missing providerKey/SKU mapping");
      continue;
    }

    const sourceName = raw.source?.trim() || "supplierA";
    const source = await prisma.source.upsert({
      where: { name: sourceName },
      create: { name: sourceName, type: "CSV" },
      update: {}
    });

    const offerData = {
      providerKey,
      sourceId: source.id,
      stockQty: normalizeStock(raw.stockQty),
      cost: new Decimal(raw.cost ?? "0").toString(),
      currency: raw.currency || "CHF",
      leadTimeDays: raw.leadTimeDays
        ? Number(raw.leadTimeDays)
        : undefined,
      lastSeenAt: new Date(),
      rawJson: raw
    };

    tasks.push(
      prisma.offer.upsert({
        where: {
          providerKey_sourceId: {
            providerKey,
            sourceId: source.id
          }
        },
        create: offerData,
        update: {
          ...offerData,
          lastSeenAt: new Date()
        }
      })
    );
  }

  await Promise.all(tasks);
  logger.info({ count: rows.length }, "Supplier offers synced");
}

