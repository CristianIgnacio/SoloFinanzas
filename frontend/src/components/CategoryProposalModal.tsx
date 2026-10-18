import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CategoryService, type CategoryPattern } from "../services/categoryService";
import type { Category } from "../types";
import { Button } from "./ui";
import { CategoryProposalDetails } from "./CategoryProposalDetails";

export function CategoryProposalModal({ proposal, categories, onClose, onDecided }: {
  proposal: CategoryPattern; categories: Category[]; onClose: () => void;
  onDecided: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<CategoryPattern | null>(proposal);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setCurrentProposal(proposal); }, [proposal]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const decide = async (action: "accept" | "snooze" | "reject") => {
    if (busyRef.current || !currentProposal) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      await CategoryService.decidePattern(currentProposal.id, action, currentProposal.version);
      onDecided({ accept: "Regla creada para futuras importaciones.",
        snooze: "Propuesta pospuesta durante 30 días.", reject: "No volveremos a proponer este patrón." }[action]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la decisión. Puedes volver a intentarlo.");
      // Recheck a stale proposal before allowing another explicit decision.
      try {
        const items = await CategoryService.ruleProposals();
        const updated = items.find(item => item.id === currentProposal.id) ?? null;
        setCurrentProposal(updated);
        if (!updated) setError("Esta propuesta ya no está pendiente. Tu cambio de categoría sigue guardado.");
      } catch { /* Preserve the original error; version checks protect a retry. */ }
    } finally { busyRef.current = false; setBusy(false); }
  };

  return createPortal(<dialog ref={dialogRef} aria-labelledby="category-proposal-title"
    aria-describedby="category-proposal-description" aria-modal="true"
    onCancel={event => { event.preventDefault(); if (!busyRef.current) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [tabindex="0"]',
      ) ?? []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-outline bg-white p-5 text-ink shadow-xl backdrop:bg-black/40 sm:p-7">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="eyebrow m-0 text-primary">Aprendiendo de tus decisiones</p>
        <h2 id="category-proposal-title" className="mt-2 dialog-title">¿Crear una regla automática?</h2>
      </div>
      <button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar propuesta"
        className="min-h-11 shrink-0 px-2 text-sm text-muted disabled:opacity-50">Cerrar</button>
    </div>
    <p id="category-proposal-description" className="my-4 text-sm text-muted">Tu categoría ya está guardada. Detectamos un patrón en tus decisiones.</p>
    {currentProposal ? <CategoryProposalDetails proposal={currentProposal} categories={categories} expanded /> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
    {currentProposal ? <div className="mt-6 flex flex-wrap gap-3">
      <Button disabled={busy} onClick={() => void decide("accept")}>{busy ? "Guardando…" : "Crear regla"}</Button>
      <Button tone="secondary" disabled={busy} onClick={() => void decide("snooze")}>Más adelante</Button>
      <button type="button" disabled={busy} onClick={() => void decide("reject")}
        className="min-h-11 text-sm text-muted underline disabled:opacity-50">No proponer este patrón</button>
      <p className="w-full text-xs text-muted">«Más adelante» pospone la propuesta durante 30 días. Si la rechazas, podrás reactivarla en Personalización.</p>
    </div> : null}
  </dialog>, document.body);
}
