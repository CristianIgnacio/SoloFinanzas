import type { ReactNode } from "react";
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
    <div className="md:overflow-x-auto">
      <table role="table" className="block w-full border-collapse md:table md:min-w-[720px]">
        <thead role="rowgroup" className="sr-only text-left text-sm text-muted md:not-sr-only md:table-header-group">
          <tr className="border-b border-outline">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Descripción</th>
            <th className="px-4 py-3 font-medium">Categoría</th>
            <th className="px-4 py-3 text-right font-medium">Monto</th>
            {renderActions ? <th className="px-4 py-3 text-right font-medium">Acciones</th> : null}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block md:table-row-group">
          {transactions.map((transaction) => (
            <tr role="row" key={transaction.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 border-b border-outline/60 py-4 first:pt-0 last:border-0 md:table-row md:py-0">
              <td role="cell" className="col-span-2 block text-sm text-muted md:table-cell md:whitespace-nowrap md:px-4 md:py-4 md:text-base">{parseLocalDate(transaction.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td role="cell" className="col-span-2 block min-w-0 text-sm font-medium [overflow-wrap:anywhere] md:table-cell md:px-4 md:py-4 md:text-base">{transaction.description}</td>
              <td role="cell" className="col-span-2 block min-w-0 md:table-cell md:px-4 md:py-4">
                <span className="inline-block max-w-full rounded-xl bg-paper-soft px-2 py-1 text-sm text-muted [overflow-wrap:anywhere] md:rounded-full md:px-3">{getCategoryPath(transaction.category_id, categoryMap)}</span>
              </td>
              <td role="cell" className={cn("block min-w-0 self-center font-semibold tabular-nums [overflow-wrap:anywhere] md:table-cell md:whitespace-nowrap md:px-4 md:py-4 md:text-right", transaction.amount_clp >= 0 ? "text-primary" : "text-ink")}>{formatCurrency(transaction.amount_clp)}</td>
              {renderActions ? <td role="cell" className="block self-center text-right md:table-cell md:px-4 md:py-4"><div className="flex justify-end">{renderActions(transaction)}</div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
