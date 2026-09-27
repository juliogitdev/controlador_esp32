import type { FastifyPluginAsync } from "fastify";
import { Prisma, type ReadingOrigin, type ReadingStatus, type SourceKind } from "@prisma/client";
import { authenticateSource } from "../lib/auth.js";

type SourceEvent = {
  protocolVersion: 1;
  eventId: string;
  sourceId: string;
  subjectId: string;
  kind: string;
  observedAt: string;
  validForMs: number;
  value: unknown;
  unit: string;
  status: ReadingStatus;
  origin: ReadingOrigin;
};

const definitions: Record<string, { unit: string; valid: (value: unknown) => boolean }> = {
  presence: { unit: "boolean", valid: (value) => typeof value === "boolean" },
  temperature: { unit: "C", valid: (value) => typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 200 },
  humidity: { unit: "%", valid: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 },
  voltage: { unit: "V", valid: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000 },
  current: { unit: "A", valid: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000 },
  climate_state: { unit: "state", valid: (value) => ["on", "off", "standby", "unknown"].includes(String(value)) },
};

export const sourceRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { sourceId: string }; Body: SourceEvent }>("/sources/:sourceId/events", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["sourceId"], properties: { sourceId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } } },
      body: { type: "object", additionalProperties: false, required: ["protocolVersion", "eventId", "sourceId", "subjectId", "kind", "observedAt", "validForMs", "value", "unit", "status", "origin"], properties: {
        protocolVersion: { const: 1 }, eventId: { type: "string", minLength: 1, maxLength: 64 },
        sourceId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" }, subjectId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
        kind: { type: "string", enum: Object.keys(definitions) }, observedAt: { type: "string", format: "date-time" },
        validForMs: { type: "integer", minimum: 1000, maximum: 300000 }, value: {}, unit: { type: "string", maxLength: 24 },
        status: { type: "string", enum: ["ok", "unavailable"] }, origin: { type: "string", enum: ["hardware", "simulated"] },
      } },
    },
  }, async (request, reply) => {
    const source = await authenticateSource(request, request.params.sourceId);
    if (!source) return reply.code(401).send({ error: "unauthorized" });
    const event = request.body;
    const definition = definitions[event.kind];
    if (!definition || event.sourceId !== source.id || event.kind !== source.kind || event.subjectId !== source.room.subjectId || event.unit !== definition.unit) {
      return reply.code(400).send({ error: "source_event_mismatch" });
    }
    if ((event.status === "ok" && !definition.valid(event.value)) || (event.status === "unavailable" && event.value !== null)) {
      return reply.code(400).send({ error: "invalid_sensor_value" });
    }
    const observedAt = new Date(event.observedAt);
    if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 300000) {
      return reply.code(400).send({ error: "invalid_observed_at" });
    }
    const existing = await app.db.reading.findUnique({ where: { eventId: event.eventId }, select: { sourceId: true } });
    if (existing) {
      if (existing.sourceId !== source.id) return reply.code(409).send({ error: "event_id_conflict" });
      return { accepted: true, eventId: event.eventId, duplicate: true };
    }
    await app.db.reading.create({ data: {
      eventId: event.eventId, sourceId: source.id, observedAt,
      validUntil: new Date(observedAt.getTime() + event.validForMs),
      value: event.value === null ? Prisma.JsonNull : event.value as Prisma.InputJsonValue,
      unit: event.unit, status: event.status, origin: event.origin,
    } });
    return reply.code(201).send({ accepted: true, eventId: event.eventId });
  });
};
