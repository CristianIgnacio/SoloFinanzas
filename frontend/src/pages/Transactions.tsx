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
  Panel,
  QuestionIcon,
  StatusNotice,
  cn,
  UtensilsIcon,
} from "../components";
import {
  createCategoryMap,
  getCategoryPath,
  groupCategories,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import { CashLinkModal } from "../components/CashLinkModal";
import { CategoryPicker } from "../components/CategoryPicker";
import { CategorySource, CategoryType } from "../types";
import type { Account, CashAccount, Category, Transaction } from "../types";

type FilterMode = "all" | "expense" | "income";
type CategoryNotice = {
  id: number;
  tone: "saving" | "success" | "error";
  message: string;
  undo?: { transaction: Transaction; categoryId: number | null; categorySource: CategorySource | null };
};

const ALL_PERIODS = "all";
const ALL_ACCOUNTS = "all";
const ALL_CATEGORIES = "all";
const UNCATEGORIZED_CATEGORY = "uncategorized";

const VISIBLE_TRANSACTION_STEP = 50;

function canLinkWithCash(transaction: Transaction, categories: Map<number, Category>) {
  if (transaction.origin !== "pdf" || transaction.is_internal_transfer ||
      transaction.amount_clp === 0 || !transaction.category_id) return false;
  const category = categories.get(transaction.category_id);
  const parent = category?.parent_id ? categories.get(category.parent_id) : undefined;
  return Boolean(category?.is_active && category.type === CategoryType.TRANSFER &&
    parent?.is_active && parent.type === CategoryType.TRANSFER && parent.name === "Transferencias" &&
    category.name === (transaction.amount_clp < 0 ? "Retiro de efectivo" : "Depósito de efectivo"));
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
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white sm:h-12 sm:w-12">
        <MoneyIcon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
    );
  }

  if (transaction.description.toLowerCase().includes("cafe")) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbe7ff] text-secondary sm:h-12 sm:w-12">
        <UtensilsIcon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffd7c2] text-clay sm:h-12 sm:w-12">
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
  const [savingCategoryIds, setSavingCategoryIds] = useState<Set<number>>(() => new Set());
  const [categoryNotice, setCategoryNotice] = useState<CategoryNotice | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [excludeInternalTransfers, setExcludeInternalTransfers] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const month = searchParams.get("month") ?? "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : ALL_PERIODS;
  });
  const [selectedAccount, setSelectedAccount] = useState(searchParams.get("account_id") ?? ALL_ACCOUNTS);
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get("category") === UNCATEGORIZED_CATEGORY ? UNCATEGORIZED_CATEGORY : ALL_CATEGORIES);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedTransactionIds, setExpandedTransactionIds] = useState<Set<number>>(() => new Set());
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestGenerationRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const fetchingMoreRef = useRef(false);
  const savingCategoryIdsRef = useRef(new Set<number>());
  const categoryOverridesRef = useRef(new Map<number, number | null>());
  const noticeSequenceRef = useRef(0);
  const latestCategoryActionRef = useRef(0);
  const latestCategoryRefreshRef = useRef(0);

  const toggleTransactionDetails = (id: number) => {
    setExpandedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!categoryNotice || categoryNotice.tone === "saving") return;
    const timeout = window.setTimeout(() => {
      setCategoryNotice(current => current?.id === categoryNotice.id ? null : current);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [categoryNotice]);

  const showCategoryNotice = (notice: Omit<CategoryNotice, "id">) => {
    noticeSequenceRef.current += 1;
    setCategoryNotice({ id: noticeSequenceRef.current, ...notice });
  };

  const withCategoryOverrides = (items: Transaction[]) => items.map(transaction =>
    categoryOverridesRef.current.has(transaction.id)
      ? { ...transaction, category_id: categoryOverridesRef.current.get(transaction.id) ?? null }
      : transaction,
  );

  const refreshVisibleTransactions = async () => {
    const generation = requestGenerationRef.current;
    latestCategoryRefreshRef.current += 1;
    const refreshId = latestCategoryRefreshRef.current;
    try {
      const page = await TransactionService.getPage({
        ...query,
        limit: Math.min(Math.max(nextOffsetRef.current, VISIBLE_TRANSACTION_STEP), 1000),
        offset: 0,
      });
      if (generation !== requestGenerationRef.current || refreshId !== latestCategoryRefreshRef.current) return;
      if (selectedCategory !== ALL_CATEGORIES) {
        requestGenerationRef.current += 1;
        fetchingMoreRef.current = false;
        setLoadingMore(false);
        setLoadMoreFailed(false);
        setTransactions(withCategoryOverrides(page.items));
        setTotal(page.total);
        nextOffsetRef.current = page.items.length;
        return;
      }
      const refreshed = new Map(withCategoryOverrides(page.items).map(item => [item.id, item]));
      setTransactions(current => current.map(item => refreshed.get(item.id) ?? item));
      if (selectedCategory === ALL_CATEGORIES) setTotal(page.total);
    } catch {
      // El cambio ya se guardó; se conservan las tarjetas actuales si falla esta actualización secundaria.
    }
  };

  const query = {
    statement_id: statementId,
    account_id: selectedAccount === ALL_ACCOUNTS ? undefined : Number(selectedAccount),
    category_id: [ALL_CATEGORIES, UNCATEGORIZED_CATEGORY].includes(selectedCategory) ? undefined : Number(selectedCategory),
    uncategorized: selectedCategory === UNCATEGORIZED_CATEGORY,
    exclude_internal: excludeInternalTransfers,
    transaction_type: filter === 'all' ? undefined : filter,
    date_from: selectedMonth === ALL_PERIODS ? undefined : `${selectedMonth}-01`,
    date_to: selectedMonth === ALL_PERIODS ? undefined : `${selectedMonth}-${new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()}`,
    limit: VISIBLE_TRANSACTION_STEP,
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
    requestGenerationRef.current += 1;
    nextOffsetRef.current = 0;
    fetchingMoreRef.current = false;
    setLoading(true); setError(null);
    setLoadingMore(false);
    setLoadMoreFailed(false);
    void TransactionService.getPage({ ...query, offset: 0 }).then(page => {
      if (!cancelled) {
        setTransactions(withCategoryOverrides(page.items)); setTotal(page.total); setHasLoaded(true);
        nextOffsetRef.current = page.items.length;
      }
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statementId, selectedMonth, selectedAccount, selectedCategory, filter, excludeInternalTransfers, cashRefreshKey]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasLoaded || loading || loadingMore || loadMoreFailed || nextOffsetRef.current >= total) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || fetchingMoreRef.current) return;
      fetchingMoreRef.current = true;
      setLoadingMore(true);
      const generation = requestGenerationRef.current;
      const offset = nextOffsetRef.current;
      void TransactionService.getPage({ ...query, offset }).then(page => {
        if (generation !== requestGenerationRef.current) return;
        nextOffsetRef.current = offset + page.items.length;
        setTransactions(current => {
          const knownIds = new Set(current.map(transaction => transaction.id));
          return [...current, ...withCategoryOverrides(page.items.filter(transaction => !knownIds.has(transaction.id)))];
        });
        setTotal(page.items.length === 0 ? offset : page.total);
      }).catch(cause => {
        if (generation === requestGenerationRef.current) {
          setError(cause instanceof Error ? cause.message : "No se pudieron cargar más movimientos.");
          setLoadMoreFailed(true);
        }
      }).finally(() => {
        if (generation === requestGenerationRef.current) {
          fetchingMoreRef.current = false;
          setLoadingMore(false);
        }
      });
    }, { rootMargin: "350px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasLoaded, loading, loadingMore, loadMoreFailed, total, transactions.length, statementId, selectedMonth, selectedAccount, selectedCategory, filter, excludeInternalTransfers, cashRefreshKey]);

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

  const visibleTransactions = transactions;
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
    const expectedCashCategory = transaction.amount_clp < 0 ? "Retiro de efectivo" : "Depósito de efectivo";
    return groupCategories(categories.filter((category) => {
      const parent = category.parent_id ? categoryMap.get(category.parent_id) : undefined;
      return parent?.name !== "Transferencias" ||
        !["Retiro de efectivo", "Depósito de efectivo"].includes(category.name) ||
        category.name === expectedCashCategory;
    }), {
      activeOnly: true,
      type:
        transaction.transaction_type === "income"
          ? CategoryType.INCOME
          : CategoryType.EXPENSE,
    });
  };

  const changeCategory = async (transaction: Transaction, categoryId: number | null,
    categorySource: CategorySource | null = CategorySource.MANUAL, undoing = false) => {
    const previousCategoryId = transaction.category_id;
    if (categoryId === previousCategoryId || savingCategoryIdsRef.current.has(transaction.id)) return;

    latestCategoryActionRef.current += 1;
    const actionId = latestCategoryActionRef.current;
    savingCategoryIdsRef.current.add(transaction.id);
    setSavingCategoryIds(current => new Set(current).add(transaction.id));
    categoryOverridesRef.current.set(transaction.id, categoryId);
    setTransactions(current => current.map(item => item.id === transaction.id
      ? { ...item, category_id: categoryId, category_source: categorySource }
      : item));
    showCategoryNotice({ tone: "saving", message: undoing ? "Deshaciendo cambio…" : "Guardando categoría…" });

    try {
      const saved = await TransactionService.updateCategory(transaction.id, categoryId, categorySource);
      setTransactions(current => current.map(item => item.id === transaction.id
        ? { ...item, ...(saved && saved.id === transaction.id ? saved : {}), category_id: categoryId }
        : item));
      void refreshVisibleTransactions();
      const categoryName = categoryId === null ? "Sin categoría" : categoryMap.get(categoryId)?.name ?? "la categoría seleccionada";
      if (latestCategoryActionRef.current === actionId) {
        showCategoryNotice({
          tone: "success",
          message: undoing ? "Cambio deshecho." : `Categoría cambiada a ${categoryName}.`,
          undo: undoing ? undefined : {
            transaction: { ...transaction, category_id: categoryId, category_source: categorySource },
            categoryId: previousCategoryId,
            categorySource: transaction.category_source,
          },
        });
      }
    } catch (cause) {
      categoryOverridesRef.current.set(transaction.id, previousCategoryId);
      setTransactions(current => current.map(item => item.id === transaction.id
        ? { ...item, category_id: previousCategoryId, category_source: transaction.category_source }
        : item));
      if (latestCategoryActionRef.current === actionId) {
        showCategoryNotice({
          tone: "error",
          message: cause instanceof Error ? `No se pudo guardar: ${cause.message}` : "No se pudo guardar la categoría.",
        });
      }
    } finally {
      savingCategoryIdsRef.current.delete(transaction.id);
      setSavingCategoryIds(current => {
        const next = new Set(current);
        next.delete(transaction.id);
        return next;
      });
    }
  };

  const undoCategoryChange = () => {
    const undo = categoryNotice?.undo;
    if (!undo) return;
    const transaction = transactions.find(item => item.id === undo.transaction.id) ?? undo.transaction;
    void changeCategory(transaction, undo.categoryId, undo.categorySource, true);
  };

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
      setCashRefreshKey((value) => value + 1);
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : "No fue posible actualizar el vínculo.");
    } finally {
      setLinkSaving(false);
    }
  };

  const exportMarkdown = () => {
    const markdown = [
      `# Movimientos cargados - ${formatMonthLabel(selectedMonth)}`,
      "",
      ...visibleTransactions.map((transaction) => {
        const categoryName = getCategoryPath(
          transaction.category_id,
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

  const activeFilters = [
    ...(selectedMonth !== ALL_PERIODS ? [{ key: "period", label: formatMonthLabel(selectedMonth), clear: () => setSelectedMonth(ALL_PERIODS) }] : []),
    ...(selectedAccount !== ALL_ACCOUNTS ? [{ key: "account", label: accountOptions.find(account => String(account.id) === selectedAccount)?.label ?? "Cuenta seleccionada", clear: () => setSelectedAccount(ALL_ACCOUNTS) }] : []),
    ...(selectedCategory !== ALL_CATEGORIES ? [{ key: "category", label: selectedCategory === UNCATEGORIZED_CATEGORY ? "Sin categoría" : categoryFilterOptions.find(category => String(category.id) === selectedCategory)?.label ?? "Categoría seleccionada", clear: () => setSelectedCategory(ALL_CATEGORIES) }] : []),
    ...(excludeInternalTransfers ? [{ key: "transfers", label: "Sin transferencias internas", clear: () => setExcludeInternalTransfers(false) }] : []),
  ];
  const activeFilterCount = activeFilters.length;

  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline/70 pb-4 sm:pb-5">
        <div className="hidden w-full items-center gap-3 pb-1 lg:flex">
          <span className="text-xs font-medium uppercase tracking-widest text-muted">Periodo</span>
          <label className="relative inline-flex max-w-full items-center">
            <span className="sr-only">Filtrar movimientos por periodo</span>
            <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}
              className="min-h-11 max-w-full appearance-none border-b border-primary/30 bg-transparent pr-8 text-xl font-medium text-primary outline-none focus:border-primary">
              <option value={ALL_PERIODS}>Todos los periodos</option>
              {months.map(month => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-1 h-4 w-4 text-primary" />
          </label>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl lg:text-[2.5rem]">Movimientos</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {cashAccount && !statementId ? (
            <Button compactOnMobile onClick={() => { setEditingCashTransaction(null); setCashFormOpen(true); }}>
              <span aria-hidden="true">+</span> Registrar
            </Button>
          ) : null}
          <div className="hidden sm:block">
            <Button compactOnMobile tone="secondary" onClick={exportMarkdown} disabled={loading || visibleTransactions.length === 0}>
              <ExportIcon className="h-4 w-4" /> Exportar
            </Button>
          </div>
          <details className="relative sm:hidden">
            <summary aria-label="Más acciones" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-outline bg-white text-xl [&::-webkit-details-marker]:hidden">⋯</summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-outline bg-white p-1 shadow-lg">
              <button type="button" disabled={loading || visibleTransactions.length === 0}
                onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); exportMarkdown(); }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-paper-soft disabled:opacity-50">
                <ExportIcon className="h-4 w-4" /> Exportar movimientos
              </button>
            </div>
          </details>
        </div>
        {statementId ? <p className="w-full text-sm text-muted">Revisa los movimientos de la cartola importada.</p> : null}
      </header>

      {loading && !hasLoaded ? <LoadingState message="Cargando movimientos..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {typeof location.state?.importMessage === "string" ? (
        <StatusNotice tone="success">{location.state.importMessage}</StatusNotice>
      ) : null}
      {successMessage ? (
        <StatusNotice tone="success">{successMessage}</StatusNotice>
      ) : null}

      <section aria-label="Filtros de movimientos" className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[18rem_auto] lg:justify-start">
          <div role="group" aria-label="Tipo de movimiento" className="grid min-w-0 grid-cols-3 rounded-xl bg-primary-mist/60 p-1">
            {([['all', 'Todos'], ['expense', 'Gastos'], ['income', 'Ingresos']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                className={cn("min-h-10 rounded-lg px-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:min-h-9", filter === value ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink")}>{label}</button>
            ))}
          </div>
          <button type="button" aria-expanded={filtersOpen} aria-controls="movement-filters" onClick={() => setFiltersOpen(open => !open)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline bg-white px-3 text-sm font-medium text-ink">
            Filtros{activeFilterCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-white">{activeFilterCount}</span> : null}
            <ChevronDownIcon className={cn("h-4 w-4 transition", filtersOpen && "rotate-180")} />
          </button>
        </div>
        <div id="movement-filters" hidden={!filtersOpen} className="pt-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="relative min-w-0 space-y-1.5 lg:hidden sm:col-span-2">
              <span className="block text-sm font-medium text-muted">Periodo</span>
              <span className="relative block">
                <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}
                  className="min-h-11 w-full min-w-0 appearance-none rounded-xl border border-outline bg-white px-3 pr-9 text-base text-ink outline-none focus:border-primary">
                  <option value={ALL_PERIODS}>Todos los periodos</option>
                  {months.map(month => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              </span>
            </label>
            <label className="min-w-0 space-y-1.5 text-sm font-medium text-muted">
              <span className="block">Cuenta</span>
              <select aria-label="Filtrar por cuenta" value={selectedAccount} onChange={event => setSelectedAccount(event.target.value)} className="block min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 text-base text-ink sm:text-sm">
                <option value={ALL_ACCOUNTS}>Todas las cuentas</option>
                {accountOptions.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
              </select>
            </label>
            <div className="min-w-0 space-y-1.5">
              <span className="block text-sm font-medium text-muted">Categoría</span>
              <CategoryPicker label="Filtrar por categoría" purpose="filter" value={selectedCategory} disabled={false}
                groups={groupCategories(categories)} onChange={setSelectedCategory} />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" checked={excludeInternalTransfers} onChange={event => setExcludeInternalTransfers(event.target.checked)} className="h-4 w-4 accent-primary" />
              Excluir transferencias internas
            </label>
          </div>
        </div>
        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
            {activeFilters.map(item => <button key={item.key} type="button" onClick={item.clear} aria-label={`Quitar filtro: ${item.label}`} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-primary-mist px-3 text-xs font-medium text-primary"><span className="truncate">{item.label}</span><span aria-hidden="true">×</span></button>)}
            <button type="button" onClick={() => { setSelectedMonth(ALL_PERIODS); setSelectedAccount(ALL_ACCOUNTS); setSelectedCategory(ALL_CATEGORIES); setExcludeInternalTransfers(false); }} className="min-h-9 px-2 text-xs font-medium text-muted underline underline-offset-2">Limpiar filtros</button>
          </div>
        ) : null}
      </section>

      {hasLoaded ? (
        <p className="min-h-5 text-sm text-muted" role="status" aria-live="polite">
          Mostrando {displayedTransactions.length} de {total} movimientos
          {statementId ? " de esta importacion" : ""}.
          {loading ? <span className="ml-2">Actualizando…</span> : null}
        </p>
      ) : null}

      {groupedTransactions.length > 0 ? (
        <div className="space-y-5 sm:space-y-8">
          {groupedTransactions.map(([date, items]) => (
            <section key={date} className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span className="h-5 w-[3px] rounded-full bg-primary-soft" />
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink sm:text-base sm:tracking-[0.08em] lg:text-xl">
                  {formatDateLabel(date)}
                </h2>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {items.map((transaction) => {
                  const categoryValue = transaction.category_id ? String(transaction.category_id) : "";
                  const categoryGroups = categoryGroupsFor(transaction);
                  const account = accountMap.get(transaction.account_id);
                  const detailsOpen = expandedTransactionIds.has(transaction.id);
                  const originLabel = transaction.origin === "pdf"
                    ? "Cartola PDF"
                    : transaction.origin === "cash_transfer"
                      ? "Traslado con Efectivo"
                      : "Registro manual";

                  return (
                    <Panel
                      compactOnMobile
                      dense
                      key={transaction.id}
                      className={cn("relative min-w-0 cursor-pointer space-y-3 sm:space-y-4", (transaction.is_internal_transfer || transaction.origin === "cash_transfer") && "overflow-hidden sm:overflow-visible")}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
                        toggleTransactionDetails(transaction.id);
                      }}
                    >
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)] sm:gap-x-6 lg:grid-cols-[3rem_minmax(0,1fr)_max-content_12rem] lg:gap-x-4 lg:gap-y-1 xl:grid-cols-[3rem_minmax(0,1fr)_max-content_14rem] 2xl:grid-cols-[3rem_minmax(0,1fr)_max-content_16rem]">
                        <span className="hidden lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:flex lg:items-center"><MovementIcon transaction={transaction} /></span>
                        <div className={cn("min-w-0", (transaction.is_internal_transfer || transaction.origin === "cash_transfer") && "pl-5 sm:pl-0")}>
                          {transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? (
                            <span role="img" aria-label="Transferencia interna" className="pointer-events-none absolute left-0 top-0 h-11 w-11 bg-primary [clip-path:polygon(0_0,100%_0,0_100%)] sm:hidden">
                              <span aria-hidden="true" className="absolute left-2 top-2 text-xs font-bold leading-none text-white">↔</span>
                            </span>
                          ) : null}
                          <div className="flex min-h-6 min-w-0 items-center gap-3">
                            <span className="hidden shrink-0 sm:block lg:hidden"><MovementIcon transaction={transaction} /></span>
                            <button
                              type="button"
                              aria-label={`${detailsOpen ? "Ocultar" : "Mostrar"} detalles de ${transaction.description}`}
                              aria-expanded={detailsOpen}
                              aria-controls={detailsOpen ? `transaction-details-${transaction.id}` : undefined}
                              onClick={() => toggleTransactionDetails(transaction.id)}
                              className="block min-w-0 max-w-full text-left focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <span className={cn(
                                "block text-[0.9375rem] font-semibold leading-6 tracking-[-0.02em] text-ink sm:text-[1.0625rem] lg:text-[1.375rem] lg:leading-7 xl:text-[1.625rem] xl:leading-8",
                                detailsOpen ? "whitespace-normal [overflow-wrap:anywhere]" : "truncate whitespace-nowrap",
                              )}>
                                {transaction.description}
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0 text-right lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-center">
                          <p className={cn(
                            "max-w-full whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums sm:text-lg lg:text-[1.375rem] xl:text-[1.625rem]",
                            transaction.amount_clp >= 0 ? "text-primary" : "text-ink",
                          )}>
                          {new Intl.NumberFormat("es-CL", {
                            style: "currency",
                            currency: "CLP",
                            maximumFractionDigits: 0,
                          }).format(transaction.amount_clp)}
                          </p>
                        </div>
                        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-2 self-center sm:pl-[3.75rem] lg:col-start-2 lg:row-start-2 lg:pl-0">
                          <span className="hidden text-xs text-muted sm:inline lg:text-base">
                            {transaction.transaction_type === "income" ? "Ingreso" : "Gasto"}
                          </span>
                          {account ? (
                            <Link
                              to={`/app/accounts?account_id=${account.id}`}
                              aria-label={`Ver detalle de ${account.name}`}
                              className="relative inline-flex max-w-full items-center gap-1.5 rounded-md text-xs font-medium text-muted transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:rounded-full lg:border lg:border-outline lg:bg-white lg:px-2.5 lg:py-1 lg:font-semibold"
                            >
                              <span className="block shrink-0">{"institution" in account ? (
                                <InstitutionLogo institution={account.institution} size="sm" />
                              ) : <WalletIcon className="h-4 w-4 shrink-0 text-primary" />}</span>
                              <span className="min-w-0 truncate">{account.name}</span>
                            </Link>
                          ) : (
                            <span className="block truncate text-xs font-medium text-muted">
                              Tarjeta #{transaction.account_id}
                            </span>
                          )}
                          {transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? (
                            <span className="hidden rounded-full border border-primary/20 bg-primary-mist px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex lg:px-2 lg:py-0.5 lg:text-[0.625rem] lg:uppercase lg:tracking-[0.02em] 2xl:text-xs">
                              Transferencia interna
                            </span>
                          ) : null}
                          <span className="hidden text-xs text-muted 2xl:inline">{originLabel}</span>
                        </div>
                        <span className="min-w-0 self-center text-right text-xs leading-5 text-muted sm:hidden" title={categoryMap.get(Number(categoryValue))?.name ?? "Sin categoría"}>
                          <span className="line-clamp-1 [overflow-wrap:anywhere]">{categoryMap.get(Number(categoryValue))?.name ?? "Sin categoría"}</span>
                        </span>
                        <div className={cn("col-span-2 mt-2 w-full min-w-0 text-left sm:col-span-1 sm:ml-auto sm:mt-0 sm:max-w-64 sm:text-right lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:self-center", detailsOpen ? "block" : "hidden sm:block")}>
                          <span className="block text-left text-xs font-medium text-muted lg:sr-only">Categoría</span>
                          <div className="relative mt-1 w-full min-w-0 lg:mt-0">
                              <CategoryPicker
                                label={`Categoria de ${transaction.description}`}
                                disabled={transaction.origin === "cash_transfer" || savingCategoryIds.has(transaction.id)}
                                value={categoryValue}
                                groups={categoryGroups}
                                onChange={value => void changeCategory(transaction, value ? Number(value) : null)}
                              />
                          </div>
                        </div>
                      </div>

                      {detailsOpen ? (
                        <div id={`transaction-details-${transaction.id}`} className="space-y-3 border-t border-outline/70 pt-3">
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <div className="sm:hidden">
                              <dt className="text-xs text-muted">Tipo</dt>
                              <dd className="mt-1 font-medium text-ink">{transaction.transaction_type === "income" ? "Ingreso" : "Gasto"}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted">Fecha</dt>
                              <dd className="mt-1 font-medium text-ink">{formatDateLabel(transaction.date)}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted">Origen</dt>
                              <dd className="mt-1 font-medium text-ink">{originLabel}</dd>
                            </div>
                            <div className="sm:hidden">
                              <dt className="text-xs text-muted">Transferencia interna</dt>
                              <dd className="mt-1 font-medium text-ink">{transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? "Sí" : "No"}</dd>
                            </div>
                          </dl>
                          {transaction.origin === "manual" ? (
                            <Button compactOnMobile tone="ghost" disabled={savingCategoryIds.has(transaction.id)} onClick={() => { setEditingCashTransaction(transaction); setCashFormOpen(true); }}>
                              Editar
                            </Button>
                          ) : null}
                          {(transaction.cash_transfer_linked || transaction.origin === "cash_transfer" ||
                            canLinkWithCash(transaction, categoryMap)) ? (
                            <Button compactOnMobile tone="ghost" disabled={savingCategoryIds.has(transaction.id)} onClick={() => { setLinkError(null); setLinkingTransaction(transaction); }}>
                              {transaction.cash_transfer_linked || transaction.origin === "cash_transfer" ? "Deshacer vínculo" : "Vincular con Efectivo"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </Panel>
                  );
                })}
              </div>
            </section>
          ))}

          <div ref={loadMoreRef} className="flex min-h-10 items-center justify-center" role="status" aria-live="polite">
            {loadingMore ? "Cargando más movimientos…" : null}
            {loadMoreFailed ? <Button tone="secondary" onClick={() => { setError(null); setLoadMoreFailed(false); }}>Reintentar carga</Button> : null}
          </div>
        </div>
      ) : hasLoaded ? (
        <EmptyState
          title={selectedCategory === UNCATEGORIZED_CATEGORY && selectedMonth !== ALL_PERIODS && selectedAccount === ALL_ACCOUNTS && filter === "all" && !excludeInternalTransfers ? "Todo categorizado para este periodo" : "No hay movimientos para este filtro"}
          description={selectedCategory === UNCATEGORIZED_CATEGORY ? "No quedan movimientos sin categoría con los filtros actuales." : "Prueba cambiando el periodo o el criterio de revision."}
        />
      ) : null}
      {categoryNotice ? (
        <div role={categoryNotice.tone === "error" ? "alert" : "status"} aria-live={categoryNotice.tone === "error" ? "assertive" : "polite"}
          className={cn("fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-auto sm:max-w-md",
            categoryNotice.tone === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-primary/20 bg-white text-ink")}>
          <span>{categoryNotice.message}</span>
          {categoryNotice.undo ? (
            <button type="button" onClick={undoCategoryChange} aria-label="Deshacer cambio de categoría"
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-primary hover:bg-primary-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span aria-hidden="true" className="text-lg">↶</span> Deshacer
            </button>
          ) : null}
        </div>
      ) : null}
      {cashFormOpen ? (
        <CashMovementFormModal
          key={editingCashTransaction?.id ?? "new"}
          categories={categories}
          transaction={editingCashTransaction}
          onClose={() => setCashFormOpen(false)}
          onChanged={() => {
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
