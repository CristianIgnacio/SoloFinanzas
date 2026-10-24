import { createPortal } from "react-dom";
import "./Analytics.css";
import { CategoryPicker } from "../components/CategoryPicker";
import { ReportService } from '../services/reportService';
import { useAuth } from '../auth/AuthProvider';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type ComponentProps } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BalanceIcon,
  CalendarIcon,
  Button,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EChart,
  EmptyState,
  ErrorState,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  LoadingState,
  MoneyIcon,
  Panel,
  ReceiptIcon,
  SettingsIcon,
  cn,
} from "../components";
import type { AppChartOption } from "../components/EChart";
import { useFormatCurrency } from "../hooks";
import {
  categoryMatchesSelection,
  createCategoryMap,
  getCategoryPath,
  groupCategories,
  getRootCategory,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import { InstitutionLabels, TransactionType } from "../types";
import type { Account, CashAccount, Category, Transaction } from "../types";

const TRANSACTION_PAGE_SIZE = 1000;
const TRANSACTION_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const UNCATEGORIZED_KEY = "uncategorized";
const CATEGORY_SELECTION_SUMMARY = "category-selection-summary";
const WIDGET_STORAGE_KEY = "solo-finanzas.analytics.widgets";
const WIDGET_STORAGE_VERSION = 2;
const EXCLUDED_TRANSACTIONS_STORAGE_KEY = "solo-finanzas.analytics.excluded-transactions";
const EXCLUDED_TRANSACTIONS_STORAGE_VERSION = 1;

const WIDGET_OPTIONS = [
  { value: "evolution", label: "Evoluci\u00f3n temporal" },
  { value: "categories", label: "Distribuci\u00f3n por categor\u00eda" },
  { value: "accounts", label: "Comparaci\u00f3n por cuenta" },
  { value: "weekdays", label: "Gastos por d\u00eda de la semana" },
  { value: "descriptions", label: "Principales descripciones" },
  { value: "expenseFrequency", label: "Frecuencia de gastos por categoría" },
  { value: "transactions", label: "Tabla de movimientos" },
] as const;

type WidgetId = (typeof WIDGET_OPTIONS)[number]["value"];
const ANALYSIS_VIEWS = [
  { value: "summary", label: "Gráficos" },
  { value: "movements", label: "Movimientos" },
] as const;
type AnalysisView = (typeof ANALYSIS_VIEWS)[number]["value"];
type ChartWidgetId = Exclude<WidgetId, "transactions">;
const CHART_WIDGETS = WIDGET_OPTIONS.filter(widget => widget.value !== "transactions");
const DEFAULT_WIDGETS: WidgetId[] = ["evolution", "categories", "accounts", "weekdays", "descriptions"];

type CategoryBreakdownItem = { key: string; label: string; total: number };
type CategoryChartItem = CategoryBreakdownItem & { axisLabel: string };
type ChartSelection = {
  sourceChart: ChartWidgetId;
  label: string;
  transactionType: TransactionType;
  categoryKey?: string;
  includeChildren?: boolean;
  periodKey?: string;
  weekly?: boolean;
  accountId?: number;
  weekday?: number;
  description?: string;
};
type ChartDrilldown = ChartSelection & {
  previousSearch: string;
  previousTableView: TransactionAnalysisView;
};

type ChartStyle = "bar" | "line";
type TransactionAnalysisView = "all" | "included" | "excluded";
type TransactionSortKey = "date" | "description" | "account" | "category" | "type" | "amount";
type SortDirection = "asc" | "desc";

type TransactionSort = {
  key: TransactionSortKey;
  direction: SortDirection;
};


type FilterOption = {
  value: string;
  label: string;
  helper?: string;
};

type FilterGroup = "periods" | "accounts" | "categories" | "types" | "scopes";

type ActiveFilter = {
  key: string;
  group: FilterGroup;
  groupLabel: string;
  value: string;
  label: string;
};

function createActiveFilters(
  group: FilterGroup,
  groupLabel: string,
  options: FilterOption[],
  selected: Set<string>,
): ActiveFilter[] {
  return options
    .filter((option) => selected.has(option.value))
    .map((option) => ({
      key: `${group}-${option.value}`,
      group,
      groupLabel,
      value: option.value,
      label: option.label,
    }));
}

function createPaginationItems(currentPage: number, totalPages: number): Array<number | string> {
  const visiblePages = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push(`ellipsis-${page}`);
    }
    items.push(page);
  });

  return items;
}

async function loadPeriodTransactions(period: string) {
  const transactions: Transaction[] = [];
  let offset = 0;

  while (true) {
    const page = await TransactionService.getTransactions({
      date_from: `${period}-01`,
      date_to: `${period}-${new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate()}`,
      limit: TRANSACTION_PAGE_SIZE,
      offset,
    });
    transactions.push(...page);
    if (page.length < TRANSACTION_PAGE_SIZE) return transactions;
    offset += TRANSACTION_PAGE_SIZE;
  }
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
}

function formatShortPeriod(period: string) {
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
    .replace(".", "");
}

function formatCompactCurrency(value: number) {
  return `$${new Intl.NumberFormat("es-CL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;
}

// Calendar weeks run Monday–Sunday and are clipped to the selected month.
function getWeekStart(date: string) {
  const localDate = parseLocalDate(date);
  const day = Math.max(1, localDate.getDate() - (localDate.getDay() + 6) % 7);
  return `${date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

function formatWeekRange(date: string) {
  const start = parseLocalDate(date);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const end = Math.min(daysInMonth, start.getDate() + 6 - (start.getDay() + 6) % 7);
  const month = start.toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
  return `${start.getDate()}–${end} ${month}`;
}

function withCategoryAxisLabels(items: CategoryBreakdownItem[], categoryMap: ReturnType<typeof createCategoryMap>): CategoryChartItem[] {
  const names = items.map(item => categoryMap.get(Number(item.key))?.name ?? item.label);
  return items.map((item, index) => {
    const name = names[index];
    const parentId = categoryMap.get(Number(item.key))?.parent_id;
    const duplicate = names.filter(candidate => candidate === name).length > 1;
    const context = parentId != null ? getCategoryPath(parentId, categoryMap) : "Categoría principal";
    return { ...item, axisLabel: duplicate ? `${name}\n${context}` : name };
  });
}

function readStoredWidgets(owner: string): Set<WidgetId> {
  if (typeof window === "undefined") return new Set(DEFAULT_WIDGETS);

  try {
    const stored = JSON.parse(window.localStorage.getItem(`${WIDGET_STORAGE_KEY}.${owner}`) ?? "[]") as unknown;
    const isLegacyStorage = Array.isArray(stored);
    const storedWidgets = isLegacyStorage
      ? stored
      : typeof stored === "object" &&
          stored !== null &&
          "widgets" in stored &&
          Array.isArray(stored.widgets)
        ? stored.widgets
        : [];

    if (storedWidgets.length === 0 && isLegacyStorage) {
      return new Set(DEFAULT_WIDGETS);
    }
    const validWidgets = storedWidgets.filter((value): value is WidgetId =>
      WIDGET_OPTIONS.some((option) => option.value === value),
    );
    if (isLegacyStorage) {
      validWidgets.push("weekdays");
    }

    return new Set(validWidgets);
  } catch {
    return new Set(DEFAULT_WIDGETS);
  }
}

function readExcludedTransactionIds(owner: string): Set<number> {
  if (typeof window === "undefined") return new Set();

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`${EXCLUDED_TRANSACTIONS_STORAGE_KEY}.${owner}`) ?? "{}",
    ) as unknown;
    if (
      typeof stored !== "object" ||
      stored === null ||
      !("transactionIds" in stored) ||
      !Array.isArray(stored.transactionIds)
    ) {
      return new Set();
    }

    return new Set(
      stored.transactionIds.filter(
        (transactionId): transactionId is number =>
          typeof transactionId === "number" && Number.isInteger(transactionId),
      ),
    );
  } catch {
    return new Set();
  }
}

export function AnalyticsPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const formatCurrency = useFormatCurrency();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashAccount, setCashAccount] = useState<CashAccount | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(["regular"]));
  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetId>>(() => readStoredWidgets(owner));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const [analysisView, setAnalysisView] = useState<AnalysisView>("summary");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [chartDrilldown, setChartDrilldown] = useState<ChartDrilldown | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bar");
  const [showSubcategoryDetail, setShowSubcategoryDetail] = useState(false);
  const [showFrequencySubcategories, setShowFrequencySubcategories] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactionSort, setTransactionSort] = useState<TransactionSort>({
    key: "date",
    direction: "desc",
  });
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionPageSize, setTransactionPageSize] = useState(25);
  const [transactionAnalysisView, setTransactionAnalysisView] =
    useState<TransactionAnalysisView>("all");
  const [excludedTransactionIds, setExcludedTransactionIds] =
    useState<Set<number>>(() => readExcludedTransactionIds(owner));
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(
    new Set(),
  );
  const [showStickyBulkActions, setShowStickyBulkActions] = useState(false);
  const transactionTableRef = useRef<HTMLDivElement>(null);
  const bulkActionsRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const update = () => navigation.parentElement?.style.setProperty("--analysis-navigation-height", `${navigation.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalyticsData() {
      try {
        const [accountData, cashData, categoryData, periods] = await Promise.all([
          AccountService.getAccounts(),
          AccountService.getCashAccount(),
          CategoryService.getCategories(),
          ReportService.periods(),
        ]);
        if (cancelled) return;

        setAccounts(accountData);
        setCashAccount(cashData);
        setCategories(categoryData);
        const sortedPeriods = [...periods].sort((left, right) => right.localeCompare(left));
        setAvailablePeriods(sortedPeriods);
        setSelectedPeriods(new Set(sortedPeriods.slice(0, 1)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No fue posible cargar el an\u00e1lisis.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAnalyticsData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingPeriods(true); setTransactions([]);
    // An empty period selection means no data, never an implicit full-history fetch.
    void (async () => {
      const data: Transaction[] = [];
      for (const period of selectedPeriods) {
        if (cancelled) return;
        data.push(...await loadPeriodTransactions(period));
      }
      if (!cancelled) setTransactions(data);
    })().catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingPeriods(false); });
    return () => { cancelled = true; };
  }, [selectedPeriods]);

  useEffect(() => {
    window.localStorage.setItem(
      `${WIDGET_STORAGE_KEY}.${owner}`,
      JSON.stringify({
        version: WIDGET_STORAGE_VERSION,
        widgets: [...visibleWidgets],
      }),
    );
  }, [visibleWidgets]);

  useEffect(() => {
    window.localStorage.setItem(
      `${EXCLUDED_TRANSACTIONS_STORAGE_KEY}.${owner}`,
      JSON.stringify({
        version: EXCLUDED_TRANSACTIONS_STORAGE_VERSION,
        transactionIds: [...excludedTransactionIds],
      }),
    );
  }, [excludedTransactionIds]);

  useEffect(() => {
    if (selectedTransactionIds.size === 0) {
      setShowStickyBulkActions(false);
      return;
    }

    const bulkActions = bulkActionsRef.current;
    if (!bulkActions) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setShowStickyBulkActions(!entry.isIntersecting);
      },
      {
        rootMargin: "-72px 0px 0px 0px",
        threshold: 0,
      },
    );

    observer.observe(bulkActions);
    return () => observer.disconnect();
  }, [selectedTransactionIds.size, analysisView]);

  const accountMap = useMemo(
    () => new Map<number, Account | CashAccount>([
      ...accounts.map((account): [number, Account] => [account.id, account]),
      ...(cashAccount ? [[cashAccount.id, cashAccount] as [number, CashAccount]] : []),
    ]),
    [accounts, cashAccount],
  );
  const categoryMap = useMemo(
    () => createCategoryMap(categories),
    [categories],
  );

  const categoryGroups = useMemo(() => groupCategories(categories), [categories]);

  const periodOptions = useMemo<FilterOption[]>(
    () =>
      [...availablePeriods]
        .sort((left, right) => right.localeCompare(left))
        .map((period) => ({ value: period, label: formatPeriodLabel(period) })),
    [availablePeriods],
  );
  const accountOptions = useMemo<FilterOption[]>(
    () =>
      [...accounts.map((account) => ({
        value: String(account.id),
        label: account.name,
        helper: InstitutionLabels[account.institution],
      })), ...(cashAccount ? [{ value: String(cashAccount.id), label: cashAccount.name, helper: "Cuenta manual" }] : [])],
    [accounts, cashAccount],
  );
  const categoryOptions = useMemo<FilterOption[]>(
    () => [
      { value: UNCATEGORIZED_KEY, label: "Sin categor\u00eda" },
      ...categories.map((category) => ({
        value: String(category.id),
        label: getCategoryPath(category.id, categoryMap),
      })),
    ],
    [categories, categoryMap],
  );
  const typeOptions = useMemo<FilterOption[]>(
    () => [
      { value: TransactionType.INCOME, label: "Ingresos" },
      { value: TransactionType.EXPENSE, label: "Gastos" },
    ],
    [],
  );
  const scopeOptions = useMemo<FilterOption[]>(
    () => [
      { value: "regular", label: "Movimientos normales" },
      { value: "internal", label: "Transferencias internas" },
    ],
    [],
  );


  const activeFilters = useMemo<ActiveFilter[]>(
    () => {
      const categoryFilters =
        selectedCategoryKeys.size > 5
          ? [
              {
                key: "categories-summary",
                group: "categories" as const,
                groupLabel: "Categor\u00eda",
                value: CATEGORY_SELECTION_SUMMARY,
                label:
                  selectedCategoryKeys.size === categoryOptions.length
                    ? "Todas las categor\u00edas"
                    : `${selectedCategoryKeys.size} seleccionadas`,
              },
            ]
          : createActiveFilters(
              "categories",
              "Categor\u00eda",
              categoryOptions,
              selectedCategoryKeys,
            );

      return [
        ...createActiveFilters("periods", "Periodo", periodOptions, selectedPeriods),
        ...createActiveFilters("accounts", "Cuenta", accountOptions, selectedAccountIds),
        ...categoryFilters,
        ...createActiveFilters("types", "Tipo", typeOptions, selectedTypes),
        ...createActiveFilters("scopes", "Movimiento", scopeOptions, selectedScopes),
      ];
    },
    [
      accountOptions,
      categoryOptions,
      periodOptions,
      scopeOptions,
      selectedAccountIds,
      selectedCategoryKeys,
      selectedPeriods,
      selectedScopes,
      selectedTypes,
      typeOptions,
    ],
  );
  const activeFilterCount = activeFilters.length + (chartDrilldown ? 1 : 0);
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const period = transaction.date.slice(0, 7);
        const categoryKey = transaction.category_id
          ? String(transaction.category_id)
          : UNCATEGORIZED_KEY;
        const scope = transaction.is_internal_transfer || transaction.origin === "cash_transfer" ? "internal" : "regular";
        return (
          (selectedPeriods.size === 0 || selectedPeriods.has(period)) &&
          (selectedAccountIds.size === 0 ||
            selectedAccountIds.has(String(transaction.account_id))) &&
          (selectedCategoryKeys.size === 0 ||
            selectedCategoryKeys.has(categoryKey) ||
            [...selectedCategoryKeys].some(
              (selected) =>
                selected !== UNCATEGORIZED_KEY &&
                categoryMatchesSelection(
                  transaction.category_id,
                  Number(selected),
                  categoryMap,
                ),
            )) &&
          (selectedTypes.size === 0 || selectedTypes.has(transaction.transaction_type)) &&
          (selectedScopes.size === 0 || selectedScopes.has(scope)) &&
          (!chartDrilldown || scope === "regular" && transaction.transaction_type === chartDrilldown.transactionType &&
            (chartDrilldown.categoryKey === undefined || (chartDrilldown.categoryKey === UNCATEGORIZED_KEY
              ? transaction.category_id === null
              : chartDrilldown.includeChildren
                ? categoryMatchesSelection(transaction.category_id, Number(chartDrilldown.categoryKey), categoryMap)
                : String(transaction.category_id) === chartDrilldown.categoryKey)) &&
            (chartDrilldown.periodKey === undefined || (chartDrilldown.weekly ? getWeekStart(transaction.date) : period) === chartDrilldown.periodKey) &&
            (chartDrilldown.accountId === undefined || transaction.account_id === chartDrilldown.accountId) &&
            (chartDrilldown.weekday === undefined || parseLocalDate(transaction.date).getDay() === chartDrilldown.weekday) &&
            (chartDrilldown.description === undefined || (transaction.description.trim() || "Sin descripcion") === chartDrilldown.description))
        );
      }),
    [
      selectedAccountIds,
      categoryMap,
      chartDrilldown,
      selectedCategoryKeys,
      selectedPeriods,
      selectedScopes,
      selectedTypes,
      transactions,
    ],
  );

  const analyzedTransactions = useMemo(
    () =>
      filteredTransactions.filter(
        (transaction) => !excludedTransactionIds.has(transaction.id),
      ),
    [excludedTransactionIds, filteredTransactions],
  );
  const metricTransactions = useMemo(
    () => analyzedTransactions.filter((transaction) => !transaction.is_internal_transfer && transaction.origin !== "cash_transfer"),
    [analyzedTransactions],
  );
  const excludedFilteredTransactions = useMemo(
    () =>
      filteredTransactions.filter((transaction) =>
        excludedTransactionIds.has(transaction.id),
      ),
    [excludedTransactionIds, filteredTransactions],
  );

  const summary = useMemo(() => {
    const income = metricTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.INCOME)
      .reduce((total, transaction) => total + transaction.amount_clp, 0);
    const expenses = metricTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.EXPENSE)
      .reduce((total, transaction) => total + Math.abs(transaction.amount_clp), 0);
    const activeMonths = new Set(
      metricTransactions.map((transaction) => transaction.date.slice(0, 7)),
    ).size;
    return {
      income,
      expenses,
      balance: income - expenses,
      averageExpenses: activeMonths > 0 ? Math.round(expenses / activeMonths) : 0,
    };
  }, [metricTransactions]);

  const weeklyEvolution = selectedPeriods.size === 1;
  const evolutionData = useMemo(() => {
    const totals = new Map<string, { income: number; expenses: number }>();
    [...selectedPeriods].sort().forEach((period) => {
      if (weeklyEvolution) {
        const [year, month] = period.split("-").map(Number);
        const days = new Date(year, month, 0).getDate();
        for (let day = 1; day <= days; day++) {
          totals.set(getWeekStart(`${period}-${String(day).padStart(2, "0")}`), { income: 0, expenses: 0 });
        }
      } else {
        totals.set(period, { income: 0, expenses: 0 });
      }
    });
    metricTransactions.forEach((transaction) => {
      const period = weeklyEvolution ? getWeekStart(transaction.date) : transaction.date.slice(0, 7);
      const current = totals.get(period) ?? { income: 0, expenses: 0 };
      if (transaction.transaction_type === TransactionType.INCOME) {
        current.income += transaction.amount_clp;
      } else {
        current.expenses += Math.abs(transaction.amount_clp);
      }
      totals.set(period, current);
    });
    return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [weeklyEvolution, metricTransactions, selectedPeriods]);

  const evolutionLabels = useMemo(() => evolutionData.map(([period]) => weeklyEvolution
    ? formatWeekRange(period)
    : formatShortPeriod(period)), [evolutionData, weeklyEvolution]);

  const expenseFrequency = useMemo(() => {
    const frequency = new Map<string, CategoryBreakdownItem>();
    metricTransactions.forEach(transaction => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;
      const category = categoryMap.get(transaction.category_id ?? -1);
      const displayedCategory = showFrequencySubcategories ? category : getRootCategory(category, categoryMap);
      const key = String(displayedCategory?.id ?? transaction.category_id ?? UNCATEGORIZED_KEY);
      const label = showFrequencySubcategories
        ? getCategoryPath(transaction.category_id, categoryMap)
        : displayedCategory?.name ?? getCategoryPath(transaction.category_id, categoryMap);
      const item = frequency.get(key) ?? { key, label, total: 0 };
      item.total += 1;
      frequency.set(key, item);
    });
    return withCategoryAxisLabels([...frequency.values()]
      .sort((a, b) => b.total - a.total).slice(0, 10), categoryMap);
  }, [metricTransactions, categoryMap, showFrequencySubcategories]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, CategoryBreakdownItem>();
    metricTransactions.forEach(transaction => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;
      const category = categoryMap.get(transaction.category_id ?? -1);
      const displayedCategory = showSubcategoryDetail ? category : getRootCategory(category, categoryMap);
      const key = String(displayedCategory?.id ?? transaction.category_id ?? UNCATEGORIZED_KEY);
      const label = transaction.category_id === null
        ? "Sin categoría"
        : showSubcategoryDetail ? getCategoryPath(transaction.category_id, categoryMap)
        : displayedCategory?.name ?? getCategoryPath(transaction.category_id, categoryMap);
      const entry = totals.get(key) ?? { key, label, total: 0 };
      entry.total += Math.abs(transaction.amount_clp);
      totals.set(key, entry);
    });
    return withCategoryAxisLabels([...totals.values()].sort((left, right) => right.total - left.total).slice(0, 10), categoryMap);
  }, [metricTransactions, categoryMap, showSubcategoryDetail]);

  const accountBreakdown = useMemo(() => {
    const totals = new Map<number, { income: number; expenses: number }>();
    metricTransactions.forEach((transaction) => {
      const current = totals.get(transaction.account_id) ?? { income: 0, expenses: 0 };
      if (transaction.transaction_type === TransactionType.INCOME) {
        current.income += transaction.amount_clp;
      } else {
        current.expenses += Math.abs(transaction.amount_clp);
      }
      totals.set(transaction.account_id, current);
    });
    return [...totals.entries()]
      .map(([accountId, totalsByAccount]) => ({
        accountId,
        name: accountMap.get(accountId)?.name ?? `Cuenta #${accountId}`,
        ...totalsByAccount,
      }))
      .sort((left, right) => right.income + right.expenses - left.income - left.expenses);
  }, [accountMap, metricTransactions]);

  const descriptionBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    metricTransactions.forEach((transaction) => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;
      const label = transaction.description.trim() || "Sin descripcion";
      totals.set(label, (totals.get(label) ?? 0) + Math.abs(transaction.amount_clp));
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [metricTransactions]);

  const weekdayBreakdown = useMemo(() => {
    const weekdays = [
      { day: 1, label: "Lun" },
      { day: 2, label: "Mar" },
      { day: 3, label: "Mi\u00e9" },
      { day: 4, label: "Jue" },
      { day: 5, label: "Vie" },
      { day: 6, label: "S\u00e1b" },
      { day: 0, label: "Dom" },
    ];
    const totals = new Map(weekdays.map(({ day }) => [day, 0]));

    metricTransactions.forEach((transaction) => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;

      const weekday = parseLocalDate(transaction.date).getDay();
      totals.set(weekday, (totals.get(weekday) ?? 0) + Math.abs(transaction.amount_clp));
    });

    return weekdays.map(({ day, label }) => ({ day, label, total: totals.get(day) ?? 0 }));
  }, [metricTransactions]);

  const evolutionOption = useMemo<AppChartOption>(() => {
    const labels = evolutionLabels;
    const income = evolutionData.map(([, values]) => values.income);
    const expenses = evolutionData.map(([, values]) => values.expenses);
    const series =
      chartStyle === "line"
        ? [
            {
              name: "Ingresos",
              type: "line" as const,
              smooth: false,
              symbolSize: 8,
              data: income,
              lineStyle: { color: "#344b2e", width: 3 },
              itemStyle: { color: "#344b2e" },
            },
            {
              name: "Gastos",
              type: "line" as const,
              smooth: false,
              symbolSize: 8,
              data: expenses,
              lineStyle: { color: "#d77b68", width: 3 },
              itemStyle: { color: "#d77b68" },
            },
          ]
        : [
            {
              name: "Ingresos",
              type: "bar" as const,
              data: income,
              itemStyle: { color: "#344b2e", borderRadius: [8, 8, 0, 0] },
            },
            {
              name: "Gastos",
              type: "bar" as const,
              data: expenses,
              itemStyle: { color: "#d77b68", borderRadius: [8, 8, 0, 0] },
            },
          ];
    return {
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => formatCurrency(Number(value)) },
      legend: { bottom: 0, textStyle: { color: "#65705f" } },
      grid: { left: 20, right: 20, top: 20, bottom: 55, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { color: "#65705f" } },
      yAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      series,
    };
  }, [chartStyle, evolutionLabels, evolutionData, formatCurrency]);

  const expenseFrequencyOption = useMemo<AppChartOption>(() => ({
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => `${Number(value)} ${Number(value) === 1 ? "gasto" : "gastos"}` },
      grid: { left: 10, right: 30, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: "value", minInterval: 1,
        axisLabel: { color: "#65705f" },
        splitLine: { lineStyle: { color: "#e8e3da" } } },
      yAxis: { type: "category", data: [...expenseFrequency].reverse().map(item => item.label),
        axisLabel: { color: "#65705f", width: 110, overflow: "truncate", lineHeight: 16,
          formatter: (_value, index) => expenseFrequency[expenseFrequency.length - 1 - index]?.axisLabel ?? "" } },
      series: [{ name: "Cantidad de gastos", type: "bar",
        data: [...expenseFrequency].reverse().map(item => item.total),
        label: { show: true, position: "right", color: "#65705f" },
        itemStyle: { color: "#d77b68", borderRadius: [0, 8, 8, 0] } }],
    }), [expenseFrequency]);

  const categoryOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => `${formatCurrency(Number(value))} · ${summary.expenses > 0 ? (Number(value) / summary.expenses * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 }) : 0}% del gasto` },
      grid: { left: 10, right: 55, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      yAxis: {
        type: "category",
        data: [...categoryBreakdown].reverse().map(item => item.label),
        axisLabel: {
          color: "#65705f",
          width: 110,
          overflow: "truncate",
          lineHeight: 16,
          formatter: (_value, index) => categoryBreakdown[categoryBreakdown.length - 1 - index]?.axisLabel ?? "",
        },
      },
      series: [
        {
          type: "bar",
          name: "Gastos",
          cursor: "pointer",
          data: [...categoryBreakdown].reverse().map(item => item.total),
          label: { show: true, position: "right", color: "#65705f", formatter: params => `${summary.expenses > 0 ? (Number(params.value) / summary.expenses * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 }) : 0}%` },
          itemStyle: { color: "#d77b68", borderRadius: [0, 8, 8, 0] },
        },
      ],
    }),
    [categoryBreakdown, summary.expenses, formatCurrency],
  );

  const accountOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => formatCurrency(Number(value)) },
      legend: { bottom: 0, textStyle: { color: "#65705f" } },
      grid: { left: 20, right: 20, top: 15, bottom: 60, containLabel: true },
      yAxis: {
        type: "category",
        data: accountBreakdown.map((item) => item.name),
        inverse: true,
        axisLabel: { color: "#65705f", width: 110, overflow: "truncate" },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      series: [
        {
          name: "Ingresos",
          type: "bar",
          data: accountBreakdown.map((item) => item.income),
          barMaxWidth: 24,
          itemStyle: { color: "#344b2e", borderRadius: [0, 7, 7, 0] },
        },
        {
          name: "Gastos",
          type: "bar",
          data: accountBreakdown.map((item) => item.expenses),
          barMaxWidth: 24,
          itemStyle: { color: "#d77b68", borderRadius: [0, 7, 7, 0] },
        },
      ],
    }),
    [accountBreakdown, formatCurrency],
  );

  const weekdayOption = useMemo<AppChartOption>(() => {
    const series = {
      name: "Gasto acumulado",
      type: "bar" as const,
      data: weekdayBreakdown.map((item) => item.total),
      itemStyle: { color: "#d77b68", borderRadius: [8, 8, 0, 0] },
    };

    return {
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => formatCurrency(Number(value)) },
      grid: { left: 20, right: 20, top: 20, bottom: 25, containLabel: true },
      xAxis: {
        type: "category",
        data: weekdayBreakdown.map((item) => item.label),
        axisLabel: { color: "#65705f", interval: 0 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      series: [series],
    };
  }, [weekdayBreakdown, formatCurrency]);

  const descriptionOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis", confine: true, valueFormatter: value => formatCurrency(Number(value)) },
      grid: { left: 10, right: 25, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      yAxis: {
        type: "category",
        data: [...descriptionBreakdown].reverse().map(([name]) => name),
        axisLabel: { color: "#65705f", width: 110, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          name: "Gastos",
          data: [...descriptionBreakdown].reverse().map(([, value]) => value),
          itemStyle: { color: "#d77b68", borderRadius: [0, 8, 8, 0] },
        },
      ],
    }),
    [descriptionBreakdown, formatCurrency],
  );

  const tableTransactions = useMemo(() => {
    if (transactionAnalysisView === "included") return analyzedTransactions;
    if (transactionAnalysisView === "excluded") return excludedFilteredTransactions;
    return filteredTransactions;
  }, [
    analyzedTransactions,
    excludedFilteredTransactions,
    filteredTransactions,
    transactionAnalysisView,
  ]);

  const sortedTransactions = useMemo(() => {
    const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
    const sortValue = (transaction: Transaction): string | number => {
      switch (transactionSort.key) {
        case "date":
          return transaction.date;
        case "description":
          return transaction.description;
        case "account":
          return accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`;
        case "category":
          return getCategoryPath(transaction.category_id, categoryMap);
        case "type":
          return transaction.is_internal_transfer || transaction.origin === "cash_transfer"
            ? "Transferencia interna"
            : transaction.transaction_type === TransactionType.INCOME
              ? "Ingreso"
              : "Gasto";
        case "amount":
          return transaction.amount_clp;
      }
    };

    const query = transactionSearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    return tableTransactions.filter(transaction => transaction.description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").includes(query))
      .sort((left, right) => {
        const leftValue = sortValue(left);
        const rightValue = sortValue(right);
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : collator.compare(String(leftValue), String(rightValue));
        const resolvedComparison = comparison === 0 ? left.id - right.id : comparison;
        return transactionSort.direction === "asc" ? resolvedComparison : -resolvedComparison;
      });
  }, [accountMap, categoryMap, tableTransactions, transactionSort, transactionSearch]);


  const transactionTotalPages = Math.max(
    1,
    Math.ceil(sortedTransactions.length / transactionPageSize),
  );
  const safeTransactionPage = Math.min(transactionPage, transactionTotalPages);
  const transactionPageStart = (safeTransactionPage - 1) * transactionPageSize;
  const visibleTransactions = useMemo(
    () =>
      sortedTransactions.slice(
        transactionPageStart,
        transactionPageStart + transactionPageSize,
      ),
    [sortedTransactions, transactionPageSize, transactionPageStart],
  );
  const transactionRangeStart =
    sortedTransactions.length === 0 ? 0 : transactionPageStart + 1;
  const transactionRangeEnd = transactionPageStart + visibleTransactions.length;
  const transactionPaginationItems = useMemo(
    () => createPaginationItems(safeTransactionPage, transactionTotalPages),
    [safeTransactionPage, transactionTotalPages],
  );

  useEffect(() => {
    setTransactionPage(1);
  }, [
    selectedAccountIds,
    selectedCategoryKeys,
    selectedPeriods,
    selectedScopes,
    selectedTypes,
    transactionAnalysisView,
    transactionSearch,
    chartDrilldown,
    transactionPageSize,
    transactionSort,
  ]);

  useEffect(() => {
    setSelectedTransactionIds(new Set());
  }, [
    selectedAccountIds,
    selectedCategoryKeys,
    selectedPeriods,
    selectedScopes,
    selectedTypes,
    transactionAnalysisView,
    transactionSearch,
    chartDrilldown,
  ]);

  useEffect(() => {
    setTransactionPage((current) => Math.min(current, transactionTotalPages));
  }, [transactionTotalPages]);
  const handleTransactionSort = (key: TransactionSortKey) => {
    setTransactionSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const scrollToTransactionTable = () => {
    window.requestAnimationFrame(() => {
      transactionTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToTransactionPage = (page: number) => {
    setTransactionPage(page);
    scrollToTransactionTable();
  };

  const handleTransactionPageSizeChange = (pageSize: number) => {
    setTransactionPageSize(pageSize);
    setTransactionPage(1);
    scrollToTransactionTable();
  };

  const toggleTransactionSelection = (transactionId: number) => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  };

  const setTransactionsExcluded = (transactionIds: Iterable<number>, excluded: boolean) => {
    setExcludedTransactionIds((current) => {
      const next = new Set(current);
      for (const transactionId of transactionIds) {
        if (excluded) next.add(transactionId);
        else next.delete(transactionId);
      }
      return next;
    });
    setSelectedTransactionIds(new Set());
  };

  const selectVisibleTransactions = () => {
    setSelectedTransactionIds((current) => {
      const visibleIds = visibleTransactions.map((transaction) => transaction.id);
      const allVisibleSelected = visibleIds.every((transactionId) => current.has(transactionId));
      const next = new Set(current);
      visibleIds.forEach((transactionId) => {
        if (allVisibleSelected) next.delete(transactionId);
        else next.add(transactionId);
      });
      return next;
    });
  };

  const removeActiveFilter = (group: FilterGroup, value: string) => {
    const removeValue = (current: Set<string>) => {
      const next = new Set(current);
      next.delete(value);
      return next;
    };

    switch (group) {
      case "periods":
        setSelectedPeriods(removeValue);
        break;
      case "accounts":
        setSelectedAccountIds(removeValue);
        break;
      case "categories":
        if (value === CATEGORY_SELECTION_SUMMARY) setSelectedCategoryKeys(new Set());
        else setSelectedCategoryKeys(removeValue);
        break;
      case "types":
        setSelectedTypes(removeValue);
        break;
      case "scopes":
        setSelectedScopes(removeValue);
        break;
    }
  };

  const clearFilters = () => {
    clearChartDrilldown();
    setSelectedPeriods(new Set(availablePeriods.slice(0, 1)));
    setSelectedAccountIds(new Set());
    setSelectedCategoryKeys(new Set());
    setSelectedTypes(new Set());
    setSelectedScopes(new Set(["regular"]));
  };

  const toggleWidget = (widget: WidgetId) => {
    setVisibleWidgets((current) => {
      const next = new Set(current);
      if (next.has(widget)) next.delete(widget);
      else next.add(widget);
      return next;
    });
  };

  const showChart = (chart: ChartWidgetId) => analysisView === "summary" && visibleWidgets.has(chart);
  const clearChartDrilldown = () => {
    if (!chartDrilldown) return;
    setTransactionSearch(chartDrilldown.previousSearch);
    setTransactionAnalysisView(chartDrilldown.previousTableView);
    setChartDrilldown(null);
  };
  const changeView = (view: AnalysisView) => {
    if (view !== "movements") clearChartDrilldown();
    setAnalysisView(view);
    window.requestAnimationFrame(() => {
      const navigation = navigationRef.current;
      if (!navigation) return;
      const top = parseFloat(getComputedStyle(navigation).top) || 0;
      const panel = document.getElementById("analysis-view-panel");
      if (panel && panel.getBoundingClientRect().top < top + navigation.offsetHeight) window.scrollTo({ top: Math.max(0, window.scrollY + panel.getBoundingClientRect().top - top - navigation.offsetHeight - 20), behavior: "instant" });
      document.getElementById(`analysis-tab-${view}`)?.focus({ preventScroll: true });
    });
  };
  const openChartMovements = (selection: ChartSelection) => {
    setChartDrilldown({ ...selection, previousSearch: transactionSearch, previousTableView: transactionAnalysisView });
    setTransactionSearch("");
    setTransactionAnalysisView("included");
    setSelectedTransactionIds(new Set());
    changeView("movements");
  };
  const returnToChart = () => {
    if (!chartDrilldown) return;
    const sourceChart = chartDrilldown.sourceChart;
    clearChartDrilldown();
    setAnalysisView("summary");
    window.requestAnimationFrame(() => {
      const chart = document.getElementById(`analysis-chart-${sourceChart}`);
      chart?.scrollIntoView({ block: "start", behavior: "instant" });
      chart?.focus({ preventScroll: true });
    });
  };

  if (loading) return <LoadingState message={"Preparando tu espacio de an\u00e1lisis..."} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="analytics-view space-y-6 sm:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Análisis</h1>
          <p className="mt-1 text-sm text-muted">Explora tus ingresos, gastos y movimientos.</p>
        </div>
      </header>

      <div className="space-y-5">
        <div ref={navigationRef} aria-label="Navegación del análisis" className="sticky top-[var(--app-header-height,105px)] z-10 rounded-2xl border border-outline/80 bg-paper/95 p-2 shadow-sm backdrop-blur-md" data-testid="analysis-navigation">
          <div className="flex items-center gap-1 sm:gap-4">
        <div role="tablist" aria-label="Vistas de análisis" className="grid min-w-0 flex-1 grid-cols-[0.85fr_1.15fr] gap-0.5 rounded-xl bg-paper-soft p-1 sm:max-w-lg sm:grid-cols-2 sm:gap-1">
          {ANALYSIS_VIEWS.map((view, index) => (
            <button key={view.value} type="button" role="tab" id={`analysis-tab-${view.value}`} aria-controls="analysis-view-panel" aria-selected={analysisView === view.value} tabIndex={analysisView === view.value ? 0 : -1}
              onClick={() => changeView(view.value)}
              onKeyDown={event => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % ANALYSIS_VIEWS.length;
                else if (event.key === "ArrowLeft") next = (index + ANALYSIS_VIEWS.length - 1) % ANALYSIS_VIEWS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = ANALYSIS_VIEWS.length - 1;
                else return;
                event.preventDefault();
                changeView(ANALYSIS_VIEWS[next].value);
                document.getElementById(`analysis-tab-${ANALYSIS_VIEWS[next].value}`)?.focus();
              }}
              className={cn("min-h-11 rounded-xl px-1 py-2 text-xs font-semibold transition sm:px-5 sm:text-sm", analysisView === view.value ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink")}
            >{view.label}</button>
          ))}
        </div>

            <div className="flex shrink-0 items-center justify-end gap-1 sm:ml-auto sm:gap-2">
            <button type="button" aria-label="Personalizar" title="Personalizar gráficos" aria-haspopup="dialog" aria-expanded={customizeOpen} onClick={() => setCustomizeOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline bg-white text-sm font-medium text-ink transition hover:border-primary/30 hover:bg-paper-soft sm:w-auto sm:px-4">
              <SettingsIcon aria-hidden="true" className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Personalizar</span>
            </button>
            <button ref={filterButtonRef} type="button" aria-haspopup="dialog" aria-expanded={filtersOpen} aria-label="Filtros" title={`Filtros · ${activeFilterCount} activos`} onClick={() => setFiltersOpen(true)} className="relative flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 sm:w-auto sm:px-4">
              <FilterIcon aria-hidden="true" className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Filtros</span>
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 ring-2 ring-paper sm:static sm:bg-white/20 sm:px-1.5 sm:py-0.5 sm:text-xs sm:leading-normal sm:ring-0">{activeFilterCount}</span>
            </button>
            </div>
          </div>
        </div>
          {(activeFilters.length > 0 || chartDrilldown) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline/70 pt-4" aria-label="Filtros activos">
              <span className="mr-1 text-xs font-medium text-muted">Aplicados</span>
              {chartDrilldown && <button type="button" aria-label={`Quitar selección del gráfico: ${chartDrilldown.label}`} onClick={clearChartDrilldown} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-mist px-3 py-1.5 text-sm font-medium text-primary">
                Gráfico: {chartDrilldown.label}<span aria-hidden="true">×</span>
              </button>}
              {activeFilters.map(filter => <button key={filter.key} type="button" className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-mist/50 px-3 py-1.5 text-sm text-primary hover:bg-primary-mist" aria-label={`Quitar filtro ${filter.groupLabel}: ${filter.label}`} onClick={() => removeActiveFilter(filter.group, filter.value)}>
                <span>{filter.groupLabel}: {filter.label}</span><span aria-hidden="true">×</span>
              </button>)}
            </div>
          )}

        {loadingPeriods && <LoadingState message="Cargando los meses seleccionados…" />}
        {customizeOpen && <AnalysisCustomizeDialog visibleWidgets={visibleWidgets} onToggle={toggleWidget} onClose={() => setCustomizeOpen(false)} />}
        {filtersOpen && <AnalysisFiltersDialog
          initial={{ periods: selectedPeriods, accounts: selectedAccountIds, categories: selectedCategoryKeys, types: selectedTypes, scopes: selectedScopes }}
          periods={periodOptions} accounts={accountOptions} types={typeOptions} scopes={scopeOptions} categoryGroups={categoryGroups}
          onClose={() => { setFiltersOpen(false); filterButtonRef.current?.focus({ preventScroll: true }); }}
          onApply={filters => {
            setSelectedPeriods(filters.periods);
            setSelectedAccountIds(filters.accounts);
            setSelectedCategoryKeys(filters.categories);
            setSelectedTypes(filters.types);
            setSelectedScopes(filters.scopes);
            setFiltersOpen(false);
            filterButtonRef.current?.focus({ preventScroll: true });
          }}
        />}

        <div id="analysis-view-panel" role="tabpanel" aria-labelledby={`analysis-tab-${analysisView}`} tabIndex={0} className="min-w-0 space-y-6">
          <p className="text-sm text-muted">
            {analyzedTransactions.length} {analyzedTransactions.length === 1 ? "movimiento" : "movimientos"}
          </p>

                  {analysisView === "movements" && chartDrilldown && <div className="flex flex-col gap-3 rounded-2xl border border-outline bg-primary-mist/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
                    <div><p className="font-semibold text-primary">Movimientos de {chartDrilldown.label}</p><p className="mt-1 text-sm text-muted">{chartDrilldown.includeChildren ? "Incluye sus subcategorías. " : ""}Se conservan los demás filtros del gráfico.</p></div>
                    <Button tone="secondary" compactOnMobile onClick={returnToChart}>Volver al gráfico</Button>
                  </div>}
          {analysisView === "summary" && <>
            <section className="grid grid-cols-2 gap-2 xl:grid-cols-4 sm:gap-4" aria-label="Indicadores del análisis">
              <CompactMetric prominent label="Ingresos" value={formatCurrency(summary.income)} icon={<MoneyIcon className="h-5 w-5" />} tone="income" />
              <CompactMetric prominent label="Gastos" value={formatCurrency(summary.expenses)} icon={<ReceiptIcon className="h-5 w-5" />} tone="expense" />
              <CompactMetric prominent label="Balance" value={formatCurrency(summary.balance)} icon={<BalanceIcon className="h-5 w-5" />} tone={summary.balance >= 0 ? "income" : "expense"} />
              <CompactMetric prominent label="Gasto mensual promedio" value={formatCurrency(summary.averageExpenses)} icon={<CalendarIcon className="h-5 w-5" />} />
            </section>
          </>}

          {filteredTransactions.length === 0 ? (
            <EmptyState
              title={activeFilterCount > 0 ? "No hay resultados para esta combinaci\u00f3n" : "Todav\u00eda no hay movimientos"}
              description={
                activeFilterCount > 0
                  ? "Quita uno o varios filtros para ampliar los resultados."
                  : "Importa movimientos para comenzar a analizarlos."
              }
              action={activeFilterCount > 0 ? <Button onClick={clearFilters}>Limpiar filtros</Button> : undefined}
            />
          ) : (
            <>
              {analysisView === "summary" && !CHART_WIDGETS.some(widget => visibleWidgets.has(widget.value)) && <EmptyState title="Aún no hay gráficos seleccionados" description="Elige los gráficos que quieres ver en Personalizar." action={<Button tone="secondary" onClick={() => setCustomizeOpen(true)}>Personalizar gráficos</Button>} />}
              {analysisView === "summary" && CHART_WIDGETS.some(widget => visibleWidgets.has(widget.value)) && <p className="text-sm text-muted">Selecciona una barra o un punto para ver sus movimientos.</p>}
              {showChart("evolution") ? (
                <AnalysisChartPanel chart="evolution" label="Gráfico de evolución">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <ChartHeading
                    title={"Evoluci\u00f3n temporal"}
                    description={weeklyEvolution
                      ? "Ingresos y gastos por semana."
                      : "Ingresos y gastos por mes."}
                  />
                    <ChartStyleToggle label="Estilo de evolución temporal" value={chartStyle} onChange={setChartStyle} />
                  </div>
                  <AnalysisChart className="mt-5 h-[260px] w-full sm:h-[360px]" option={evolutionOption} onItemClick={(index, seriesIndex) => {
                    const period = evolutionData[index];
                    if (period) openChartMovements({ sourceChart: "evolution", label: `${seriesIndex === 0 ? "Ingresos" : "Gastos"} · ${evolutionLabels[index]}`, transactionType: seriesIndex === 0 ? TransactionType.INCOME : TransactionType.EXPENSE, periodKey: period[0], weekly: weeklyEvolution });
                  }} />
                </AnalysisChartPanel>
              ) : null}

              <div className="space-y-6">
                {showChart("categories") ? (
                  <AnalysisChartPanel chart="categories" label="Gráfico de categorías">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <ChartHeading
                        title={"Distribuci\u00f3n por categor\u00eda"}
                        description={
                          showSubcategoryDetail
                            ? "Las 10 categorías y subcategorías con más gasto."
                            : "Las 10 categorías con más gasto."
                        }
                      />
                      <SubcategoryToggle checked={showSubcategoryDetail} onChange={() => setShowSubcategoryDetail(current => !current)} />
                    </div>
                    {categoryBreakdown.length > 0 ? <>
                    <div style={{ height: Math.max(300, categoryBreakdown.length * 42) }} className="mt-5">
                    <AnalysisChart className="h-full w-full" horizontal option={categoryOption} onItemClick={index => {
                      const item = categoryBreakdown[categoryBreakdown.length - 1 - index];
                      if (item) openChartMovements({ sourceChart: "categories", label: item.label, transactionType: TransactionType.EXPENSE, categoryKey: item.key, includeChildren: !showSubcategoryDetail });
                    }} />
                    </div>
                    </> : <p className="py-12 text-center text-sm text-muted">No hay gastos por categoría con los filtros actuales.</p>}
                  </AnalysisChartPanel>
                ) : null}

                {showChart("accounts") ? (
                  <AnalysisChartPanel chart="accounts" label="Gráfico de cuentas">
                    <ChartHeading
                      title={"Comparaci\u00f3n por cuenta"}
                      description="Ingresos y gastos de cada cuenta."
                    />
                    <div style={{ height: Math.max(300, accountBreakdown.length * 72 + 70) }} className="mt-5">
                      <AnalysisChart className="h-full w-full" horizontal option={accountOption} onItemClick={(index, seriesIndex) => {
                        const account = accountBreakdown[index];
                        if (account) openChartMovements({ sourceChart: "accounts", label: `${account.name} · ${seriesIndex === 0 ? "Ingresos" : "Gastos"}`, transactionType: seriesIndex === 0 ? TransactionType.INCOME : TransactionType.EXPENSE, accountId: account.accountId });
                      }} />
                    </div>
                  </AnalysisChartPanel>
                ) : null}

                {showChart("weekdays") ? (
                  <AnalysisChartPanel chart="weekdays" label="Gráfico de días de la semana">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <ChartHeading
                      title={"Gastos por d\u00eda de la semana"}
                      description="Gasto total por día de la semana."
                    />
                    </div>
                    {summary.expenses > 0
                      ? <AnalysisChart className="mt-5 h-[260px] w-full sm:h-[360px]" option={weekdayOption} onItemClick={index => {
                        const weekday = weekdayBreakdown[index];
                        if (weekday) openChartMovements({ sourceChart: "weekdays", label: `Gastos · ${weekday.label}`, transactionType: TransactionType.EXPENSE, weekday: weekday.day });
                      }} />
                      : <p className="py-12 text-center text-sm text-muted">No hay gastos por día de la semana con los filtros actuales.</p>}
                  </AnalysisChartPanel>
                ) : null}

                {showChart("descriptions") ? (
                  <AnalysisChartPanel chart="descriptions" label="Gráfico de descripciones">
                    <ChartHeading
                      title="Principales descripciones"
                      description="Los 8 conceptos con mayor gasto."
                    />
                    {descriptionBreakdown.length > 0
                      ? <div style={{ height: Math.max(300, descriptionBreakdown.length * 42) }} className="mt-5"><AnalysisChart className="h-full w-full" horizontal option={descriptionOption} onItemClick={index => {
                        const description = descriptionBreakdown[descriptionBreakdown.length - 1 - index];
                        if (description) openChartMovements({ sourceChart: "descriptions", label: description[0], transactionType: TransactionType.EXPENSE, description: description[0] });
                      }} /></div>
                      : <p className="py-12 text-center text-sm text-muted">No hay gastos por descripción con los filtros actuales.</p>}
                  </AnalysisChartPanel>
                ) : null}

                {showChart("expenseFrequency") && <AnalysisChartPanel chart="expenseFrequency" label="Gráfico de frecuencia de gastos">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <ChartHeading title="Frecuencia de gastos por categoría" description={showFrequencySubcategories
                      ? "Las 10 categorías y subcategorías con más movimientos de gasto."
                      : "Las 10 categorías con más movimientos de gasto."} />
                    <SubcategoryToggle checked={showFrequencySubcategories} onChange={() => setShowFrequencySubcategories(current => !current)} />
                  </div>
                  {expenseFrequency.length > 0
                    ? <div className="mt-5" style={{ height: Math.max(300, expenseFrequency.length * 42) }}><AnalysisChart className="h-full w-full" horizontal option={expenseFrequencyOption} onItemClick={index => {
                      const item = expenseFrequency[expenseFrequency.length - 1 - index];
                      if (item) openChartMovements({ sourceChart: "expenseFrequency", label: item.label, transactionType: TransactionType.EXPENSE, categoryKey: item.key, includeChildren: !showFrequencySubcategories });
                    }} /></div>
                    : <p className="py-12 text-center text-sm text-muted">No hay gastos para comparar su frecuencia con los filtros actuales.</p>}
                </AnalysisChartPanel>}
              </div>

              {analysisView === "movements" ? (
                <Panel className="analysis-movements-panel p-0 md:p-0">
                  <div ref={transactionTableRef} className="scroll-mt-[calc(var(--app-header-height,105px)+var(--analysis-navigation-height,76px)+8px)] flex flex-col gap-2 border-b border-outline px-5 py-5 md:px-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">Movimientos asociados</h2>
                        <p className="mt-1 text-sm text-muted">
                          Mostrando {transactionRangeStart}-{transactionRangeEnd} de {sortedTransactions.length} movimientos.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <EyeOffIcon className="h-4 w-4" />
                          <span>
                            {excludedFilteredTransactions.length === 0
                              ? "No hay movimientos omitidos del an\u00e1lisis."
                              : `${excludedFilteredTransactions.length} ${excludedFilteredTransactions.length === 1 ? "movimiento omitido" : "movimientos omitidos"} del an\u00e1lisis.`}
                          </span>
                          {excludedFilteredTransactions.length > 0 && transactionAnalysisView !== "excluded" ? (
                            <button
                              type="button"
                              className="font-semibold text-primary underline-offset-4 hover:underline"
                              onClick={() => setTransactionAnalysisView("excluded")}
                            >
                              Ver omitidos
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap rounded-2xl border border-outline bg-paper-soft p-1" aria-label="Vista de movimientos">
                        {([
                          ["all", "Todos"],
                          ["included", `Incluidos (${analyzedTransactions.length})`],
                          ["excluded", `Omitidos (${excludedFilteredTransactions.length})`],
                        ] as const).map(([view, label]) => (
                          <button
                            key={view}
                            type="button"
                            className={cn(
                              "rounded-xl px-3 py-2 text-sm font-medium transition",
                              transactionAnalysisView === view
                                ? "bg-white text-primary shadow-sm"
                                : "text-muted hover:text-ink",
                            )}
                            aria-pressed={transactionAnalysisView === view}
                            onClick={() => setTransactionAnalysisView(view)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="mt-3 block max-w-lg space-y-2">
                      <span className="text-sm font-medium">Buscar en los movimientos</span>
                      <input type="search" value={transactionSearch} onChange={event => setTransactionSearch(event.target.value)} placeholder="Buscar por descripción…" className="min-h-11 w-full rounded-xl border border-outline bg-white px-3 py-2 text-sm" />
                      <span className="block text-xs text-muted">La búsqueda filtra esta lista; los indicadores mantienen los filtros generales.</span>
                    </label>
                    {selectedTransactionIds.size > 0 ? (
                      <div ref={bulkActionsRef}>
                        <BulkAnalysisActions
                          selectedCount={selectedTransactionIds.size}
                          onExclude={() => setTransactionsExcluded(selectedTransactionIds, true)}
                          onInclude={() => setTransactionsExcluded(selectedTransactionIds, false)}
                          onClear={() => setSelectedTransactionIds(new Set())}
                        />
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        {activeFilterCount === 0 ? "Resumen del hist\u00f3rico completo" : "Resumen de los filtros activos"}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <CompactMetric
                          label="Ingresos"
                          value={formatCurrency(summary.income)}
                          tone="income"
                        />
                        <CompactMetric
                          label="Gastos"
                          value={formatCurrency(summary.expenses)}
                          tone="expense"
                        />
                        <CompactMetric
                          label="Balance"
                          value={formatCurrency(summary.balance)}
                          tone={summary.balance >= 0 ? "income" : "expense"}
                        />
                        <CompactMetric
                          label="Promedio mensual"
                          value={formatCurrency(summary.averageExpenses)}
                        />
                      </div>
                    </div>
                  </div>
                  {selectedTransactionIds.size > 0 && showStickyBulkActions ? (
                    <div className="sticky top-[calc(var(--app-header-height,105px)+var(--analysis-navigation-height,76px))] z-[5] px-5 py-3 md:px-8">
                      <BulkAnalysisActions
                        floating
                        selectedCount={selectedTransactionIds.size}
                        onExclude={() => setTransactionsExcluded(selectedTransactionIds, true)}
                        onInclude={() => setTransactionsExcluded(selectedTransactionIds, false)}
                        onClear={() => setSelectedTransactionIds(new Set())}
                      />
                    </div>
                  ) : null}
                  <p className="border-b border-outline px-3 py-2 text-xs text-muted sm:hidden">
                    Desliza para ver fecha, cuenta y más detalles.
                  </p>
                  <div className="analysis-movements-container overflow-x-auto" role="region" aria-label="Tabla de movimientos" tabIndex={0}>
                    <table className="analysis-movements-table w-full min-w-[800px] table-fixed border-collapse text-sm">
                      <thead className="text-left text-sm text-muted">
                        <tr className="border-b border-outline">
                          <th className="w-10 px-2 py-3 text-center md:pl-4">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-outline accent-primary"
                              checked={
                                visibleTransactions.length > 0 &&
                                visibleTransactions.every((transaction) =>
                                  selectedTransactionIds.has(transaction.id),
                                )
                              }
                              aria-label="Seleccionar movimientos visibles"
                              onChange={selectVisibleTransactions}
                            />
                          </th>
                          <SortableTableHeader
                            label={"Descripci\u00f3n"}
                            sortKey="description"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-40 px-2"
                          />
                          <SortableTableHeader
                            label="Monto"
                            sortKey="amount"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            align="right"
                            className="w-24 px-2"
                          />
                          <SortableTableHeader
                            label="Fecha"
                            sortKey="date"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-24 px-2"
                          />
                          <SortableTableHeader
                            label="Cuenta"
                            sortKey="account"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-28 px-2"
                          />
                          <SortableTableHeader
                            label={"Categor\u00eda"}
                            sortKey="category"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-28 px-2"
                          />
                          <SortableTableHeader
                            label="Tipo"
                            sortKey="type"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-28 px-2"
                          />
                          <th className="w-14 px-2 py-3 text-center md:pr-4">
                            {"An\u00e1lisis"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-6 py-10 text-center text-sm text-muted">
                              {transactionSearch.trim() ? "No hay movimientos que coincidan con la búsqueda." : transactionAnalysisView === "excluded"
                                ? "No hay movimientos omitidos dentro de los filtros actuales."
                                : transactionAnalysisView === "included"
                                  ? "No hay movimientos incluidos dentro de los filtros actuales."
                                  : "No hay movimientos para mostrar."}
                            </td>
                          </tr>
                        ) : null}
                        {visibleTransactions.map((transaction) => {
                          const isExcluded = excludedTransactionIds.has(transaction.id);
                          return (
                          <tr
                            key={transaction.id}
                            className={cn(
                              "border-b border-outline/60 align-top transition last:border-0",
                              isExcluded && "bg-paper-soft/70 text-muted",
                            )}
                          >
                            <td className="w-10 px-2 py-4 text-center md:pl-4">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-outline accent-primary"
                                checked={selectedTransactionIds.has(transaction.id)}
                                aria-label={`Seleccionar movimiento ${transaction.description}`}
                                onChange={() => toggleTransactionSelection(transaction.id)}
                              />
                            </td>
                            <td className="break-words px-2 py-4 font-medium" title={transaction.description}>
                              {transaction.description}
                            </td>
                            <td className={cn(
                              "whitespace-nowrap px-2 py-4 text-right font-semibold",
                              transaction.amount_clp >= 0 ? "text-primary" : "text-danger",
                              isExcluded && "opacity-60",
                            )}>
                              {formatCurrency(transaction.amount_clp)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-4 text-muted">
                              {parseLocalDate(transaction.date).toLocaleDateString("es-CL")}
                            </td>
                            <td
                              className="break-words px-2 py-4 text-muted"
                              title={accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`}
                            >
                              {accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`}
                            </td>
                            <td
                              className="break-words px-2 py-4 text-muted"
                              title={getCategoryPath(transaction.category_id, categoryMap)}
                            >
                              {getCategoryPath(transaction.category_id, categoryMap)}
                            </td>
                            <td className="break-words px-2 py-4">
                              <span className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                transaction.is_internal_transfer || transaction.origin === "cash_transfer"
                                  ? "bg-paper-soft text-muted"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "bg-primary-mist text-primary"
                                    : "bg-danger-soft text-danger",
                              )}>
                                {transaction.is_internal_transfer || transaction.origin === "cash_transfer"
                                  ? "Transf interna"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "Ingreso"
                                    : "Gasto"}
                              </span>
                              <span className="ml-2 text-xs text-muted">
                                {transaction.origin === "pdf" ? "PDF" : transaction.origin === "cash_transfer" ? "Traslado" : "Manual"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-4 text-center md:pr-4">
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-xl border p-2 text-xs font-semibold transition 2xl:px-3",
                                  isExcluded
                                    ? "border-outline bg-white text-muted hover:border-primary/35 hover:text-primary"
                                    : "border-primary/15 bg-primary-mist/60 text-primary hover:border-primary/35",
                                )}
                                aria-label={
                                  isExcluded
                                    ? `Incluir ${transaction.description} en el an\u00e1lisis`
                                    : `Omitir ${transaction.description} del an\u00e1lisis`
                                }
                                title={isExcluded ? "Omitido del an\u00e1lisis" : "Incluido en el an\u00e1lisis"}
                                onClick={() =>
                                  setTransactionsExcluded([transaction.id], !isExcluded)
                                }
                              >
                                {isExcluded ? (
                                  <EyeOffIcon className="h-4 w-4" />
                                ) : (
                                  <EyeIcon className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-outline px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-8">
                    <label className="flex items-center gap-3 text-sm text-muted">
                      <span className="font-medium"><span className="sm:hidden">Por página</span><span className="hidden sm:inline">{"Movimientos por p\u00e1gina"}</span></span>
                      <select
                        aria-label={"Movimientos por p\u00e1gina"}
                        value={transactionPageSize}
                        onChange={(event) =>
                          handleTransactionPageSizeChange(Number(event.target.value))
                        }
                        className="min-h-11 rounded-xl border border-outline bg-white px-3 py-2 font-medium text-ink outline-none transition focus:border-primary"
                      >
                        {TRANSACTION_PAGE_SIZE_OPTIONS.map((pageSize) => (
                          <option
                            key={pageSize}
                            value={pageSize}
                          >
                            {pageSize}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div
                      className="flex flex-col gap-3 sm:items-end"
                    >
                      <span className="hidden text-sm text-muted sm:block">
                        {"P\u00e1gina"} {safeTransactionPage} de {transactionTotalPages}
                      </span>
                      <nav className="analysis-pagination flex items-center gap-1.5 sm:flex-wrap" aria-label={"Paginaci\u00f3n de movimientos"}>
                        <button
                          type="button"
                          className="rounded-xl border border-outline bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-primary-mist disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label="Anterior"
                          disabled={safeTransactionPage === 1}
                          onClick={() => goToTransactionPage(safeTransactionPage - 1)}
                        >
                          <ChevronLeftIcon className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Anterior</span>
                        </button>
                        <label className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm text-muted sm:hidden">
                          <select aria-label="Ir a la página" value={safeTransactionPage} onChange={event => goToTransactionPage(Number(event.target.value))} className="min-h-11 min-w-0 rounded-xl border border-outline bg-white px-2 font-semibold text-ink">
                            {Array.from({ length: transactionTotalPages }, (_, index) => index + 1).map(page => <option key={page} value={page}>{page}</option>)}
                          </select>
                          <span>de {transactionTotalPages}</span>
                        </label>
                        {transactionPaginationItems.map((item) =>
                          typeof item === "number" ? (
                            <button
                              key={item}
                              type="button"
                              className={cn(
                                "hidden h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold transition sm:inline-block",
                                item === safeTransactionPage
                                  ? "border-primary bg-primary text-white"
                                  : "border-outline bg-white text-ink hover:border-primary/35 hover:bg-primary-mist",
                              )}
                              aria-current={item === safeTransactionPage ? "page" : undefined}
                              onClick={() => goToTransactionPage(item)}
                            >
                              {item}
                            </button>
                          ) : (
                            <span key={item} className="hidden px-1 text-muted sm:inline" aria-hidden="true">
                              {"\u2026"}
                            </span>
                          ),
                        )}
                        <button
                          type="button"
                          className="rounded-xl border border-outline bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-primary-mist disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label="Siguiente"
                          disabled={safeTransactionPage === transactionTotalPages}
                          onClick={() => goToTransactionPage(safeTransactionPage + 1)}
                        >
                          <ChevronRightIcon className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Siguiente</span>
                        </button>
                      </nav>
                    </div>
                  </div>
                </Panel>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterAccordion({ title, count, total, required = false, children }: {
  title: string; count: number; total?: number; required?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const all = !required && (count === 0 || count === total);
  const description = all ? "Sin filtro" : count === 0 ? "Selecciona un período" : `${count} ${count === 1 ? "filtro activo" : "filtros activos"}`;
  return <section className="py-1.5">
    <button type="button" aria-label={title} aria-expanded={open} aria-controls={id} onClick={() => setOpen(current => !current)}
      className={cn("flex min-h-[76px] w-full items-center justify-between gap-4 rounded-2xl px-3 py-3 text-left transition sm:px-4", open ? "bg-paper-soft" : "hover:bg-paper-soft/70")}>
      <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{title}</span><span className="mt-1 block text-sm text-muted">{description}</span></span>
      <span className="flex shrink-0 items-center gap-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", open ? "bg-white text-primary" : "bg-paper-soft text-muted")}>{all ? "Todos" : count}</span><ChevronDownIcon className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} /></span>
    </button>
    {open && <div id={id} className="px-2 pb-3 pt-3 sm:px-3">{children}</div>}
  </section>;
}

function AnalysisCustomizeDialog({ visibleWidgets, onToggle, onClose }: {
  visibleWidgets: Set<WidgetId>; onToggle: (widget: WidgetId) => void; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; trigger?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<dialog ref={dialogRef} aria-labelledby="analysis-customize-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="analysis-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-outline bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 id="analysis-customize-title" className="text-xl font-semibold">Personalizar gráficos</h2><button type="button" aria-label="Cerrar personalización" onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-xl text-muted hover:bg-paper-soft">×</button></div>
      <p className="mt-2 text-sm leading-6 text-muted">Elige qué gráficos mostrar en Gráficos. Selecciona sus barras o puntos para consultar los movimientos.</p>
      <div className="mt-4 space-y-2">{CHART_WIDGETS.map(widget => <CheckboxRow key={widget.value} checked={visibleWidgets.has(widget.value)} label={widget.label} onChange={() => onToggle(widget.value)} />)}</div>
      <div className="mt-5 flex justify-end"><Button compactOnMobile onClick={onClose}>Listo</Button></div>
    </div>
  </dialog>, document.body);
}

type AnalysisFilters = Record<"periods" | "accounts" | "categories" | "types" | "scopes", Set<string>>;

type AnalysisFiltersDialogProps = {
  initial: AnalysisFilters;
  periods: FilterOption[];
  accounts: FilterOption[];
  types: FilterOption[];
  scopes: FilterOption[];
  categoryGroups: ReturnType<typeof groupCategories>;
  onClose: () => void;
  onApply: (filters: AnalysisFilters) => void;
};

function AnalysisFiltersDialog({ initial, periods, accounts, types, scopes, categoryGroups, onClose, onApply }: AnalysisFiltersDialogProps) {
  const [draft, setDraft] = useState(initial);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const update = (key: keyof AnalysisFilters, value: Set<string>) => setDraft(current => ({ ...current, [key]: value }));
  const toggle = (key: keyof AnalysisFilters, value: string) => {
    const next = new Set(draft[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(key, next);
  };
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="analysis-filters-title" onCancel={event => { if (event.target === event.currentTarget) { event.preventDefault(); onClose(); } }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="analysis-dialog fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border border-outline bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
      <div className="analysis-dialog-content flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-outline px-5 py-4 sm:px-6">
          <div><h2 id="analysis-filters-title" className="text-xl font-semibold">Filtros del análisis</h2><p className="mt-1 text-sm text-muted">Se aplican a Gráficos y Movimientos.</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar filtros" className="min-h-11 min-w-11 rounded-xl text-xl text-muted hover:bg-paper-soft">×</button>
        </header>
        <div className="min-h-0 divide-y divide-outline/70 overflow-y-auto overscroll-contain px-3 py-2 sm:px-5">
          <FilterAccordion title="Períodos" count={draft.periods.size} required>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button tone="secondary" compactOnMobile disabled={!periods.length} onClick={() => update("periods", new Set(periods.slice(0, 1).map(option => option.value)))}>Último mes disponible</Button>
              <Button tone="secondary" compactOnMobile disabled={!periods.length} onClick={() => {
                const latest = periods[0]?.value;
                if (!latest) return;
                const [year, month] = latest.split("-").map(Number);
                const first = new Date(year, month - 3, 1);
                const start = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`;
                update("periods", new Set(periods.filter(option => option.value >= start && option.value <= latest).map(option => option.value)));
              }}>Últimos 3 meses</Button>
            </div>
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-2xl bg-paper-soft/50 p-2 sm:grid-cols-2">
              {periods.map(option => <CheckboxRow key={option.value} checked={draft.periods.has(option.value)} label={option.label} onChange={() => toggle("periods", option.value)} />)}
            </div>
            {draft.periods.size === 0 && <p role="status" className="mt-2 text-sm text-danger">Selecciona al menos un mes.</p>}
          </FilterAccordion>
          <FilterAccordion title="Cuentas" count={draft.accounts.size} total={accounts.length}>
            <p className="mb-2 text-xs text-muted">Sin selección se incluyen todas las cuentas.</p>
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-2xl bg-paper-soft/50 p-2 sm:grid-cols-2">
              {accounts.map(option => <CheckboxRow key={option.value} checked={draft.accounts.has(option.value)} label={option.label} helper={option.helper} onChange={() => toggle("accounts", option.value)} />)}
            </div>
          </FilterAccordion>
          <FilterAccordion title="Categorías" count={draft.categories.size}>
            <CategoryPicker label="Filtrar por categorías" purpose="filter" multiple value={draft.categories} disabled={false} groups={categoryGroups} onChange={value => update("categories", value)} />
          </FilterAccordion>
          <FilterAccordion title="Tipos" count={draft.types.size} total={types.length}>
            <CheckboxFilterGroup title="Tipos" options={types} selected={draft.types} onChange={value => update("types", value)} />
          </FilterAccordion>
          <FilterAccordion title="Movimientos" count={draft.scopes.size} total={scopes.length}>
            <CheckboxFilterGroup title="Movimientos" options={scopes} selected={draft.scopes} onChange={value => update("scopes", value)} />
          </FilterAccordion>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline bg-paper-soft/50 px-5 py-4 sm:px-6">
          <button type="button" className="mr-auto min-h-11 rounded-xl px-2 text-sm text-muted hover:bg-white" onClick={() => setDraft({ periods: new Set(periods.slice(0, 1).map(option => option.value)), accounts: new Set(), categories: new Set(), types: new Set(), scopes: new Set(["regular"]) })}>Restablecer</button>
          <Button tone="ghost" compactOnMobile onClick={onClose}>Cancelar</Button>
          <Button compactOnMobile disabled={draft.periods.size === 0} onClick={() => onApply(draft)}>Aplicar filtros</Button>
        </footer>
      </div>
    </dialog>, document.body,
  );
}

type BulkAnalysisActionsProps = {
  selectedCount: number;
  floating?: boolean;
  onExclude: () => void;
  onInclude: () => void;
  onClear: () => void;
};

function BulkAnalysisActions({
  selectedCount,
  floating = false,
  onExclude,
  onInclude,
  onClear,
}: BulkAnalysisActionsProps) {
  return (
    <div
      role="group"
      aria-label="Acciones de movimientos seleccionados"
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl border p-2 sm:gap-3 sm:p-3",
        floating
          ? "border-primary/20 bg-white/95 shadow-[0_16px_35px_rgba(38,55,34,0.14)] backdrop-blur-md"
          : "mt-3 border-primary/15 bg-primary-mist/60",
      )}
    >
      <span className="min-w-0 text-xs font-semibold text-primary sm:text-sm" title={`${selectedCount} movimientos seleccionados`}>
        <span className="sm:hidden">{selectedCount} selecc.</span>
        <span className="hidden sm:inline">{selectedCount} {selectedCount === 1 ? "movimiento seleccionado" : "movimientos seleccionados"}</span>
      </span>
      <div className="flex shrink-0 items-center gap-1 xl:gap-2">
        <button
          type="button"
          aria-label="Omitir del análisis"
          title="Omitir del análisis"
          className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 xl:w-auto xl:px-3"
          onClick={onExclude}
        >
          <EyeOffIcon aria-hidden="true" className="h-5 w-5" />
          <span className="hidden xl:inline">Omitir del análisis</span>
        </button>
        <button
          type="button"
          aria-label="Incluir en el análisis"
          title="Incluir en el análisis"
          className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-outline bg-white text-sm font-semibold text-ink transition hover:border-primary/35 xl:w-auto xl:px-3"
          onClick={onInclude}
        >
          <EyeIcon aria-hidden="true" className="h-5 w-5" />
          <span className="hidden xl:inline">Incluir en el análisis</span>
        </button>
        <button
          type="button"
          aria-label="Limpiar selección"
          title="Limpiar selección"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-sm font-medium text-muted transition hover:bg-white hover:text-ink xl:w-auto xl:px-3"
          onClick={onClear}
        >
          <span aria-hidden="true" className="text-xl xl:hidden">×</span>
          <span className="hidden xl:inline">Limpiar selección</span>
        </button>
      </div>
    </div>
  );
}

type CompactMetricProps = {
  label: string;
  value: string;
  tone?: "income" | "expense" | "neutral";
  prominent?: boolean;
  icon?: ReactNode;
};

function CompactMetric({ label, value, tone = "neutral", prominent = false, icon }: CompactMetricProps) {
  const toneClass =
    tone === "income"
      ? "border-primary/15 bg-primary-mist/50 text-primary"
      : tone === "expense"
        ? "border-danger/15 bg-danger-soft/55 text-danger"
        : "border-outline bg-paper-soft/70 text-ink";

  return (
    <div className={cn("analysis-metric metric-container min-w-0 rounded-2xl border", prominent ? "flex min-h-28 flex-col justify-between gap-2 p-3 sm:min-h-40 sm:gap-4 sm:p-5" : "px-3 py-3", toneClass)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-h-10 text-sm font-medium leading-5 opacity-90">{label}</p>
        {icon && <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60 sm:flex">{icon}</span>}
      </div>
      <strong className={cn("mt-1 block font-semibold tracking-[-0.03em]", prominent ? "metric-value" : "truncate text-lg")} title={value}>
        {value}
      </strong>
    </div>
  );
}

type SortableTableHeaderProps = {
  label: string;
  sortKey: TransactionSortKey;
  sort: TransactionSort;
  onSort: (key: TransactionSortKey) => void;
  align?: "left" | "right";
  className?: string;
};

function SortableTableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
}: SortableTableHeaderProps) {
  const isActive = sort.key === sortKey;
  const nextDirection = isActive && sort.direction === "asc" ? "descendente" : "ascendente";

  return (
    <th
      className={cn("px-4 py-3 font-medium", align === "right" && "text-right", className)}
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-center gap-2 transition hover:text-ink focus-visible:outline-none focus-visible:text-primary",
          align === "right" && "justify-end",
          isActive && "font-semibold text-primary",
        )}
        aria-label={`Ordenar ${label} ${nextDirection}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <span className="flex h-5 w-3 flex-col items-center justify-center -space-y-1" aria-hidden="true">
          <ArrowUpIcon
            className={cn("h-2.5 w-2.5", isActive && sort.direction === "asc" ? "text-primary" : "text-outline")}
          />
          <ArrowDownIcon
            className={cn("h-2.5 w-2.5", isActive && sort.direction === "desc" ? "text-primary" : "text-outline")}
          />
        </span>
      </button>
    </th>
  );
}

type CheckboxFilterGroupProps = {
  title: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
};

function CheckboxFilterGroup({ title, options, selected, onChange }: CheckboxFilterGroupProps) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="sr-only">{title}</legend>
      {options.map(option => (
        <CheckboxRow key={option.value} checked={selected.has(option.value)} label={option.label} helper={option.helper} onChange={() => {
          const next = new Set(selected);
          if (next.has(option.value)) next.delete(option.value);
          else next.add(option.value);
          onChange(next);
        }} />
      ))}
      <p className="px-2 text-xs text-muted">{selected.size === 0 ? "Todos incluidos" : `${selected.size} seleccionados`}</p>
    </fieldset>
  );
}

type CheckboxRowProps = {
  checked: boolean;
  label: string;
  helper?: string;
  onChange: () => void;
};

function CheckboxRow({ checked, label, helper, onChange }: CheckboxRowProps) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition", checked ? "border-primary/15 bg-primary-mist/50" : "border-transparent hover:bg-white")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">
          {label}
        </span>
        {helper ? <span className="block truncate text-sm text-muted">{helper}</span> : null}
      </span>
    </label>
  );
}

type ChartHeadingProps = {
  title: string;
  description: string;
};

function ChartHeading({ title, description }: ChartHeadingProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{title}</h2>
      <p className="text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function AnalysisChart({ option, horizontal = false, ...props }: ComponentProps<typeof EChart> & { horizontal?: boolean }) {
  const responsiveOption = useMemo<AppChartOption>(() => ({
    ...option,
    media: [{ query: { maxWidth: 420 }, option: {
      grid: { left: 0, right: horizontal ? 42 : 10, top: 15, bottom: horizontal && !option.legend ? 15 : 55, containLabel: true },
      xAxis: { splitNumber: 2, axisLabel: { fontSize: 10, hideOverlap: true,
        ...(!horizontal ? { interval: 0, formatter: (value: string) => value.replace(" ", "\n") } : {}) } },
      yAxis: { splitNumber: 3, axisLabel: { fontSize: 10, ...(horizontal ? { width: 85 } : {}) } },
      ...(option.legend ? { legend: { textStyle: { fontSize: 11 }, itemWidth: 14, itemHeight: 9 } } : {}),
    } }],
  }), [option, horizontal]);
  return <EChart {...props} option={responsiveOption} />;
}

function AnalysisChartPanel({ chart, label, children }: { chart: ChartWidgetId; label: string; children: ReactNode }) {
  return <section id={`analysis-chart-${chart}`} tabIndex={-1} aria-label={label} className="analysis-chart-panel scroll-mt-[calc(var(--app-header-height,105px)+var(--analysis-navigation-height,76px)+12px)]">
    <Panel className="p-3 sm:p-5 md:p-8">{children}</Panel>
  </section>;
}

function SubcategoryToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={onChange}
    className={cn("inline-flex shrink-0 items-center gap-3 self-start rounded-full border px-3 py-2 text-sm font-medium transition",
      checked ? "border-primary/30 bg-primary-mist text-primary" : "border-outline bg-white text-muted hover:border-primary/30 hover:text-primary")}>
    <span>Ver subcategorías</span>
    <span aria-hidden="true" className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-outline")}>
      <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform", checked && "translate-x-4")} />
    </span>
  </button>;
}

function ChartStyleToggle({ label, value, onChange }: {
  label: string;
  value: ChartStyle;
  onChange: (value: ChartStyle) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 self-start rounded-2xl border border-outline bg-paper-soft p-1">
      {(["bar", "line"] as const).map(style => (
        <button key={style} type="button" aria-pressed={value === style} onClick={() => onChange(style)}
          className={cn("min-h-11 rounded-xl px-4 py-2 text-sm font-medium transition", value === style ? "bg-primary text-white" : "text-muted hover:bg-white")}>
          {style === "bar" ? "Barras" : "Líneas"}
        </button>
      ))}
    </div>
  );
}
