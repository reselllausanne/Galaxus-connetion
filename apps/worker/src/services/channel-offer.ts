import Decimal from "decimal.js";
import { prisma } from "@resell-lausanne/db";
import { logger } from "@resell-lausanne/shared";
import { selectBestOffer, OfferWithSource } from "./offers";

export async function computeGalaxusOffers() {
  const variants = await prisma.productVariant.findMany();
  const validations: Array<{ providerKey: string; missingFields: string[] }> =
    [];

  const operations = [];
  for (const variant of variants) {
    const offers = await prisma.offer.findMany({
      where: { providerKey: variant.providerKey },
      include: { source: true }
    });

    const best = selectBestOffer(offers as OfferWithSource[]);
    const isDataComplete =
      !!variant.gtin &&
      !!variant.weightGrams &&
      !!variant.originCountry &&
      !!variant.title;

    const publish = Boolean(best && isDataComplete);

    if (!isDataComplete) {
      const missingFields = [];
      if (!variant.gtin) missingFields.push("gtin");
      if (!variant.weightGrams) missingFields.push("weightGrams");
      if (!variant.originCountry) missingFields.push("originCountry");
      if (!variant.title) missingFields.push("title");
      validations.push({ providerKey: variant.providerKey, missingFields });
    }

    if (!best) {
      await prisma.channelOffer.upsert({
        where: {
          providerKey_channel: {
            providerKey: variant.providerKey,
            channel: "GALAXUS"
          }
        },
      create: {
        providerKey: variant.providerKey,
        channel: "GALAXUS",
        publish: false
      },
      update: {
        publish: false
      }
      });
      continue;
    }

    const offerCost = new Decimal(best.cost);
    const operation = prisma.channelOffer.upsert({
      where: {
        providerKey_channel: {
          providerKey: variant.providerKey,
          channel: "GALAXUS"
        }
      },
      create: {
        providerKey: variant.providerKey,
        channel: "GALAXUS",
        publish,
        sellPrice: offerCost.toString(),
        sellCurrency: best.currency,
        stockPolicy: { selectedSource: best.source.name },
        computedStockQty: best.stockQty,
        computedLeadTimeDays: best.leadTimeDays,
        computedCost: offerCost.toString()
      },
      update: {
        publish,
        sellPrice: offerCost.toString(),
        sellCurrency: best.currency,
        stockPolicy: { selectedSource: best.source.name },
        computedStockQty: best.stockQty,
        computedLeadTimeDays: best.leadTimeDays,
        computedCost: offerCost.toString()
      }
    });

    operations.push(operation);
  }

  await Promise.all(operations);
  logger.info({ count: variants.length }, "Galaxus offers computed");

  return validations;
}

