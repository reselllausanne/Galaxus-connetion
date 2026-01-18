import { config } from "@resell-lausanne/shared";
import { prisma } from "@resell-lausanne/db";
import { logger } from "@resell-lausanne/shared";

const GRAPHQL_QUERY = `
  query productVariants($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      edges {
        node {
          id
          sku
          barcode
          title
          weight
          weightUnit
          image {
            url
          }
          product {
            title
            vendor
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
          selectedOptions {
            name
            value
          }
          metafields(first: 20) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const weightUnitFactor: Record<string, number> = {
  KG: 1000,
  G: 1,
  LB: 453.592,
  OZ: 28.35
};

const toGrams = (value: number | null, unit: string | null) => {
  if (!value || !unit) return null;
  return Math.round(value * (weightUnitFactor[unit.toUpperCase()] ?? 1));
};

const parseMetafield = (
  edges: Array<{ node: { namespace: string; key: string; value: string } }>
) => {
  const map: Record<string, string> = {};
  edges.forEach(({ node }) => {
    map[`${node.namespace}.${node.key}`] = node.value;
    map[node.key] = node.value;
  });
  return map;
};

const pickProviderKey = (variant: any): string | null => {
  if (variant.sku) return variant.sku;
  const variantMeta = parseMetafield(
    variant.metafields?.edges ?? []
  );
  return (
    variantMeta["custom.provider_key"] ||
    variantMeta["custom.providerKey"] ||
    variantMeta["provider_key"] ||
    null
  );
};

export async function syncShopifyVariants() {
  const endpoint = `https://${config.SHOPIFY_SHOP}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`;
  let cursor: string | null = null;
  let count = 0;

  do {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query: GRAPHQL_QUERY, variables: { cursor } })
    });

    const payload = await response.json();
    if (payload.errors) {
      logger.error({ errors: payload.errors }, "Shopify GraphQL error");
      throw new Error("Shopify GraphQL failed");
    }

    const connection = payload.data.productVariants;

    for (const edge of connection.edges) {
      const variant = edge.node;
      const providerKey = pickProviderKey(variant);
      if (!providerKey) continue;

      const productMeta = parseMetafield(
        variant.product?.metafields?.edges ?? []
      );

      const data = {
        providerKey,
        shopifyVariantId: variant.id,
        title: variant.product?.title ?? variant.title ?? providerKey,
        brand: variant.product?.vendor,
        gtin: variant.barcode,
        sku: variant.sku,
        size: variant.selectedOptions?.find(
          (opt: any) => opt.name.toLowerCase().includes("size")
        )?.value,
        color: variant.selectedOptions?.find(
          (opt: any) => opt.name.toLowerCase().includes("color")
        )?.value,
        imageUrl: variant.image?.url,
        weightGrams: toGrams(variant.weight, variant.weightUnit),
        originCountry:
          productMeta["custom.origin_country"] ||
          productMeta["origin_country"] ||
          productMeta["originCountry"],
        attributesJson: variant.selectedOptions?.reduce(
          (acc: Record<string, string>, option: any) => {
            acc[option.name] = option.value;
            return acc;
          },
          {}
        )
      };

      await prisma.productVariant.upsert({
        where: { providerKey },
        create: data,
        update: data
      });

      count += 1;
    }

    cursor = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (cursor);

  logger.info({ count }, "Shopify snapshot complete");
}

