import { useFormatCurrency } from "../hooks";
import type { MonthlyMovement } from "../types";
import { Panel } from "./ui";

type MonthlyMovementsTableProps = {
  data: MonthlyMovement[];
};

export function MonthlyMovementsTable({ data }: MonthlyMovementsTableProps) {
  const formatCurrency = useFormatCurrency();

  return (
    <Panel>
      <div className="space-y-2">
        <h2 className="text-3xl font-medium tracking-[-0.03em]">Movimientos mensuales</h2>
        <p className="text-muted">Resumen de ingresos y gastos por mes.</p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="text-left text-sm text-muted">
            <tr className="border-b border-outline/80">
              <th className="px-4 py-3 font-medium">Mes</th>
              <th className="px-4 py-3 font-medium">Ingresos</th>
              <th className="px-4 py-3 font-medium">Gastos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month} className="border-b border-outline/50 last:border-b-0">
                <td className="px-4 py-4">{row.month}</td>
                <td className="px-4 py-4 text-primary">{formatCurrency(row.income)}</td>
                <td className="px-4 py-4 text-danger">{formatCurrency(row.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
