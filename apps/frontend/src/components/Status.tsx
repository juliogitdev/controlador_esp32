export function StatusBadge({ tone, children }: { tone: "ok" | "danger" | "warning" | "neutral"; children: React.ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

export function PageState({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`page-state${error ? " error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}

