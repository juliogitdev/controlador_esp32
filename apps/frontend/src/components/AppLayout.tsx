import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function AppLayout() {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-start"><button className="menu-button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span></span><span></span><span></span></button><div className="brand"><span className="brand-mark">IF</span><div><strong>Gerenciador de climatização</strong><small>Monitoramento acadêmico</small></div></div></div>
      <div className="account"><span>{session?.user.email}</span><button className="button quiet" onClick={() => void signOut()}>Sair</button></div>
    </header>
    <div className="body-grid">
      {menuOpen && <button className="nav-overlay" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <nav className={`sidebar${menuOpen ? " open" : ""}`} aria-label="Navegação principal">
        <div className="mobile-account"><span>Administrador</span><small>{session?.user.email}</small></div>
        <NavLink to="/" end>Visão geral</NavLink>
        <NavLink to="/ambientes">Ambientes</NavLink>
        <NavLink to="/cadastros">Cadastros</NavLink>
      </nav>
      <main className="content"><Outlet /></main>
    </div>
  </div>;
}
