import { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import { config } from "@resell-lausanne/shared";

const queueNames = {
  shopify: "shopify:snapshot",
  suppliers: "suppliers:sync",
  galaxus: "galaxus:export_upload"
};

const queueClients: Record<string, Queue> = {};

const getQueue = (name: string) => {
  if (!queueClients[name]) {
    queueClients[name] = new Queue(name, {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD
      }
    });
  }
  return queueClients[name];
};

const enqueueJob = async (name: string) => {
  const queue = getQueue(name);
  await queue.add("manual", {}, { removeOnComplete: true });
};

export function adminRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { status: "ok", env: config.NODE_ENV };
  });

  app.post("/admin/run/shopify", async () => {
    await enqueueJob(queueNames.shopify);
    return { queued: queueNames.shopify };
  });

  app.post("/admin/run/suppliers", async () => {
    await enqueueJob(queueNames.suppliers);
    return { queued: queueNames.suppliers };
  });

  app.post("/admin/run/galaxus", async () => {
    await enqueueJob(queueNames.galaxus);
    return { queued: queueNames.galaxus };
  });
}

