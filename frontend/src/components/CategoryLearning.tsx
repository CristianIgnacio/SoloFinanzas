import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "./index";
import { CategoryService, type CategoryPattern } from "../services/categoryService";
import type { Category } from "../types";
import { CategoryProposalDetails } from "./CategoryProposalDetails";

export function CategoryLearning({ categories, onRuleCreated, categoryId }: {
  categories: Category[]; onRuleCreated: () => void; categoryId?: number | null;
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
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las propuestas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [categories]);

  const decide = async (item: CategoryPattern, action: "accept" | "reject" | "snooze" | "reactivate") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null); setNotice(null);
    try {
      await CategoryService.decidePattern(item.id, action, item.version);
      setNotice({ accept: "Regla creada para futuras importaciones.", reject: "No volveremos a mostrar esta sugerencia.",
        snooze: "Propuesta pospuesta durante 30 días.", reactivate: "Sugerencia recuperada. Aparecerá cuando haya suficientes coincidencias." }[action]);
      await load();
      if (action === "accept") onRuleCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la decisión.");
      try { await load(); } catch { /* Keep the original actionable error. */ }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const visiblePatterns = categoryId == null ? patterns : patterns.filter(item => item.category_id === categoryId);
  const pending = visiblePatterns.filter(item => item.state === "pending");
  const dismissed = visiblePatterns.filter(item => item.state === "rejected" || item.state === "snoozed");
  return <Panel className="space-y-4 scroll-mt-24 !p-4 sm:!p-6 md:!p-8" id="personalizacion">
    <h2 className="text-xl font-medium">Propuestas de reglas</h2>
    <p className="text-sm text-muted">Te avisaremos cuando podamos sugerirte una regla. Tú decides si crearla.</p>
    {error ? <p role="alert" className="text-sm text-danger">{error} <button className="underline" onClick={() => void load().then(() => setError(null)).catch(() => {})}>Reintentar</button></p> : null}
    {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
    {loading ? <p className="text-sm text-muted">Cargando propuestas…</p> : null}
    {pending.map(item => <div key={item.id} className="space-y-3 rounded-xl border border-primary/30 p-3 text-sm">
      <CategoryProposalDetails proposal={item} categories={categories} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void decide(item, "accept")}>Crear regla</Button>
        <Button tone="secondary" disabled={busy} onClick={() => void decide(item, "snooze")}>Más adelante</Button>
        <button className="text-muted underline disabled:opacity-50" disabled={busy} onClick={() => void decide(item, "reject")}>No volver a sugerir</button>
      </div>
    </div>)}
    {!loading && pending.length === 0 ? <p className="text-sm text-muted">No hay propuestas pendientes.</p> : null}
    {dismissed.length > 0 ? <details className="text-sm">
      <summary className="cursor-pointer text-muted">Sugerencias descartadas y pospuestas</summary>
      <p className="mt-3 text-muted">Puedes recuperarlas para que volvamos a sugerírtelas cuando corresponda.</p>
      <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">{dismissed.map(item => <div key={item.id} className="space-y-2 rounded-xl bg-paper-soft p-3">
        <p className="font-medium break-words">{item.pattern}</p>
        <p className="text-muted">{categories.find(category => category.id === item.category_id)?.name ?? "Categoría no disponible"} · {item.transaction_type === "expense" ? "Salidas" : "Entradas"} · {item.state === "rejected" ? "Descartada" : "Pospuesta"}</p>
        {item.snoozed_until && item.state === "snoozed" ? <p>Pospuesta hasta {new Date(item.snoozed_until).toLocaleDateString("es-CL")}</p> : null}
        <button disabled={busy} className="min-h-11 text-primary underline disabled:opacity-50" onClick={() => void decide(item, "reactivate")}>Recuperar sugerencia</button>
      </div>)}</div>
    </details> : null}
  </Panel>;
}
