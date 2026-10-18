import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

export type CategoryDetailsView = "rules" | "history";

export function CategoryDetailsPanel({ compact, open, view, categoryName, onViewChange, onClose, rules, history }: {
  compact: boolean;
  open: boolean;
  view: CategoryDetailsView;
  categoryName?: string;
  onViewChange: (view: CategoryDetailsView) => void;
  onClose: () => void;
  rules: ReactNode;
  history: ReactNode;
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

  if (!compact) return <div className="min-w-0 space-y-5">{rules}{history}</div>;

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="category-details-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="m-0 mt-auto w-full max-w-none overflow-hidden rounded-t-3xl border border-outline bg-paper text-ink shadow-xl backdrop:bg-ink/45 sm:mx-auto sm:mb-4 sm:max-w-xl sm:rounded-3xl">
      <div className="flex max-h-[90dvh] flex-col">
        <div className="shrink-0 border-b border-outline bg-white px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{categoryName ? "Categoría" : "Personalización"}</p>
              <h2 id="category-details-title" className="mt-1 text-lg font-semibold [overflow-wrap:anywhere]">{categoryName ?? "Historial y aprendizaje"}</h2>
            </div>
            <button type="button" autoFocus onClick={onClose}
              className="min-h-11 shrink-0 rounded-xl border border-outline px-3 text-sm font-medium">Cerrar</button>
          </div>
          <div role="tablist" aria-label="Detalles de categoría" className="mt-4 flex gap-1 rounded-xl bg-paper-soft p-1">
            {(["rules", "history"] as const).map(tab => (
              <button key={tab} type="button" role="tab" id={`category-tab-${tab}`}
                aria-controls={`category-panel-${tab}`} aria-selected={view === tab}
                disabled={tab === "rules" && !categoryName} tabIndex={view === tab ? 0 : -1}
                onClick={() => onViewChange(tab)}
                onKeyDown={event => {
                  if (!categoryName || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next = event.key === "Home" ? "rules" : event.key === "End" ? "history" : tab === "rules" ? "history" : "rules";
                  onViewChange(next);
                  dialogRef.current?.querySelector<HTMLButtonElement>(`#category-tab-${next}`)?.focus();
                }}
                className={cn("min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-40",
                  view === tab ? "bg-white text-primary shadow-sm" : "text-muted")}>
                {tab === "rules" ? "Reglas" : "Historial"}
              </button>
            ))}
          </div>
        </div>
        <div ref={contentRef} className="min-h-0 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div role="tabpanel" id="category-panel-rules" aria-labelledby="category-tab-rules" hidden={view !== "rules"}>{rules}</div>
          <div role="tabpanel" id="category-panel-history" aria-labelledby="category-tab-history" hidden={view !== "history"}>{history}</div>
        </div>
      </div>
    </dialog>, document.body,
  );
}
