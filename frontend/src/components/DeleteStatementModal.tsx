import { useFormatCurrency } from "../hooks";
import type { Statement, StatementDeletionImpact } from "../types";
import { ModalDialog } from "./ModalDialog";
import { TrashIcon } from "./icons";
import { Button, StatusNotice } from "./ui";

type DeleteStatementModalProps = {
  statement: Statement;
  impact: StatementDeletionImpact | null;
  loadingImpact: boolean;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatPeriod(period: string | null) {
  if (!period) return "Sin periodo";
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-CL", {
    month: "long", year: "numeric",
  });
}

export function DeleteStatementModal({ statement, impact, loadingImpact, deleting, error, onCancel, onConfirm }: DeleteStatementModalProps) {
  const formatCurrency = useFormatCurrency();
  return (
    <ModalDialog labelledBy="delete-statement-title" busy={deleting} onClose={onCancel}
      initialFocus="[data-modal-cancel]" className="max-w-xl p-4 sm:p-6">
      <p className="eyebrow m-0 text-danger">Cartola importada</p>
      <h2 id="delete-statement-title" className="mt-2 dialog-title">Deshacer importación</h2>
      <p className="mt-3 break-words font-semibold text-ink">{statement.file_name}</p>
      <p className="mt-1 text-sm capitalize text-muted">{formatPeriod(statement.period_month)}</p>
      <p className="mt-3 text-sm text-muted">Se eliminarán esta cartola y sus movimientos. Los saldos y gráficos se recalcularán.</p>

      {loadingImpact ? <p role="status" className="mt-5 text-sm text-muted">Calculando el impacto…</p> : null}
      {error ? <StatusNotice className="mt-4" tone="error">{error}</StatusNotice> : null}
      {!loadingImpact && impact ? <div className="mt-5 space-y-4">
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-outline bg-paper-soft p-4">
          <div><dt className="text-sm text-muted">Movimientos</dt><dd className="mt-1 text-xl font-semibold">{impact.transaction_count}</dd></div>
          <div><dt className="text-sm text-muted">Balance asociado</dt><dd className="mt-1 break-words text-xl font-semibold">{formatCurrency(impact.net_total_clp)}</dd></div>
        </dl>
        <div className="space-y-2 rounded-xl bg-danger-soft/60 p-3 text-sm text-danger">
          <p>Esta acción es definitiva. Se perderán las categorías asignadas a estos movimientos.</p>
          {impact.cash_counterpart_count > 0 ? <p>Además, se eliminarán {impact.cash_counterpart_count} {impact.cash_counterpart_count === 1 ? "movimiento vinculado" : "movimientos vinculados"} de Efectivo.</p> : null}
          {impact.raw_file_delete_eligible ? <p>El PDF original también se eliminará.</p> : null}
        </div>
        <details className="rounded-xl border border-outline">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver detalle del impacto</summary>
          <dl className="space-y-3 border-t border-outline px-4 py-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Ingresos</dt><dd className="font-medium">{formatCurrency(impact.income_total_clp)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Gastos</dt><dd className="font-medium">{formatCurrency(impact.expense_total_clp)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Transferencias afectadas</dt><dd className="font-medium">{impact.internal_transfer_match_count}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-muted">Meses afectados</dt><dd className="text-right capitalize">{impact.affected_periods.length ? impact.affected_periods.map(formatPeriod).join(", ") : "Ninguno"}</dd></div>
          </dl>
          {impact.cash_counterpart_count > 0 ? <p className="px-4 pb-3 text-sm text-muted">Los movimientos manuales independientes de Efectivo se conservarán.</p> : null}
          {!impact.raw_file_delete_eligible ? <p className="px-4 pb-3 text-sm text-muted">El PDF original no se eliminará automáticamente.</p> : null}
        </details>
      </div> : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button data-modal-cancel tone="secondary" onClick={onCancel} disabled={deleting}>Cancelar</Button>
        <Button className="!border-danger !bg-danger text-white hover:!bg-danger/90" onClick={onConfirm}
          disabled={loadingImpact || deleting || impact === null || error !== null}>
          <TrashIcon className="h-5 w-5" />{deleting ? "Eliminando..." : "Deshacer importación"}
        </Button>
      </div>
    </ModalDialog>
  );
}
