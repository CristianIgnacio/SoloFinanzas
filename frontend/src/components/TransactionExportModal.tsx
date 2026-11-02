import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TransactionService, type TransactionFilters } from "../services/transactionService";
import { createTransactionExport, type TransactionExportFormat } from "../lib/transactionExport";
import type { Category, Transaction } from "../types";
import { Button } from "./ui";

export type TransactionExportRequest = {
  filters: TransactionFilters;
  total: number;
  period: string;
  filePeriod: string;
  filterLabels: string[];
  trigger: HTMLElement;
};

export function TransactionExportModal({ request, categories, accountNames, onClose, onExported }: {
  request: TransactionExportRequest;
  categories: Map<number, Category>;
  accountNames: Map<number, string>;
  onClose: () => void;
  onExported: (count: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [available, setAvailable] = useState(request.total);
  const [scope, setScope] = useState<"all" | "custom">("all");
  const [quantity, setQuantity] = useState(String(request.total));
  const [format, setFormat] = useState<TransactionExportFormat>("csv");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const count = scope === "all" ? available : Number(quantity);
  const valid = Number.isSafeInteger(count) && count > 0 && count <= available;
  const number = (value: number) => value.toLocaleString("es-CL");

  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      controllerRef.current?.abort();
      dialog?.close();
      document.body.style.overflow = overflow;
      if (request.trigger.isConnected) request.trigger.focus({ preventScroll: true });
    };
  }, [request]);

  const download = async () => {
    if (!valid || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const items: Transaction[] = [];
      const seen = new Set<number>();
      while (items.length < count) {
        const page = await TransactionService.getPage({
          ...request.filters, limit: Math.min(500, count - items.length), offset: items.length,
        }, controller.signal);
        if (controller.signal.aborted) return;
        if (page.total !== available) {
          setAvailable(page.total);
          throw new Error(`La cantidad de resultados cambió a ${number(page.total)}. Revisa el alcance y vuelve a exportar.`);
        }
        if (page.items.length === 0 || page.items.some(item => seen.has(item.id))) {
          throw new Error("Los resultados cambiaron durante la descarga. Vuelve a intentarlo para obtener un archivo completo.");
        }
        for (const item of page.items.slice(0, count - items.length)) {
          if (seen.has(item.id)) throw new Error("Los resultados cambiaron. Vuelve a intentar la exportación.");
          seen.add(item.id);
          items.push(item);
        }
        setProgress(items.length);
      }
      if (controller.signal.aborted) return;
      const blob = createTransactionExport(items, format, {
        categories, accountNames, period: request.period, total: available, filters: request.filterLabels,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `movimientos-${request.filePeriod}-${items.length}.${format === "csv" ? "csv" : "md"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onExported(items.length);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo exportar. Vuelve a intentarlo.");
    } finally {
      controllerRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return createPortal(<dialog ref={dialogRef} aria-labelledby="transaction-export-title" aria-describedby="transaction-export-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border border-outline bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40">
    <form className="flex max-h-[90dvh] flex-col" onSubmit={event => { event.preventDefault(); void download(); }}>
      <div className="shrink-0 border-b border-outline px-4 py-4 sm:px-6">
        <h2 id="transaction-export-title" className="text-xl font-semibold">Exportar movimientos</h2>
        <p id="transaction-export-description" className="mt-1 text-sm text-muted">{number(available)} {available === 1 ? "resultado disponible" : "resultados disponibles"} con los filtros actuales.</p>
      </div>
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <p className="text-xs text-muted [overflow-wrap:anywhere]">{[request.period, ...request.filterLabels].join(" · ")}</p>
        <fieldset disabled={busy} className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Cantidad a exportar</legend>
          <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${scope === "all" ? "border-primary/30 bg-primary-mist/50" : "border-outline"}`}>
            <input type="radio" name="export-scope" checked={scope === "all"} onChange={() => setScope("all")} className="h-4 w-4 shrink-0 accent-primary" />
            <span className="text-sm">Todos los resultados <strong className="whitespace-nowrap">({number(available)})</strong></span>
          </label>
          <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${scope === "custom" ? "border-primary/30 bg-primary-mist/50" : "border-outline"}`}>
            <input type="radio" name="export-scope" checked={scope === "custom"} onChange={() => setScope("custom")} className="h-4 w-4 shrink-0 accent-primary" />
            <span className="text-sm">Elegir cantidad</span>
          </label>
          {scope === "custom" ? <label className="block space-y-1.5 pt-1 text-sm">
            <span>Cantidad de movimientos</span>
            <input type="number" inputMode="numeric" min={1} max={available} step={1} required value={quantity}
              aria-invalid={!valid} aria-describedby="export-quantity-help" onChange={event => setQuantity(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-outline bg-white px-3 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            <span id="export-quantity-help" className={`block text-xs ${valid ? "text-muted" : "text-danger"}`}>Ingresa un número entero entre 1 y {number(available)}.</span>
          </label> : null}
          <p className="pt-1 text-xs text-muted">Más recientes primero, igual que en la lista. Incluye resultados que aún no has cargado en pantalla.</p>
        </fieldset>
        <label className="block space-y-1.5 text-sm font-semibold">
          <span>Formato</span>
          <select value={format} disabled={busy} onChange={event => setFormat(event.target.value as TransactionExportFormat)}
            className="min-h-11 w-full rounded-xl border border-outline bg-white px-3 text-base font-normal">
            <option value="csv">CSV — hoja de cálculo</option>
            <option value="markdown">Markdown — documento de texto</option>
          </select>
        </label>
        {error ? <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
        {busy ? <p role="status" className="text-sm text-muted">Preparando {number(progress)} de {number(count)} movimientos…</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-outline p-4 sm:px-6">
        <Button tone="ghost" compactOnMobile onClick={onClose}>Cancelar</Button>
        <Button type="submit" compactOnMobile disabled={!valid || busy} className="max-w-full">
          {busy ? "Preparando…" : `Exportar ${valid ? number(count) : ""} ${count === 1 ? "movimiento" : "movimientos"}`}
        </Button>
      </div>
    </form>
  </dialog>, document.body);
}
