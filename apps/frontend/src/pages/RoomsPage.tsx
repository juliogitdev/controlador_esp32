import { Link } from "react-router-dom";
import type { RoomListItem } from "../api/types";
import { PageState, StatusBadge } from "../components/Status";
import { useApi } from "../hooks/useApi";

export function RoomsPage() {
  const { data, error, loading, reload } = useApi<RoomListItem[]>("/api/admin/rooms");
  const groups = (data ?? []).reduce((map, room) => {
    const key = room.department.name;
    map.set(key, [...(map.get(key) ?? []), room]);
    return map;
  }, new Map<string, RoomListItem[]>());
  return <>
    <div className="page-heading"><div><p className="eyebrow">Cadastro</p><h1>Ambientes</h1><p>Organização por departamento e situação dos controladores.</p></div><button className="button secondary" onClick={() => void reload()}>Atualizar</button></div>
    {loading && !data ? <PageState>Carregando ambientes…</PageState> : error ? <PageState error>{error}</PageState> : !data?.length ? <PageState>Nenhum ambiente cadastrado.</PageState> :
      [...groups].map(([department, rooms]) => <section className="room-group" key={department}><h2>{department}</h2><div className="room-grid">
        {rooms.map((room) => { const online = room.devices.some((device) => device.online);
          return <article className="room-card" key={room.id}><div><h3>{room.name}</h3><p>{room.subjectId}</p></div><dl><div><dt>Controlador</dt><dd>{online ? <StatusBadge tone="ok">Online</StatusBadge> : <StatusBadge tone="neutral">Sem comunicação</StatusBadge>}</dd></div><div><dt>Fontes</dt><dd>{room.sources.filter((source) => source.enabled).length}</dd></div></dl><Link to={`/ambientes/${room.id}`} className="text-link">Ver detalhes <span aria-hidden>→</span></Link></article>; })}
      </div></section>) }
  </>;
}
