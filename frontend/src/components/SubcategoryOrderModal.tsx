import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownIcon, ArrowUpIcon } from "./icons";
import { Button, StatusNotice } from "./ui";
import { CategoryIcon } from "./CategoryIcon";
import type { Category } from "../types";

export function SubcategoryOrderModal({ parent, items, categoryMap, saving, error, onSave, onClose }: {
  parent: Category;
  items: Category[];
  categoryMap: Map<number, Category>;
  saving: boolean;
  error: string | null;
  onSave: (ids: number[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initialOrder = useRef(items.map(item => item.id));
  const [order, setOrder] = useState(initialOrder.current);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
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
  }, []);

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (saving || nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setOrder(next);
    setAnnouncement(`${categoryMap.get(order[index])?.name}: posición ${nextIndex + 1} de ${order.length}.`);
  };
  const changed = order.some((id, index) => id !== initialOrder.current[index]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="subcategory-order-title" aria-describedby="subcategory-order-help"
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}
      className="m-0 mt-auto w-full max-w-none overflow-hidden rounded-t-3xl border border-outline bg-white text-ink shadow-xl backdrop:bg-ink/45 sm:mx-auto sm:mb-4 sm:max-w-xl sm:rounded-3xl">
      <div className="flex max-h-[90dvh] flex-col">
        <div className="shrink-0 border-b border-outline p-4">
          <h2 id="subcategory-order-title" className="text-xl font-semibold">Ordenar subcategorías</h2>
          <p className="mt-1 font-medium text-primary [overflow-wrap:anywhere]">{parent.name}</p>
          <p id="subcategory-order-help" className="mt-2 text-sm text-muted">Usa las flechas para cambiar el orden. Se guardará al tocar «Listo».</p>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
          <ol aria-label={`Subcategorías de ${parent.name}`} className="space-y-2">
            {order.map((id, index) => {
              const category = categoryMap.get(id);
              if (!category) return null;
              return <li key={id} className="flex items-center gap-2 rounded-2xl border border-outline bg-paper-soft/60 p-3">
                <CategoryIcon category={category} categoryMap={categoryMap} size="sm" compactOnMobile />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{category.name}</p>
                  <p className="mt-1 text-xs text-muted">Posición {index + 1}{!category.is_active ? " · Archivada" : ""}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" aria-label={`Subir ${category.name}`} disabled={saving || index === 0}
                    onClick={() => move(index, -1)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline bg-white text-primary disabled:opacity-35">
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Bajar ${category.name}`} disabled={saving || index === order.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline bg-white text-primary disabled:opacity-35">
                    <ArrowDownIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>;
            })}
          </ol>
        </div>
        <div className="shrink-0 space-y-3 border-t border-outline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
          <p role="status" className="sr-only">{saving ? "Guardando orden…" : announcement}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button disabled={saving} onClick={() => changed || error ? onSave(order) : onClose()}>{saving ? "Guardando…" : "Listo"}</Button>
          </div>
        </div>
      </div>
    </dialog>, document.body,
  );
}
