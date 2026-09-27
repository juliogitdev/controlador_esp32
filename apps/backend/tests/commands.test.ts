import { describe, expect, it } from "vitest";
import { validateCommand } from "../src/lib/commands.js";

describe("validacao de comandos", () => {
  it("aceita os comandos climate.set usados pelo firmware", () => {
    expect(validateCommand("climate.set", { envId: "env_1", presetId: "cool_24" })).toBeNull();
    expect(validateCommand("climate.set", { envId: "env_1", power: false })).toBeNull();
    expect(validateCommand("climate.set", { envId: "env_1", power: true, mode: "cool", temperature: 24 })).toBeNull();
  });
  it("rejeita solicitacao ambigua ou fora do contrato", () => {
    expect(validateCommand("climate.set", { envId: "env_1", presetId: "cool_24", power: true })).toBe("invalid_or_ambiguous_preset");
    expect(validateCommand("climate.set", { envId: "env_1", power: true, mode: "heat", temperature: 24 })).toBe("invalid_cool_request");
    expect(validateCommand("desconhecido", {})).toBe("unsupported_command");
  });
  it("impede sobrescrever campos controlados pelo servidor", () => {
    expect(validateCommand("ir.send", { envId: "env_1", button: "power_off", seq: 10 })).toBe("reserved_field:seq");
  });
  it("valida exclusoes de perfis e estados IR", () => {
    expect(validateCommand("ir.delete", { envId: "env_1", button: "cool_24" })).toBeNull();
    expect(validateCommand("environment.delete", { envId: "env_1" })).toBeNull();
    expect(validateCommand("ir.delete", { envId: "env_1", button: "cool-24" })).toBe("invalid_button");
    expect(validateCommand("environment.delete", { envId: "env_1", extra: true })).toBe("invalid_environment_delete");
  });
});
