import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Category } from "../types";
import { ChevronDownIcon, SettingsIcon } from "./icons";
import { CategoryIcon } from "./CategoryIcon";

type Props = {
  label: string;
  disabled: boolean;
  groups: { root: Category; children: Category[] }[];
  purpose?: "edit" | "filter" | "summary";
  triggerVariant?: "field" | "icon" | "compact" | "table" | "review";
  description?: string;
  error?: string | null;
} & ({
  multiple: true;
  value: ReadonlySet<string>;
  onChange: (value: Set<string>) => void;
} | {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
});

export function CategoryPicker(props: Props) {
  const { label, value, disabled, groups, purpose = "edit", triggerVariant = "field" } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = groups.flatMap(group => [group.root, ...group.children]).find(category => String(category.id) === value);
  const singleLabel = purpose === "filter" && value === "all" ? "Todas las categorías" : selected?.name ?? "Sin categoría";
  const selectedLabel = props.multiple
    ? props.value.size === 0 ? purpose === "summary" ? "Ninguna categoría" : "Todas las categorías" : `${props.value.size} ${props.value.size === 1 ? "categoría seleccionada" : "categorías seleccionadas"}`
    : singleLabel;
  const isSelected = (id: string) => props.multiple
    ? id === "all" ? props.value.size === 0 : props.value.has(id)
    : value === id;
  const selectOption = (id: string) => {
    if (props.multiple) {
      const next = new Set(props.value);
      if (id === "all") next.clear();
      else if (next.has(id)) next.delete(id);
      else next.add(id);
      props.onChange(next);
    } else {
      props.onChange(id);
      setOpen(false);
    }
  };
  const categoryMap = new Map(groups.flatMap(group => [group.root, ...group.children]).map(category => [category.id, category]));

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);

  const option = (id: string, name: string, child = false) => (
    <button
      key={id}
      type="button"
      aria-pressed={isSelected(id)}
      onClick={() => selectOption(id)}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${child ? "pl-6" : ""} ${isSelected(id) ? "bg-primary-mist font-semibold text-primary" : "text-ink hover:bg-paper-soft"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {id !== "all" ? <CategoryIcon category={categoryMap.get(Number(id))} categoryMap={categoryMap} size="sm" /> : null}
        <span className="min-w-0 break-words">{name}</span>
      </span>
      {isSelected(id) ? <span aria-hidden="true" className="shrink-0">✓</span> : null}
    </button>
  );

  return (
    <>
      <button
        type="button"
        ref={trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={triggerVariant === "icon" ? label : undefined}
        className={triggerVariant === "icon"
          ? "flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          : triggerVariant === "review"
          ? "relative flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-lg py-1 pr-4 text-left text-[13px] text-ink transition hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 xl:block xl:rounded-xl xl:border xl:border-outline xl:bg-white xl:py-2 xl:pl-3 xl:pr-9 xl:text-sm"
          : triggerVariant === "compact"
          ? "relative inline-flex min-h-4 w-full min-w-0 items-center justify-end gap-1 rounded-lg border border-transparent bg-transparent p-0 text-right text-sm text-muted transition hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 sm:block sm:min-h-11 sm:border-outline sm:bg-white sm:py-2 sm:pl-3 sm:pr-8 sm:text-left sm:text-ink"
          : `relative min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-2 py-2 pr-7 text-left ${triggerVariant === "table" ? "text-sm" : "text-base"} text-ink transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 sm:px-3 sm:pr-9 sm:text-sm ${purpose === "edit" && triggerVariant === "field" ? "lg:rounded-2xl lg:bg-paper-soft lg:px-4 lg:py-3 lg:pr-10 lg:text-base" : ""}`}
      >
        {triggerVariant === "icon" ? <SettingsIcon className="h-4 w-4" /> : <>
          {triggerVariant === "review" && <span className="flex shrink-0 xl:hidden"><CategoryIcon category={selected} categoryMap={categoryMap} size="xs" /></span>}
          <span className={triggerVariant === "review" ? "block min-w-0 break-words leading-4 xl:truncate xl:leading-5" : "block min-w-0 truncate"}>{selectedLabel}</span>
          <ChevronDownIcon className={triggerVariant === "compact"
            ? "h-4 w-4 shrink-0 text-muted sm:absolute sm:right-2 sm:top-1/2 sm:-translate-y-1/2"
            : triggerVariant === "review" ? "absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted xl:right-2 xl:h-4 xl:w-4"
            : "absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"} />
        </>}
      </button>
      {open ? createPortal(
        <dialog
          ref={dialog}
          onKeyDown={event => event.stopPropagation()}
          aria-label={props.multiple ? "Seleccionar categorías" : "Seleccionar categoría"}
          onClose={() => setOpen(false)}
          onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}
          className="fixed inset-0 m-auto max-h-[65dvh] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-outline bg-white p-0 text-ink shadow-xl backdrop:bg-black/35 sm:max-h-[min(65dvh,30rem)]"
        >
          <div className="flex max-h-[65dvh] flex-col sm:max-h-[min(65dvh,30rem)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-outline px-4 py-2">
              <h2 className="text-base font-semibold">{props.multiple ? "Seleccionar categorías" : "Seleccionar categoría"}</h2>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-sm font-medium text-primary">{props.multiple ? "Listo" : "Cerrar"}</button>
            </div>
            {props.multiple && <p className="border-b border-outline bg-paper-soft px-4 py-3 text-sm text-muted">Puedes combinar varias categorías. Elegir una principal incluye sus subcategorías.</p>}
            {props.description ? <p className="px-4 py-2 text-xs text-muted">{props.description}</p> : null}
            {props.error ? <p role="alert" className="px-4 py-2 text-sm text-danger">{props.error}</p> : null}
            <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
              {purpose === "filter" ? option("all", "Todas las categorías") : null}
              {purpose !== "summary" ? option(purpose === "filter" ? "uncategorized" : "", "Sin categoría") : null}
              {groups.map(group => (
                <div key={group.root.id} className="mt-2">
                  <p className="px-3 py-2 text-xs font-semibold text-muted">{group.root.name}</p>
                  {option(String(group.root.id), group.children.length ? `${group.root.name} (${purpose !== "edit" ? "todas" : "sin subcategoría"})` : group.root.name)}
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
