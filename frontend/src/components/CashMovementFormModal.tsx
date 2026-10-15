import { useState } from "react";
import { TransactionService } from "../services";
import { CategoryType, TransactionType } from "../types";
import type { Category, ManualTransactionInput, Transaction } from "../types";
import { Button } from "./ui";

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
      if (transaction) await TransactionService.updateCashTransaction(transaction.id, payload);
      else await TransactionService.createCashTransaction(payload);
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!transaction) return;
    setSaving(true);
    setError(null);
    try {
      await TransactionService.deleteCashTransaction(transaction.id);
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cash-movement-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-3 py-4 backdrop-blur-sm">
      <div className="surface-card max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto p-6 sm:p-8">
        <p className="eyebrow m-0 text-primary">Cuenta Efectivo</p>
        <h2 id="cash-movement-title" className="mt-2 dialog-title">
          {confirmDelete ? "Eliminar movimiento" : transaction ? "Editar movimiento" : "Registrar movimiento"}
        </h2>
        <p className="mt-2 text-sm text-muted">Registra dinero que entra o sale de tu efectivo. No necesitas una cartola.</p>

        {confirmDelete ? (
          <div className="mt-7 space-y-5">
            <p className="text-ink">¿Eliminar este movimiento manual? Esta acción actualizará los totales de Efectivo.</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-3">
              <Button tone="secondary" disabled={saving} onClick={initialDelete ? onClose : () => setConfirmDelete(false)}>Cancelar</Button>
              <Button className="border-danger bg-danger text-white hover:bg-danger/90" disabled={saving} onClick={() => void remove()}>
                {saving ? "Eliminando..." : "Eliminar movimiento"}
              </Button>
            </div>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={(event) => void save(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-ink">Tipo
                <select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId(""); }} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary">
                  <option value={TransactionType.EXPENSE}>Gasto</option>
                  <option value={TransactionType.INCOME}>Ingreso</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-ink">Monto en pesos
                <input type="number" min="1" max="2147483647" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary" />
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-5">
              {transaction ? <Button tone="ghost" className="text-danger hover:text-danger" disabled={saving} onClick={() => setConfirmDelete(true)}>Eliminar</Button> : <span />}
              <div className="flex gap-3">
                <Button tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : transaction ? "Guardar cambios" : "Registrar"}</Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
