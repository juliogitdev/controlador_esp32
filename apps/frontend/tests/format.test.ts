import { describe, expect, it } from "vitest";
import { profilesFromTelemetry, readingValue } from "../src/lib/format";

describe("formatacao de dados", () => {
  it("diferencia presenca falsa de indisponibilidade", () => {
    expect(readingValue("presence", false, "boolean")).toBe("Não detectada");
    expect(readingValue("presence", null, "boolean")).toBe("Indisponível");
  });
  it("extrai somente perfis IR validos da telemetria", () => {
    expect(profilesFromTelemetry({ environments: [{ id: "env_1", name: "Ar Lab", buttons: ["power_off", 2] }] })).toEqual([
      { id: "env_1", name: "Ar Lab", buttons: ["power_off"] },
    ]);
    expect(profilesFromTelemetry(null)).toEqual([]);
  });
});

