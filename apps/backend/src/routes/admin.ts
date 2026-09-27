import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "../lib/auth.js";
import { hashToken, newToken } from "../lib/tokens.js";
import { validateCommand } from "../lib/commands.js";

const idPattern = "^[A-Za-z0-9_-]{1,64}$";
const objectOnly = { type: "object", additionalProperties: false } as const;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireAdmin);

  app.get("/session", async () => ({ authenticated: true }));

  app.get("/departments", async () => app.db.department.findMany({ orderBy: { name: "asc" } }));
  app.post<{ Body: { name: string } }>("/departments", {
    schema: { body: { ...objectOnly, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    const department = await app.db.department.create({ data: { name } });
    return reply.code(201).send(department);
  });
  app.patch<{ Params: { departmentId: string }; Body: { name: string } }>("/departments/:departmentId", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["departmentId"], properties: { departmentId: { type: "string", format: "uuid" } } },
      body: { ...objectOnly, required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 100 } } },
    },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    return app.db.department.update({ where: { id: request.params.departmentId }, data: { name } });
  });

  app.get("/rooms", async () => {
    const rooms = await app.db.room.findMany({
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      include: { department: true, devices: { select: { id: true, name: true, enabled: true, lastSeenAt: true, intervalMs: true } }, sources: { select: { id: true, name: true, kind: true, enabled: true } } },
    });
    const now = Date.now();
    return rooms.map((room) => ({ ...room, devices: room.devices.map((device) => ({
      ...device, online: !!device.lastSeenAt && now - device.lastSeenAt.getTime() <= 2 * device.intervalMs + 15000,
    })) }));
  });
  app.get<{ Params: { roomId: string } }>("/rooms/:roomId", {
    schema: { params: { type: "object", additionalProperties: false, required: ["roomId"], properties: { roomId: { type: "string", format: "uuid" } } } },
  }, async (request, reply) => {
    const room = await app.db.room.findUnique({ where: { id: request.params.roomId }, include: {
      department: true,
      devices: { select: { id: true, name: true, enabled: true, lastSeenAt: true, intervalMs: true, firmwareVersion: true, telemetry: true } },
      sources: { include: { readings: { orderBy: { observedAt: "desc" }, take: 1 } } },
    } });
    if (!room) return reply.code(404).send({ error: "room_not_found" });
    const now = Date.now();
    return {
      ...room,
      devices: room.devices.map((device) => ({ ...device, online: !!device.lastSeenAt && now - device.lastSeenAt.getTime() <= 2 * device.intervalMs + 15000 })),
      sources: room.sources.map((source) => {
        const reading = source.readings[0] ?? null;
        return { id: source.id, name: source.name, kind: source.kind, enabled: source.enabled,
          reading: reading ? { ...reading, freshness: reading.validUntil.getTime() > now ? "valid" : "stale" } : null };
      }),
    };
  });
  app.post<{ Body: { subjectId: string; name: string; departmentId: string } }>("/rooms", {
    schema: { body: { ...objectOnly, required: ["subjectId", "name", "departmentId"], properties: {
      subjectId: { type: "string", pattern: idPattern }, name: { type: "string", minLength: 1, maxLength: 100 }, departmentId: { type: "string", format: "uuid" },
    } } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    const room = await app.db.room.create({ data: { subjectId: request.body.subjectId, name, departmentId: request.body.departmentId } });
    return reply.code(201).send(room);
  });
  app.patch<{ Params: { roomId: string }; Body: { subjectId: string; name: string; departmentId: string } }>("/rooms/:roomId", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["roomId"], properties: { roomId: { type: "string", format: "uuid" } } },
      body: { ...objectOnly, required: ["subjectId", "name", "departmentId"], properties: {
        subjectId: { type: "string", pattern: idPattern }, name: { type: "string", minLength: 1, maxLength: 100 }, departmentId: { type: "string", format: "uuid" },
      } },
    },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    return app.db.room.update({ where: { id: request.params.roomId }, data: { ...request.body, name } });
  });

  app.get("/devices", async () => app.db.device.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, enabled: true, roomId: true, firmwareVersion: true, lastBootId: true, lastSeenAt: true, createdAt: true, updatedAt: true },
  }));

  app.get("/dashboard", async () => {
    const now = new Date();
    const [rooms, activeDevices, pendingCommands, latestPresence] = await Promise.all([
      app.db.room.count(), app.db.device.findMany({ where: { enabled: true }, select: { lastSeenAt: true, intervalMs: true } }),
      app.db.command.count({ where: { status: { in: ["pending", "delivered", "capturing"] } } }),
      app.db.reading.findMany({
        where: { source: { kind: "presence", enabled: true }, status: "ok", validUntil: { gt: now } },
        distinct: ["sourceId"], orderBy: [{ sourceId: "asc" }, { observedAt: "desc" }], select: { sourceId: true, value: true },
      }),
    ]);
    const onlineDevices = activeDevices.filter((device) => device.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() <= 2 * device.intervalMs + 15000).length;
    return { rooms, devices: { total: activeDevices.length, online: onlineDevices, offline: activeDevices.length - onlineDevices },
      pendingCommands, occupiedSources: latestPresence.filter((reading) => reading.value === true).length,
      generatedAt: now.toISOString() };
  });
  app.post<{ Body: { id: string; name: string; roomId?: string | null } }>("/devices", {
    schema: { body: { ...objectOnly, required: ["id", "name"], properties: {
      id: { type: "string", pattern: idPattern }, name: { type: "string", minLength: 1, maxLength: 100 },
      roomId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
    } } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    const token = newToken();
    const device = await app.db.device.create({ data: {
      id: request.body.id, name, roomId: request.body.roomId ?? null,
      tokenHash: hashToken(token, app.config.tokenPepper),
    }, select: { id: true, name: true, roomId: true, enabled: true } });
    return reply.code(201).send({ device, token });
  });
  app.patch<{ Params: { deviceId: string }; Body: { name: string; roomId: string | null; enabled: boolean } }>("/devices/:deviceId", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["deviceId"], properties: { deviceId: { type: "string", pattern: idPattern } } },
      body: { ...objectOnly, required: ["name", "roomId", "enabled"], properties: {
        name: { type: "string", minLength: 1, maxLength: 100 }, enabled: { type: "boolean" },
        roomId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
      } },
    },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    return app.db.device.update({ where: { id: request.params.deviceId }, data: { ...request.body, name }, select: {
      id: true, name: true, roomId: true, enabled: true, firmwareVersion: true, lastBootId: true, lastSeenAt: true, createdAt: true, updatedAt: true,
    } });
  });
  app.post<{ Params: { deviceId: string } }>("/devices/:deviceId/token", {
    schema: { params: { type: "object", additionalProperties: false, required: ["deviceId"], properties: { deviceId: { type: "string", pattern: idPattern } } } },
  }, async (request) => {
    const token = newToken();
    await app.db.device.update({ where: { id: request.params.deviceId }, data: { tokenHash: hashToken(token, app.config.tokenPepper) } });
    return { id: request.params.deviceId, token };
  });

  app.get("/sources", async () => app.db.sensorSource.findMany({
    orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, enabled: true, roomId: true, createdAt: true },
  }));
  app.post<{ Body: { id: string; name: string; kind: "presence" | "temperature" | "humidity" | "voltage" | "current" | "climate_state"; roomId: string } }>("/sources", {
    schema: { body: { ...objectOnly, required: ["id", "name", "kind", "roomId"], properties: {
      id: { type: "string", pattern: idPattern }, name: { type: "string", minLength: 1, maxLength: 100 },
      kind: { type: "string", enum: ["presence", "temperature", "humidity", "voltage", "current", "climate_state"] },
      roomId: { type: "string", format: "uuid" },
    } } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    const token = newToken();
    const source = await app.db.sensorSource.create({ data: {
      ...request.body, name, tokenHash: hashToken(token, app.config.tokenPepper),
    }, select: { id: true, name: true, kind: true, roomId: true, enabled: true } });
    return reply.code(201).send({ source, token });
  });
  app.patch<{ Params: { sourceId: string }; Body: { name: string; kind: "presence" | "temperature" | "humidity" | "voltage" | "current" | "climate_state"; roomId: string; enabled: boolean } }>("/sources/:sourceId", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["sourceId"], properties: { sourceId: { type: "string", pattern: idPattern } } },
      body: { ...objectOnly, required: ["name", "kind", "roomId", "enabled"], properties: {
        name: { type: "string", minLength: 1, maxLength: 100 }, enabled: { type: "boolean" },
        kind: { type: "string", enum: ["presence", "temperature", "humidity", "voltage", "current", "climate_state"] },
        roomId: { type: "string", format: "uuid" },
      } },
    },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: "invalid_name" });
    return app.db.sensorSource.update({ where: { id: request.params.sourceId }, data: { ...request.body, name }, select: {
      id: true, name: true, kind: true, enabled: true, roomId: true, createdAt: true,
    } });
  });
  app.post<{ Params: { sourceId: string } }>("/sources/:sourceId/token", {
    schema: { params: { type: "object", additionalProperties: false, required: ["sourceId"], properties: { sourceId: { type: "string", pattern: idPattern } } } },
  }, async (request) => {
    const token = newToken();
    await app.db.sensorSource.update({ where: { id: request.params.sourceId }, data: { tokenHash: hashToken(token, app.config.tokenPepper) } });
    return { id: request.params.sourceId, token };
  });

  app.get<{ Querystring: { deviceId?: string } }>("/commands", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { deviceId: { type: "string", pattern: idPattern } } } },
  }, async (request) => {
    const rows = await app.db.command.findMany({ where: request.query.deviceId ? { deviceId: request.query.deviceId } : {}, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((row) => ({ ...row, sequence: row.sequence.toString() }));
  });
  app.post<{ Body: { id: string; deviceId: string; type: string; payload: Record<string, unknown>; expiresInSeconds?: number } }>("/commands", {
    schema: { body: { ...objectOnly, required: ["id", "deviceId", "type", "payload"], properties: {
      id: { type: "string", pattern: idPattern }, deviceId: { type: "string", pattern: idPattern },
      type: { type: "string", minLength: 1, maxLength: 48 }, payload: { type: "object" },
      expiresInSeconds: { type: "integer", minimum: 10, maximum: 3600, default: 300 },
    } } },
  }, async (request, reply) => {
    const invalid = validateCommand(request.body.type, request.body.payload);
    if (invalid) return reply.code(400).send({ error: invalid });
    const [device, max] = await Promise.all([
      app.db.device.findUniqueOrThrow({ where: { id: request.body.deviceId }, select: { lastSequence: true } }),
      app.db.command.aggregate({ where: { deviceId: request.body.deviceId }, _max: { sequence: true } }),
    ]);
    const watermark = device.lastSequence > (max._max.sequence ?? 0n) ? device.lastSequence : (max._max.sequence ?? 0n);
    const sequence = watermark + 1n;
    if (sequence > 4294967295n) return reply.code(409).send({ error: "sequence_exhausted" });
    const expiresAt = new Date(Date.now() + (request.body.expiresInSeconds ?? 300) * 1000);
    const command = await app.db.command.create({ data: {
      id: request.body.id, deviceId: request.body.deviceId, type: request.body.type,
      payload: request.body.payload as Prisma.InputJsonValue, sequence, expiresAt,
    } });
    return reply.code(201).send({ ...command, sequence: command.sequence.toString() });
  });
};
