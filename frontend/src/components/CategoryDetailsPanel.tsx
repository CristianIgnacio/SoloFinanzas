import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

export type CategoryDetailsView = "rules" | "proposals";

export function CategoryDetailsPanel({ compact, open, view, categoryName, categoryBadge, onViewChange, onClose, rules, proposals }: {
  compact: boolean;
  open: boolean;
  view: CategoryDetailsView;
  categoryName?: string;
  categoryBadge?: ReactNode;
  onViewChange: (view: CategoryDetailsView) => void;
  onClose: () => void;
  rules: ReactNode;
  proposals: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compact || !open) return;
    const dialog = dialogRef.current;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [compact, open]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view, categoryName, open]);

  const tabs = <div role="tablist" aria-label="Detalles de categoría" className="mt-4 flex gap-1 rounded-xl bg-paper-soft p-1">
    {(["rules", "proposals"] as const).map(tab => (
      <button key={tab} type="button" role="tab" id={`category-tab-${tab}`}
        aria-controls={`category-panel-${tab}`} aria-selected={view === tab}
        disabled={compact && tab === "rules" && !categoryName} tabIndex={view === tab ? 0 : -1}
        onClick={() => onViewChange(tab)}
        onKeyDown={event => {
          if ((compact && !categoryName) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "rules" : event.key === "End" ? "proposals" : tab === "rules" ? "proposals" : "rules";
          onViewChange(next);
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#category-tab-${next}`)?.focus();
        }}
        className={cn("min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40",
          view === tab ? "bg-white text-primary shadow-sm" : "text-muted")}>
        {tab === "rules" ? "Reglas" : "Propuestas"}
      </button>
    ))}
  </div>;

  const panels = <>
    <div role="tabpanel" id="category-panel-rules" aria-labelledby="category-tab-rules" hidden={view !== "rules"}>{rules}</div>
    <div role="tabpanel" id="category-panel-proposals" aria-labelledby="category-tab-proposals" hidden={view !== "proposals"}>{proposals}</div>
  </>;

  if (!compact) return <section role="region" aria-label="Reglas y propuestas"
    className="sticky top-6 flex max-h-[calc(100dvh-3rem)] min-w-0 self-start flex-col overflow-hidden rounded-3xl border border-outline/80 bg-white shadow-paper">
    <div className="shrink-0 border-b border-outline/60 p-4 pb-3">
      <p className="text-xs font-medium text-muted">{categoryName ? "Categoría seleccionada" : "Reglas y propuestas"}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{categoryName ?? "Organiza tus categorías"}</h2>
        {categoryBadge}
      </div>
      {tabs}
    </div>
    <div ref={contentRef} tabIndex={0} aria-label="Contenido de reglas y propuestas"
      className="min-h-0 overflow-y-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">{panels}</div>
  </section>;

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="category-details-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="m-0 mt-auto w-full max-w-none overflow-hidden rounded-t-3xl border border-outline bg-paper text-ink shadow-xl backdrop:bg-ink/45 sm:mx-auto sm:mb-4 sm:max-w-xl sm:rounded-3xl">
      <div className="flex max-h-[90dvh] flex-col">
        <div className="shrink-0 border-b border-outline bg-white px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{categoryName ? "Categoría" : "Propuestas"}</p>
              <h2 id="category-details-title" className="mt-1 text-lg font-semibold [overflow-wrap:anywhere]">{categoryName ?? "Propuestas de reglas"}</h2>
            </div>
            <button type="button" autoFocus onClick={onClose}
              className="min-h-11 shrink-0 rounded-xl border border-outline px-3 text-sm font-medium">Cerrar</button>
          </div>
          {tabs}
        </div>
        <div ref={contentRef} className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {panels}
        </div>
      </div>
    </dialog>, document.body,
  );
}
