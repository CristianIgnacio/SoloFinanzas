import { useExplicitAction } from "../query/useExplicitAction";
import { useWriteActions } from "../query/writes";
import { useState } from "react";
import { CategoryType, TransactionType } from "../types";
import type { Category, ManualTransactionInput, Transaction } from "../types";
import { Button } from "./ui";
import { ModalDialog } from "./ModalDialog";
import { parseLocalDate } from "../lib";

const pesos = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

type Props = {
  categories: Category[];
  transaction?: Transaction | null;
  initialDelete?: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function CashMovementFormModal({ categories, transaction, initialDelete = false, onClose, onChanged }: Props) {
  const writes = useWriteActions();
  const createAction = useExplicitAction(writes.transactions.createCashTransaction);
  const updateAction = useExplicitAction(writes.transactions.updateCashTransaction);
  const deleteAction = useExplicitAction(writes.transactions.deleteCashTransaction);
  const [type, setType] = useState<TransactionType>(transaction?.transaction_type ?? TransactionType.EXPENSE);
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount_clp)) : "");
  const [date, setDate] = useState(transaction?.date ?? localToday());
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ? String(transaction.category_id) : "");
  const [confirmDelete, setConfirmDelete] = useState(initialDelete);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const compatibleCategories = categories.filter((category) =>
    category.is_active && category.type === (type === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE),
  );

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > 2_147_483_647) {
      setError("Ingresa un monto positivo en pesos enteros.");
      return;
    }
    if (!description.trim() || !date) {
      setError("Completa la fecha y la descripción.");
      return;
    }
    const payload: ManualTransactionInput = {
      transaction_type: type,
      amount_clp: parsedAmount,
      date,
      description: description.trim(),
      category_id: categoryId ? Number(categoryId) : null,
    };
    setSaving(true);
    setError(null);
    try {
      if (transaction) await updateAction.run(transaction.id, payload);
      else await createAction.run(payload);
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!transaction || saving) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAction.run(transaction.id);
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalDialog labelledBy="cash-movement-title" busy={saving} onClose={onClose}
      initialFocus={confirmDelete ? "[data-modal-cancel]" : undefined} className="max-w-xl !overflow-hidden">
      <div className="shrink-0 border-b border-outline/70 px-4 py-3 sm:px-6 sm:py-4">
        <p className="eyebrow m-0 text-primary">Cuenta Efectivo</p>
        <h2 id="cash-movement-title" className="mt-2 dialog-title">
          {confirmDelete ? "Eliminar movimiento" : transaction ? "Editar movimiento" : "Registrar movimiento"}
        </h2>
        {!confirmDelete ? <p className="mt-2 text-sm text-muted">Registra dinero que entra o sale de tu efectivo.</p> : null}
      </div>

        {confirmDelete ? (
          <div className="space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <p className="text-ink">¿Eliminar este movimiento manual? Esta acción actualizará los totales de Efectivo.</p>
            {transaction ? <div className="rounded-2xl border border-outline bg-paper-soft p-4">
              <p className="break-words font-semibold text-ink">{transaction.description}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Fecha</dt><dd>{parseLocalDate(transaction.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{transaction.transaction_type === TransactionType.INCOME ? "Ingreso" : "Gasto"}</dt><dd className="font-semibold">{pesos.format(Math.abs(transaction.amount_clp))}</dd></div>
              </dl>
            </div> : null}
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Button compactOnMobile data-modal-cancel tone="secondary" disabled={saving} onClick={initialDelete ? onClose : () => setConfirmDelete(false)}>Cancelar</Button>
              <Button compactOnMobile className="!border-danger !bg-danger text-white hover:!bg-danger/90" disabled={saving} onClick={() => void remove()}>
                {saving ? "Eliminando..." : "Eliminar movimiento"}
              </Button>
            </div>
          </div>
        ) : (
          <form className="flex min-h-0 flex-col" onSubmit={(event) => void save(event)}
            onFocusCapture={event => {
              if (event.target.matches("input, select")) event.target.scrollIntoView({ block: "nearest" });
            }}>
            <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 [scroll-padding-block:12px] sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-ink">Tipo
                <select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId(""); }} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary">
                  <option value={TransactionType.EXPENSE}>Gasto</option>
                  <option value={TransactionType.INCOME}>Ingreso</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-ink">Monto en pesos
                <input type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-ink">Fecha
                <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary" />
              </label>
              <label className="space-y-2 text-sm font-medium text-ink">Categoría (opcional)
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary">
                  <option value="">Sin categoría</option>
                  {compatibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium text-ink">Descripción
              <input type="text" maxLength={240} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. Almuerzo" className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary" />
            </label>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-outline p-3 sm:px-6 sm:py-4">
              {transaction ? <Button compactOnMobile tone="ghost" className="text-danger hover:text-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>Eliminar</Button> : <span />}
              <div className="flex gap-3">
                <Button compactOnMobile tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
                <Button compactOnMobile type="submit" disabled={saving}>{saving ? "Guardando..." : transaction ? "Guardar cambios" : "Registrar"}</Button>
              </div>
            </div>
          </form>
        )}
    </ModalDialog>
  );
}
