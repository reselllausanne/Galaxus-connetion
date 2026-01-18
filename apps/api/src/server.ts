import "dotenv/config";
import Fastify from "fastify";
import { adminRoutes } from "./routes/admin";
import { config, logger } from "@resell-lausanne/shared";

const PORT = Number(process.env.PORT || 4000);

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  adminRoutes(app);

  return app;
}

if (require.main === module) {
  const server = buildServer();
  server
    .listen({ port: PORT, host: "0.0.0.0" })
    .catch((error) => {
      logger.error(error, "Server failed to start");
      process.exit(1);
    });
}

