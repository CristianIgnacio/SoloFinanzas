import { useEffect, useState } from "react";
import { StatementService, TransactionService } from "../services";
import type { Account } from "../types";
import { ModalDialog } from "./ModalDialog";
import { TrashIcon } from "./icons";
import { Button } from "./ui";

export function DeleteAccountModal({ account, deleting, error, onCancel, onConfirm }: {
  account: Account;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [records, setRecords] = useState<{ statements: number; transactions: number } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRecords(null);
    setCheckError(null);
    Promise.all([
      StatementService.getStatements(account.id),
      TransactionService.getPage({ account_id: account.id, limit: 1, offset: 0 }),
    ]).then(([statements, transactions]) => {
      if (!cancelled) setRecords({ statements: statements.length, transactions: transactions.total });
    }).catch(() => {
      if (!cancelled) setCheckError("No pudimos comprobar los registros de esta cuenta. Inténtalo de nuevo antes de eliminarla.");
    });
    return () => { cancelled = true; };
  }, [account.id, attempt]);
  const blocked = records !== null && (records.statements > 0 || records.transactions > 0);

  return <ModalDialog labelledBy="delete-account-title" busy={deleting} onClose={onCancel}
    initialFocus="[data-modal-cancel]" className="max-w-lg p-5 sm:p-6">
    <p className="eyebrow m-0 text-danger">Eliminar cuenta</p>
    <h2 id="delete-account-title" className="mt-2 dialog-title">¿Eliminar {account.name}?</h2>
    <div className="mt-4 text-sm text-muted" aria-live="polite">
      {!records && !checkError ? <p>Comprobando cartolas y movimientos…</p> : null}
      {records ? blocked ? <div className="rounded-xl bg-paper-soft p-4">
        <p className="font-semibold text-ink">Esta cuenta tiene registros asociados y no se puede eliminar.</p>
        <p className="mt-2">{records.statements} {records.statements === 1 ? "cartola" : "cartolas"} · {records.transactions} {records.transactions === 1 ? "movimiento" : "movimientos"}</p>
        <p className="mt-2">Revisa sus importaciones y movimientos antes de intentar eliminar la cuenta.</p>
      </div> : <p>No tiene cartolas ni movimientos asociados. La eliminación de la cuenta es definitiva.</p> : null}
      {checkError ? <div><p role="alert" className="text-danger">{checkError}</p><Button tone="ghost" onClick={() => setAttempt(value => value + 1)}>Reintentar</Button></div> : null}
    </div>
    {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button data-modal-cancel tone="secondary" onClick={onCancel} disabled={deleting}>Cancelar</Button>
      <Button className="!border-danger !bg-danger text-white hover:!bg-danger/90" onClick={onConfirm} disabled={deleting || !records || blocked}>
        <TrashIcon className="h-5 w-5" />{deleting ? "Eliminando..." : "Eliminar cuenta"}
      </Button>
    </div>
  </ModalDialog>;
}
