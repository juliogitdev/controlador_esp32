import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

const valid = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://user:password@localhost:5432/test", FRONTEND_ORIGIN: "http://localhost:5173",
  ADMIN_API_TOKEN: "a".repeat(32), TOKEN_PEPPER: "b".repeat(32),
  SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ADMIN_EMAILS: "admin@example.com",
};

describe("configuracao", () => {
  it("carrega valores validos", () => {
    const config = loadConfig(valid);
    expect(config.port).toBe(3000);
    expect(config.frontendOrigins).toEqual(["http://localhost:5173"]);
  });
  it("rejeita segredos curtos", () => {
    expect(() => loadConfig({ ...valid, ADMIN_API_TOKEN: "curto" })).toThrow(/32 caracteres/);
  });
  it("rejeita origem com caminho", () => {
    expect(() => loadConfig({ ...valid, FRONTEND_ORIGIN: "http://localhost:5173/path" })).toThrow(/Origem/);
  });
  it("rejeita a URL de exemplo do banco", () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: "postgresql://user:SENHA@POOLER_HOST:5432/postgres" })).toThrow(/valores de exemplo/);
  });
  it("rejeita URL malformada ou variaveis concatenadas", () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: '\"postgresql://user:pass@host:5432/db\"FRONTEND_ORIGIN=http://localhost:5173' })).toThrow(/DATABASE_URL invalida/);
  });
});
