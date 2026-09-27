import type { AppConfig } from "../config/env.js";
import type { Database } from "../lib/database.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Database;
  }
}

