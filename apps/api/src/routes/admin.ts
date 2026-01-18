import { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import { config } from "@resell-lausanne/shared";
import { promises as fs } from "fs";
import path from "path";

const queueNames = {
  shopify: "shopify:snapshot",
  suppliers: "suppliers:sync",
  supplier1: "supplier1:sync",
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
  app.get("/", async (_request, reply) => {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resell-Lausanne Integration Hub</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { margin-bottom: 6px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 16px 0; }
      button { padding: 10px 12px; border-radius: 6px; border: 1px solid #ccc; background: #f7f7f7; cursor: pointer; }
      button:hover { background: #eee; }
      pre { background: #111; color: #0f0; padding: 12px; border-radius: 6px; overflow-x: auto; }
      .row { margin: 8px 0; }
      a { color: #2b6cb0; }
    </style>
  </head>
  <body>
    <h1>Integration Hub</h1>
    <div class="row">Status: <span id="health">loading...</span></div>
    <div class="grid">
      <button onclick="runJob('shopify')">Run Shopify Snapshot</button>
      <button onclick="runJob('suppliers')">Run Suppliers Sync</button>
      <button onclick="runJob('supplier1')">Run Supplier1 Sync</button>
      <button onclick="runJob('galaxus')">Run Galaxus Export</button>
      <button onclick="loadExports()">List Exports</button>
    </div>
    <div class="row"><strong>Exports:</strong> <span id="exports"></span></div>
    <div class="row"><strong>Output:</strong></div>
    <pre id="output"></pre>
    <script>
      const output = document.getElementById("output");
      const healthEl = document.getElementById("health");
      const exportsEl = document.getElementById("exports");

      const log = (msg) => {
        output.textContent = msg + "\\n" + output.textContent;
      };

      const fetchJson = async (url, options) => {
        const res = await fetch(url, options);
        const text = await res.text();
        try { return { ok: res.ok, data: JSON.parse(text) }; }
        catch { return { ok: res.ok, data: text }; }
      };

      const loadHealth = async () => {
        const res = await fetchJson("/health");
        healthEl.textContent = res.ok ? "ok" : "error";
      };

      const runJob = async (name) => {
        const res = await fetchJson("/admin/run/" + name, { method: "POST" });
        log(JSON.stringify(res.data, null, 2));
      };

      const loadExports = async () => {
        const res = await fetchJson("/admin/exports");
        if (!res.ok) {
          log("Failed to load exports");
          return;
        }
        exportsEl.innerHTML = res.data
          .map((f) => '<a href="/admin/exports/' + encodeURIComponent(f.name) + '" target="_blank">' + f.name + '</a> (' + f.size + ' bytes)')
          .join(" | ");
      };

      loadHealth();
    </script>
  </body>
</html>`;
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  });

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

  app.post("/admin/run/supplier1", async () => {
    await enqueueJob(queueNames.supplier1);
    return { queued: queueNames.supplier1 };
  });

  app.post("/admin/run/galaxus", async () => {
    await enqueueJob(queueNames.galaxus);
    return { queued: queueNames.galaxus };
  });

  app.get("/admin/exports", async () => {
    const dir = config.EXPORTS_PATH;
    try {
      const files = await fs.readdir(dir);
      const items = await Promise.all(
        files.map(async (name) => {
          const stats = await fs.stat(path.join(dir, name));
          return { name, size: stats.size };
        })
      );
      return items;
    } catch (error) {
      app.log.error({ error }, "Failed to list exports");
      return [];
    }
  });

  app.get("/admin/exports/:name", async (request, reply) => {
    const fileName = (request.params as { name: string }).name;
    const exportsDir = path.resolve(config.EXPORTS_PATH);
    const filePath = path.resolve(exportsDir, fileName);
    if (!filePath.startsWith(exportsDir)) {
      reply.code(400);
      return { error: "Invalid file" };
    }
    reply.header("content-type", "text/csv; charset=utf-8");
    return reply.send(await fs.readFile(filePath));
  });
}

