import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "./index";
import { CategoryService, type CategoryPattern } from "../services/categoryService";
import type { Category } from "../types";
import { CategoryProposalDetails } from "./CategoryProposalDetails";

const stateLabels: Record<string, string> = {
  observing: "En observación", pending: "Propuesta pendiente", snoozed: "Pospuesta",
  rejected: "Rechazada", accepted: "Regla aceptada", conflict: "En conflicto",
  inactive: "Sin vigencia", covered: "Ya tiene una regla",
};

export function CategoryLearning({ categories, onRuleCreated, categoryId, expandHistory = false }: {
  categories: Category[]; onRuleCreated: () => void; categoryId?: number | null; expandHistory?: boolean;
}) {
  const [patterns, setPatterns] = useState<CategoryPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => setPatterns(await CategoryService.patterns());
  useEffect(() => {
    let active = true;
    CategoryService.patterns().then(items => { if (active) setPatterns(items); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el aprendizaje."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [categories]);

  const decide = async (item: CategoryPattern, action: "accept" | "reject" | "snooze" | "reactivate") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      await CategoryService.decidePattern(item.id, action, item.version);
      setNotice({ accept: "Regla creada para futuras importaciones.", reject: "No volveremos a proponer este patrón.",
        snooze: "Propuesta pospuesta durante 30 días.", reactivate: "Patrón reactivado." }[action]);
      await load();
      if (action === "accept") onRuleCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la decisión.");
      try { await load(); } catch { /* Keep the original actionable error. */ }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const visiblePatterns = categoryId == null ? patterns : patterns.filter(item => item.category_id === categoryId);
  const pending = visiblePatterns.filter(item => item.state === "pending");
  const history = visiblePatterns.filter(item => item.state !== "pending");
  return <Panel className="space-y-4 scroll-mt-24 !p-4 sm:!p-6 md:!p-8" id="personalizacion">
    <h2 className="text-xl font-medium">Personalización</h2>
    <p className="text-sm text-muted">Tus cambios de categoría se registran automáticamente. Después de tres decisiones coincidentes te propondremos una regla; tú decides si crearla.</p>
    {error ? <p role="alert" className="text-sm text-danger">{error} <button className="underline" onClick={() => void load().then(() => setError(null)).catch(() => {})}>Reintentar</button></p> : null}
    {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
    {loading ? <p className="text-sm text-muted">Cargando patrones…</p> : null}
    {pending.map(item => <div key={item.id} className="space-y-3 rounded-xl border border-primary/30 p-3 text-sm">
      <CategoryProposalDetails proposal={item} categories={categories} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void decide(item, "accept")}>Crear regla</Button>
        <Button tone="secondary" disabled={busy} onClick={() => void decide(item, "snooze")}>Más adelante</Button>
        <button className="text-muted underline disabled:opacity-50" disabled={busy} onClick={() => void decide(item, "reject")}>No proponer este patrón</button>
      </div>
    </div>)}
    {!loading && pending.length === 0 ? <p className="text-sm text-muted">No hay propuestas pendientes.</p> : null}
    {!loading && history.length === 0 && expandHistory ? <p className="text-sm text-muted">{categoryId == null ? "Aún no hay historial de aprendizaje." : "Aún no hay historial de aprendizaje para esta categoría."}</p> : null}
    {history.length > 0 ? <details className="text-sm" open={expandHistory || undefined}>
      <summary className="cursor-pointer text-primary">Patrones e historial ({history.length})</summary>
      <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">{history.map(item => <div key={item.id} className="space-y-2 rounded-xl bg-paper-soft p-3">
        <p className="font-medium break-words">{item.pattern} · {stateLabels[item.state] ?? item.state}</p>
        <p className="text-muted">{item.transaction_type === "expense" ? "Salidas" : "Entradas"} · {item.evidence_count} movimientos · {item.decision_count} decisiones</p>
        <p className="text-muted">{item.reason}</p>
        {item.snoozed_until && item.state === "snoozed" ? <p>Pospuesta hasta {new Date(item.snoozed_until).toLocaleDateString("es-CL")}</p> : null}
        {item.state === "rejected" || item.state === "snoozed" ? <button disabled={busy} className="text-primary underline" onClick={() => void decide(item, "reactivate")}>Volver a evaluar</button> : null}
        {item.state === "observing" || item.state === "conflict" ? <button disabled={busy} className="text-muted underline" onClick={() => void decide(item, "reject")}>No proponer este patrón</button> : null}
        {item.history.length > 0 ? <details><summary className="cursor-pointer text-muted">Ver historial</summary><ul className="mt-2 space-y-1 text-muted">{item.history.map((event, index) => <li key={index}>{new Date(event.at).toLocaleDateString("es-CL")} · {stateLabels[event.state] ?? event.state} · {event.reason}</li>)}</ul></details> : null}
      </div>)}</div>
    </details> : null}
  </Panel>;
}
