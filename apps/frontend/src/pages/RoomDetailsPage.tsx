import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Command, RoomDetails } from "../api/types";
import { PageState, StatusBadge } from "../components/Status";
import { useApi } from "../hooks/useApi";
import { formatDate, profilesFromTelemetry, readingValue } from "../lib/format";

const kindLabels: Record<string, string> = { temperature: "Temperatura", humidity: "Umidade", presence: "Presença", voltage: "Tensão", current: "Corrente", climate_state: "Estado observado" };
const commandLabels: Record<string, string> = { pending: "Pendente", delivered: "Entregue", capturing: "Capturando", completed: "Concluído", failed: "Falhou", rejected: "Rejeitado", unknown_after_restart: "Resultado incerto", expired: "Expirado" };

export function RoomDetailsPage() {
  const { roomId = "" } = useParams();
  const { data: room, error, loading, reload } = useApi<RoomDetails>(`/api/admin/rooms/${roomId}`);
  const [deviceId, setDeviceId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [preset, setPreset] = useState("");
  const [commands, setCommands] = useState<Command[]>([]);
  const [actionState, setActionState] = useState("");
  const [sending, setSending] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [newPreset, setNewPreset] = useState("");
  const [frequencyKhz, setFrequencyKhz] = useState(38);
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
  const queueCommand = async (type: string, payload: Record<string, unknown>, success: string, expiresInSeconds = 300) => {
    if (!device) return;
    setSending(true); setActionState("");
    try {
      await api<Command>("/api/admin/commands", { method: "POST", body: JSON.stringify({
        id: crypto.randomUUID(), deviceId: device.id, type, payload, expiresInSeconds,
      }) });
      setActionState(success);
      await loadCommands(device.id);
    } catch (reason) { setActionState(reason instanceof Error ? reason.message : "Falha ao criar comando."); }
    finally { setSending(false); }
  };
  const sendPreset = (selected: string) => queueCommand("climate.set", { envId: profileId, presetId: selected }, "Comando criado. Aguardando o próximo contato do controlador.");
  const createProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    void queueCommand("environment.create", { name }, "Criação solicitada. Atualize a página após a conclusão.");
    setProfileName("");
  };
  const capturePreset = () => {
    const button = newPreset.trim();
    if (!profileId || !button) return;
    void queueCommand("ir.capture", { envId: profileId, button, frequencyKhz, timeoutMs: 30000 },
      "Captura armada. Aponte o controle original para o receptor e pressione o botão desejado durante os próximos 30 segundos.", 90);
  };
  const deletePreset = (button: string) => {
    if (!window.confirm(`Excluir definitivamente o estado IR “${button}” do ESP32?`)) return;
    void queueCommand("ir.delete", { envId: profileId, button }, "Exclusão solicitada. Atualize após a conclusão.");
  };
  const deleteProfile = () => {
    if (!profile || !window.confirm(`Excluir o perfil “${profile.name}” e todos os sinais IR armazenados nele?`)) return;
    void queueCommand("environment.delete", { envId: profile.id }, "Exclusão do perfil solicitada. Atualize após a conclusão.");
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
    <section className="panel"><div className="panel-heading"><div><h2>Aprendizado e testes de IR</h2><p>Crie um perfil para o aparelho, grave sinais do controle original e teste a emissão.</p></div>{device && <StatusBadge tone={device.online ? "ok" : "neutral"}>{device.online ? "Controlador online" : "Controlador offline"}</StatusBadge>}</div>
      {!room.devices.length ? <PageState>Nenhum controlador associado.</PageState> : <div className="ir-manager">
        <label>Controlador<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{room.devices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div className="ir-create-row"><label>Nome do novo perfil<input value={profileName} maxLength={64} onChange={(event) => setProfileName(event.target.value)} placeholder="Ex.: Ar-condicionado Lab 1" /></label><button className="button secondary" disabled={sending || !device?.online || !profileName.trim()} onClick={createProfile}>Criar perfil</button></div>
        <div className="ir-profile-heading"><label>Perfil IR<select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!profiles.length}>{profiles.length ? profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>) : <option>Nenhum perfil recebido</option>}</select></label><button className="button danger" disabled={sending || !device?.online || !profile} onClick={deleteProfile}>Excluir perfil</button></div>
        {profile && <>
          <div className="capture-form"><label>Nome técnico do estado<input value={newPreset} maxLength={48} pattern="[A-Za-z0-9_]{1,48}" onChange={(event) => setNewPreset(event.target.value)} placeholder="Ex.: cool_24 ou power_off" /></label><label>Portadora (kHz)<input type="number" min={20} max={60} value={frequencyKhz} onChange={(event) => setFrequencyKhz(Number(event.target.value))} /></label><button className="button primary" disabled={sending || !device?.online || !/^[A-Za-z0-9_]{1,48}$/.test(newPreset) || frequencyKhz < 20 || frequencyKhz > 60} onClick={capturePreset}>Gravar sinal</button></div>
          <p className="capture-help">Ao gravar, a captura substituirá um estado de mesmo nome. Tenha o controle original apontado para o receptor IR.</p>
          {!profile.buttons.length ? <PageState>Nenhum estado IR gravado neste perfil.</PageState> : <div className="table-wrap"><table><thead><tr><th>Estado salvo</th><th>Ações</th></tr></thead><tbody>{profile.buttons.map((button) => <tr key={button}><td><code>{button}</code></td><td><div className="table-actions"><button className="table-action" disabled={sending || !device?.online} onClick={() => void queueCommand("ir.send", { envId: profile.id, button }, "Emissão solicitada. Confira o resultado nos comandos recentes.")}>Testar emissão</button><button className="table-action danger-link" disabled={sending || !device?.online} onClick={() => deletePreset(button)}>Excluir</button></div></td></tr>)}</tbody></table></div>}
        </>}
        {actionState && <p className="action-message" role="status">{actionState}</p>}
      </div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Controle do ar-condicionado</h2><p>Os comandos abaixo confirmam apenas a transmissão IR.</p></div>{device && <StatusBadge tone={device.online ? "ok" : "neutral"}>{device.online ? "Controlador online" : "Controlador offline"}</StatusBadge>}</div>
      {!room.devices.length ? <PageState>Nenhum controlador associado.</PageState> : <div className="control-form">
        <label>Controlador<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{room.devices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Perfil IR<select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!profiles.length}>{profiles.length ? profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>) : <option>Nenhum perfil recebido</option>}</select></label>
        <label>Estado aprendido<select value={preset} onChange={(event) => setPreset(event.target.value)} disabled={!usablePresets.length}>{usablePresets.length ? usablePresets.map((item) => <option value={item} key={item}>{item}</option>) : <option>Nenhum estado disponível</option>}</select></label>
        <div className="control-actions"><button className="button primary" disabled={sending || !device?.online || !preset} onClick={() => void sendPreset(preset)}>{sending ? "Enviando…" : "Enviar estado"}</button><button className="button danger" disabled={sending || !device?.online || !profile?.buttons.includes("power_off")} onClick={() => void sendPreset("power_off")}>Desligar</button></div>
      </div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Comandos recentes</h2><p>Resultados informados pelo firmware.</p></div></div>
      {!commands.length ? <PageState>Nenhum comando registrado para este controlador.</PageState> : <div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Estado</th><th>Sequência</th></tr></thead><tbody>{commands.slice(0, 20).map((command) => <tr key={command.id}><td>{formatDate(command.createdAt)}</td><td>{command.type}</td><td>{commandLabels[command.status] ?? command.status}</td><td>{command.sequence}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
