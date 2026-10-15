import type { ReactNode } from "react";
import type { AccountTotal } from "../services/reportService";
import { ArrowDownIcon, ArrowUpIcon, ReceiptIcon } from "./icons";
import { cn } from "./ui";

type Props = {
  description: string;
  compactOnDesktop?: boolean;
  firstLabel: string;
  firstValue: string;
  firstIcon: ReactNode;
  summary: AccountTotal;
  ready: boolean;
  formatCurrency: (value: number) => string;
};

export function AccountActivitySummary({ compactOnDesktop = false, description, firstLabel, firstValue, firstIcon, summary, ready, formatCurrency }: Props) {
  const metrics = [
    { label: firstLabel, value: firstValue, icon: firstIcon, tone: "neutral" },
    { label: "Ingresos", value: ready ? formatCurrency(summary.income) : "—", icon: <ArrowUpIcon className="h-5 w-5" />, tone: "income" },
    { label: "Gastos", value: ready ? formatCurrency(summary.expenses) : "—", icon: <ArrowDownIcon className="h-5 w-5" />, tone: "expense" },
    { label: "Movimientos", value: ready ? String(summary.count) : "—", icon: <ReceiptIcon className="h-5 w-5" />, tone: "neutral" },
  ];
  const hasLongValue = metrics.some((metric) => metric.value.length > 10);
  return (
    <div className="space-y-3">
      {compactOnDesktop ? (
        <section className="hidden rounded-2xl border border-outline bg-white px-5 py-4 lg:block" aria-label="Resumen histórico de la cuenta">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Todo el historial</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
            <div className="metric-container">
              <p className="text-sm text-muted">Ingresos</p>
              <p className="metric-value mt-1 text-primary">{ready ? formatCurrency(summary.income) : "—"}</p>
              <p className="mt-1 text-sm text-muted">Sin transferencias internas</p>
            </div>
            <div className="metric-container">
              <p className="text-sm text-muted">Gastos</p>
              <p className="metric-value mt-1 text-ink">{ready ? formatCurrency(summary.expenses) : "—"}</p>
              <p className="mt-1 text-sm text-muted">Sin transferencias internas</p>
            </div>
            <div className="metric-container">
              <p className="text-sm text-muted">{firstLabel}</p>
              <p className="metric-value mt-1 text-ink" title="Incluye todos los movimientos, también las transferencias internas.">{firstValue}</p>
              <p className="mt-1 text-sm text-muted">No corresponde al saldo bancario</p>
            </div>
          </div>
        </section>
      ) : null}
      <div className={compactOnDesktop ? "space-y-3 lg:hidden" : "space-y-3"}>
      <section className={cn("grid gap-3 sm:gap-4", hasLongValue ? "grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]" : "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] sm:grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]")} aria-label="Resumen de movimientos de la cuenta">
        {metrics.map((metric) => (
          <article key={metric.label} className="surface-card metric-container flex flex-col justify-between gap-3 p-3.5 sm:min-h-[190px] sm:gap-6 sm:p-6">
            <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
              <p className="text-sm font-medium text-muted sm:text-base">{metric.label}</p>
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12",
                metric.tone === "income" ? "bg-primary-mist text-primary" : metric.tone === "expense" ? "bg-danger-soft text-danger" : "bg-paper-soft text-clay")}>{metric.icon}</span>
            </div>
            <strong className="metric-value text-ink">{metric.value}</strong>
          </article>
        ))}
      </section>
      <p className="text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}
