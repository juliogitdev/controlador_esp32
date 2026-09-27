export type Dashboard = {
  rooms: number;
  devices: { total: number; online: number; offline: number };
  pendingCommands: number;
  occupiedSources: number;
  generatedAt: string;
};

export type Department = { id: string; name: string };
export type DeviceListItem = {
  id: string; name: string; enabled: boolean; roomId: string | null;
  firmwareVersion: string | null; lastSeenAt: string | null; createdAt: string; updatedAt: string;
};
export type SourceListItem = {
  id: string; name: string; kind: string; enabled: boolean; roomId: string; createdAt: string;
};
export type RoomListItem = {
  id: string; subjectId: string; name: string; department: Department;
  devices: Array<{ id: string; name: string; enabled: boolean; lastSeenAt: string | null; intervalMs: number; online: boolean }>;
  sources: Array<{ id: string; name: string; kind: string; enabled: boolean }>;
};
export type Reading = {
  id: string; value: unknown; unit: string; status: "ok" | "unavailable";
  origin: "hardware" | "simulated"; observedAt: string; validUntil: string; freshness: "valid" | "stale";
};
export type Device = {
  id: string; name: string; enabled: boolean; online: boolean; lastSeenAt: string | null;
  firmwareVersion: string | null; intervalMs: number; telemetry: unknown;
};
export type RoomDetails = {
  id: string; subjectId: string; name: string; department: Department;
  devices: Device[];
  sources: Array<{ id: string; name: string; kind: string; enabled: boolean; reading: Reading | null }>;
};
export type Command = {
  id: string; deviceId: string; sequence: string; type: string; status: string;
  payload: Record<string, unknown>; result: unknown; createdAt: string; expiresAt: string;
};
