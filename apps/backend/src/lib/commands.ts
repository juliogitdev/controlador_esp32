const identifier = /^[A-Za-z0-9_]{1,48}$/;
const environment = /^[A-Za-z0-9_-]{1,64}$/;

export function validateCommand(type: string, payload: Record<string, unknown>): string | null {
  for (const reserved of ["id", "seq", "bootId", "expiresAt", "type"]) {
    if (reserved in payload) return `reserved_field:${reserved}`;
  }
  if (type === "environment.create") {
    return typeof payload.name === "string" && payload.name.trim().length > 0 && Buffer.byteLength(payload.name.trim()) <= 64
      ? null : "invalid_environment_name";
  }
  if (type === "device.configure") {
    return Number.isInteger(payload.intervalMs) && Number(payload.intervalMs) >= 2000 && Number(payload.intervalMs) <= 60000
      ? null : "invalid_interval";
  }
  if (!["environment.delete", "ir.capture", "ir.send", "ir.delete", "climate.set"].includes(type)) return "unsupported_command";
  if (typeof payload.envId !== "string" || !environment.test(payload.envId)) return "invalid_environment";
  if (type === "environment.delete") return Object.keys(payload).length === 1 ? null : "invalid_environment_delete";
  if (type === "ir.capture" || type === "ir.send" || type === "ir.delete") {
    if (typeof payload.button !== "string" || !identifier.test(payload.button)) return "invalid_button";
    if (type === "ir.capture" && payload.timeoutMs !== undefined &&
        (!Number.isInteger(payload.timeoutMs) || Number(payload.timeoutMs) < 1000 || Number(payload.timeoutMs) > 60000)) return "invalid_timeout";
    if (type === "ir.capture" && payload.frequencyKhz !== undefined &&
        (!Number.isInteger(payload.frequencyKhz) || Number(payload.frequencyKhz) < 20 || Number(payload.frequencyKhz) > 60)) return "invalid_frequency";
    if (type === "ir.delete" && Object.keys(payload).length !== 2) return "invalid_ir_delete";
    return null;
  }
  if (typeof payload.presetId === "string") {
    return identifier.test(payload.presetId) && !("power" in payload || "temperature" in payload || "mode" in payload || "fan" in payload)
      ? null : "invalid_or_ambiguous_preset";
  }
  if (typeof payload.power !== "boolean" || "fan" in payload) return "invalid_climate_request";
  if (payload.power === false) return "temperature" in payload || "mode" in payload ? "invalid_off_request" : null;
  return Number.isInteger(payload.temperature) && Number(payload.temperature) >= 16 && Number(payload.temperature) <= 30 && payload.mode === "cool"
    ? null : "invalid_cool_request";
}
