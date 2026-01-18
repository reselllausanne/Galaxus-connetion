import { parse } from "csv-parse/sync";
import { promises as fs } from "fs";
import path from "path";
import Decimal from "decimal.js";
import { config, logger } from "@resell-lausanne/shared";
import { prisma } from "@resell-lausanne/db";

type Supplier1Row = {
  providerKey?: string;
  supplierSku?: string;
  stockQty?: string | number;
  cost?: string | number;
  currency?: string;
  leadTimeDays?: string | number;
};

const normalizeStock = (value?: string | number) => {
  if (value === undefined || value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLeadTime = (value?: string | number) => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseCsvFile = async (filePath: string) => {
  const raw = await fs.readFile(filePath, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Supplier1Row[];
};

const fetchApiRows = async () => {
  const response = await fetch(config.SUPPLIER1_API_URL, {
    headers: {
      accept: "application/json",
      ...(config.SUPPLIER1_API_TOKEN
        ? { Authorization: `Bearer ${config.SUPPLIER1_API_TOKEN.trim()}` }
        : {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      { status: response.status, body },
      "Supplier1 API fetch failed"
    );
    throw new Error("Supplier1 API error");
  }

  const payload = await response.json();
  if (Array.isArray(payload)) {
    return payload as Supplier1Row[];
  }
  if (Array.isArray(payload?.results)) {
    return payload.results as Supplier1Row[];
  }
  return [];
};

const ensureExportsDir = async () => {
  await fs.mkdir(config.EXPORTS_PATH, { recursive: true });
};

const writeUnmappedRows = async (rows: Array<Supplier1Row & { reason: string }>) => {
  await ensureExportsDir();
  const headers = [
    "providerKey",
    "supplierSku",
    "stockQty",
    "cost",
    "currency",
    "leadTimeDays",
    "reason"
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.providerKey ?? "",
        row.supplierSku ?? "",
        row.stockQty ?? "",
        row.cost ?? "",
        row.currency ?? "",
        row.leadTimeDays ?? "",
        row.reason
      ].join(",")
    );
  }
  await fs.writeFile(
    path.join(config.EXPORTS_PATH, "unmapped_supplier1_rows.csv"),
    lines.join("\n")
  );
};

const resolveProviderKey = async (sourceId: string, supplierSku: string) => {
  const mapping = await prisma.supplierSkuMap.findUnique({
    where: {
      sourceId_supplierSku: {
        sourceId,
        supplierSku
      }
    }
  });
  return mapping?.providerKey ?? null;
};

export async function syncSupplier1Offers() {
  const source = await prisma.source.upsert({
    where: { name: "supplier1" },
    create: { name: "supplier1", type: "API" },
    update: {}
  });

  const mode = config.SUPPLIER1_MODE;
  const rows =
    mode === "api"
      ? await fetchApiRows()
      : await parseCsvFile(config.SUPPLIER1_CSV_PATH);

  const unmapped: Array<Supplier1Row & { reason: string }> = [];
  const operations = [];

  for (const raw of rows) {
    const supplierSku = raw.supplierSku?.toString().trim();
    let providerKey = raw.providerKey?.toString().trim();

    if (!providerKey && supplierSku) {
      providerKey = await resolveProviderKey(source.id, supplierSku);
      if (!providerKey) {
        unmapped.push({ ...raw, supplierSku, reason: "missing_provider_key" });
        continue;
      }
    }

    if (!providerKey) {
      unmapped.push({ ...raw, reason: "missing_provider_key" });
      continue;
    }

    const offerData = {
      providerKey,
      sourceId: source.id,
      supplierSku: supplierSku || null,
      stockQty: normalizeStock(raw.stockQty),
      cost: new Decimal(raw.cost ?? "0").toString(),
      currency: raw.currency || "CHF",
      leadTimeDays: normalizeLeadTime(raw.leadTimeDays),
      lastSeenAt: new Date(),
      rawJson: raw
    };

    operations.push(
      prisma.offer.upsert({
        where: {
          providerKey_sourceId: {
            providerKey,
            sourceId: source.id
          }
        },
        create: offerData,
        update: {
          stockQty: offerData.stockQty,
          cost: offerData.cost,
          currency: offerData.currency,
          leadTimeDays: offerData.leadTimeDays,
          lastSeenAt: offerData.lastSeenAt,
          rawJson: offerData.rawJson,
          supplierSku: offerData.supplierSku
        }
      })
    );
  }

  await Promise.all(operations);
  if (unmapped.length) {
    await writeUnmappedRows(unmapped);
  } else {
    await writeUnmappedRows([]);
  }

  logger.info(
    { count: rows.length, unmapped: unmapped.length, mode },
    "Supplier1 offers synced"
  );
}

