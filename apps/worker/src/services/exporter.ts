import { promises as fs } from "fs";
import path from "path";
import { config } from "@resell-lausanne/shared";
import { prisma } from "@resell-lausanne/db";

const headersPriceStock = [
  "providerKey",
  "price",
  "currency",
  "stockQty",
  "leadTimeDays"
];

const headersMaster = [
  "providerKey",
  "title",
  "brand",
  "gtin",
  "imageUrl",
  "weightGrams",
  "originCountry",
  "size",
  "color"
];

type CSVRow = Record<string, string | number | undefined>;

export const toCsv = (headers: string[], rows: CSVRow[]) => {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((field) => (row[field] ?? "").toString()).join(","));
  }
  return lines.join("\n");
};

const ensureExportsDir = async () => {
  await fs.mkdir(config.EXPORTS_PATH, { recursive: true });
};

export interface ValidationEntry {
  providerKey: string;
  missingFields: string[];
  notes: string;
}

export async function generateGalaxusExports() {
  await ensureExportsDir();

  const channelOffers = await prisma.channelOffer.findMany({
    where: { channel: "GALAXUS" }
  });

  const variants = await prisma.productVariant.findMany({
    where: {
      providerKey: {
        in: channelOffers.map((offer: { providerKey: string }) => offer.providerKey)
      }
    }
  });

  const variantMap = variants.reduce<Record<string, (typeof variants)[number]>>(
    (acc: Record<string, (typeof variants)[number]>, variant) => {
      acc[variant.providerKey] = variant;
      return acc;
    },
    {}
  );

  const validationRows: ValidationEntry[] = [];
  const priceRows: CSVRow[] = [];
  const masterRows: CSVRow[] = [];

  const requiredFields: Array<keyof (typeof variants)[number]> = [
    "gtin",
    "weightGrams",
    "originCountry",
    "title"
  ];

  for (const offer of channelOffers) {
    if (!offer.publish) {
      const missingFields = requiredFields.filter(
        (field) => !variantMap[offer.providerKey]?.[field]
      );
      validationRows.push({
        providerKey: offer.providerKey,
        missingFields,
        notes: "publish=false"
      });
      continue;
    }

    const variant = variantMap[offer.providerKey];
    if (!variant) continue;

    const masterRow: CSVRow = {
      providerKey: variant.providerKey,
      title: variant.title,
      brand: variant.brand ?? "",
      gtin: variant.gtin ?? "",
      imageUrl: variant.imageUrl ?? "",
      weightGrams: variant.weightGrams ?? "",
      originCountry: variant.originCountry ?? "",
      size: variant.size ?? "",
      color: variant.color ?? ""
    };

    masterRows.push(masterRow);

    const priceRow: CSVRow = {
      providerKey: variant.providerKey,
      price: offer.sellPrice ?? offer.computedCost ?? "",
      currency: offer.sellCurrency ?? "",
      stockQty: offer.computedStockQty ?? "",
      leadTimeDays: offer.computedLeadTimeDays ?? ""
    };

    priceRows.push(priceRow);

    const missingFields = requiredFields.filter((field) => !variant[field]);
    if (missingFields.length) {
      validationRows.push({
        providerKey: variant.providerKey,
        missingFields,
        notes: "missing_master_fields"
      });
    }
  }

  await Promise.all([
    fs.writeFile(
      path.join(config.EXPORTS_PATH, "galaxus_price_stock.csv"),
      toCsv(headersPriceStock, priceRows)
    ),
    fs.writeFile(
      path.join(config.EXPORTS_PATH, "galaxus_master.csv"),
      toCsv(headersMaster, masterRows)
    ),
    fs.writeFile(
      path.join(config.EXPORTS_PATH, "galaxus_validation_report.csv"),
      [
        "providerKey,missingFields,notes",
        ...validationRows.map(
          (entry) =>
            `${entry.providerKey},"${entry.missingFields.join(";")}",${entry.notes}`
        )
      ].join("\n")
    )
  ]);

  return {
    priceRows: priceRows.length,
    masterRows: masterRows.length,
    validationRows: validationRows.length
  };
}

