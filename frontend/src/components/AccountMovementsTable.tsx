import type { ReactNode } from "react";
import "./AccountTables.css";
import { getCategoryPath, parseLocalDate } from "../lib";
import type { Category, Transaction } from "../types";
import { cn } from "./ui";

type Props = {
  transactions: Transaction[];
  categoryMap: Map<number, Category>;
  formatCurrency: (value: number) => string;
  renderActions?: (transaction: Transaction) => ReactNode;
};

export function AccountMovementsTable({ transactions, categoryMap, formatCurrency, renderActions }: Props) {
  return (
    <div className="-mx-4 sm:mx-0">
      <p className="border-b border-outline px-3 py-2 text-xs text-muted sm:hidden">Desliza para ver fecha, categoría y más detalles.</p>
      <div className="account-table-scroll overflow-x-auto" role="region" aria-label="Movimientos de la cuenta" tabIndex={0}>
        <table className={cn("account-data-table account-movements-table w-full min-w-[720px] table-fixed border-collapse text-sm", renderActions && "account-movements-table-actions")}>
          <thead className="text-left text-sm text-muted">
            <tr className="border-b border-outline">
              <th className="w-56 px-4 py-3 font-medium">Descripción</th>
              <th className="w-32 px-4 py-3 text-right font-medium">Monto</th>
              <th className="w-36 px-4 py-3 font-medium">Fecha</th>
              <th className="w-48 px-4 py-3 font-medium">Categoría</th>
              {renderActions ? <th className="w-40 px-4 py-3 text-right font-medium">Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="border-b border-outline/60 last:border-0">
                <td className="px-4 py-4 font-medium [overflow-wrap:anywhere]">{transaction.description}</td>
                <td className={cn("whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums", transaction.amount_clp >= 0 ? "text-primary" : "text-danger")}>{formatCurrency(transaction.amount_clp)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted">{parseLocalDate(transaction.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-4">
                  <span className="inline-block max-w-full rounded-xl bg-paper-soft px-2 py-1 text-xs text-muted [overflow-wrap:anywhere] sm:rounded-full sm:px-3 sm:text-sm">{getCategoryPath(transaction.category_id, categoryMap)}</span>
                </td>
                {renderActions ? <td className="px-4 py-4 text-right"><div className="flex justify-end">{renderActions(transaction)}</div></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
