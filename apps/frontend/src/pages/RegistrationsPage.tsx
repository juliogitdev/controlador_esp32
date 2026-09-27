import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Department, DeviceListItem, RoomListItem, SourceListItem } from "../api/types";
import { PageState, StatusBadge } from "../components/Status";
import { useApi } from "../hooks/useApi";
import { formatDate } from "../lib/format";

type Credential = { title: string; id: string; token: string };
type Editing =
  | { type: "room"; item: RoomListItem }
  | { type: "device"; item: DeviceListItem }
  | { type: "source"; item: SourceListItem };
const sourceLabels: Record<string, string> = {
  presence: "Presença", temperature: "Temperatura", humidity: "Umidade",
  current: "Corrente", voltage: "Tensão", climate_state: "Estado observado",
};

function FormMessage({ value }: { value: string }) {
  if (!value) return null;
  return <p className="form-message" role="status">{value}</p>;
}

export function RegistrationsPage() {
  const departments = useApi<Department[]>("/api/admin/departments");
  const rooms = useApi<RoomListItem[]>("/api/admin/rooms");
  const devices = useApi<DeviceListItem[]>("/api/admin/devices");
  const sources = useApi<SourceListItem[]>("/api/admin/sources");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const submit = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setMessage("");
    try { await action(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Não foi possível concluir o cadastro."); }
    finally { setBusy(""); }
  };

  const createDepartment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    void submit("department", async () => {
      await api("/api/admin/departments", { method: "POST", body: JSON.stringify({ name: values.get("name") }) });
      form.reset(); setMessage("Departamento cadastrado."); await departments.reload();
    });
  };
  const createRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    void submit("room", async () => {
      await api("/api/admin/rooms", { method: "POST", body: JSON.stringify({
        name: values.get("name"), subjectId: values.get("subjectId"), departmentId: values.get("departmentId"),
      }) });
      form.reset(); setMessage("Ambiente cadastrado."); await rooms.reload();
    });
  };
  const createDevice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    void submit("device", async () => {
      const result = await api<{ device: { id: string; name: string }; token: string }>("/api/admin/devices", {
        method: "POST", body: JSON.stringify({ id: values.get("id"), name: values.get("name"), roomId: values.get("roomId") || null }),
      });
      form.reset(); setCredential({ title: "Token do controlador", id: result.device.id, token: result.token });
      setMessage("Controlador cadastrado."); await Promise.all([devices.reload(), rooms.reload()]);
    });
  };
  const createSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    void submit("source", async () => {
      const result = await api<{ source: { id: string; name: string }; token: string }>("/api/admin/sources", {
        method: "POST", body: JSON.stringify({ id: values.get("id"), name: values.get("name"), kind: values.get("kind"), roomId: values.get("roomId") }),
      });
      form.reset(); setCredential({ title: "Token da fonte", id: result.source.id, token: result.token });
      setMessage("Fonte cadastrada."); await Promise.all([sources.reload(), rooms.reload()]);
    });
  };

  const updateRegistration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const values = new FormData(event.currentTarget);
    void submit("edit", async () => {
      if (editing.type === "room") {
        await api(`/api/admin/rooms/${editing.item.id}`, { method: "PATCH", body: JSON.stringify({
          name: values.get("name"), subjectId: values.get("subjectId"), departmentId: values.get("departmentId"),
        }) });
      } else if (editing.type === "device") {
        await api(`/api/admin/devices/${editing.item.id}`, { method: "PATCH", body: JSON.stringify({
          name: values.get("name"), roomId: values.get("roomId") || null, enabled: values.get("enabled") === "on",
        }) });
      } else {
        await api(`/api/admin/sources/${editing.item.id}`, { method: "PATCH", body: JSON.stringify({
          name: values.get("name"), kind: values.get("kind"), roomId: values.get("roomId"), enabled: values.get("enabled") === "on",
        }) });
      }
      setEditing(null); setMessage("Cadastro atualizado.");
      await Promise.all([rooms.reload(), devices.reload(), sources.reload()]);
    });
  };

  const rotateToken = (type: "device" | "source", id: string) => {
    const label = type === "device" ? "controlador" : "fonte";
    if (!window.confirm(`Gerar um novo token para este ${label}? O token atual deixará de funcionar imediatamente.`)) return;
    void submit("token", async () => {
      const result = await api<{ id: string; token: string }>(`/api/admin/${type === "device" ? "devices" : "sources"}/${id}/token`, { method: "POST" });
      setCredential({ title: `Novo token do ${label}`, id: result.id, token: result.token });
      setMessage("Credencial renovada. Atualize a configuração do equipamento.");
    });
  };

  const renameDepartment = (item: Department) => {
    const name = window.prompt("Novo nome do departamento:", item.name)?.trim();
    if (!name || name === item.name) return;
    void submit("department-edit", async () => {
      await api(`/api/admin/departments/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setMessage("Departamento atualizado.");
      await Promise.all([departments.reload(), rooms.reload()]);
    });
  };

  const loading = departments.loading || rooms.loading || devices.loading || sources.loading;
  const error = departments.error || rooms.error || devices.error || sources.error;
  return <>
    <div className="page-heading"><div><p className="eyebrow">Administração</p><h1>Cadastros</h1><p>Configure a estrutura acadêmica e associe os componentes do protótipo.</p></div></div>
    {loading && !departments.data ? <PageState>Carregando cadastros…</PageState> : error ? <PageState error>{error}</PageState> : <>
      <FormMessage value={message} />
      {credential && <section className="credential-box" aria-live="assertive">
        <div><strong>{credential.title}</strong><p>Copie agora. Este token não poderá ser consultado novamente.</p></div>
        <dl><div><dt>Identificador</dt><dd>{credential.id}</dd></div><div><dt>Token</dt><dd><code>{credential.token}</code></dd></div></dl>
        <div className="credential-actions"><button className="button primary" onClick={() => void navigator.clipboard.writeText(credential.token)}>Copiar token</button><button className="button quiet" onClick={() => setCredential(null)}>Já copiei</button></div>
      </section>}

      {editing && <section className="panel edit-panel" aria-labelledby="edit-title">
        <div className="panel-heading"><div><h2 id="edit-title">Editar {editing.type === "room" ? "ambiente" : editing.type === "device" ? "controlador" : "fonte"}</h2><p>Identificador: <code>{editing.item.id}</code></p></div><button className="button quiet" type="button" onClick={() => setEditing(null)}>Cancelar</button></div>
        <form className="stack-form edit-form" onSubmit={updateRegistration}>
          <label>Nome<input name="name" maxLength={100} defaultValue={editing.item.name} required /></label>
          {editing.type === "room" && <><label>Identificador técnico<input name="subjectId" pattern="[A-Za-z0-9_-]{1,64}" defaultValue={editing.item.subjectId} required /></label><label>Departamento<select name="departmentId" defaultValue={editing.item.department.id} required>{departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
          {editing.type === "device" && <><label>Ambiente<select name="roomId" defaultValue={editing.item.roomId ?? ""}><option value="">Sem associação</option>{rooms.data?.map((item) => <option key={item.id} value={item.id}>{item.department.name} — {item.name}</option>)}</select></label><label className="check-field"><input type="checkbox" name="enabled" defaultChecked={editing.item.enabled} /> Controlador ativo</label></>}
          {editing.type === "source" && <><label>Tipo<select name="kind" defaultValue={editing.item.kind}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Ambiente<select name="roomId" defaultValue={editing.item.roomId} required>{rooms.data?.map((item) => <option key={item.id} value={item.id}>{item.department.name} — {item.name}</option>)}</select></label><label className="check-field"><input type="checkbox" name="enabled" defaultChecked={editing.item.enabled} /> Fonte ativa</label></>}
          <button className="button primary" disabled={busy === "edit"}>{busy === "edit" ? "Salvando…" : "Salvar alterações"}</button>
        </form>
      </section>}

      <div className="registration-grid">
        <section className="panel registration-panel"><div className="panel-heading"><div><h2>Novo departamento</h2><p>Ex.: Laboratórios ou Administrativo.</p></div></div>
          <form className="stack-form" onSubmit={createDepartment}><label>Nome<input name="name" maxLength={100} required /></label><button className="button primary" disabled={busy === "department"}>{busy === "department" ? "Salvando…" : "Cadastrar departamento"}</button></form>
          <div className="compact-list">{departments.data?.map((item) => <div key={item.id}><strong>{item.name}</strong><button className="table-action" type="button" disabled={busy === "department-edit"} onClick={() => renameDepartment(item)}>Renomear</button></div>)}</div>
        </section>

        <section className="panel registration-panel"><div className="panel-heading"><div><h2>Novo ambiente</h2><p>O identificador será usado pelos eventos dos sensores.</p></div></div>
          <form className="stack-form" onSubmit={createRoom}><label>Nome<input name="name" maxLength={100} placeholder="Ex.: Laboratório I" required /></label><label>Identificador técnico<input name="subjectId" pattern="[A-Za-z0-9_-]{1,64}" placeholder="Ex.: lab-01" required /></label><label>Departamento<select name="departmentId" required defaultValue=""><option value="" disabled>Selecione</option>{departments.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button primary" disabled={busy === "room" || !departments.data?.length}>{busy === "room" ? "Salvando…" : "Cadastrar ambiente"}</button></form>
        </section>

        <section className="panel registration-panel"><div className="panel-heading"><div><h2>Novo controlador</h2><p>Use o deviceId informado pelo ESP32.</p></div></div>
          <form className="stack-form" onSubmit={createDevice}><label>Identificador do dispositivo<input name="id" pattern="[A-Za-z0-9_-]{1,64}" placeholder="esp32-aabb11223344" required /></label><label>Nome de exibição<input name="name" maxLength={100} placeholder="Controlador do Lab I" required /></label><label>Ambiente<select name="roomId" defaultValue=""><option value="">Associar depois</option>{rooms.data?.map((item) => <option key={item.id} value={item.id}>{item.department.name} — {item.name}</option>)}</select></label><button className="button primary" disabled={busy === "device"}>{busy === "device" ? "Salvando…" : "Cadastrar controlador"}</button></form>
        </section>

        <section className="panel registration-panel"><div className="panel-heading"><div><h2>Nova fonte de sensor</h2><p>Cada grandeza possui identidade e token próprios.</p></div></div>
          <form className="stack-form" onSubmit={createSource}><label>Identificador da fonte<input name="id" pattern="[A-Za-z0-9_-]{1,64}" placeholder="sensor-presenca-01" required /></label><label>Nome de exibição<input name="name" maxLength={100} placeholder="Presença do Lab I" required /></label><label>Tipo<select name="kind" defaultValue="presence">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Ambiente<select name="roomId" required defaultValue=""><option value="" disabled>Selecione</option>{rooms.data?.map((item) => <option key={item.id} value={item.id}>{item.department.name} — {item.name}</option>)}</select></label><button className="button primary" disabled={busy === "source" || !rooms.data?.length}>{busy === "source" ? "Salvando…" : "Cadastrar fonte"}</button></form>
        </section>
      </div>

      <section className="panel"><div className="panel-heading"><div><h2>Ambientes cadastrados</h2><p>Edite o nome, identificador técnico ou departamento.</p></div></div>{!rooms.data?.length ? <PageState>Nenhum ambiente cadastrado.</PageState> : <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Identificador</th><th>Departamento</th><th>Ações</th></tr></thead><tbody>{rooms.data.map((item) => <tr key={item.id}><td>{item.name}</td><td><code>{item.subjectId}</code></td><td>{item.department.name}</td><td><button className="table-action" onClick={() => setEditing({ type: "room", item })}>Editar</button></td></tr>)}</tbody></table></div>}</section>

      <section className="panel"><div className="panel-heading"><div><h2>Controladores cadastrados</h2><p>Desative um equipamento sem apagar seu histórico.</p></div></div>{!devices.data?.length ? <PageState>Nenhum controlador cadastrado.</PageState> : <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Identificador</th><th>Situação</th><th>Última comunicação</th><th>Ações</th></tr></thead><tbody>{devices.data.map((item) => <tr key={item.id}><td>{item.name}</td><td><code>{item.id}</code></td><td><StatusBadge tone={item.enabled ? "ok" : "neutral"}>{item.enabled ? "Ativo" : "Inativo"}</StatusBadge></td><td>{formatDate(item.lastSeenAt)}</td><td><div className="table-actions"><button className="table-action" onClick={() => setEditing({ type: "device", item })}>Editar</button><button className="table-action" disabled={busy === "token"} onClick={() => rotateToken("device", item.id)}>Novo token</button></div></td></tr>)}</tbody></table></div>}</section>

      <section className="panel"><div className="panel-heading"><div><h2>Fontes cadastradas</h2><p>Gerencie sensores e simuladores associados aos ambientes.</p></div></div>{!sources.data?.length ? <PageState>Nenhuma fonte cadastrada.</PageState> : <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Identificador</th><th>Tipo</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{sources.data.map((item) => <tr key={item.id}><td>{item.name}</td><td><code>{item.id}</code></td><td>{sourceLabels[item.kind] ?? item.kind}</td><td><StatusBadge tone={item.enabled ? "ok" : "neutral"}>{item.enabled ? "Ativa" : "Inativa"}</StatusBadge></td><td><div className="table-actions"><button className="table-action" onClick={() => setEditing({ type: "source", item })}>Editar</button><button className="table-action" disabled={busy === "token"} onClick={() => rotateToken("source", item.id)}>Novo token</button></div></td></tr>)}</tbody></table></div>}</section>
    </>}
  </>;
}
