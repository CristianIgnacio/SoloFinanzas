import type { Transaction } from "../types";
import { Button } from "./ui";
import { ModalDialog } from "./ModalDialog";
import { parseLocalDate } from "../lib";

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
  const isCashSide = transaction.origin === "cash_transfer";
  const cashAmount = isCashSide ? transaction.amount_clp : -transaction.amount_clp;
  const direction = cashAmount > 0 ? "Entrada a Efectivo" : "Salida de Efectivo";
  const bankName = isCashSide ? "Cuenta bancaria" : accountName;
  const from = cashAmount > 0 ? bankName : "Efectivo";
  const to = cashAmount > 0 ? "Efectivo" : bankName;
  return (
    <ModalDialog labelledBy="cash-link-title" busy={saving} onClose={onClose}
      initialFocus="[data-modal-cancel]" className="max-w-lg p-5 sm:p-6">
        <p className="eyebrow m-0 text-primary">Transferencia con Efectivo</p>
        <h2 id="cash-link-title" className="mt-2 dialog-title">
          {undo ? "Deshacer vínculo" : "Vincular con Efectivo"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {undo
            ? "Se eliminará la contraparte creada en Efectivo. El movimiento bancario permanecerá en su cartola."
            : "Confirma que este movimiento corresponde a dinero trasladado entre tu cuenta y Efectivo."}
        </p>
        <div className="mt-5 rounded-2xl border border-outline bg-paper-soft p-4">
          <div role="group" aria-label={`De ${from} a ${to}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm font-semibold">
            <span className="break-words">{from}</span><span aria-hidden="true" className="text-xl text-primary">→</span><span className="break-words text-right">{to}</span>
          </div>
          <p className="mt-3 text-center text-2xl font-semibold tabular-nums">{pesos.format(Math.abs(transaction.amount_clp))}</p>
          <p className="mt-1 text-center text-sm text-muted">{direction}</p>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Movimiento</dt><dd className="min-w-0 break-words text-right font-medium text-ink">{transaction.description}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Fecha</dt><dd className="font-medium text-ink">{parseLocalDate(transaction.date).toLocaleDateString("es-CL")}</dd></div>
        </dl>
        {!undo ? <p className="mt-4 text-sm text-muted">Se creará el movimiento correspondiente en Efectivo. Este traslado no contará como ingreso ni gasto consolidado.</p> : null}
        {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <Button data-modal-cancel tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} onClick={onConfirm}>{saving ? "Guardando..." : undo ? "Deshacer vínculo" : "Confirmar vínculo"}</Button>
        </div>
    </ModalDialog>
  );
}
