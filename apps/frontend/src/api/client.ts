import { config } from "../config";
import { supabase } from "../lib/supabase";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Sessao encerrada. Entre novamente.", 401);
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    });
  } catch {
    throw new ApiError(`Não foi possível conectar à API (${config.apiUrl}). Verifique se o backend está em execução e se a URL está correta.`, 0);
  }
  const body = await response.json().catch(() => null) as { error?: string; details?: string } | null;
  const messages: Record<string, string> = {
    database_unavailable: "O backend está ativo, mas não conseguiu conectar ao banco Supabase.",
    forbidden: "Seu usuário está autenticado, mas não está autorizado como administrador.",
    unauthorized: "Sua sessão não foi aceita. Entre novamente.",
    already_exists: "Já existe um cadastro com esses dados.",
    related_record_not_found: "O registro relacionado não foi encontrado.",
    invalid_name: "Informe um nome válido.",
  };
  if (!response.ok) throw new ApiError((body?.error && messages[body.error]) || body?.details || body?.error || `Erro HTTP ${response.status}`, response.status);
  return body as T;
}
