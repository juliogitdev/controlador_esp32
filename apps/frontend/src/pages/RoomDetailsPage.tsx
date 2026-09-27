import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Command, RoomDetails } from "../api/types";
import { PageState, StatusBadge } from "../components/Status";
import { useApi } from "../hooks/useApi";
import { formatDate, profilesFromTelemetry, readingValue } from "../lib/format";

const kindLabels: Record<string, string> = { temperature: "Temperatura", humidity: "Umidade", presence: "Presença", voltage: "Tensão", current: "Corrente", climate_state: "Estado observado" };
const commandLabels: Record<string, string> = { pending: "Pendente", delivered: "Entregue", capturing: "Capturando", completed: "Transmitido", failed: "Falhou", rejected: "Rejeitado", unknown_after_restart: "Resultado incerto", expired: "Expirado" };

export function RoomDetailsPage() {
  const { roomId = "" } = useParams();
  const { data: room, error, loading, reload } = useApi<RoomDetails>(`/api/admin/rooms/${roomId}`);
  const [deviceId, setDeviceId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [preset, setPreset] = useState("");
  const [commands, setCommands] = useState<Command[]>([]);
  const [actionState, setActionState] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => { if (room?.devices.length && !deviceId) setDeviceId(room.devices[0]!.id); }, [room, deviceId]);
  const device = room?.devices.find((item) => item.id === deviceId);
  const profiles = useMemo(() => profilesFromTelemetry(device?.telemetry), [device]);
  useEffect(() => {
    if (!profiles.some((item) => item.id === profileId)) setProfileId(profiles[0]?.id ?? "");
  }, [profiles, profileId]);
  const profile = profiles.find((item) => item.id === profileId);
  const usablePresets = profile?.buttons.filter((button) => button === "power_on" || button === "power_off" || button.startsWith("cool_")) ?? [];
  useEffect(() => { if (!usablePresets.includes(preset)) setPreset(usablePresets.find((item) => item.startsWith("cool_")) ?? usablePresets[0] ?? ""); }, [usablePresets, preset]);
  const loadCommands = async (id: string) => {
    try { setCommands(await api<Command[]>(`/api/admin/commands?deviceId=${encodeURIComponent(id)}`)); } catch { setCommands([]); }
  };
  useEffect(() => { if (deviceId) void loadCommands(deviceId); }, [deviceId]);
  const sendPreset = async (selected: string) => {
    if (!device || !profileId || !selected) return;
    setSending(true); setActionState("");
    try {
      await api<Command>("/api/admin/commands", { method: "POST", body: JSON.stringify({
        id: crypto.randomUUID(), deviceId: device.id, type: "climate.set", payload: { envId: profileId, presetId: selected }, expiresInSeconds: 300,
      }) });
      setActionState("Comando criado. Aguardando o próximo contato do controlador.");
      await loadCommands(device.id);
    } catch (reason) { setActionState(reason instanceof Error ? reason.message : "Falha ao criar comando."); }
    finally { setSending(false); }
  };
  if (loading && !room) return <PageState>Carregando ambiente…</PageState>;
  if (error || !room) return <PageState error>{error || "Ambiente não encontrado."}</PageState>;
  return <>
    <Link className="back-link" to="/ambientes">← Ambientes</Link>
    <div className="page-heading"><div><p className="eyebrow">{room.department.name}</p><h1>{room.name}</h1><p>Identificador: {room.subjectId}</p></div><button className="button secondary" onClick={() => void reload()}>Atualizar</button></div>
    <section className="readings-grid" aria-label="Leituras atuais">
      {room.sources.length ? room.sources.map((source) => {
        const unavailable = !source.reading || source.reading.status !== "ok" || source.reading.freshness === "stale";
        return <article key={source.id}><span>{kindLabels[source.kind] ?? source.name}</span><strong>{unavailable ? "Indisponível" : readingValue(source.kind, source.reading!.value, source.reading!.unit)}</strong><small>{source.reading ? `${source.reading.origin === "simulated" ? "Simulada" : "Hardware"} · ${source.reading.freshness === "stale" ? "Leitura vencida" : formatDate(source.reading.observedAt)}` : "Sem leitura"}</small></article>;
      }) : <PageState>Nenhuma fonte associada.</PageState>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Controle do ar-condicionado</h2><p>Os comandos abaixo confirmam apenas a transmissão IR.</p></div>{device && <StatusBadge tone={device.online ? "ok" : "neutral"}>{device.online ? "Controlador online" : "Controlador offline"}</StatusBadge>}</div>
      {!room.devices.length ? <PageState>Nenhum controlador associado.</PageState> : <div className="control-form">
        <label>Controlador<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{room.devices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Perfil IR<select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!profiles.length}>{profiles.length ? profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>) : <option>Nenhum perfil recebido</option>}</select></label>
        <label>Estado aprendido<select value={preset} onChange={(event) => setPreset(event.target.value)} disabled={!usablePresets.length}>{usablePresets.length ? usablePresets.map((item) => <option value={item} key={item}>{item}</option>) : <option>Nenhum estado disponível</option>}</select></label>
        <div className="control-actions"><button className="button primary" disabled={sending || !device?.online || !preset} onClick={() => void sendPreset(preset)}>{sending ? "Enviando…" : "Enviar estado"}</button><button className="button danger" disabled={sending || !device?.online || !profile?.buttons.includes("power_off")} onClick={() => void sendPreset("power_off")}>Desligar</button></div>
        {actionState && <p className="action-message" role="status">{actionState}</p>}
      </div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Comandos recentes</h2><p>Resultados informados pelo firmware.</p></div></div>
      {!commands.length ? <PageState>Nenhum comando registrado para este controlador.</PageState> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Estado</th><th>Sequência</th></tr></thead><tbody>{commands.slice(0, 20).map((command) => <tr key={command.id}><td>{formatDate(command.createdAt)}</td><td>{command.type}</td><td>{commandLabels[command.status] ?? command.status}</td><td>{command.sequence}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

