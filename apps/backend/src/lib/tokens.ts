import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string, pepper: string): string {
  return createHash("sha256").update(pepper).update("\0").update(token).digest("hex");
}

export function tokenMatches(token: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashToken(token, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function secretMatches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function bearer(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  return token && !/[\r\n]/.test(token) ? token : null;
}

