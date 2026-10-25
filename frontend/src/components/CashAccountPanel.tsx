import { AccountTablePagination } from "./AccountTablePagination";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useFormatCurrency } from "../hooks";
import { createCategoryMap } from "../lib";
import { AccountService, TransactionService } from "../services";
import { ReportService, type AccountTotal } from "../services/reportService";
import type { CashAccount, CashBalance, Category, Transaction } from "../types";
import { AccountActivitySummary } from "./AccountActivitySummary";
import { AccountMovementsTable } from "./AccountMovementsTable";
import { CashMovementFormModal } from "./CashMovementFormModal";
import { CashLinkModal } from "./CashLinkModal";
import { WalletIcon } from "./icons";
import { Button, Panel } from "./ui";

const PAGE_SIZE = 50;

function MovementActions({ transaction, onEdit, onDelete }: {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const placeMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({
      top: rect.bottom + 96 > window.innerHeight ? Math.max(8, rect.top - 92) : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    const onScroll = () => placeMenu();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button ref={buttonRef} type="button" aria-label={`Acciones de ${transaction.description}`} aria-expanded={open} aria-haspopup="menu"
        onClick={() => {
          placeMenu();
          setOpen((value) => !value);
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-paper-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open ? createPortal(
        <div ref={menuRef} role="menu" style={position} className="fixed z-50 min-w-36 rounded-xl border border-outline bg-white p-1.5 shadow-paper">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">Editar</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger hover:text-white">Eliminar</button>
        </div>, document.body,
      ) : null}
    </>
  );
}

const pesos = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0,
});

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

export function CashAccountPanel({ account, categories, onBalanceChange }: {
  account: CashAccount;
  categories: Category[];
  onBalanceChange: (balance: CashBalance) => void;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<AccountTotal | null>(null);
  const [balance, setBalance] = useState<CashBalance | null>(null);
  const [balanceEditing, setBalanceEditing] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingDate, setOpeningDate] = useState(localToday);
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [pageOffset, setPageOffset] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [initialDelete, setInitialDelete] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<Transaction | null>(null);
  const [unlinkSaving, setUnlinkSaving] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const formatCurrency = useFormatCurrency();
  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [page, currentBalance, totals] = await Promise.all([
          TransactionService.getPage({ account_id: account.id, limit: PAGE_SIZE, offset: pageOffset }),
          AccountService.getCashBalance(),
          ReportService.accounts(),
        ]);
        if (cancelled) return;
        setTransactions(page.items);
        setCount(page.total);
        setSummary(totals.find((item) => item.account_id === account.id) ?? {
          account_id: account.id, count: page.total, net: 0, income: 0, expenses: 0,
        });
        setBalance(currentBalance);
        onBalanceChange(currentBalance);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No fue posible cargar Efectivo.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [account.id, pageOffset, refreshKey]);

  useEffect(() => {
    if (!account || window.location.hash !== "#cash-account") return;
    requestAnimationFrame(() => document.getElementById("cash-account")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [account.id]);

  const editOpeningBalance = () => {
    setOpeningAmount(balance?.opening_balance_clp == null ? "" : String(balance.opening_balance_clp));
    setOpeningDate(balance?.opening_balance_date ?? localToday());
    setBalanceError(null);
    setBalanceEditing(true);
  };

  const saveOpeningBalance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(openingAmount);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_147_483_647 || !openingDate) {
      setBalanceError("Ingresa un monto válido en pesos enteros y una fecha.");
      return;
    }
    setBalanceSaving(true);
    setBalanceError(null);
    try {
      const updated = await AccountService.updateCashBalance({ amount_clp: amount, date: openingDate });
      setBalance(updated);
      onBalanceChange(updated);
      setBalanceEditing(false);
    } catch (cause) {
      setBalanceError(cause instanceof Error ? cause.message : "No fue posible guardar el saldo inicial.");
    } finally {
      setBalanceSaving(false);
    }
  };

  const clearOpeningBalance = async () => {
    setBalanceSaving(true);
    setBalanceError(null);
    try {
      const updated = await AccountService.clearCashBalance();
      setBalance(updated);
      onBalanceChange(updated);
      setBalanceEditing(false);
    } catch (cause) {
      setBalanceError(cause instanceof Error ? cause.message : "No fue posible quitar el saldo inicial.");
    } finally {
      setBalanceSaving(false);
    }
  };

  const unlink = async () => {
    if (!unlinking) return;
    setUnlinkSaving(true);
    setUnlinkError(null);
    try {
      await TransactionService.unlinkCash(unlinking.id);
      setUnlinking(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setUnlinkError(cause instanceof Error ? cause.message : "No fue posible deshacer el vínculo.");
    } finally {
      setUnlinkSaving(false);
    }
  };

  return (
    <div id="cash-account" className="space-y-5 sm:space-y-8">
      <Panel compactOnMobile className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-mist text-primary sm:h-16 sm:w-16"><WalletIcon className="h-7 w-7" /></span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-muted">Información de la cuenta</p>
              <h2 className="mt-1 section-title sm:mt-2">{account.name}</h2>
              <p className="mt-1 text-sm text-muted sm:text-base">Cuenta manual</p>
            </div>
          </div>
          <Button compactOnMobile onClick={() => { setEditing(null); setInitialDelete(false); setFormOpen(true); }}>Registrar movimiento</Button>
        </div>
        <div className="subtle-divider" />
        <dl className="grid grid-cols-2 gap-y-3 rounded-2xl bg-paper-soft/70 p-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-outline/70 sm:bg-transparent sm:p-0">
          <div className="col-span-2 border-b border-outline/70 pb-3 sm:col-span-1 sm:border-0 sm:py-3 sm:pr-5"><dt className="text-sm text-muted">Producto</dt><dd className="mt-1 font-semibold">Efectivo</dd></div>
          <div className="min-w-0 pr-3 sm:px-5 sm:py-3"><dt className="text-sm text-muted">Saldo inicial</dt><dd className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{balance?.opening_balance_date ? pesos.format(balance.opening_balance_clp ?? 0) : "No configurado"}</dd></div>
          <div className="border-l border-outline/70 pl-3 sm:border-0 sm:py-3 sm:pl-5"><dt className="text-sm text-muted">Moneda</dt><dd className="mt-1 font-semibold">CLP</dd></div>
        </dl>
        <div className="subtle-divider" />
        <div>
          <p className="eyebrow m-0 text-primary">Saldo según tus registros</p>
          <p className="mt-2 text-sm text-muted">
            {balance?.opening_balance_date
              ? `Saldo inicial ${pesos.format(balance.opening_balance_clp ?? 0)} al comienzo del ${displayDate(balance.opening_balance_date)}; incluye los movimientos desde ese día.`
              : "Calculado desde cero con todos los movimientos registrados."}
          </p>
          {balance?.is_negative ? <p role="status" className="mt-2 text-sm text-danger">El saldo calculado es negativo; revisa si faltan movimientos.</p> : null}
          <Button tone="ghost" className="mt-2 px-0 text-sm text-primary" onClick={editOpeningBalance}>
            {balance?.opening_balance_date ? "Corregir saldo inicial" : "Configurar saldo inicial"}
          </Button>
        </div>
          {balanceEditing ? (
            <form onSubmit={(event) => void saveOpeningBalance(event)} className="flex flex-wrap items-end gap-3 border-t border-outline pt-5">
              <label className="w-full min-w-0 space-y-2 text-sm font-medium text-ink sm:w-auto">Saldo inicial en pesos
                <input type="number" min="0" max="2147483647" step="1" required value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} className="block w-full min-w-0 rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary sm:w-48" />
              </label>
              <label className="w-full min-w-0 space-y-2 text-sm font-medium text-ink sm:w-auto">Fecha de inicio
                <input type="date" required value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} className="block w-full min-w-0 rounded-2xl border border-outline bg-white px-4 py-3 text-base outline-none sm:text-sm focus:border-primary" />
              </label>
              <Button type="submit" disabled={balanceSaving}>{balanceSaving ? "Guardando..." : "Guardar saldo"}</Button>
              {balance?.opening_balance_date ? <Button tone="ghost" disabled={balanceSaving} onClick={() => void clearOpeningBalance()}>Quitar saldo inicial</Button> : null}
              <Button tone="ghost" disabled={balanceSaving} onClick={() => setBalanceEditing(false)}>Cancelar</Button>
              {balanceError ? <p role="alert" className="w-full text-sm text-danger">{balanceError}</p> : null}
            </form>
          ) : null}
      </Panel>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <AccountActivitySummary
        description="Resumen de tus movimientos registrados. Los ingresos y gastos excluyen los traspasos vinculados con cuentas financieras; el saldo incluye el saldo inicial configurado."
        firstLabel="Saldo registrado"
        firstValue={balance ? formatCurrency(balance.balance_clp) : "—"}
        firstIcon={<WalletIcon className="h-5 w-5" />}
        summary={summary ?? { account_id: account.id, count, net: 0, income: 0, expenses: 0 }}
        ready={summary !== null && balance !== null}
        formatCurrency={formatCurrency}
      />
      <Panel className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline px-4 pt-3 sm:px-5 sm:pt-5 md:px-8 md:pt-7">
          <h3 className="border-b-2 border-primary py-3 text-sm font-semibold text-primary sm:px-4 sm:text-base">Movimientos ({count})</h3>
          <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline" to={`/app/transactions?account_id=${account.id}`}>Ver todos</Link>
        </div>
        <div className="p-4 sm:p-5 md:p-8">
          {transactions.length > 0 ? <AccountMovementsTable transactions={transactions} categoryMap={categoryMap} formatCurrency={formatCurrency} renderActions={(transaction) => (
            transaction.origin === "manual" ? (
              <MovementActions transaction={transaction}
                onEdit={() => { setEditing(transaction); setInitialDelete(false); setFormOpen(true); }}
                onDelete={() => { setEditing(transaction); setInitialDelete(true); setFormOpen(true); }} />
            ) : transaction.origin === "cash_transfer" ? (
              <Button tone="ghost" className="px-3 py-2 text-sm" onClick={() => { setUnlinkError(null); setUnlinking(transaction); }}>Deshacer vínculo</Button>
            ) : null
          )} /> : null}
          {transactions.length === 0 ? <p className="py-2 text-sm text-muted">Todavía no hay movimientos en Efectivo.</p> : null}
          <AccountTablePagination total={count} pageSize={PAGE_SIZE} offset={pageOffset} onOffsetChange={setPageOffset} />
        </div>
      </Panel>
      {formOpen ? (
        <CashMovementFormModal
          key={editing?.id ?? "new"}
          categories={categories}
          transaction={editing}
          initialDelete={initialDelete}
          onClose={() => setFormOpen(false)}
          onChanged={() => { setPageOffset(0); setRefreshKey((value) => value + 1); }}
        />
      ) : null}
      {unlinking ? (
        <CashLinkModal transaction={unlinking} accountName="Efectivo" saving={unlinkSaving} error={unlinkError}
          onClose={() => setUnlinking(null)} onConfirm={() => void unlink()} />
      ) : null}
    </div>
  );
}
