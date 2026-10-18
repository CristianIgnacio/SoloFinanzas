import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Category } from "../types";
import { ChevronDownIcon } from "./icons";
import { CategoryIcon } from "./CategoryIcon";

type Props = {
  label: string;
  value: string;
  disabled: boolean;
  groups: { root: Category; children: Category[] }[];
  onChange: (value: string) => void;
  purpose?: "edit" | "filter";
};

export function CategoryPicker({ label, value, disabled, groups, onChange, purpose = "edit" }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const selected = groups.flatMap(group => [group.root, ...group.children]).find(category => String(category.id) === value);
  const selectedLabel = purpose === "filter" && value === "all" ? "Todas las categorías" : selected?.name ?? "Sin categoría";
  const categoryMap = new Map(groups.flatMap(group => [group.root, ...group.children]).map(category => [category.id, category]));

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const option = (id: string, name: string, child = false) => (
    <button
      key={id}
      type="button"
      aria-pressed={value === id}
      onClick={() => { onChange(id); setOpen(false); }}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${child ? "pl-6" : ""} ${value === id ? "bg-primary-mist font-semibold text-primary" : "text-ink hover:bg-paper-soft"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {id !== "all" ? <CategoryIcon category={categoryMap.get(Number(id))} categoryMap={categoryMap} size="sm" /> : null}
        <span className="min-w-0 break-words">{name}</span>
      </span>
      {value === id ? <span aria-hidden="true" className="shrink-0">✓</span> : null}
    </button>
  );

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`relative min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-2 py-2 pr-7 text-left text-base text-ink transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 sm:px-3 sm:pr-9 sm:text-sm ${purpose === "edit" ? "lg:rounded-2xl lg:bg-paper-soft lg:px-4 lg:py-3 lg:pr-10 lg:text-base" : ""}`}
      >
        <span className="block truncate">{selectedLabel}</span>
        <ChevronDownIcon className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </button>
      {open ? createPortal(
        <dialog
          ref={dialog}
          aria-label="Seleccionar categoría"
          onClose={() => setOpen(false)}
          onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}
          className="fixed inset-0 m-auto max-h-[65dvh] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-outline bg-white p-0 text-ink shadow-xl backdrop:bg-black/35 sm:max-h-[min(65dvh,30rem)]"
        >
          <div className="flex max-h-[65dvh] flex-col sm:max-h-[min(65dvh,30rem)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline px-4 py-2">
              <h2 className="text-base font-semibold">Seleccionar categoría</h2>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-sm font-medium text-primary">Cerrar</button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
              {purpose === "filter" ? option("all", "Todas las categorías") : null}
              {option(purpose === "filter" ? "uncategorized" : "", "Sin categoría")}
              {groups.map(group => (
                <div key={group.root.id} className="mt-2">
                  <p className="px-3 py-2 text-xs font-semibold text-muted">{group.root.name}</p>
                  {option(String(group.root.id), group.children.length ? `${group.root.name} (${purpose === "filter" ? "todas" : "sin subcategoría"})` : group.root.name)}
                  {group.children.map(category => option(String(category.id), category.name, true))}
                </div>
              ))}
            </div>
          </div>
        </dialog>, document.body,
      ) : null}
    </>
  );
}
