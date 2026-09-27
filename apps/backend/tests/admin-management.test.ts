import { describe, expect, it, vi } from "vitest";
import type { Database } from "../src/lib/database.js";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";

const adminToken = "a".repeat(32);
const config: AppConfig = {
  nodeEnv: "test", host: "127.0.0.1", port: 3000, logLevel: "silent",
  databaseUrl: "postgresql://unused", frontendOrigins: ["http://localhost:5173"],
  adminApiToken: adminToken, tokenPepper: "b".repeat(32),
  supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test",
  adminEmails: ["admin@example.com"],
};

describe("gestao administrativa", () => {
  it("edita e desativa um controlador sem alterar seu identificador", async () => {
    const update = vi.fn().mockResolvedValue({ id: "esp32-test", name: "Sala 2", enabled: false, roomId: null });
    const db = { device: { update }, $disconnect: vi.fn() } as unknown as Database;
    const app = await buildApp({ config, logger: false, db });
    const response = await app.inject({
      method: "PATCH", url: "/api/admin/devices/esp32-test",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: " Sala 2 ", roomId: null, enabled: false },
    });
    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "esp32-test" }, data: { name: "Sala 2", roomId: null, enabled: false },
    }));
    await app.close();
  });

  it("renova o token sem devolver seu hash", async () => {
    const update = vi.fn().mockResolvedValue({ id: "sensor-test" });
    const db = { sensorSource: { update }, $disconnect: vi.fn() } as unknown as Database;
    const app = await buildApp({ config, logger: false, db });
    const response = await app.inject({
      method: "POST", url: "/api/admin/sources/sensor-test/token",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "sensor-test", token: expect.any(String) });
    expect(response.json().token.length).toBeGreaterThanOrEqual(32);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sensor-test" }, data: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    }));
    await app.close();
  });
});
