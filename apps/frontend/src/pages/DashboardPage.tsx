import { Link } from "react-router-dom";
import type { Dashboard } from "../api/types";
import { PageState } from "../components/Status";
import { useApi } from "../hooks/useApi";

export function DashboardPage() {
  const { data, error, loading, reload } = useApi<Dashboard>("/api/admin/dashboard");
  return <>
    <div className="page-heading"><div><p className="eyebrow">Visão geral</p><h1>Monitoramento dos ambientes</h1><p>Resumo dos dados atualmente disponíveis no sistema.</p></div><button className="button secondary" onClick={() => void reload()}>Atualizar</button></div>
    {loading && !data ? <PageState>Carregando resumo…</PageState> : error ? <PageState error>{error}</PageState> : data && <>
      <section className="summary-grid" aria-label="Resumo">
        <article><span>Ambientes</span><strong>{data.rooms}</strong><small>cadastrados</small></article>
        <article><span>Controladores online</span><strong>{data.devices.online}</strong><small>de {data.devices.total} ativos</small></article>
        <article><span>Fontes com presença</span><strong>{data.occupiedSources}</strong><small>leituras válidas</small></article>
        <article><span>Comandos pendentes</span><strong>{data.pendingCommands}</strong><small>aguardando resultado</small></article>
      </section>
      {data.devices.offline > 0 && <div className="notice warning"><strong>Atenção:</strong> {data.devices.offline} controlador(es) sem comunicação recente.</div>}
      <section className="section-block"><div><h2>Acompanhamento</h2><p>Consulte sensores, controladores e comandos associados a cada sala.</p></div><Link className="button primary" to="/ambientes">Ver ambientes</Link></section>
      <p className="timestamp">Resumo gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}</p>
    </>}
  </>;
}

