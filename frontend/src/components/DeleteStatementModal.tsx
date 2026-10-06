import { useEffect } from "react";

import { useFormatCurrency } from "../hooks";
import type { Statement, StatementDeletionImpact } from "../types";
import { LoadingState } from "./LoadingState";
import { TrashIcon } from "./icons";
import { Button, StatusNotice, cn } from "./ui";

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
    month: "long",
    year: "numeric",
  });
}

export function DeleteStatementModal({
  statement,
  impact,
  loadingImpact,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteStatementModalProps) {
  const formatCurrency = useFormatCurrency();
  const busy = loadingImpact || deleting;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/30 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        aria-labelledby="delete-statement-title"
        aria-modal="true"
        className="surface-card max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-6 md:p-8"
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <TrashIcon className="h-6 w-6" />
          </span>
          <div className="space-y-3">
            <p className="eyebrow m-0 text-danger">Deshacer importacion</p>
            <h2
              className="text-4xl font-medium tracking-[-0.04em] text-ink"
              id="delete-statement-title"
            >
              Confirmar eliminacion
            </h2>
            <p className="text-muted">
              Se eliminaran la cartola y los movimientos creados durante esta importacion.
              Los saldos, graficos y transferencias internas se recalcularan.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-outline/80 bg-paper-soft/80 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Cartola seleccionada
          </p>
          <p className="mt-2 break-words text-2xl font-medium tracking-[-0.03em] text-ink">
            {statement.file_name}
          </p>
          <p className="mt-1 capitalize text-muted">{formatPeriod(statement.period_month)}</p>
        </div>

        {loadingImpact ? (
          <div className="mt-6">
            <LoadingState message="Calculando el impacto de la eliminacion..." />
          </div>
        ) : null}

        {error ? (
          <StatusNotice className="mt-6" tone="error">
            {error}
          </StatusNotice>
        ) : null}

        {!loadingImpact && impact ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ImpactValue label="Movimientos" value={String(impact.transaction_count)} />
              <ImpactValue
                label="Ingresos"
                value={formatCurrency(impact.income_total_clp)}
                valueClassName="text-primary"
              />
              <ImpactValue
                label="Gastos"
                value={formatCurrency(impact.expense_total_clp)}
                valueClassName="text-danger"
              />
              <ImpactValue
                label="Impacto neto"
                value={formatCurrency(impact.net_total_clp)}
                valueClassName={impact.net_total_clp >= 0 ? "text-primary" : "text-danger"}
              />
              <ImpactValue
                label="Transferencias afectadas"
                value={String(impact.internal_transfer_match_count)}
              />
              <ImpactValue
                label="Meses afectados"
                value={impact.affected_periods.length > 0 ? impact.affected_periods.join(", ") : "Ninguno"}
              />
            </div>

            <StatusNotice tone={impact.raw_file_delete_eligible ? "error" : "info"}>
              {impact.raw_file_delete_eligible
                ? "El PDF original tambien sera eliminado del almacenamiento."
                : "El PDF original no sera eliminado automaticamente."}
            </StatusNotice>

            <p className="rounded-2xl border border-danger/20 bg-danger-soft/50 px-4 py-3 text-sm leading-6 text-danger">
              Esta accion no se puede deshacer y las categorizaciones manuales de estos
              movimientos se perderan.
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            className="border-danger bg-danger text-white hover:bg-[#9d4337]"
            onClick={onConfirm}
            disabled={busy || impact === null || error !== null}
          >
            <TrashIcon className="h-5 w-5" />
            {deleting ? "Eliminando..." : "Deshacer importacion"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ImpactValueProps = {
  label: string;
  value: string;
  valueClassName?: string;
};

function ImpactValue({ label, value, valueClassName }: ImpactValueProps) {
  return (
    <div className="rounded-2xl border border-outline/70 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold text-ink", valueClassName)}>{value}</p>
    </div>
  );
}
