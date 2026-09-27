import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<T>(path)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha inesperada"); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

