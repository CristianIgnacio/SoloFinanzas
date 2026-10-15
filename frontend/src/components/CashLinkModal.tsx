import type { Transaction } from "../types";
import { Button } from "./ui";

const pesos = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0,
});

type Props = {
  transaction: Transaction;
  accountName: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function CashLinkModal({ transaction, accountName, saving, error, onClose, onConfirm }: Props) {
  const undo = transaction.cash_transfer_linked || transaction.origin === "cash_transfer";
  const cashAmount = -transaction.amount_clp;
  const direction = cashAmount > 0 ? "Entrada a Efectivo" : "Salida de Efectivo";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cash-link-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-3 py-4 backdrop-blur-sm">
      <div className="surface-card max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto p-6 sm:p-8">
        <p className="eyebrow m-0 text-primary">Transferencia con Efectivo</p>
        <h2 id="cash-link-title" className="mt-2 dialog-title">
          {undo ? "Deshacer vínculo" : "Vincular con Efectivo"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {undo
            ? "Se eliminará la contraparte creada en Efectivo. El movimiento bancario permanecerá en su cartola."
            : "Confirma que este movimiento corresponde a dinero trasladado entre tu cuenta y Efectivo."}
        </p>
        <dl className="mt-6 space-y-3 border-y border-outline py-5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Cuenta</dt><dd className="text-right font-medium text-ink">{accountName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Movimiento</dt><dd className="text-right font-medium text-ink">{transaction.description}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Fecha</dt><dd className="font-medium text-ink">{transaction.date}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Monto</dt><dd className="font-medium text-ink">{pesos.format(Math.abs(transaction.amount_clp))}</dd></div>
          {!undo ? <div className="flex justify-between gap-4"><dt className="text-muted">En Efectivo</dt><dd className="font-semibold text-primary">{direction}</dd></div> : null}
        </dl>
        {!undo ? <p className="mt-4 text-sm text-muted">La contraparte tendrá el mismo monto y fecha, con el signo opuesto. Ambos movimientos se excluirán de ingresos y gastos consolidados.</p> : null}
        {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <Button tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} onClick={onConfirm}>{saving ? "Guardando..." : undo ? "Deshacer vínculo" : "Confirmar vínculo"}</Button>
        </div>
      </div>
    </div>
  );
}
