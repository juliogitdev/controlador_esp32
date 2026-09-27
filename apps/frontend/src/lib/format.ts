export function formatDate(value: string | null): string {
  if (!value) return "Sem comunicação";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

export function readingValue(kind: string, value: unknown, unit: string): string {
  if (value === null || value === undefined) return "Indisponível";
  if (kind === "presence") return value === true ? "Detectada" : "Não detectada";
  if (kind === "climate_state") return ({ on: "Ligado", off: "Desligado", standby: "Em espera", unknown: "Desconhecido" } as Record<string, string>)[String(value)] ?? String(value);
  if (typeof value === "number") return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  return String(value);
}

export type IrProfile = { id: string; name: string; buttons: string[] };
export function profilesFromTelemetry(value: unknown): IrProfile[] {
  if (!value || typeof value !== "object") return [];
  const environments = (value as { environments?: unknown }).environments;
  if (!Array.isArray(environments)) return [];
  return environments.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; name?: unknown; buttons?: unknown };
    if (typeof row.id !== "string") return [];
    return [{ id: row.id, name: typeof row.name === "string" ? row.name : row.id,
      buttons: Array.isArray(row.buttons) ? row.buttons.filter((button): button is string => typeof button === "string") : [] }];
  });
}

