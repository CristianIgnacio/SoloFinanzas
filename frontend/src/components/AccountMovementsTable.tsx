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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="text-left text-sm text-muted">
          <tr className="border-b border-outline">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Descripción</th>
            <th className="px-4 py-3 font-medium">Categoría</th>
            <th className="px-4 py-3 text-right font-medium">Monto</th>
            {renderActions ? <th className="px-4 py-3 text-right font-medium">Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="border-b border-outline/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-4 text-muted">{parseLocalDate(transaction.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td className="px-4 py-4 font-medium">{transaction.description}</td>
              <td className="px-4 py-4">
                <span className="rounded-full bg-paper-soft px-3 py-1 text-sm text-muted">{getCategoryPath(transaction.category_id, categoryMap)}</span>
              </td>
              <td className={cn("whitespace-nowrap px-4 py-4 text-right font-semibold", transaction.amount_clp >= 0 ? "text-primary" : "text-ink")}>{formatCurrency(transaction.amount_clp)}</td>
              {renderActions ? <td className="px-4 py-4 text-right"><div className="flex justify-end">{renderActions(transaction)}</div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
