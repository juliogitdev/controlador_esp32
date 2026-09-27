import type { FastifyReply, FastifyRequest } from "fastify";
import { bearer, secretMatches, tokenMatches } from "./tokens.js";

type SupabaseUser = { id: string; email?: string };

export async function verifySupabaseUser(
  token: string,
  config: FastifyRequest["server"]["config"],
  fetcher: typeof fetch = fetch,
): Promise<SupabaseUser | null> {
  try {
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const user = await response.json() as SupabaseUser;
    return typeof user.id === "string" ? user : null;
  } catch {
    return null;
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearer(request.headers.authorization);
  if (!token) return void await reply.code(401).send({ error: "unauthorized" });
  if (secretMatches(token, request.server.config.adminApiToken)) return;
  const user = await verifySupabaseUser(token, request.server.config);
  const email = user?.email?.toLowerCase();
  if (!email || !request.server.config.adminEmails.includes(email)) {
    await reply.code(403).send({ error: "forbidden" });
  }
}

export async function authenticateDevice(request: FastifyRequest, deviceId: string) {
  const token = bearer(request.headers.authorization);
  if (!token) return null;
  const device = await request.server.db.device.findUnique({ where: { id: deviceId } });
  if (!device?.enabled || !tokenMatches(token, device.tokenHash, request.server.config.tokenPepper)) return null;
  return device;
}

export async function authenticateSource(request: FastifyRequest, sourceId: string) {
  const token = bearer(request.headers.authorization);
  if (!token) return null;
  const source = await request.server.db.sensorSource.findUnique({ where: { id: sourceId }, include: { room: true } });
  if (!source?.enabled || !tokenMatches(token, source.tokenHash, request.server.config.tokenPepper)) return null;
  return source;
}
