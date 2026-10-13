import type { ReactNode } from "react";
import type { AccountTotal } from "../services/reportService";
import { ArrowDownIcon, ArrowUpIcon, ReceiptIcon } from "./icons";
import { StatCard } from "./ui";

type Props = {
  description: string;
  firstLabel: string;
  firstValue: string;
  firstIcon: ReactNode;
  summary: AccountTotal;
  ready: boolean;
  formatCurrency: (value: number) => string;
};

export function AccountActivitySummary({ description, firstLabel, firstValue, firstIcon, summary, ready, formatCurrency }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{description}</p>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de movimientos de la cuenta">
        <StatCard label={firstLabel} value={firstValue} icon={firstIcon} />
        <StatCard label="Ingresos" value={ready ? formatCurrency(summary.income) : "—"} tone="income" icon={<ArrowUpIcon className="h-5 w-5" />} />
        <StatCard label="Gastos" value={ready ? formatCurrency(summary.expenses) : "—"} tone="expense" icon={<ArrowDownIcon className="h-5 w-5" />} />
        <StatCard label="Movimientos" value={ready ? String(summary.count) : "—"} icon={<ReceiptIcon className="h-5 w-5" />} />
      </section>
    </div>
  );
}
