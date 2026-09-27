import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import type { AppConfig } from "./config/env.js";
import { createDatabase, type Database } from "./lib/database.js";
import { adminRoutes } from "./routes/admin.js";
import { deviceRoutes } from "./routes/devices.js";
import { healthRoutes } from "./routes/health.js";
import { sourceRoutes } from "./routes/sources.js";

export type BuildAppOptions = { config: AppConfig; db?: Database; logger?: boolean };

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger === false ? false : { level: options.config.logLevel }, bodyLimit: 65536 });
  const db = options.db ?? createDatabase(options.config.databaseUrl);
  app.decorate("config", options.config);
  app.decorate("db", db);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || options.config.frontendOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Origem nao autorizada"), false);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(healthRoutes);
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(deviceRoutes, { prefix: "/api/v1" });
  await app.register(sourceRoutes, { prefix: "/api/v1" });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) return reply.code(400).send({ error: "validation_error", details: error.message });
    const prismaCode = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : null;
    if (error instanceof Prisma.PrismaClientKnownRequestError || prismaCode) {
      if (prismaCode === "P2002") return reply.code(409).send({ error: "already_exists" });
      if (prismaCode === "P2003" || prismaCode === "P2025") return reply.code(404).send({ error: "related_record_not_found" });
      if (prismaCode === "P1001" || prismaCode === "P1002" || prismaCode === "P1017" || prismaCode === "P2010") {
        return reply.code(503).send({ error: "database_unavailable" });
      }
    }
    app.log.error({ error }, "Erro nao tratado");
    return reply.code(500).send({ error: "internal_error" });
  });
  app.addHook("onClose", async () => db.$disconnect());
  return app;
}
