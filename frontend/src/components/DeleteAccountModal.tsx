import { useQuery } from "@tanstack/react-query";
import { useQueryOwner } from "../query/shared";
import { statementsQueries } from "../query/statements";
import { transactionsQueries } from "../query/transactions";
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
  const owner = useQueryOwner();
  // Share identity/cancellation, but verify anew on opening this destructive flow.
  const statements = useQuery({ ...statementsQueries.list(owner, account.id), staleTime: 0 });
  const transactions = useQuery({ ...transactionsQueries.page(owner,
    { account_id: account.id, limit: 1, offset: 0 }), staleTime: 0 });
  const checking = statements.isFetching || transactions.isFetching;
  const failed = statements.isError || transactions.isError;
  const records = !checking && !failed && statements.data && transactions.data
    ? { statements: statements.data.length, transactions: transactions.data.total } : null;
  const checkError = !checking && failed
    ? "No pudimos comprobar los registros de esta cuenta. Inténtalo de nuevo antes de eliminarla." : null;
  const retry = () => {
    if (statements.isError) void statements.refetch();
    if (transactions.isError) void transactions.refetch();
  };
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
      {checkError ? <div><p role="alert" className="text-danger">{checkError}</p><Button tone="ghost" onClick={retry}>Reintentar</Button></div> : null}
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
