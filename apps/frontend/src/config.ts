function required(name: string): string {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`Configuracao ausente: ${name}`);
  return value.replace(/\/$/, "");
}

export const config = {
  apiUrl: required("VITE_API_URL"),
  supabaseUrl: required("VITE_SUPABASE_URL"),
  supabasePublishableKey: required("VITE_SUPABASE_PUBLISHABLE_KEY"),
};

