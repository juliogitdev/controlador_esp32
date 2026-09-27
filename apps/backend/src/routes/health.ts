import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    try {
      await app.db.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch (error) {
      app.log.error({ error }, "Falha na verificacao do banco");
      return reply.code(503).send({ status: "not_ready" });
    }
  });
};

