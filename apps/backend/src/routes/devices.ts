import type { FastifyPluginAsync } from "fastify";
import { Prisma, type CommandStatus } from "@prisma/client";
import { authenticateDevice } from "../lib/auth.js";

type Ack = { id: string; seq: number; status: string; [key: string]: unknown };
type Exchange = {
  protocolVersion: 1;
  role: "climate_actuator";
  deviceId: string;
  bootId: string;
  firmwareVersion: string;
  timestamp: number;
  uptimeMs: number;
  wifiRssi: number;
  storageReady: boolean;
  intervalMs: number;
  lastSequence: number;
  capabilities: Record<string, unknown>;
  environments: unknown[];
  ack: Ack | null;
};

const terminal = new Set<CommandStatus>(["completed", "failed", "rejected", "unknown_after_restart"]);

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { deviceId: string }; Body: Exchange }>("/devices/:deviceId/exchange", {
    bodyLimit: 32768,
    schema: {
      params: { type: "object", additionalProperties: false, required: ["deviceId"], properties: { deviceId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" } } },
      body: { type: "object", additionalProperties: true, required: ["protocolVersion", "role", "deviceId", "bootId", "firmwareVersion", "timestamp", "uptimeMs", "wifiRssi", "storageReady", "intervalMs", "lastSequence", "capabilities", "environments", "ack"], properties: {
        protocolVersion: { const: 1 }, role: { const: "climate_actuator" }, deviceId: { type: "string" },
        bootId: { type: "string", minLength: 1, maxLength: 64 }, firmwareVersion: { type: "string", minLength: 1, maxLength: 32 },
        timestamp: { type: "integer", minimum: 1 }, uptimeMs: { type: "integer", minimum: 0 }, wifiRssi: { type: "integer", minimum: -150, maximum: 20 },
        storageReady: { type: "boolean" }, intervalMs: { type: "integer", minimum: 2000, maximum: 60000 },
        lastSequence: { type: "integer", minimum: 0, maximum: 4294967295 }, capabilities: { type: "object" }, environments: { type: "array", maxItems: 12 },
        ack: { anyOf: [{ type: "null" }, { type: "object", required: ["id", "seq", "status"], properties: {
          id: { type: "string", minLength: 1, maxLength: 64 }, seq: { type: "integer", minimum: 1, maximum: 4294967295 },
          status: { type: "string", enum: ["completed", "failed", "rejected", "unknown_after_restart"] },
        } }] },
      } },
    },
  }, async (request, reply) => {
    const device = await authenticateDevice(request, request.params.deviceId);
    if (!device) return reply.code(401).send({ error: "unauthorized" });
    const body = request.body;
    if (body.deviceId !== device.id) return reply.code(400).send({ error: "device_id_mismatch" });

    const response = await app.db.$transaction(async (tx) => {
      let ackId: string | null = null;
      if (body.ack) {
        const status = body.ack.status as CommandStatus;
        const command = await tx.command.findUnique({ where: { id: body.ack.id } });
        const validBoot = status === "unknown_after_restart" || command?.bootId === body.bootId;
        if (command && command.deviceId === device.id && command.sequence === BigInt(body.ack.seq) &&
            (command.status === "delivered" || command.status === "capturing") && terminal.has(status) && validBoot) {
          await tx.command.update({ where: { id: command.id }, data: {
            status, result: body.ack as Prisma.InputJsonValue, completedAt: new Date(),
          } });
          ackId = command.id;
        }
      }

      await tx.device.update({ where: { id: device.id }, data: {
        firmwareVersion: body.firmwareVersion, lastBootId: body.bootId, lastSeenAt: new Date(), intervalMs: body.intervalMs,
        lastSequence: BigInt(body.lastSequence) > device.lastSequence ? BigInt(body.lastSequence) : device.lastSequence,
        telemetry: body as unknown as Prisma.InputJsonValue,
      } });

      await tx.command.updateMany({
        where: { deviceId: device.id, status: "pending", expiresAt: { lte: new Date() } }, data: { status: "expired" },
      });
      await tx.command.updateMany({
        where: { deviceId: device.id, status: "delivered", bootId: { not: body.bootId } },
        data: { status: "unknown_after_restart", completedAt: new Date() },
      });
      const command = await tx.command.findFirst({
        where: { deviceId: device.id, OR: [{ status: "pending" }, { status: "delivered", bootId: body.bootId }] },
        orderBy: { sequence: "asc" },
      });
      if (!command) return { ackId, command: null };
      if (command.status === "pending") {
        await tx.command.update({ where: { id: command.id }, data: { status: "delivered", bootId: body.bootId, deliveredAt: new Date() } });
      }
      const payload = command.payload as Record<string, unknown>;
      return { ackId, command: {
        ...payload, id: command.id, seq: Number(command.sequence), bootId: body.bootId,
        expiresAt: Math.floor(command.expiresAt.getTime() / 1000), type: command.type,
      } };
    });
    return { protocolVersion: 1, deviceId: device.id, bootId: body.bootId, ...response };
  });
};
