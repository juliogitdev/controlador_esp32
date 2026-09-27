import { describe, expect, it, vi } from "vitest";
import { verifySupabaseUser } from "../src/lib/auth.js";
import type { AppConfig } from "../src/config/env.js";

const config = {
  supabaseUrl: "https://project.supabase.co", supabasePublishableKey: "sb_publishable_test",
} as AppConfig;

describe("Supabase Auth", () => {
  it("aceita usuario retornado pelo Auth", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "user-1", email: "admin@example.com" }), { status: 200 }));
    await expect(verifySupabaseUser("jwt", config, fetcher)).resolves.toEqual({ id: "user-1", email: "admin@example.com" });
    expect(fetcher).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/user", expect.objectContaining({
      headers: { apikey: "sb_publishable_test", Authorization: "Bearer jwt" },
    }));
  });
  it("rejeita token recusado pelo Auth", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    await expect(verifySupabaseUser("invalido", config, fetcher)).resolves.toBeNull();
  });
});
