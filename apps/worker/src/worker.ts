import "dotenv/config";
import { Worker, Queue, QueueScheduler } from "bullmq";
import { config, logger } from "@resell-lausanne/shared";
import { syncShopifyVariants } from "./services/shopify-importer";
import { syncSupplierOffers } from "./services/supplier";
import { computeGalaxusOffers } from "./services/channel-offer";
import { generateGalaxusExports } from "./services/exporter";
import { uploadGalaxusFiles } from "./services/uploader";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD
};

const shopifyQueueName = "shopify:snapshot";
const suppliersQueueName = "suppliers:sync";
const galaxusComputeQueueName = "galaxus:compute";
const galaxusExportQueueName = "galaxus:export_upload";

const shopifyQueue = new Queue(shopifyQueueName, { connection: redisConnection });
const suppliersQueue = new Queue(suppliersQueueName, { connection: redisConnection });
const galaxusComputeQueue = new Queue(galaxusComputeQueueName, {
  connection: redisConnection
});
const galaxusExportQueue = new Queue(galaxusExportQueueName, {
  connection: redisConnection
});

const schedulerNames = [
  shopifyQueueName,
  suppliersQueueName,
  galaxusComputeQueueName,
  galaxusExportQueueName
];

schedulerNames.forEach((name) => {
  new QueueScheduler(name, { connection: redisConnection });
});

new Worker(
  shopifyQueueName,
  async () => {
    logger.info("Running Shopify snapshot job");
    await syncShopifyVariants();
  },
  { connection: redisConnection }
);

new Worker(
  suppliersQueueName,
  async () => {
    logger.info("Syncing supplier offers");
    await syncSupplierOffers();
  },
  { connection: redisConnection }
);

new Worker(
  galaxusComputeQueueName,
  async () => {
    logger.info("Computing Galaxus channel offers");
    const validations = await computeGalaxusOffers();
    await galaxusExportQueue.add("trigger", { validations }, { removeOnComplete: true });
  },
  { connection: redisConnection }
);

new Worker(
  galaxusExportQueueName,
  async () => {
    logger.info("Generating Galaxus exports");
    const summary = await generateGalaxusExports();
    logger.info({ summary }, "Exports written");
    await uploadGalaxusFiles();
  },
  { connection: redisConnection }
);

async function scheduleRepeatables() {
  await shopifyQueue.add(
    "repeatable",
    {},
    {
      jobId: "shopify:snapshot:repeat",
      repeat: { cron: config.SHOPIFY_SNAPSHOT_CRON },
      removeOnComplete: true
    }
  );

  await suppliersQueue.add(
    "repeatable",
    {},
    {
      jobId: "suppliers:sync:repeat",
      repeat: { cron: config.SUPPLIERS_SYNC_CRON },
      removeOnComplete: true
    }
  );

  await galaxusComputeQueue.add(
    "repeatable",
    {},
    {
      jobId: "galaxus:compute:repeat",
      repeat: { cron: config.GALAXUS_EXPORT_CRON },
      removeOnComplete: true
    }
  );
}

scheduleRepeatables().catch((error) => {
  logger.error({ error }, "Failed to schedule repeatable jobs");
  process.exit(1);
});

