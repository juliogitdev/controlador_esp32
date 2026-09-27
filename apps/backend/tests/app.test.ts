import { describe, expect, it, vi } from "vitest";
import type { Database } from "../src/lib/database.js";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";

const config: AppConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 3000, logLevel: "silent",
  databaseUrl: "postgresql://unused", frontendOrigins: ["http://localhost:5173"],
  adminApiToken: "a".repeat(32), tokenPepper: "b".repeat(32),
  supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test",
  adminEmails: ["admin@example.com"],
};

describe("aplicacao", () => {
  it("responde ao health check sem consultar o banco", async () => {
    const disconnect = vi.fn();
    const app = await buildApp({ config, logger: false, db: { $disconnect: disconnect } as unknown as Database });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("protege as rotas administrativas", async () => {
    const app = await buildApp({ config, logger: false, db: { $disconnect: vi.fn() } as unknown as Database });
    const response = await app.inject({ method: "GET", url: "/api/admin/departments" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
