import { useEffect, useId, useMemo, useState } from "react";

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
const UNCATEGORIZED_KEY = "uncategorized";
const WIDGET_STORAGE_KEY = "solo-finanzas.analytics.widgets";
const WIDGET_STORAGE_VERSION = 2;

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

        const periods = Array.from(
          new Set(transactionData.map((transaction) => transaction.date.slice(0, 7))),
        );
        setAccounts(accountData);
        setCategories(categoryData);
        setTransactions(transactionData);
        setSelectedPeriods(new Set(periods));
        setSelectedAccountIds(new Set(accountData.map((account) => String(account.id))));
        setSelectedCategoryKeys(
          new Set([UNCATEGORIZED_KEY, ...categoryData.map((category) => String(category.id))]),
        );
        setSelectedTypes(new Set([TransactionType.INCOME, TransactionType.EXPENSE]));
        setSelectedScopes(new Set(["regular", "internal"]));
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

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const period = transaction.date.slice(0, 7);
        const categoryKey = transaction.category_id
          ? String(transaction.category_id)
          : UNCATEGORIZED_KEY;
        const scope = transaction.is_internal_transfer ? "internal" : "regular";
        return (
          selectedPeriods.has(period) &&
          selectedAccountIds.has(String(transaction.account_id)) &&
          selectedCategoryKeys.has(categoryKey) &&
          selectedTypes.has(transaction.transaction_type) &&
          selectedScopes.has(scope)
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

  const summary = useMemo(() => {
    const income = filteredTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.INCOME)
      .reduce((total, transaction) => total + transaction.amount_clp, 0);
    const expenses = filteredTransactions
      .filter((transaction) => transaction.transaction_type === TransactionType.EXPENSE)
      .reduce((total, transaction) => total + Math.abs(transaction.amount_clp), 0);
    const activeMonths = new Set(
      filteredTransactions.map((transaction) => transaction.date.slice(0, 7)),
    ).size;
    return {
      income,
      expenses,
      balance: income - expenses,
      averageExpenses: activeMonths > 0 ? Math.round(expenses / activeMonths) : 0,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const evolutionData = useMemo(() => {
    const totals = new Map<string, { income: number; expenses: number }>();
    [...selectedPeriods].sort().forEach((period) => {
      totals.set(period, { income: 0, expenses: 0 });
    });
    filteredTransactions.forEach((transaction) => {
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
  }, [filteredTransactions, selectedPeriods]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    filteredTransactions.forEach((transaction) => {
      const categoryName = transaction.category_id
        ? categoryMap.get(transaction.category_id)?.name ?? `Categoria #${transaction.category_id}`
        : "Sin categor\u00eda";
      totals.set(categoryName, (totals.get(categoryName) ?? 0) + Math.abs(transaction.amount_clp));
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10);
  }, [categoryMap, filteredTransactions]);

  const accountBreakdown = useMemo(() => {
    const totals = new Map<number, { income: number; expenses: number }>();
    filteredTransactions.forEach((transaction) => {
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
  }, [accountMap, filteredTransactions]);

  const descriptionBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    filteredTransactions.forEach((transaction) => {
      const label = transaction.description.trim() || "Sin descripcion";
      totals.set(label, (totals.get(label) ?? 0) + Math.abs(transaction.amount_clp));
    });
    return [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [filteredTransactions]);

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

    filteredTransactions.forEach((transaction) => {
      if (transaction.transaction_type !== TransactionType.EXPENSE) return;

      const weekday = parseLocalDate(transaction.date).getDay();
      totals.set(weekday, (totals.get(weekday) ?? 0) + Math.abs(transaction.amount_clp));
    });

    return weekdays.map(({ day, label }) => ({ label, total: totals.get(day) ?? 0 }));
  }, [filteredTransactions]);

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

  const visibleTransactions = useMemo(() => {
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

    return [...filteredTransactions]
      .sort((left, right) => {
        const leftValue = sortValue(left);
        const rightValue = sortValue(right);
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : collator.compare(String(leftValue), String(rightValue));
        const resolvedComparison = comparison === 0 ? left.id - right.id : comparison;
        return transactionSort.direction === "asc" ? resolvedComparison : -resolvedComparison;
      })
      .slice(0, 50);
  }, [accountMap, categoryMap, filteredTransactions, transactionSort]);

  const handleTransactionSort = (key: TransactionSortKey) => {
    setTransactionSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const resetFilters = () => {
    setSelectedPeriods(new Set(periodOptions.map((option) => option.value)));
    setSelectedAccountIds(new Set(accountOptions.map((option) => option.value)));
    setSelectedCategoryKeys(new Set(categoryOptions.map((option) => option.value)));
    setSelectedTypes(new Set(typeOptions.map((option) => option.value)));
    setSelectedScopes(new Set(scopeOptions.map((option) => option.value)));
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
          <Button className="whitespace-nowrap" tone="secondary" onClick={resetFilters}>
            Restablecer filtros
          </Button>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel className="space-y-6 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:overscroll-contain">
          <div>
            <p className="eyebrow m-0 text-primary">Filtros combinables</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">{"Refina el an\u00e1lisis"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Marca todas las opciones que quieras incluir.
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
          <div className="flex flex-col gap-3 rounded-3xl border border-primary/15 bg-primary-mist/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-primary">
                {filteredTransactions.length} movimiento{filteredTransactions.length === 1 ? "" : "s"} seleccionado{filteredTransactions.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {"Todos los indicadores y gr\u00e1ficos responden a los mismos checkboxes."}
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

          <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            <StatCard label="Ingresos" value={formatCurrency(summary.income)} icon={<MoneyIcon className="h-5 w-5" />} tone="income" />
            <StatCard label="Gastos" value={formatCurrency(summary.expenses)} icon={<ReceiptIcon className="h-5 w-5" />} tone="expense" />
            <StatCard label="Balance" value={formatCurrency(summary.balance)} icon={<BalanceIcon className="h-5 w-5" />} />
            <StatCard label="Gasto promedio mensual" value={formatCurrency(summary.averageExpenses)} icon={<CalendarIcon className="h-5 w-5" />} />
            <StatCard label="Movimientos" value={String(summary.count)} icon={<TrendLineIcon className="h-5 w-5" />} />
          </section>

          {filteredTransactions.length === 0 ? (
            <EmptyState
              title={"No hay resultados para esta combinaci\u00f3n"}
              description={"Selecciona al menos una opci\u00f3n en cada grupo o restablece todos los filtros."}
              action={<Button onClick={resetFilters}>Restablecer filtros</Button>}
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
                <Panel className="p-0 md:p-0">
                  <div className="flex flex-col gap-2 border-b border-outline px-5 py-5 md:px-8">
                    <h2 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">Movimientos asociados</h2>
                    <p className="text-sm text-muted">
                      Mostrando {visibleTransactions.length} de {filteredTransactions.length} movimientos filtrados.
                    </p>
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Resumen de los filtros activos
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-5">
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
                        <CompactMetric
                          label="Movimientos"
                          value={String(summary.count)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse">
                      <thead className="text-left text-sm text-muted">
                        <tr className="border-b border-outline">
                          <SortableTableHeader
                            label="Fecha"
                            sortKey="date"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            className="px-5 md:px-8"
                          />
                          <SortableTableHeader
                            label={"Descripci\u00f3n"}
                            sortKey="description"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                          />
                          <SortableTableHeader
                            label="Cuenta"
                            sortKey="account"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                          />
                          <SortableTableHeader
                            label={"Categor\u00eda"}
                            sortKey="category"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                          />
                          <SortableTableHeader
                            label="Tipo"
                            sortKey="type"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                          />
                          <SortableTableHeader
                            label="Monto"
                            sortKey="amount"
                            sort={transactionSort}
                            onSort={handleTransactionSort}
                            align="right"
                            className="px-5 md:px-8"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTransactions.map((transaction) => (
                          <tr key={transaction.id} className="border-b border-outline/60 last:border-0">
                            <td className="whitespace-nowrap px-5 py-4 text-muted md:px-8">
                              {parseLocalDate(transaction.date).toLocaleDateString("es-CL")}
                            </td>
                            <td className="max-w-[18rem] truncate px-4 py-4 font-medium" title={transaction.description}>
                              {transaction.description}
                            </td>
                            <td className="px-4 py-4 text-muted">
                              {accountMap.get(transaction.account_id)?.name ?? `Cuenta #${transaction.account_id}`}
                            </td>
                            <td className="px-4 py-4 text-muted">
                              {transaction.category_id
                                ? categoryMap.get(transaction.category_id)?.name ?? "Sin categor\u00eda"
                                : "Sin categor\u00eda"}
                            </td>
                            <td className="px-4 py-4">
                              <span className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
                                transaction.is_internal_transfer
                                  ? "bg-paper-soft text-muted"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "bg-primary-mist text-primary"
                                    : "bg-danger-soft text-danger",
                              )}>
                                {transaction.is_internal_transfer
                                  ? "Transferencia interna"
                                  : transaction.transaction_type === TransactionType.INCOME
                                    ? "Ingreso"
                                    : "Gasto"}
                              </span>
                            </td>
                            <td className={cn(
                              "whitespace-nowrap px-5 py-4 text-right font-semibold md:px-8",
                              transaction.amount_clp >= 0 ? "text-primary" : "text-danger",
                            )}>
                              {formatCurrency(transaction.amount_clp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
};

function CheckboxFilterGroup({ title, options, selected, onChange }: CheckboxFilterGroupProps) {
  const allSelected = options.length > 0 && options.every((option) => selected.has(option.value));
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  const toggleOption = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
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
            {selected.size === options.length ? "Todas las opciones" : `${selected.size} seleccionadas`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-paper-soft px-2.5 py-1 text-xs font-semibold text-muted">
            {selected.size}/{options.length}
          </span>
          <ChevronDownIcon
            className={cn("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180 text-primary")}
          />
        </span>
      </button>
      {isOpen ? (
        <div id={contentId} className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
        <CheckboxRow
          checked={allSelected}
          label="Seleccionar todo"
          onChange={() =>
            onChange(allSelected ? new Set() : new Set(options.map((option) => option.value)))
          }
          emphasized
        />
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
  emphasized?: boolean;
  onChange: () => void;
};

function CheckboxRow({ checked, label, helper, emphasized = false, onChange }: CheckboxRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition hover:bg-paper-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className={cn("block text-sm", emphasized ? "font-semibold text-primary" : "font-medium text-ink")}>
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
