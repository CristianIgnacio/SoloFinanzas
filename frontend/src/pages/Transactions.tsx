import { ReportService } from '../services/reportService';
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faSliders } from "@fortawesome/free-solid-svg-icons";

import {
  Button,
  CashMovementFormModal,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  ExportIcon,
  InstitutionLogo,
  LoadingState,
  WalletIcon,
  Panel,
  PlusIcon,
  StatusNotice,
  cn,
} from "../components";
import {
  createCategoryMap,
  getCategoryPath,
  groupCategories,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import { CashLinkModal } from "../components/CashLinkModal";
import { CategoryIcon } from "../components/CategoryIcon";
import { CategoryPicker } from "../components/CategoryPicker";
import { CategoryProposalModal } from "../components/CategoryProposalModal";
import { TransactionExportModal, type TransactionExportRequest } from "../components/TransactionExportModal";
import type { CategoryPattern } from "../services/categoryService";
import { CategoryType } from "../types";
import type { Account, CashAccount, Category, Transaction } from "../types";

type FilterMode = "all" | "expense" | "income";
type CategoryNotice = {
  id: number;
  tone: "saving" | "success" | "error";
  message: string;
  undo?: { transactionId: number; eventId: number; version: number };
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

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [proposals, setProposals] = useState<CategoryPattern[]>([]);
  const [proposalQueue, setProposalQueue] = useState<CategoryPattern[]>([]);
  const shownProposals = useRef(new Set<number>());
  const changedForProposals = useRef(new Map<number, Transaction>());
  const proposalRequest = useRef(0);
  const refreshProposals = async (changed?: Transaction) => {
    if (changed) changedForProposals.current.set(changed.id, changed);
    const request = ++proposalRequest.current;
    try {
      const items = await CategoryService.ruleProposals();
      if (request !== proposalRequest.current) return;
      setProposals(items);
      // Only interrupt for patterns related to the user's saved changes, not
      // unrelated proposals that happened to be waiting when this page opened.
      const relevant = items.filter(item => !shownProposals.current.has(item.id) &&
        [...changedForProposals.current.values()].some(tx => {
          const description = tx.normalized_description;
          return item.category_id === tx.category_id && item.transaction_type === tx.transaction_type &&
            (item.match_type === "exact" ? item.pattern === description : ` ${description} `.includes(` ${item.pattern} `));
        }));
      relevant.forEach(item => shownProposals.current.add(item.id));
      changedForProposals.current.clear();
      setProposalQueue(current => [...current.flatMap(queued => {
        const updated = items.find(item => item.id === queued.id);
        return updated ? [updated] : [];
      }), ...relevant.filter(item => !current.some(queued => queued.id === item.id))]);
    } catch { /* A proposal fetch failure must never undo a saved category. */ }
  };
  useEffect(() => { void refreshProposals(); }, []);
  const [categoryNotice, setCategoryNotice] = useState<CategoryNotice | null>(null);
  const updateFilters = (values: Record<string, string | undefined>) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) => {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      });
      return next;
    }, { replace: true, state: location.state, flushSync: true });
  };
  const filtersOpen = searchParams.get("filters") === "1";
  const filterParam = searchParams.get("type");
  const filter: FilterMode = filterParam === "income" || filterParam === "expense" ? filterParam : "all";
  const descriptionSearch = (searchParams.get("search") ?? "").slice(0, 200);
  const [debouncedSearch, setDebouncedSearch] = useState(() => descriptionSearch.trim());
  const setDescriptionSearch = (value: string) => updateFilters({ search: value || undefined });
  const setFilter = (value: FilterMode) => updateFilters({ type: value === "all" ? undefined : value });
  const searchPending = descriptionSearch.trim() !== debouncedSearch;
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(descriptionSearch.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [descriptionSearch]);
  const excludeInternalTransfers = searchParams.get("exclude_internal") === "1";
  const monthParam = searchParams.get("month") ?? "";
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : ALL_PERIODS;
  const accountParam = searchParams.get("account_id") ?? "";
  const selectedAccount = /^[1-9]\d*$/.test(accountParam) ? accountParam : ALL_ACCOUNTS;
  const categoryParam = searchParams.get("category") ?? "";
  const selectedCategory = categoryParam === UNCATEGORIZED_CATEGORY || /^[1-9]\d*$/.test(categoryParam) ? categoryParam : ALL_CATEGORIES;
  const setExcludeInternalTransfers = (value: boolean) => updateFilters({ exclude_internal: value ? "1" : undefined });
  const setSelectedMonth = (value: string) => updateFilters({ month: value === ALL_PERIODS ? undefined : value });
  const setSelectedAccount = (value: string) => updateFilters({ account_id: value === ALL_ACCOUNTS ? undefined : value });
  const setSelectedCategory = (value: string) => updateFilters({ category: value === ALL_CATEGORIES ? undefined : value });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [exportRequest, setExportRequest] = useState<TransactionExportRequest | null>(null);
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

  useEffect(() => {
    if (searchParams.get("new_movement") !== "1" || !cashAccount) return;
    setEditingCashTransaction(null);
    setCashFormOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new_movement");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, cashAccount]);

  const toggleTransactionDetails = (id: number) => {
    setExpandedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!categoryNotice || categoryNotice.tone === "saving" || proposalQueue.length > 0) return;
    const timeout = window.setTimeout(() => {
      setCategoryNotice(current => current?.id === categoryNotice.id ? null : current);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [categoryNotice, proposalQueue.length]);

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
    search: debouncedSearch || undefined,
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
  }, [statementId, selectedMonth, selectedAccount, selectedCategory, filter, excludeInternalTransfers, cashRefreshKey, debouncedSearch]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasLoaded || loading || searchPending || exportRequest || loadingMore || loadMoreFailed || nextOffsetRef.current >= total) return;
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
  }, [hasLoaded, loading, searchPending, exportRequest, loadingMore, loadMoreFailed, total, transactions.length, statementId, selectedMonth, selectedAccount, selectedCategory, filter, excludeInternalTransfers, cashRefreshKey, debouncedSearch]);

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
    confirming = false) => {
    const previousCategoryId = transaction.category_id;
    if ((categoryId === previousCategoryId && !confirming) || savingCategoryIdsRef.current.has(transaction.id)) return;
    latestCategoryActionRef.current += 1;
    const actionId = latestCategoryActionRef.current;
    savingCategoryIdsRef.current.add(transaction.id);
    setSavingCategoryIds(current => new Set(current).add(transaction.id));
    categoryOverridesRef.current.set(transaction.id, categoryId);
    setTransactions(current => current.map(item => item.id === transaction.id
      ? { ...item, category_id: categoryId }
      : item));
    showCategoryNotice({ tone: "saving", message: "Guardando categoría…" });

    try {
      const saved = await TransactionService.updateCategory(transaction.id, categoryId, {
        action: confirming ? "confirm" : "set",
        expected_version: transaction.category_version,
      });
      setTransactions(current => current.map(item => item.id === transaction.id
        ? { ...item, ...(saved && saved.id === transaction.id ? saved : {}), category_id: categoryId }
        : item));
      void refreshVisibleTransactions();
      void refreshProposals(saved);
      const categoryName = categoryId === null ? "Sin categoría" : categoryMap.get(categoryId)?.name ?? "la categoría seleccionada";
      if (latestCategoryActionRef.current === actionId) {
        showCategoryNotice({
          tone: "success",
          message: confirming ? "Categoría confirmada." : `Categoría cambiada a ${categoryName}.`,
          undo: saved.category_event_id ? {
            transactionId: transaction.id, eventId: saved.category_event_id,
            version: saved.category_version,
          } : undefined,
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

  const undoCategoryChange = async () => {
    const undo = categoryNotice?.undo;
    if (!undo) return;
    try {
      const restored = await TransactionService.undoCategory(undo.transactionId, undo.eventId, undo.version);
      categoryOverridesRef.current.set(restored.id, restored.category_id);
      setTransactions(current => current.map(item => item.id === restored.id ? restored : item));
      showCategoryNotice({ tone: "success", message: "Cambio deshecho." });
      void refreshVisibleTransactions();
      changedForProposals.current.delete(restored.id);
      void refreshProposals();
    } catch (cause) {
      showCategoryNotice({ tone: "error", message: cause instanceof Error ? cause.message : "No se pudo deshacer." });
    }
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

  const activeFilters = [
    ...(selectedMonth !== ALL_PERIODS ? [{ key: "period", label: formatMonthLabel(selectedMonth), clear: () => setSelectedMonth(ALL_PERIODS) }] : []),
    ...(selectedAccount !== ALL_ACCOUNTS ? [{ key: "account", label: accountOptions.find(account => String(account.id) === selectedAccount)?.label ?? "Cuenta seleccionada", clear: () => setSelectedAccount(ALL_ACCOUNTS) }] : []),
    ...(selectedCategory !== ALL_CATEGORIES ? [{ key: "category", label: selectedCategory === UNCATEGORIZED_CATEGORY ? "Sin categoría" : categoryFilterOptions.find(category => String(category.id) === selectedCategory)?.label ?? "Categoría seleccionada", clear: () => setSelectedCategory(ALL_CATEGORIES) }] : []),
    ...(excludeInternalTransfers ? [{ key: "transfers", label: "Sin transferencias internas", clear: () => setExcludeInternalTransfers(false) }] : []),
  ];
  const activeFilterCount = activeFilters.length;
  const exportDisabled = loading || searchPending || Boolean(error) || total === 0 || savingCategoryIds.size > 0;
  const openExport = (trigger: HTMLElement) => {
    if (exportDisabled) return;
    setExportRequest({
      filters: { ...query }, total, period: formatMonthLabel(selectedMonth),
      filePeriod: selectedMonth === ALL_PERIODS ? "todos" : selectedMonth,
      filterLabels: [
        ...activeFilters.filter(item => item.key !== "period").map(item => item.label),
        ...(filter !== "all" ? [filter === "income" ? "Ingresos" : "Gastos"] : []),
        ...(debouncedSearch ? [`Descripción: ${debouncedSearch}`] : []),
        ...(statementId ? [`Cartola #${statementId}`] : []),
      ], trigger,
    });
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline/70 pb-4 sm:pb-5">
        <div className="hidden w-full items-center gap-3 pb-1 lg:flex">
          <span className="text-sm font-medium uppercase tracking-widest text-muted">Periodo</span>
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
        <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
          <h1 className="page-title min-w-0 text-2xl sm:text-4xl lg:text-[2.5rem]">Movimientos</h1>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {cashAccount && !statementId ? (
              <Button compactOnMobile aria-label="Registrar movimiento" className="h-11 w-11 !px-0 sm:h-auto sm:w-auto sm:!px-5" onClick={() => { setEditingCashTransaction(null); setCashFormOpen(true); }}>
                <PlusIcon className="h-4 w-4" /><span className="hidden sm:inline">Registrar movimiento</span>
              </Button>
            ) : null}
            <div className="hidden sm:block">
              <Button compactOnMobile tone="secondary" onClick={event => openExport(event.currentTarget)} disabled={exportDisabled}>
                <ExportIcon className="h-4 w-4" /> Exportar
              </Button>
            </div>
            <details className="relative sm:hidden">
              <summary aria-label="Más acciones" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-outline bg-white text-xl [&::-webkit-details-marker]:hidden">⋯</summary>
              <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-outline bg-white p-1 shadow-lg">
                <button type="button" disabled={exportDisabled}
                  onClick={event => {
                    const menu = event.currentTarget.closest("details");
                    const trigger = menu?.querySelector("summary") ?? event.currentTarget;
                    menu?.removeAttribute("open");
                    openExport(trigger);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-paper-soft disabled:opacity-50">
                  <ExportIcon className="h-4 w-4" /> Exportar movimientos
                </button>
              </div>
            </details>
          </div>
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_18rem_auto]">
          <div className="relative col-span-2 min-w-0 lg:col-span-1">
            <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Buscar por descripción" placeholder="Buscar por descripción"
              value={descriptionSearch} maxLength={200} onChange={event => setDescriptionSearch(event.target.value)}
              className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white py-2 pl-10 pr-12 text-base text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary [&::-webkit-search-cancel-button]:appearance-none" />
            {descriptionSearch ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => setDescriptionSearch("")}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-xl text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span aria-hidden="true">×</span>
            </button> : null}
          </div>
          <div role="group" aria-label="Tipo de movimiento" className="grid w-full min-w-0 grid-cols-3 rounded-xl bg-primary-mist/60 p-1">
            {([['all', 'Todos'], ['expense', 'Gastos'], ['income', 'Ingresos']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                className={cn("min-h-10 rounded-lg px-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:px-2 sm:text-sm lg:min-h-9", filter === value ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink")}>{label}</button>
            ))}
          </div>
          <button type="button" aria-expanded={filtersOpen} aria-controls="movement-filters" onClick={() => updateFilters({ filters: filtersOpen ? undefined : "1" })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline bg-white px-3 text-sm font-medium text-ink">
            Filtros{activeFilterCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-sm leading-5 text-white">{activeFilterCount}</span> : null}
            <FontAwesomeIcon icon={faSliders} aria-hidden="true" className="h-4 w-4" />
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
            {activeFilters.map(item => <button key={item.key} type="button" onClick={item.clear} aria-label={`Quitar filtro: ${item.label}`} className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-primary-mist px-3 text-sm font-medium text-primary"><span className="truncate">{item.label}</span><span aria-hidden="true">×</span></button>)}
            <button type="button" onClick={() => updateFilters({ month: undefined, account_id: undefined, category: undefined, exclude_internal: undefined })} className="min-h-9 px-2 text-sm font-medium text-muted underline underline-offset-2">Limpiar filtros</button>
          </div>
        ) : null}
      </section>

      {hasLoaded ? (
        <p className="min-h-5 text-sm text-muted" role="status" aria-live="polite">
          {/* Mostrando {displayedTransactions.length} de  */}
          {total} movimientos
          {statementId ? " de esta importacion" : ""}.
          {loading || searchPending ? <span className="ml-2">Actualizando…</span> : null}
        </p>
      ) : null}

      {groupedTransactions.length > 0 ? (
        <div className="space-y-5 sm:space-y-8 lg:space-y-5">
          {groupedTransactions.map(([date, items]) => (
            <section key={date} className="space-y-3 sm:space-y-4 lg:space-y-2">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span className="h-5 w-[3px] rounded-full bg-primary-soft" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink sm:text-base sm:tracking-[0.08em] lg:text-sm">
                  {formatDateLabel(date)}
                </h2>
              </div>

              <div className="space-y-3 sm:space-y-4 lg:space-y-3">
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
                      className={cn("relative min-w-0 cursor-pointer space-y-3 sm:space-y-4 lg:space-y-3 lg:rounded-xl lg:px-6 lg:py-5 lg:shadow-none", (transaction.is_internal_transfer || transaction.origin === "cash_transfer") && "overflow-hidden sm:overflow-visible")}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
                        toggleTransactionDetails(transaction.id);
                      }}
                    >
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)] sm:gap-x-6 lg:grid-cols-[3rem_minmax(0,1fr)_max-content_12rem] lg:gap-x-4 lg:gap-y-1 xl:grid-cols-[3rem_minmax(0,1fr)_max-content_14rem] 2xl:grid-cols-[3rem_minmax(0,1fr)_max-content_16rem]">
                        <span className="hidden lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:flex lg:items-center"><CategoryIcon category={categoryMap.get(transaction.category_id ?? -1)} categoryMap={categoryMap} size="md" /></span>
                        <div className="min-w-0">
                          {transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? (
                            <span role="img" aria-label="Transferencia interna" className="pointer-events-none absolute left-0 top-0 z-10 h-11 w-11 bg-primary [clip-path:polygon(0_0,100%_0,0_100%)] sm:hidden">
                              <span aria-hidden="true" className="absolute left-2 top-2 text-sm font-bold leading-none text-white">↔</span>
                            </span>
                          ) : null}
                          <div className="flex min-h-6 min-w-0 items-center gap-3">
                            <span className="block shrink-0 lg:hidden"><CategoryIcon category={categoryMap.get(transaction.category_id ?? -1)} categoryMap={categoryMap} /></span>
                            <button
                              type="button"
                              aria-label={`${detailsOpen ? "Ocultar" : "Mostrar"} detalles de ${transaction.description}`}
                              aria-expanded={detailsOpen}
                              aria-controls={detailsOpen ? `transaction-details-${transaction.id}` : undefined}
                              onClick={() => toggleTransactionDetails(transaction.id)}
                              className="block min-w-0 max-w-full text-left focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <span className={cn(
                                "block min-w-0 text-base font-semibold leading-6 tracking-[-0.02em] text-ink sm:text-[1.0625rem] lg:text-base lg:font-medium lg:leading-6",
                                detailsOpen ? "whitespace-normal [overflow-wrap:anywhere]" : "truncate whitespace-nowrap",
                              )}>
                                {transaction.description}
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0 text-right lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-center">
                          <p className={cn(
                            "max-w-full whitespace-nowrap text-base font-semibold tabular-nums sm:text-lg lg:text-base",
                            transaction.amount_clp >= 0 ? "text-primary" : "text-ink",
                          )}>
                          {new Intl.NumberFormat("es-CL", {
                            style: "currency",
                            currency: "CLP",
                            maximumFractionDigits: 0,
                            signDisplay: "exceptZero",
                          }).format(transaction.amount_clp)}
                          </p>
                        </div>
                        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-2 self-center sm:pl-[3.75rem] lg:col-start-2 lg:row-start-2 lg:pl-0">
                          <span className="hidden text-sm text-muted sm:inline lg:text-xs">
                            {transaction.transaction_type === "income" ? "Ingreso" : "Gasto"}
                          </span>
                          {account ? (
                            <Link
                              to={`/app/accounts?account_id=${account.id}`}
                              aria-label={`Ver detalle de ${account.name}`}
                              className="relative inline-flex max-w-full items-center gap-1.5 rounded-md text-sm font-medium text-muted transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary lg:text-xs"
                            >
                              <span className="block shrink-0">{"institution" in account ? (
                                <InstitutionLogo institution={account.institution} size="sm" />
                              ) : <WalletIcon className="h-4 w-4 shrink-0 text-primary" />}</span>
                              <span className="min-w-0 truncate">{account.name}</span>
                            </Link>
                          ) : (
                            <span className="block truncate text-sm font-medium text-muted">
                              Tarjeta #{transaction.account_id}
                            </span>
                          )}
                          {transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? (
                            <span className="hidden rounded-full border border-primary/20 bg-primary-mist px-2.5 py-1 text-sm font-semibold text-primary sm:inline-flex lg:px-2 lg:py-0.5 lg:text-xs lg:tracking-[0.02em] 2xl:text-sm">
                              Transferencia interna
                            </span>
                          ) : null}
                          {/* <span className="hidden text-sm text-muted 2xl:inline">{originLabel}</span> */}
                        </div>
                        <div className="w-full min-w-0 self-center sm:ml-auto sm:max-w-64 sm:text-right lg:col-start-4 lg:row-span-2 lg:row-start-1">
                          <span className="sr-only text-left text-sm font-medium text-muted sm:not-sr-only sm:block lg:sr-only">Categoría</span>
                          <div className="relative w-full min-w-0 sm:mt-1 lg:mt-0">
                              <CategoryPicker
                                triggerVariant="compact"
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
                              <dt className="text-sm text-muted">Tipo</dt>
                              <dd className="mt-1 font-medium text-ink">{transaction.transaction_type === "income" ? "Ingreso" : "Gasto"}</dd>
                            </div>
                            <div>
                              <dt className="text-sm text-muted">Fecha</dt>
                              <dd className="mt-1 font-medium text-ink">{formatDateLabel(transaction.date)}</dd>
                            </div>
                            <div>
                              <dt className="text-sm text-muted">Origen</dt>
                              <dd className="mt-1 font-medium text-ink">{originLabel}</dd>
                            </div>
                            <div className="sm:hidden">
                              <dt className="text-sm text-muted">Transferencia interna</dt>
                              <dd className="mt-1 font-medium text-ink">{transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? "Sí" : "No"}</dd>
                            </div>
                          </dl>
                          {transaction.personalized_category_id && transaction.personalized_category_id !== transaction.category_id ? (
                            <div className="rounded-xl border border-primary/20 bg-primary-mist/40 p-3 text-sm">
                              <p>{transaction.suggestion_reason}: {categoryMap.get(transaction.personalized_category_id)?.name}</p>
                              <button type="button" className="mt-1 text-primary underline"
                                onClick={() => void changeCategory(transaction, transaction.personalized_category_id)}>
                                Usar sugerencia
                              </button>
                            </div>
                          ) : null}
                          {transaction.suggestion_conflict ? (
                            <p className="text-sm text-muted">Tus decisiones anteriores tienen categorías diferentes para este movimiento.</p>
                          ) : null}
                          {transaction.category_id === null ? (
                            <p className="text-sm text-muted">
                              {transaction.category_reviewed ? "Sin categoría por decisión explícita." : "Pendiente de categorizar."}
                            </p>
                          ) : null}
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
      ) : hasLoaded && !loading && !searchPending ? (
        <EmptyState
          title={debouncedSearch ? "No hay movimientos que coincidan con tu búsqueda" : selectedCategory === UNCATEGORIZED_CATEGORY && selectedMonth !== ALL_PERIODS && selectedAccount === ALL_ACCOUNTS && filter === "all" && !excludeInternalTransfers ? "Todo categorizado para este periodo" : "No hay movimientos para este filtro"}
          description={debouncedSearch ? "Prueba con otra descripción o ajusta los filtros actuales." : selectedCategory === UNCATEGORIZED_CATEGORY ? "No quedan movimientos sin categoría con los filtros actuales." : "Prueba cambiando el periodo o el criterio de revision."}
        />
      ) : null}
      {proposals.length > 0 ? <div role="status" className="rounded-xl border border-primary/20 bg-primary-mist/40 p-3 text-sm">
        Tienes {proposals.length} {proposals.length === 1 ? "propuesta de regla" : "propuestas de reglas"} basadas en tus decisiones. <button type="button" className="text-primary underline" onClick={() => {
          proposals.forEach(item => shownProposals.current.add(item.id));
          setProposalQueue(proposals);
        }}>Revisar propuestas</button>
      </div> : null}
      {proposalQueue[0] ? <CategoryProposalModal key={proposalQueue[0].id} proposal={proposalQueue[0]} categories={categories}
        onClose={() => { setProposalQueue(current => current.slice(1)); void refreshProposals(); }}
        onDecided={message => {
          const decidedId = proposalQueue[0].id;
          setProposalQueue(current => current.filter(item => item.id !== decidedId));
          setProposals(current => current.filter(item => item.id !== decidedId));
          const noticeId = ++noticeSequenceRef.current;
          setCategoryNotice(current => ({ id: noticeId, tone: "success", message, undo: current?.undo }));
          void refreshProposals();
        }} /> : null}
      {categoryNotice ? (
        <div role={categoryNotice.tone === "error" ? "alert" : "status"} aria-live={categoryNotice.tone === "error" ? "assertive" : "polite"}
          className={cn("fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm shadow-lg lg:bottom-6 sm:left-auto sm:right-6 sm:w-auto sm:max-w-md",
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
      {exportRequest ? <TransactionExportModal request={exportRequest} categories={categoryMap}
        accountNames={new Map([...accountMap].map(([id, account]) => [id, account.name]))}
        onClose={() => setExportRequest(null)} onExported={count => {
          setExportRequest(null);
          setSuccessMessage(`Se descargaron ${count.toLocaleString("es-CL")} ${count === 1 ? "movimiento" : "movimientos"}.`);
        }} /> : null}
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
