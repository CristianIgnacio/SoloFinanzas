import { useId, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAuth } from "../auth/AuthProvider";
import { useFormatCurrency } from "../hooks";
import { createCategoryMap, getCategoryPath, groupCategories } from "../lib";
import type { Category, Transaction } from "../types";
import { CategoryPicker } from "./CategoryPicker";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon, categoryAppearance } from "./CategoryIcon";
import { InvestmentIcon } from "./icons";
import { Panel } from "./ui";

function readSelection(key: string): number[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(value) && value.every(id => Number.isSafeInteger(id) && id > 0) ? value : null;
  } catch { return null; }
}

export function DashboardCategorySummary({ categories, transactions, period }: {
  categories: Category[]; transactions: Transaction[]; period: string;
}) {
  const { session } = useAuth();
  const storageKey = `solofinanzas.dashboard.categories.${session?.user.id}`;
  const [saved, setSaved] = useState(() => readSelection(storageKey));
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const categoriesId = useId();
  const formatCurrency = useFormatCurrency();
  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);
  const selectable = categories.filter(category => category.type !== "transfer");
  const defaults = selectable.filter(category =>
    category.name.trim().localeCompare("Ganancias tarjetas", "es", { sensitivity: "base" }) === 0,
  ).map(category => category.id);
  const selected = new Set(saved ?? defaults);
  const chosen = [...selected].map(id => categoryMap.get(id))
    .filter((category): category is Category => category !== undefined && category.type !== "transfer");
  const appearance = categoryAppearance(chosen[0], categoryMap);
  const palette = CATEGORY_COLORS[appearance.color];
  const effectiveIds = new Set(chosen.map(category => category.id));
  const matching = transactions.filter(transaction => {
    const category = categoryMap.get(transaction.category_id ?? -1);
    return category && category.type !== "transfer" && !transaction.is_internal_transfer &&
      transaction.origin !== "cash_transfer" &&
      (effectiveIds.has(category.id) || effectiveIds.has(category.parent_id ?? -1));
  });
  const income = matching.filter(transaction => transaction.transaction_type === "income")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount_clp), 0);
  const expense = matching.filter(transaction => transaction.transaction_type === "expense")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount_clp), 0);
  const included = selectable.filter(category => effectiveIds.has(category.id) || effectiveIds.has(category.parent_id ?? -1));
  const expensesOnly = included.length > 0 && included.every(category => category.type === "expense");
  const totalLabel = expensesOnly ? "Gasto total" : included.some(category => category.type === "expense") ? "Saldo neto" : "Total ingresos";
  const totals = new Map<number, { amount: number; count: number }>();
  matching.forEach(transaction => {
    const id = transaction.category_id!;
    const previous = totals.get(id) ?? { amount: 0, count: 0 };
    const amount = Math.abs(transaction.amount_clp) * (transaction.transaction_type === "expense" ? -1 : 1);
    totals.set(id, { amount: previous.amount + amount, count: previous.count + 1 });
  });
  const detailRows = included
    .filter(category => totals.has(category.id) || !included.some(child => child.parent_id === category.id))
    .map(category => ({ category, ...totals.get(category.id) ?? { amount: 0, count: 0 } }))
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount) || left.category.name.localeCompare(right.category.name, "es"));
  const isDefault = saved === null || (selected.size === defaults.length && defaults.every(id => selected.has(id)));

  return <Panel compactOnMobile aria-label="Resumen de categorías"
    className="metric-container relative flex min-h-[280px] w-full max-w-[22rem] min-w-0 flex-col items-center justify-center gap-3 justify-self-center text-center sm:min-h-[240px] sm:max-w-none sm:gap-4">
    <div className="absolute right-2 top-2">
      <CategoryPicker multiple purpose="summary" triggerVariant="icon" label="Elegir categorías del resumen" disabled={false}
        groups={groupCategories(selectable)} value={new Set(chosen.map(category => String(category.id)))}
        description="El resumen muestra ingresos menos gastos, sin transferencias internas. Tu selección se guarda en este navegador."
        error={error} onChange={ids => {
          try {
            const next = [...ids].map(Number);
            localStorage.setItem(storageKey, JSON.stringify(next));
            setSaved(next);
            setError(null);
          } catch { setError("No se pudo guardar la selección. Revisa el almacenamiento del navegador."); }
        }} />
    </div>
    <button type="button" aria-label={showDetail ? "Volver al resumen de categorías" : "Ver detalle por categoría"}
      title={showDetail ? "Volver al resumen" : "Ver detalle por categoría"}
      aria-expanded={showDetail} aria-controls={categoriesId} onClick={() => setShowDetail(current => !current)}
      data-category-icon={chosen.length === 1 ? appearance.icon : "summary"}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition duration-300 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none sm:h-20 sm:w-20 ${chosen.length === 1 ? "" : "border-primary/20 bg-primary-mist text-primary"}`}
      style={chosen.length === 1 ? { color: palette.foreground, backgroundColor: palette.background, borderColor: `${palette.foreground}33` } : undefined}>
      {chosen.length === 1
        ? <FontAwesomeIcon icon={CATEGORY_ICONS[appearance.icon].icon} className="h-7 w-7 sm:h-9 sm:w-9" />
        : <InvestmentIcon className="h-7 w-7 sm:h-9 sm:w-9" />}
    </button>
    <div className="w-full min-w-0 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
        {isDefault ? "Ganancias tarjetas" : "Categorías destacadas"}
      </h2>
      <strong className="metric-value text-ink">{formatCurrency(expensesOnly ? expense : income - expense)}</strong>
    </div>
    <div className="w-full min-w-0">
      <div aria-hidden={showDetail} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${showDetail ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-primary-mist px-3 py-1.5 text-sm font-semibold text-primary">
              {matching.length} {matching.length === 1 ? "movimiento" : "movimientos"}
            </span>
            <span className="rounded-full bg-paper-soft px-3 py-1.5 text-sm font-semibold text-muted">{period}</span>
          </div>
        </div>
      </div>
      <div id={categoriesId} aria-hidden={!showDetail} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${showDetail ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <p className="mb-3 text-xs text-muted">{totalLabel} · {period}</p>
          {detailRows.length ? <ul aria-label="Aporte por categoría" tabIndex={showDetail ? 0 : -1}
            className="max-h-52 space-y-1 overflow-y-auto overscroll-contain border-t border-outline py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {detailRows.map(({ category, amount, count }) => {
              const duplicate = detailRows.some(row => row.category.id !== category.id &&
                row.category.name.trim().localeCompare(category.name.trim(), "es", { sensitivity: "base" }) === 0);
              const hasChildren = included.some(child => child.parent_id === category.id);
              return <li key={category.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-1 py-2">
                <CategoryIcon category={category} categoryMap={categoryMap} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{duplicate ? getCategoryPath(category.id, categoryMap) : category.name}</p>
                  <p className="text-xs text-muted">{hasChildren ? "Sin subcategoría · " : ""}{count} {count === 1 ? "movimiento" : "movimientos"}</p>
                </div>
                <span className="max-w-[7rem] text-right text-sm font-semibold tabular-nums text-ink [overflow-wrap:anywhere]">{formatCurrency(expensesOnly ? -amount : amount)}</span>
              </li>;
            })}
          </ul> : <p className="py-4 text-sm text-muted">Elige categorías desde el engranaje para ver su detalle.</p>}
        </div>
      </div>
    </div>
  </Panel>;
}
