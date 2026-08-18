import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BalanceIcon,
  Button,
  ChevronDownIcon,
  CalendarIcon,
  EChart,
  EmptyState,
  ErrorState,
  EyeIcon,
  EyeOffIcon,
  LoadingState,
  MoneyIcon,
  PageIntro,
  Panel,
  ReceiptIcon,
  StatCard,
  TrendLineIcon,
  cn,
} from "../components";
import type { AppChartOption } from "../components/EChart";
import { useFormatCurrency } from "../hooks";
import { parseLocalDate } from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import { InstitutionLabels, TransactionType } from "../types";
import type { Account, Category, Transaction } from "../types";

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
  { value: "transactions", label: "Tabla de movimientos" },
] as const;

type WidgetId = (typeof WIDGET_OPTIONS)[number]["value"];
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

async function loadAllTransactions() {
  const transactions: Transaction[] = [];
  let offset = 0;

  while (true) {
    const page = await TransactionService.getTransactions({
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

function readStoredWidgets(): Set<WidgetId> {
  if (typeof window === "undefined") return new Set(WIDGET_OPTIONS.map((item) => item.value));

  try {
    const stored = JSON.parse(window.localStorage.getItem(WIDGET_STORAGE_KEY) ?? "[]") as unknown;
    const isLegacyStorage = Array.isArray(stored);
    const storedWidgets = isLegacyStorage
      ? stored
      : typeof stored === "object" &&
          stored !== null &&
          "widgets" in stored &&
          Array.isArray(stored.widgets)
        ? stored.widgets
        : [];

    if (storedWidgets.length === 0) {
      return new Set(WIDGET_OPTIONS.map((item) => item.value));
    }
    const validWidgets = storedWidgets.filter((value): value is WidgetId =>
      WIDGET_OPTIONS.some((option) => option.value === value),
    );
    if (isLegacyStorage) {
      validWidgets.push("weekdays");
    }

    return new Set(validWidgets);
  } catch {
    return new Set(WIDGET_OPTIONS.map((item) => item.value));
  }
}

function readExcludedTransactionIds(): Set<number> {
  if (typeof window === "undefined") return new Set();

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(EXCLUDED_TRANSACTIONS_STORAGE_KEY) ?? "{}",
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
  const formatCurrency = useFormatCurrency();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetId>>(readStoredWidgets);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bar");
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
    useState<Set<number>>(readExcludedTransactionIds);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(
    new Set(),
  );
  const [showStickyBulkActions, setShowStickyBulkActions] = useState(false);
  const transactionTableRef = useRef<HTMLDivElement>(null);
  const bulkActionsRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalyticsData() {
      try {
        const [accountData, categoryData, transactionData] = await Promise.all([
          AccountService.getAccounts(),
          CategoryService.getCategories(),
          loadAllTransactions(),
        ]);
        if (cancelled) return;

        setAccounts(accountData);
        setCategories(categoryData);
        setTransactions(transactionData);
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
    window.localStorage.setItem(
      WIDGET_STORAGE_KEY,
      JSON.stringify({
        version: WIDGET_STORAGE_VERSION,
        widgets: [...visibleWidgets],
      }),
    );
  }, [visibleWidgets]);

  useEffect(() => {
    window.localStorage.setItem(
      EXCLUDED_TRANSACTIONS_STORAGE_KEY,
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
  }, [selectedTransactionIds.size]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const periodOptions = useMemo<FilterOption[]>(
    () =>
      Array.from(new Set(transactions.map((transaction) => transaction.date.slice(0, 7))))
        .sort((left, right) => right.localeCompare(left))
        .map((period) => ({ value: period, label: formatPeriodLabel(period) })),
    [transactions],
  );
  const accountOptions = useMemo<FilterOption[]>(
    () =>
      accounts.map((account) => ({
        value: String(account.id),
        label: account.name,
        helper: InstitutionLabels[account.institution],
      })),
    [accounts],
  );
  const categoryOptions = useMemo<FilterOption[]>(
    () => [
      { value: UNCATEGORIZED_KEY, label: "Sin categor\u00eda" },
      ...categories.map((category) => ({
        value: String(category.id),
        label: category.name,
      })),
    ],
    [categories],
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
  const activeFilterCount = activeFilters.length;
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const period = transaction.date.slice(0, 7);
        const categoryKey = transaction.category_id
          ? String(transaction.category_id)
          : UNCATEGORIZED_KEY;
        const scope = transaction.is_internal_transfer ? "internal" : "regular";
        return (
          (selectedPeriods.size === 0 || selectedPeriods.has(period)) &&
          (selectedAccountIds.size === 0 ||
            selectedAccountIds.has(String(transaction.account_id))) &&
          (selectedCategoryKeys.size === 0 || selectedCategoryKeys.has(categoryKey)) &&
          (selectedTypes.size === 0 || selectedTypes.has(transaction.transaction_type)) &&
          (selectedScopes.size === 0 || selectedScopes.has(scope))
        );
      }),
    [
      selectedAccountIds,
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
  const excludedFilteredTransactions = useMemo(
    () =>
      filteredTransactions.filter((transaction) =>
        excludedTransactionIds.has(transaction.id),
      ),
    [excludedTransactionIds, filteredTransactions],
  );

  const summary = useMemo(() => {
    const income = analyzedTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.INCOME)
      .reduce((total, transaction) => total + transaction.amount_clp, 0);
    const expenses = analyzedTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.EXPENSE)
      .reduce((total, transaction) => total + Math.abs(transaction.amount_clp), 0);
    const activeMonths = new Set(
      analyzedTransactions.map((transaction) => transaction.date.slice(0, 7)),
    ).size;
    return {
      income,
      expenses,
      balance: income - expenses,
      averageExpenses: activeMonths > 0 ? Math.round(expenses / activeMonths) : 0,
      count: analyzedTransactions.length,
    };
  }, [analyzedTransactions]);

  const evolutionData = useMemo(() => {
    const totals = new Map<string, { income: number; expenses: number }>();
    [...selectedPeriods].sort().forEach((period) => {
      totals.set(period, { income: 0, expenses: 0 });
    });
    analyzedTransactions.forEach((transaction) => {
      const period = transaction.date.slice(0, 7);
      const current = totals.get(period) ?? { income: 0, expenses: 0 };
      if (transaction.transaction_type === TransactionType.INCOME) {
        current.income += transaction.amount_clp;
      } else {
        current.expenses += Math.abs(transaction.amount_clp);
      }
      totals.set(period, current);
    });
    return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [analyzedTransactions, selectedPeriods]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    analyzedTransactions.forEach((transaction) => {
      const categoryName = transaction.category_id
        ? categoryMap.get(transaction.category_id)?.name ?? `Categoria #${transaction.category_id}`
        : "Sin categor\u00eda";
      totals.set(categoryName, (totals.get(categoryName) ?? 0) + Math.abs(transaction.amount_clp));
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  }, [analyzedTransactions, categoryMap]);

  const accountBreakdown = useMemo(() => {
    const totals = new Map<number, { income: number; expenses: number }>();
    analyzedTransactions.forEach((transaction) => {
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
        name: accountMap.get(accountId)?.name ?? `Cuenta #${accountId}`,
        ...totalsByAccount,
      }))
      .sort((left, right) => right.income + right.expenses - left.income - left.expenses);
  }, [accountMap, analyzedTransactions]);

  const descriptionBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    analyzedTransactions.forEach((transaction) => {
      const label = transaction.description.trim() || "Sin descripcion";
      totals.set(label, (totals.get(label) ?? 0) + Math.abs(transaction.amount_clp));
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [analyzedTransactions]);

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

    analyzedTransactions.forEach((transaction) => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;

      const weekday = parseLocalDate(transaction.date).getDay();
      totals.set(weekday, (totals.get(weekday) ?? 0) + Math.abs(transaction.amount_clp));
    });

    return weekdays.map(({ day, label }) => ({ label, total: totals.get(day) ?? 0 }));
  }, [analyzedTransactions]);

  const evolutionOption = useMemo<AppChartOption>(() => {
    const labels = evolutionData.map(([period]) => formatShortPeriod(period));
    const income = evolutionData.map(([, values]) => values.income);
    const expenses = evolutionData.map(([, values]) => values.expenses);
    const series =
      chartStyle === "line"
        ? [
            {
              name: "Ingresos",
              type: "line" as const,
              smooth: true,
              symbolSize: 8,
              data: income,
              lineStyle: { color: "#344b2e", width: 3 },
              itemStyle: { color: "#344b2e" },
            },
            {
              name: "Gastos",
              type: "line" as const,
              smooth: true,
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
      tooltip: { trigger: "axis" },
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
  }, [chartStyle, evolutionData]);

  const categoryOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 10, right: 25, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      yAxis: {
        type: "category",
        data: [...categoryBreakdown].reverse().map(([name]) => name),
        axisLabel: { color: "#65705f", width: 120, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: [...categoryBreakdown].reverse().map(([, value]) => value),
          itemStyle: { color: "#6e875f", borderRadius: [0, 8, 8, 0] },
        },
      ],
    }),
    [categoryBreakdown],
  );

  const accountOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#65705f" } },
      grid: { left: 20, right: 20, top: 15, bottom: 60, containLabel: true },
      xAxis: {
        type: "category",
        data: accountBreakdown.map((item) => item.name),
        axisLabel: { color: "#65705f", rotate: accountBreakdown.length > 3 ? 20 : 0 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      series: [
        {
          name: "Ingresos",
          type: "bar",
          stack: "total",
          data: accountBreakdown.map((item) => item.income),
          itemStyle: { color: "#344b2e", borderRadius: [7, 7, 0, 0] },
        },
        {
          name: "Gastos",
          type: "bar",
          stack: "total",
          data: accountBreakdown.map((item) => item.expenses),
          itemStyle: { color: "#d77b68", borderRadius: [7, 7, 0, 0] },
        },
      ],
    }),
    [accountBreakdown],
  );

  const weekdayOption = useMemo<AppChartOption>(() => {
    const series =
      chartStyle === "line"
        ? {
            type: "line" as const,
            smooth: true,
            symbolSize: 9,
            data: weekdayBreakdown.map((item) => item.total),
            lineStyle: { color: "#d77b68", width: 3 },
            itemStyle: { color: "#d77b68" },
            areaStyle: { color: "rgba(215, 123, 104, 0.14)" },
          }
        : {
            type: "bar" as const,
            data: weekdayBreakdown.map((item) => item.total),
            itemStyle: { color: "#d77b68", borderRadius: [8, 8, 0, 0] },
          };

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 20, right: 20, top: 20, bottom: 25, containLabel: true },
      xAxis: {
        type: "category",
        data: weekdayBreakdown.map((item) => item.label),
        axisLabel: { color: "#65705f" },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      series: [series],
    };
  }, [chartStyle, weekdayBreakdown]);

  const descriptionOption = useMemo<AppChartOption>(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 10, right: 25, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { color: "#65705f", formatter: formatCompactCurrency },
        splitLine: { lineStyle: { color: "#e8e3da" } },
      },
      yAxis: {
        type: "category",
        data: [...descriptionBreakdown].reverse().map(([name]) => name),
        axisLabel: { color: "#65705f", width: 145, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: [...descriptionBreakdown].reverse().map(([, value]) => value),
          itemStyle: { color: "#d5b98f", borderRadius: [0, 8, 8, 0] },
        },
      ],
    }),
    [descriptionBreakdown],
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
          return transaction.category_id
            ? categoryMap.get(transaction.category_id)?.name ?? "Sin categor\u00eda"
            : "Sin categor\u00eda";
        case "type":
          return transaction.is_internal_transfer
            ? "Transferencia interna"
            : transaction.transaction_type === TransactionType.INCOME
              ? "Ingreso"
              : "Gasto";
        case "amount":
          return transaction.amount_clp;
      }
    };

    return [...tableTransactions]
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
  }, [accountMap, categoryMap, tableTransactions, transactionSort]);


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
    setSelectedPeriods(new Set());
    setSelectedAccountIds(new Set());
    setSelectedCategoryKeys(new Set());
    setSelectedTypes(new Set());
    setSelectedScopes(new Set());
  };

  const toggleWidget = (widget: WidgetId) => {
    setVisibleWidgets((current) => {
      const next = new Set(current);
      if (next.has(widget)) next.delete(widget);
      else next.add(widget);
      return next;
    });
  };

  if (loading) return <LoadingState message={"Preparando tu espacio de an\u00e1lisis..."} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow={"Exploraci\u00f3n financiera"}
        title={"An\u00e1lisis"}
        description={"Combina uno o varios filtros para descubrir patrones, comparar cuentas y entender en detalle tus movimientos."}
        actions={
          <Button
            className="whitespace-nowrap"
            tone="secondary"
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
          >
            Limpiar filtros
          </Button>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel className="space-y-6">
          <div>
            <p className="eyebrow m-0 text-primary">Filtros combinables</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">{"Refina el an\u00e1lisis"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Sin selecciones se incluye todo. Marca solo lo que quieras restringir.
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2 xl:grid-cols-1">
          <CheckboxFilterGroup
            title="Periodos"
            options={periodOptions}
            selected={selectedPeriods}
            onChange={setSelectedPeriods}
          />
          <CheckboxFilterGroup
            title="Cuentas"
            options={accountOptions}
            selected={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />
          <CheckboxFilterGroup
            title="Tipos"
            options={typeOptions}
            selected={selectedTypes}
            onChange={setSelectedTypes}
          />
          <CheckboxFilterGroup
            title="Movimientos"
            options={scopeOptions}
            selected={selectedScopes}
            onChange={setSelectedScopes}
          />
          <CheckboxFilterGroup
            title="Categorias"
            options={categoryOptions}
            selected={selectedCategoryKeys}
            onChange={setSelectedCategoryKeys}
            selectAllLabel={"Todas las categor\u00edas"}
          />
          </div>

          <div className="border-t border-outline pt-6">
            <p className="text-sm font-semibold text-ink">Personalizar panel</p>
            <div className="mt-3 space-y-2">
              {WIDGET_OPTIONS.map((widget) => (
                <CheckboxRow
                  key={widget.value}
                  checked={visibleWidgets.has(widget.value)}
                  label={widget.label}
                  onChange={() => toggleWidget(widget.value)}
                />
              ))}
            </div>
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-primary/15 bg-primary-mist/60 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-primary">
                {analyzedTransactions.length} movimiento{analyzedTransactions.length === 1 ? "" : "s"}{" "}
                {activeFilterCount === 0
                  ? "incluidos en el an\u00e1lisis"
                  : `con ${activeFilterCount} ${activeFilterCount === 1 ? "filtro activo" : "filtros activos"}`}
              </p>
              <p className="mt-1 text-sm text-muted">
                {excludedFilteredTransactions.length > 0
                  ? `${excludedFilteredTransactions.length} ${excludedFilteredTransactions.length === 1 ? "movimiento omitido" : "movimientos omitidos"} solo de los gr\u00e1ficos y KPIs de esta secci\u00f3n.`
                  : activeFilterCount === 0
                    ? "No hay filtros activos: todos los indicadores incluyen tu historial."
                    : "Todos los indicadores y gr\u00e1ficos responden a estos filtros."}
              </p>
            </div>
            <div className="flex rounded-2xl border border-outline bg-white p-1">
              {(["bar", "line"] as ChartStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition",
                    chartStyle === style ? "bg-primary text-white" : "text-muted hover:bg-paper-soft",
                  )}
                  onClick={() => setChartStyle(style)}
                >
                  {style === "bar" ? "Barras" : "L\u00edneas"}
                </button>
              ))}
            </div>
          </div>
            {activeFilters.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-primary/10 pt-4">
                <span className="mr-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                  Filtros activos
                </span>
                {activeFilters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary/35 hover:bg-primary-mist"
                    aria-label={`Quitar filtro ${filter.groupLabel}: ${filter.label}`}
                    onClick={() => removeActiveFilter(filter.group, filter.value)}
                  >
                    <span>{filter.groupLabel}: {filter.label}</span>
                    <span aria-hidden="true">{"\u00d7"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            <StatCard label="Ingresos" value={formatCurrency(summary.income)} icon={<MoneyIcon className="h-5 w-5" />} tone="income" />
            <StatCard label="Gastos" value={formatCurrency(summary.expenses)} icon={<ReceiptIcon className="h-5 w-5" />} tone="expense" />
            <StatCard label="Balance" value={formatCurrency(summary.balance)} icon={<BalanceIcon className="h-5 w-5" />} />
            <StatCard label="Gasto promedio mensual" value={formatCurrency(summary.averageExpenses)} icon={<CalendarIcon className="h-5 w-5" />} />
            <StatCard label="Movimientos" value={String(summary.count)} icon={<TrendLineIcon className="h-5 w-5" />} />
          </section>

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
              {visibleWidgets.has("evolution") ? (
                <Panel>
                  <ChartHeading
                    title={"Evoluci\u00f3n temporal"}
                    description="Ingresos y gastos agrupados por los meses seleccionados."
                  />
                  <EChart className="mt-5 h-[300px] w-full sm:h-[360px]" option={evolutionOption} />
                </Panel>
              ) : null}

              <div className="grid gap-6 2xl:grid-cols-2">
                {visibleWidgets.has("categories") ? (
                  <Panel className="2xl:col-span-2">
                    <ChartHeading
                      title={"Distribuci\u00f3n por categor\u00eda"}
                      description={"Las diez categor\u00edas con mayor volumen dentro de los filtros."}
                    />
                    <EChart className="mt-5 h-[300px] w-full sm:h-[360px]" option={categoryOption} />
                  </Panel>
                ) : null}

                {visibleWidgets.has("accounts") ? (
                  <Panel>
                    <ChartHeading
                      title={"Comparaci\u00f3n por cuenta"}
                      description="Ingresos y gastos acumulados en cada cuenta seleccionada."
                    />
                    <EChart className="mt-5 h-[300px] w-full sm:h-[360px]" option={accountOption} />
                  </Panel>
                ) : null}

                {visibleWidgets.has("weekdays") ? (
                  <Panel>
                    <ChartHeading
                      title={"Gastos por d\u00eda de la semana"}
                      description={"Identifica qu\u00e9 d\u00edas concentran m\u00e1s egresos dentro de los filtros."}
                    />
                    <EChart className="mt-5 h-[300px] w-full sm:h-[360px]" option={weekdayOption} />
                  </Panel>
                ) : null}

                {visibleWidgets.has("descriptions") ? (
                  <Panel className="2xl:col-span-2">
                    <ChartHeading
                      title="Principales descripciones"
                      description="Conceptos que concentran el mayor volumen de dinero."
                    />
                    <EChart className="mt-5 h-[300px] w-full sm:h-[360px]" option={descriptionOption} />
                  </Panel>
                ) : null}
              </div>

              {visibleWidgets.has("transactions") ? (
                <Panel className="p-0 md:p-0 xl:relative xl:-left-[19.25rem] xl:w-[calc(100%+19.25rem)]">
                  <div ref={transactionTableRef} className="scroll-mt-24 flex flex-col gap-2 border-b border-outline px-5 py-5 md:px-8">
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
                    <div className="sticky top-[4.5rem] z-20 px-5 py-3 md:px-8">
                      <BulkAnalysisActions
                        floating
                        selectedCount={selectedTransactionIds.size}
                        onExclude={() => setTransactionsExcluded(selectedTransactionIds, true)}
                        onInclude={() => setTransactionsExcluded(selectedTransactionIds, false)}
                        onClear={() => setSelectedTransactionIds(new Set())}
                      />
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
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
                            label="Fecha"
                            sortKey="date"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-24 px-2"
                          />
                          <SortableTableHeader
                            label={"Descripci\u00f3n"}
                            sortKey="description"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="w-40 px-2"
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
                          <SortableTableHeader
                            label="Monto"
                            sortKey="amount"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            align="right"
                            className="w-24 px-2"
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
                              {transactionAnalysisView === "excluded"
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
                            <td className="whitespace-nowrap px-2 py-4 text-muted">
                              {parseLocalDate(transaction.date).toLocaleDateString("es-CL")}
                            </td>
                            <td className="break-words px-2 py-4 font-medium" title={transaction.description}>
                              {transaction.description}
                            </td>
                            <td
                              className="break-words px-2 py-4 text-muted"
                              title={accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`}
                            >
                              {accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`}
                            </td>
                            <td
                              className="break-words px-2 py-4 text-muted"
                              title={
                                transaction.category_id
                                  ? categoryMap.get(transaction.category_id)?.name ?? "Sin categor\u00eda"
                                  : "Sin categor\u00eda"
                              }
                            >
                              {transaction.category_id
                                ? categoryMap.get(transaction.category_id)?.name ?? "Sin categor\u00eda"
                                : "Sin categor\u00eda"}
                            </td>
                            <td className="break-words px-2 py-4">
                              <span className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                transaction.is_internal_transfer
                                  ? "bg-paper-soft text-muted"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "bg-primary-mist text-primary"
                                    : "bg-danger-soft text-danger",
                              )}>
                                {transaction.is_internal_transfer
                                  ? "Transf interna"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "Ingreso"
                                    : "Gasto"}
                              </span>
                            </td>
                            <td className={cn(
                              "whitespace-nowrap px-2 py-4 text-right font-semibold",
                              transaction.amount_clp >= 0 ? "text-primary" : "text-danger",
                              isExcluded && "opacity-60",
                            )}>
                              {formatCurrency(transaction.amount_clp)}
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
                  <div className="flex flex-col gap-4 border-t border-outline px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
                    <label className="flex items-center gap-3 text-sm text-muted">
                      <span className="font-medium">{"Movimientos por p\u00e1gina"}</span>
                      <select
                        aria-label={"Movimientos por p\u00e1gina"}
                        value={transactionPageSize}
                        onChange={(event) =>
                          handleTransactionPageSizeChange(Number(event.target.value))
                        }
                        className="rounded-xl border border-outline bg-white px-3 py-2 font-medium text-ink outline-none transition focus:border-primary"
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
                      <span className="text-sm text-muted">
                        {"P\u00e1gina"} {safeTransactionPage} de {transactionTotalPages}
                      </span>
                      <nav className="flex flex-wrap items-center gap-1.5" aria-label={"Paginaci\u00f3n de movimientos"}>
                        <button
                          type="button"
                          className="rounded-xl border border-outline bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-primary-mist disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={safeTransactionPage === 1}
                          onClick={() => goToTransactionPage(safeTransactionPage - 1)}
                        >
                          Anterior
                        </button>
                        {transactionPaginationItems.map((item) =>
                          typeof item === "number" ? (
                            <button
                              key={item}
                              type="button"
                              className={cn(
                                "h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold transition",
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
                            <span key={item} className="px-1 text-muted" aria-hidden="true">
                              {"\u2026"}
                            </span>
                          ),
                        )}
                        <button
                          type="button"
                          className="rounded-xl border border-outline bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-primary-mist disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={safeTransactionPage === transactionTotalPages}
                          onClick={() => goToTransactionPage(safeTransactionPage + 1)}
                        >
                          Siguiente
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
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between",
        floating
          ? "border-primary/20 bg-white/95 shadow-[0_16px_35px_rgba(38,55,34,0.14)] backdrop-blur-md"
          : "mt-3 border-primary/15 bg-primary-mist/60",
      )}
    >
      <span className="text-sm font-semibold text-primary">
        {selectedCount} {selectedCount === 1 ? "movimiento seleccionado" : "movimientos seleccionados"}
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
          onClick={onExclude}
        >
          <EyeOffIcon className="h-4 w-4" />
          {"Omitir del an\u00e1lisis"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-outline bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-primary/35"
          onClick={onInclude}
        >
          <EyeIcon className="h-4 w-4" />
          {"Incluir en el an\u00e1lisis"}
        </button>
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-white hover:text-ink"
          onClick={onClear}
        >
          {"Limpiar selecci\u00f3n"}
        </button>
      </div>
    </div>
  );
}

type CompactMetricProps = {
  label: string;
  value: string;
  tone?: "income" | "expense" | "neutral";
};

function CompactMetric({ label, value, tone = "neutral" }: CompactMetricProps) {
  const toneClass =
    tone === "income"
      ? "border-primary/15 bg-primary-mist/50 text-primary"
      : tone === "expense"
        ? "border-danger/15 bg-danger-soft/55 text-danger"
        : "border-outline bg-paper-soft/70 text-ink";

  return (
    <div className={cn("min-w-0 rounded-2xl border px-3 py-3", toneClass)}>
      <p className="min-h-8 text-[0.7rem] font-semibold uppercase leading-4 tracking-[0.08em] opacity-75">
        {label}
      </p>
      <strong className="mt-1 block truncate text-lg font-semibold tracking-[-0.03em]" title={value}>
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
  selectAllLabel?: string;
};

function CheckboxFilterGroup({
  title,
  options,
  selected,
  onChange,
  selectAllLabel,
}: CheckboxFilterGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const allOptionsSelected =
    options.length > 0 && options.every((option) => selected.has(option.value));

  const toggleOption = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const toggleAllOptions = () => {
    onChange(
      allOptionsSelected
        ? new Set()
        : new Set(options.map((option) => option.value)),
    );
  };

  return (
    <div className="border-t border-outline pt-2">
      <button
        type="button"
        className="group flex w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-paper-soft"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {allOptionsSelected
              ? "Todos seleccionados"
              : selected.size === 0
              ? "Sin filtro"
              : `${selected.size} ${selected.size === 1 ? "filtro activo" : "filtros activos"}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-muted">
            {selected.size === 0 || allOptionsSelected ? "Todos" : selected.size}
          </span>
          <ChevronDownIcon
            className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180 text-primary")}
          />
        </span>
      </button>
      {isOpen ? (
        <div id={contentId} className="mt-1 space-y-1">
        {selectAllLabel ? (
          <div className="mb-1 border-b border-outline pb-1">
            <CheckboxRow
              checked={allOptionsSelected}
              label={selectAllLabel}
              helper={allOptionsSelected ? "Limpiar la selecci\u00f3n completa" : "Seleccionar la lista completa"}
              onChange={toggleAllOptions}
            />
          </div>
        ) : null}
        {options.map((option) => (
          <CheckboxRow
            key={option.value}
            checked={selected.has(option.value)}
            label={option.label}
            helper={option.helper}
            onChange={() => toggleOption(option.value)}
          />
        ))}
        </div>
      ) : null}
    </div>
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
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition hover:bg-paper-soft">
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
        {helper ? <span className="block truncate text-xs text-muted">{helper}</span> : null}
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
