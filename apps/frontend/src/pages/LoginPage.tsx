import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!loading && session) return <Navigate to={(location.state as { from?: string } | null)?.from || "/"} replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError("E-mail ou senha inválidos.");
    setSubmitting(false);
  };
  return <main className="login-page">
    <section className="login-panel" aria-labelledby="login-title">
      <div className="login-heading"><span className="brand-mark">IF</span><div><p>IFSertãoPE</p><h1 id="login-title">Gerenciador de climatização</h1></div></div>
      <p className="muted">Acesso administrativo ao monitoramento dos ambientes.</p>
      <form onSubmit={submit}>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={submitting}>{submitting ? "Entrando…" : "Entrar"}</button>
      </form>
    </section>
  </main>;
}

