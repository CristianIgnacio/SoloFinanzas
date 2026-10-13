import { ReportService } from '../services/reportService';
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useRef } from "react";

import {
  Button,
  CashMovementFormModal,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  ExportIcon,
  InstitutionLogo,
  LoadingState,
  MoneyIcon,
  WalletIcon,
  PageIntro,
  Panel,
  QuestionIcon,
  SaveIcon,
  StatusNotice,
  Tag,
  cn,
  UtensilsIcon,
} from "../components";
import {
  categoryMatchesSelection,
  createCategoryMap,
  getCategoryPath,
  groupCategories,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import { CashLinkModal } from "../components/CashLinkModal";
import { CategoryType } from "../types";
import type { Account, CashAccount, Category, Transaction } from "../types";

type FilterMode = "all" | "expense" | "income";

const ALL_PERIODS = "all";
const ALL_ACCOUNTS = "all";
const ALL_CATEGORIES = "all";
const UNCATEGORIZED_CATEGORY = "uncategorized";

const VISIBLE_TRANSACTION_STEP = 50;

function getMonthKey(date: string) {
  return date.slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  if (monthKey === ALL_PERIODS) {
    return "Todos los periodos";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function formatDateLabel(date: string) {
  return parseLocalDate(date).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function MovementIcon({ transaction }: { transaction: Transaction }) {
  if (transaction.amount_clp > 0) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
        <MoneyIcon className="h-6 w-6" />
      </span>
    );
  }

  if (transaction.description.toLowerCase().includes("cafe")) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#dbe7ff] text-secondary">
        <UtensilsIcon className="h-6 w-6" />
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffd7c2] text-clay">
      <QuestionIcon />
    </span>
  );
}

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const statementId = searchParams.get("statement_id")
    ? Number(searchParams.get("statement_id"))
    : undefined;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashAccount, setCashAccount] = useState<CashAccount | null>(null);
  const [cashFormOpen, setCashFormOpen] = useState(false);
  const [editingCashTransaction, setEditingCashTransaction] = useState<Transaction | null>(null);
  const [cashRefreshKey, setCashRefreshKey] = useState(0);
  const [linkingTransaction, setLinkingTransaction] = useState<Transaction | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draftCategories, setDraftCategories] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<FilterMode>("all");
  const [excludeInternalTransfers, setExcludeInternalTransfers] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(ALL_PERIODS);
  const [selectedAccount, setSelectedAccount] = useState(searchParams.get("account_id") ?? ALL_ACCOUNTS);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [pageOffset, setPageOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showStickySaveBar, setShowStickySaveBar] = useState(false);
  const headerSaveRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const headerSave = headerSaveRef.current;

    if (!headerSave) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setShowStickySaveBar(!entry.isIntersecting);
        }
      },
      {
        rootMargin: "-72px 0px 0px 0px",
        threshold: 0,
      },
    );

    observer.observe(headerSave);
    return () => observer.disconnect();
  }, []);

  const query = {
    statement_id: statementId,
    account_id: selectedAccount === ALL_ACCOUNTS ? undefined : Number(selectedAccount),
    category_id: [ALL_CATEGORIES, UNCATEGORIZED_CATEGORY].includes(selectedCategory) ? undefined : Number(selectedCategory),
    uncategorized: selectedCategory === UNCATEGORIZED_CATEGORY,
    exclude_internal: excludeInternalTransfers,
    transaction_type: filter === 'all' ? undefined : filter,
    date_from: selectedMonth === ALL_PERIODS ? undefined : `${selectedMonth}-01`,
    date_to: selectedMonth === ALL_PERIODS ? undefined : `${selectedMonth}-${new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()}`,
    limit: VISIBLE_TRANSACTION_STEP, offset: pageOffset,
  };
  useEffect(() => {
    let cancelled = false;
    void Promise.all([AccountService.getAccounts(), AccountService.getCashAccount(), CategoryService.getCategories(), ReportService.periods(statementId)])
      .then(([a, cash, c, p]) => { if (!cancelled) { setAccounts(a); setCashAccount(cash); setCategories(c); setMonths(p); } })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [statementId, cashRefreshKey]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setTransactions([]);
    void TransactionService.getPage(query).then(page => {
      if (!cancelled) { setTransactions(page.items); setTotal(page.total); }
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statementId, selectedMonth, selectedAccount, selectedCategory, filter, excludeInternalTransfers, pageOffset, cashRefreshKey]);

  const accountOptions = useMemo(() => {
    const accountIds = new Set(transactions.map((transaction) => transaction.account_id));
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const knownAccounts = accounts

      .map((account) => ({
        id: account.id,
        label: account.account_last4
          ? `${account.name} - **** ${account.account_last4}`
          : account.name,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "es-CL"));
    if (cashAccount) knownAccounts.unshift({ id: cashAccount.id, label: cashAccount.name });
    const missingAccounts = [...accountIds]
      .filter((accountId) => !accountsById.has(accountId) && accountId !== cashAccount?.id)
      .sort((left, right) => left - right)
      .map((accountId) => ({
        id: accountId,
        label: `Tarjeta #${accountId}`,
      }));

    return [...knownAccounts, ...missingAccounts];
  }, [accounts, cashAccount, transactions]);

  const accountMap = useMemo(
    () => new Map<number, Account | CashAccount>([
      ...accounts.map((account): [number, Account | CashAccount] => [account.id, account]),
      ...(cashAccount ? [[cashAccount.id, cashAccount] as [number, CashAccount]] : []),
    ]),
    [accounts, cashAccount],
  );

  const categoryFilterOptions = useMemo(() => {
    const categoryIds = new Set(
      transactions
        .map((transaction) => transaction.category_id)
        .filter((categoryId): categoryId is number => categoryId !== null),
    );
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    [...categoryIds].forEach((categoryId) => {
      const parentId = categoriesById.get(categoryId)?.parent_id;
      if (parentId) categoryIds.add(parentId);
    });
    const knownCategories = categories

      .map((category) => ({
        id: category.id,
        label: getCategoryPath(category.id, categoriesById),
        type: category.type,
      }))
      .sort((left, right) => {
        const typeComparison = left.type.localeCompare(right.type, "es-CL");
        return typeComparison || left.label.localeCompare(right.label, "es-CL");
      });
    const missingCategories = [...categoryIds]
      .filter((categoryId) => !categoriesById.has(categoryId))
      .sort((left, right) => left - right)
      .map((categoryId) => ({
        id: categoryId,
        label: `Categoria #${categoryId}`,
        type: "",
      }));

    return [...knownCategories, ...missingCategories];
  }, [categories, transactions]);

  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);

  const visibleTransactions = useMemo(() => {
    return transactions
      .filter(
        (transaction) =>
          selectedMonth === ALL_PERIODS ||
          getMonthKey(transaction.date) === selectedMonth,
      )
      .filter(
        (transaction) =>
          selectedAccount === ALL_ACCOUNTS ||
          String(transaction.account_id) === selectedAccount,
      )
      .filter((transaction) => {
        if (selectedCategory === ALL_CATEGORIES) {
          return true;
        }

        if (selectedCategory === UNCATEGORIZED_CATEGORY) {
          return !transaction.category_id;
        }

        return categoryMatchesSelection(
          transaction.category_id,
          Number(selectedCategory),
          categoryMap,
        );
      })
      .filter((transaction) => {
        if (filter !== "all" && transaction.transaction_type !== filter) {
          return false;
        }

        return !excludeInternalTransfers || (!transaction.is_internal_transfer && transaction.origin !== "cash_transfer");
      });
  }, [categoryMap, excludeInternalTransfers, filter, selectedAccount, selectedCategory, selectedMonth, transactions]);

  useEffect(() => {
    setPageOffset(0);
  }, [excludeInternalTransfers, filter, selectedAccount, selectedCategory, selectedMonth]);

  const displayedTransactions = visibleTransactions;

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    displayedTransactions.forEach((transaction) => {
      const current = groups.get(transaction.date) ?? [];
      current.push(transaction);
      groups.set(transaction.date, current);
    });

    return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]));
  }, [displayedTransactions]);

  const categoryGroupsFor = (transaction: Transaction) => {
    return groupCategories(categories, {
      activeOnly: true,
      type:
        transaction.transaction_type === "income"
          ? CategoryType.INCOME
          : CategoryType.EXPENSE,
    });
  };

  const updateDraftCategory = (transaction: Transaction, categoryId: string) => {
    const originalCategoryId = transaction.category_id
      ? String(transaction.category_id)
      : "";

    setSuccessMessage(null);
    setDraftCategories((current) => {
      const next = { ...current };

      if (categoryId === originalCategoryId) {
        delete next[transaction.id];
      } else {
        next[transaction.id] = categoryId;
      }

      return next;
    });
  };

  const pendingChanges = Object.keys(draftCategories).length;

  const confirmCashLink = async () => {
    if (!linkingTransaction) return;
    setLinkSaving(true);
    setLinkError(null);
    try {
      if (linkingTransaction.cash_transfer_linked || linkingTransaction.origin === "cash_transfer") {
        await TransactionService.unlinkCash(linkingTransaction.id);
      } else {
        await TransactionService.linkCash(linkingTransaction.id);
      }
      setSuccessMessage(linkingTransaction.cash_transfer_linked || linkingTransaction.origin === "cash_transfer" ? "Vínculo con Efectivo deshecho." : "Movimiento vinculado con Efectivo.");
      setLinkingTransaction(null);
      setPageOffset(0);
      setCashRefreshKey((value) => value + 1);
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : "No fue posible actualizar el vínculo.");
    } finally {
      setLinkSaving(false);
    }
  };

  const exportMarkdown = () => {
    const markdown = [
      `# Movimientos (página visible) - ${formatMonthLabel(selectedMonth)}`,
      "",
      ...visibleTransactions.map((transaction) => {
        const selectedCategory =
          draftCategories[transaction.id] || String(transaction.category_id ?? "");
        const categoryName = getCategoryPath(
          selectedCategory ? Number(selectedCategory) : null,
          categoryMap,
        );

        return `- ${formatDateLabel(transaction.date)} | ${transaction.description} | ${transaction.amount_clp.toLocaleString("es-CL")} | ${categoryName}`;
      }),
    ].join("\n");

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `movimientos-${selectedMonth === ALL_PERIODS ? "todos" : selectedMonth}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveAllChanges = async () => {
    if (pendingChanges === 0) {
      return;
    }

    const updatedMovementCount = pendingChanges;
    setSaving(true);
    setSuccessMessage(null);
    setError(null);

    try {
      await Promise.all(
        Object.entries(draftCategories).map(([transactionId, categoryId]) =>
          TransactionService.updateCategory(
            Number(transactionId),
            categoryId ? Number(categoryId) : null,
            "manual",
          ),
        ),
      );

      const refreshed = await TransactionService.getPage(query);
      setTransactions(refreshed.items);
      setTotal(refreshed.total);
      setDraftCategories({});
      setSuccessMessage(
        updatedMovementCount === 1
          ? "1 movimiento actualizado correctamente."
          : `${updatedMovementCount} movimientos actualizados correctamente.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Periodo"
        title="Movimientos"
        period={
          <label className="relative inline-flex max-w-full items-center">
            <span className="sr-only">Filtrar movimientos por periodo</span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="max-w-full appearance-none bg-transparent pl-1 pr-8 text-lg font-medium text-primary outline-none md:text-[1.75rem]"
            >
              <option value={ALL_PERIODS}>Todos los periodos</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-1 h-4 w-4 text-primary" />
          </label>
        }
        description={
          statementId
            ? "Revisa y categoriza los movimientos de la cartola que acabas de importar."
            : "Consulta, filtra y categoriza tus movimientos, o registra uno en Efectivo."
        }
        actions={
          <>
            {cashAccount && !statementId ? (
              <Button tone="secondary" disabled={pendingChanges > 0} onClick={() => { setEditingCashTransaction(null); setCashFormOpen(true); }}>
                Registrar en Efectivo
              </Button>
            ) : null}
            <Button
              tone="secondary"
              onClick={exportMarkdown}
              disabled={visibleTransactions.length === 0}
            >
              <ExportIcon className="h-5 w-5" />
              {selectedMonth === ALL_PERIODS
                ? "Exportar todos los periodos"
                : "Exportar movimientos"}
            </Button>
            <span ref={headerSaveRef} className="inline-flex">
              <Button
                onClick={() => void saveAllChanges()}
                disabled={saving || pendingChanges === 0}
              >
                <SaveIcon className="h-5 w-5" />
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </span>
          </>
        }
      />

      {loading ? <LoadingState message="Cargando movimientos..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {typeof location.state?.importMessage === "string" ? (
        <StatusNotice tone="success">{location.state.importMessage}</StatusNotice>
      ) : null}
      {successMessage && !showStickySaveBar ? (
        <StatusNotice tone="success">{successMessage}</StatusNotice>
      ) : null}
      {!loading && showStickySaveBar ? (
        <div className="sticky top-[4.5rem] z-10">
          <div
            className={cn(
              "surface-card flex flex-col gap-3 border px-4 py-3 shadow-[0_16px_35px_rgba(38,55,34,0.12)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between",
              successMessage
                ? "border-primary/25 bg-primary-mist/95"
                : pendingChanges > 0
                  ? "border-primary/20 bg-white/95"
                  : "border-outline bg-white/90",
            )}
          >
            <div className="flex min-w-0 items-center gap-3" aria-live="polite">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  successMessage || pendingChanges > 0
                    ? "bg-primary text-white"
                    : "bg-paper-soft text-muted",
                )}
              >
                <SaveIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={cn("font-semibold", successMessage ? "text-primary" : "text-ink")}>
                  {successMessage ??
                    (pendingChanges === 0
                      ? "Sin cambios pendientes"
                      : pendingChanges === 1
                        ? "1 cambio pendiente"
                        : `${pendingChanges} cambios pendientes`)}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {successMessage
                    ? "La lista ya se encuentra sincronizada."
                    : pendingChanges > 0
                      ? "Puedes continuar editando y guardar todo de una vez."
                      : "Cambia una categoria para habilitar el guardado."}
                </p>
              </div>
            </div>
            <Button
              className="w-full whitespace-nowrap sm:w-auto sm:shrink-0"
              onClick={() => void saveAllChanges()}
              disabled={saving || pendingChanges === 0}
            >
              <SaveIcon className="h-5 w-5" />
              {saving
                ? "Guardando..."
                : pendingChanges === 0
                  ? "Guardar cambios"
                  : `Guardar ${pendingChanges} ${pendingChanges === 1 ? "cambio" : "cambios"}`}
            </Button>
          </div>
        </div>
      ) : null}


      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setFilter("all")}>
              <Tag active={filter === "all"}>Todos</Tag>
            </button>
            <button type="button" onClick={() => setFilter("expense")}>
              <Tag active={filter === "expense"}>Gasto</Tag>
            </button>
            <button type="button" onClick={() => setFilter("income")}>
              <Tag active={filter === "income"}>Ingreso</Tag>
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-outline bg-white px-4 py-2.5 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={excludeInternalTransfers}
              onChange={(event) => setExcludeInternalTransfers(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Excluir transferencias internas
          </label>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[32rem] lg:max-w-full">
          <div className="relative min-w-0">
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="w-full min-w-0 truncate appearance-none rounded-full border border-outline bg-white px-5 py-3 pr-12 text-base outline-none transition focus:border-primary"
            >
              <option value={ALL_CATEGORIES}>Todas las categorias</option>
              <option value={UNCATEGORIZED_CATEGORY}>Sin categoria</option>
              {categoryFilterOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </div>

          <div className="relative min-w-0">
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              className="w-full min-w-0 truncate appearance-none rounded-full border border-outline bg-white px-5 py-3 pr-12 text-base outline-none transition focus:border-primary"
            >
              <option value={ALL_ACCOUNTS}>Todas las cuentas</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </div>
        </div>
      </div>

      {!loading && visibleTransactions.length > 0 ? (
        <p className="text-sm text-muted">
          Mostrando {displayedTransactions.length} de {total} movimientos (página {Math.floor(pageOffset / VISIBLE_TRANSACTION_STEP) + 1})
          {statementId ? " de esta importacion" : ""}.
        </p>
      ) : null}

      {groupedTransactions.length > 0 ? (
        <div className="space-y-8">
          {groupedTransactions.map(([date, items]) => (
            <section key={date} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-5 w-[3px] rounded-full bg-primary-soft" />
                <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                  {formatDateLabel(date)}
                </h2>
              </div>

              <div className="space-y-4">
                {items.map((transaction) => {
                  const categoryValue =
                    draftCategories[transaction.id] ??
                    (transaction.category_id ? String(transaction.category_id) : "");
                  const categoryGroups = categoryGroupsFor(transaction);
                  const account = accountMap.get(transaction.account_id);

                  return (
                    <Panel
                      key={transaction.id}
                      className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <MovementIcon transaction={transaction} />
                        <div className="space-y-1">
                          <p className="text-3xl font-medium tracking-[-0.03em]">
                            {transaction.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg text-muted">
                              {transaction.transaction_type === "income"
                                ? "Ingreso"
                                : "Gasto"}
                            </p>
                            {account ? (
                              <Link
                                to={`/app/accounts?account_id=${account.id}`}
                                aria-label={`Ver detalle de ${account.name}`}
                                className="inline-flex items-center gap-2 rounded-full border border-outline bg-white px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                {"institution" in account ? (
                                  <InstitutionLogo institution={account.institution} size="sm" />
                                ) : <WalletIcon className="h-4 w-4 text-primary" />}
                                {account.name}
                              </Link>
                            ) : (
                              <span className="rounded-full border border-outline bg-paper-soft px-2.5 py-1 text-xs font-semibold text-muted">
                                Tarjeta #{transaction.account_id}
                              </span>
                            )}
                            {transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? (
                              <span className="rounded-full border border-primary/20 bg-primary-mist px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                                Transferencia interna
                              </span>
                            ) : null}
                            <span className="text-xs text-muted">
                              {transaction.origin === "pdf" ? "Cartola PDF" : transaction.origin === "cash_transfer" ? "Traslado con Efectivo" : "Registro manual"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
                        <p
                          className={
                            transaction.amount_clp >= 0
                              ? "text-3xl font-medium text-primary"
                              : "text-3xl font-medium text-ink"
                          }
                        >
                          {new Intl.NumberFormat("es-CL", {
                            style: "currency",
                            currency: "CLP",
                            maximumFractionDigits: 0,
                          }).format(transaction.amount_clp)}
                        </p>

                        <div className="relative w-full min-w-0 md:w-64 md:flex-none">
                          <select
                            aria-label={`Categoria de ${transaction.description}`}
                            disabled={transaction.origin === "cash_transfer"}
                            value={categoryValue}
                            onChange={(event) =>
                              updateDraftCategory(transaction, event.target.value)
                            }
                            className="w-full min-w-0 truncate appearance-none rounded-2xl border border-outline bg-paper-soft px-4 py-3 pr-10 text-base outline-none transition focus:border-primary"
                          >
                            <option value="">Seleccionar categoria...</option>
                            {categoryGroups.map((group) => (
                              <optgroup key={group.root.id} label={group.root.name}>
                                <option value={group.root.id}>
                                  {group.children.length > 0
                                    ? `${group.root.name} (sin subcategoria)`
                                    : group.root.name}
                                </option>
                                {group.children.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        </div>
                        {transaction.origin === "manual" ? (
                          <Button tone="ghost" disabled={pendingChanges > 0} onClick={() => { setEditingCashTransaction(transaction); setCashFormOpen(true); }}>
                            Editar
                          </Button>
                        ) : null}
                        {(transaction.cash_transfer_linked || transaction.origin === "cash_transfer" ||
                          (transaction.origin === "pdf" && !transaction.is_internal_transfer)) ? (
                          <Button tone="ghost" disabled={pendingChanges > 0} onClick={() => { setLinkError(null); setLinkingTransaction(transaction); }}>
                            {transaction.cash_transfer_linked || transaction.origin === "cash_transfer" ? "Deshacer vínculo" : "Vincular con Efectivo"}
                          </Button>
                        ) : null}
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="flex justify-center gap-3">
            <Button tone="secondary" disabled={pageOffset === 0 || loading} onClick={() => setPageOffset(Math.max(0, pageOffset - VISIBLE_TRANSACTION_STEP))}>Anterior</Button>
            <Button tone="secondary" disabled={pageOffset + VISIBLE_TRANSACTION_STEP >= total || loading} onClick={() => setPageOffset(pageOffset + VISIBLE_TRANSACTION_STEP)}>Siguiente</Button>
          </div>
        </div>
      ) : !loading ? (
        <EmptyState
          title="No hay movimientos para este filtro"
          description="Prueba cambiando el periodo o el criterio de revision."
        />
      ) : null}
      {cashFormOpen ? (
        <CashMovementFormModal
          key={editingCashTransaction?.id ?? "new"}
          categories={categories}
          transaction={editingCashTransaction}
          onClose={() => setCashFormOpen(false)}
          onChanged={() => {
            setPageOffset(0);
            setDraftCategories({});
            setCashRefreshKey((value) => value + 1);
            setSuccessMessage("Movimientos de Efectivo actualizados.");
          }}
        />
      ) : null}
      {linkingTransaction ? (
        <CashLinkModal
          transaction={linkingTransaction}
          accountName={accountMap.get(linkingTransaction.account_id)?.name ?? "Cuenta"}
          saving={linkSaving}
          error={linkError}
          onClose={() => setLinkingTransaction(null)}
          onConfirm={() => void confirmCashLink()}
        />
      ) : null}
    </div>
  );
}
