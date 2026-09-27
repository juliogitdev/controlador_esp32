import { describe, expect, it } from "vitest";
import { bearer, hashToken, tokenMatches } from "../src/lib/tokens.js";

describe("tokens", () => {
  it("gera hash deterministico sem armazenar o token", () => {
    const hash = hashToken("segredo", "pimenta");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("segredo");
    expect(tokenMatches("segredo", hash, "pimenta")).toBe(true);
    expect(tokenMatches("outro", hash, "pimenta")).toBe(false);
  });
  it("aceita apenas Bearer bem formado", () => {
    expect(bearer("Bearer abc")).toBe("abc");
    expect(bearer("Basic abc")).toBeNull();
    expect(bearer("Bearer a\nb")).toBeNull();
  });
});

