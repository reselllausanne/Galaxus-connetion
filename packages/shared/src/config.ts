import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  POSTGRES_HOST: z.string().default("localhost"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default("integration_hub"),
  POSTGRES_USER: z.string().default("postgres"),
  POSTGRES_PASSWORD: z.string().default("postgres"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  SHOPIFY_SHOP: z.string().default("example.myshopify.com"),
  SHOPIFY_ACCESS_TOKEN: z.string().default("shpat_test"),
  SHOPIFY_API_VERSION: z.string().default("2024-10"),

  GALAXUS_SFTP_HOST: z.string().default("sftp.example"),
  GALAXUS_SFTP_PORT: z.coerce.number().default(22),
  GALAXUS_SFTP_USER: z.string().default("galaxus"),
  GALAXUS_SFTP_PASS: z.string().optional(),
  GALAXUS_SFTP_KEY_PATH: z.string().optional(),
  GALAXUS_SFTP_REMOTE_DIR: z.string().default("/uploads"),

  SHOPIFY_SNAPSHOT_CRON: z.string().default("0 2 * * *"),
  SUPPLIERS_SYNC_CRON: z.string().default("0 */2 * * *"),
  GALAXUS_EXPORT_CRON: z.string().default("0 */2 * * *"),

  EXPORTS_PATH: z.string().default("/exports"),
  SUPPLIER_CSV_PATH: z.string().default("./data/supplier_offers.csv"),
  SUPPLIER_MAPPING_PATH: z.string().default("./data/supplier_mapping.csv")
});

export const config = envSchema.parse(process.env);
export type EnvConfig = z.infer<typeof envSchema>;

