export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  frontendOrigins: string[];
  supabaseUrl: string;
  supabasePublishableKey: string;
  adminEmails: string[];
  adminApiToken: string;
  tokenPepper: string;
};

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Variavel de ambiente obrigatoria: ${name}`);
  return value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!(["development", "test", "production"] as const).includes(nodeEnv as never)) {
    throw new Error("NODE_ENV deve ser development, test ou production");
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT invalida");
  const adminApiToken = required("ADMIN_API_TOKEN", env.ADMIN_API_TOKEN);
  const tokenPepper = required("TOKEN_PEPPER", env.TOKEN_PEPPER);
  if (adminApiToken.length < 32 || tokenPepper.length < 32) {
    throw new Error("ADMIN_API_TOKEN e TOKEN_PEPPER devem ter ao menos 32 caracteres");
  }
  const origins = required("FRONTEND_ORIGIN", env.FRONTEND_ORIGIN)
    .split(",").map((item) => item.trim()).filter(Boolean);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!(["http:", "https:"] as const).includes(parsed.protocol as never) || parsed.origin !== origin) {
      throw new Error(`Origem de frontend invalida: ${origin}`);
    }
  }
  const supabaseUrl = required("SUPABASE_URL", env.SUPABASE_URL).replace(/\/$/, "");
  const parsedSupabaseUrl = new URL(supabaseUrl);
  if (parsedSupabaseUrl.protocol !== "https:" || parsedSupabaseUrl.origin !== supabaseUrl) {
    throw new Error("SUPABASE_URL deve ser uma origem HTTPS");
  }
  const adminEmails = required("ADMIN_EMAILS", env.ADMIN_EMAILS)
    .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("ADMIN_EMAILS contem um endereco invalido");
  }
  const databaseUrl = required("DATABASE_URL", env.DATABASE_URL);
  if (/PROJECT_REF|POOLER_HOST|SENHA|placeholder/i.test(databaseUrl)) {
    throw new Error("DATABASE_URL ainda contem valores de exemplo; copie a URI Session pooler do Supabase");
  }
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL invalida; mantenha cada variavel em uma linha e codifique caracteres reservados da senha");
  }
  if (!(["postgresql:", "postgres:"] as const).includes(parsedDatabaseUrl.protocol as never) ||
      !parsedDatabaseUrl.hostname || !parsedDatabaseUrl.username || !parsedDatabaseUrl.pathname.slice(1)) {
    throw new Error("DATABASE_URL deve ser uma URI PostgreSQL completa");
  }
  return {
    nodeEnv: nodeEnv as AppConfig["nodeEnv"],
    host: env.HOST?.trim() || "0.0.0.0",
    port,
    logLevel: env.LOG_LEVEL?.trim() || "info",
    databaseUrl,
    frontendOrigins: origins,
    supabaseUrl,
    supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY", env.SUPABASE_PUBLISHABLE_KEY),
    adminEmails,
    adminApiToken,
    tokenPepper,
  };
}
