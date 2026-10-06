import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BalanceIcon,
  BankIcon,
  Button,
  CalendarIcon,
  ChevronDownIcon,
  EChart,
  EmptyState,
  ErrorState,
  HouseIcon,
  InstitutionLogo,
  InvestmentIcon,
  LightningIcon,
  LoadingState,
  MoneyIcon,
  PageIntro,
  Panel,
  PlusIcon,
  ReceiptIcon,
  StatCard,
} from "../components";
import { useDashboard, useFormatCurrency } from "../hooks";
import {
  createCategoryMap,
  getCategoryPath,
  getRootCategory,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import {
  CurrencyCode,
  InstitutionCode,
  InstitutionLabels,
  InstitutionOptions,
} from "../types";
import type { Account, AccountCreate, Category, Transaction } from "../types";

type DashboardSupportState = {
  transactions: Transaction[];
  periodTransactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  loading: boolean;
  error: string | null;
};

type MovementFilter = "all" | "income" | "expense";

const movementIcons = [HouseIcon, MoneyIcon, LightningIcon];
const expenseChartColors = ["#344b2e", "#6e875f", "#a8b89a", "#d5b98f", "#d77b68"];
const TRANSACTION_PAGE_SIZE = 1000;
const accountTypeOptions = [
  { value: "credito", label: "Tarjeta de credito" },
  { value: "corriente", label: "Cuenta corriente" },
  { value: "vista", label: "Cuenta vista" },
  { value: "ahorro", label: "Cuenta de ahorro" },
  { value: "prepago", label: "Tarjeta de prepago" },
  { value: "billetera_digital", label: "Billetera digital" },
];
const accountTypeLabels = Object.fromEntries(
  accountTypeOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;
const periodFormatter = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatPeriod(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const validPeriod =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12;
  const date = validPeriod
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date();
  const label = periodFormatter.format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatChartMonth(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}

function getPeriodDateRange(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    date_from: `${periodMonth}-01`,
    date_to: `${periodMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getPeriodDays(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${periodMonth}-${day}`;
  });
}

function getTrendDirection(trend: string) {
  if (trend.startsWith("Subio")) return "up";
  if (trend.startsWith("Bajo")) return "down";
  return "neutral";
}

function getTrendTone(trend: string, cardIndex: number) {
  const direction = getTrendDirection(trend);
  if (direction === "neutral") return "neutral";

  const isExpenseCard = cardIndex === 2;
  if (isExpenseCard) {
    return direction === "down" ? "positive" : "negative";
  }

  return direction === "up" ? "positive" : "negative";
}

const calendarWeekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];

function getCalendarOffset(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

function getHeatmapColor(value: number, max: number) {
  if (value <= 0 || max <= 0) return "#f2eee3";

  const intensity = Math.min(value / max, 1);
  if (intensity < 0.25) return "#eadfc9";
  if (intensity < 0.5) return "#d8bd8e";
  if (intensity < 0.75) return "#d77b68";
  return "#9f493d";
}

async function loadPeriodTransactions(periodMonth: string) {
  const transactions: Transaction[] = [];
  const dateRange = getPeriodDateRange(periodMonth);
  let offset = 0;

  while (true) {
    const page = await TransactionService.getTransactions({
      ...dateRange,
      limit: TRANSACTION_PAGE_SIZE,
      offset,
    });
    transactions.push(...page);

    if (page.length < TRANSACTION_PAGE_SIZE) {
      return transactions;
    }

    offset += TRANSACTION_PAGE_SIZE;
  }
}

type NewAccountForm = {
  account_type: string;
  account_last4: string;
  currency: CurrencyCode;
  institution: InstitutionCode;
  name: string;
};

type CreateAccountModalProps = {
  error: string | null;
  form: NewAccountForm;
  onChange: (field: keyof NewAccountForm, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
};

function CreateAccountModal({
  error,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
}: CreateAccountModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8 backdrop-blur-sm">
      <div className="surface-card w-full max-w-4xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow m-0">Nueva Tarjeta</p>
            <h2 className="text-4xl font-medium tracking-[-0.04em] text-ink">
              Agregar cuenta o tarjeta
            </h2>
            <p className="max-w-2xl text-muted">
              Completa los datos principales y revisa al lado como se vera esta tarjeta en el dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-outline bg-white px-3 py-2 text-sm text-muted transition hover:text-ink"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.1fr)] lg:items-center">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-ink">Nombre visible</span>
              <input
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Ej: Visa Signature"
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Institucion</span>
              <select
                value={form.institution}
                onChange={(event) => onChange("institution", event.target.value)}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              >
                {InstitutionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Tipo</span>
              <select
                value={form.account_type}
                onChange={(event) => onChange("account_type", event.target.value)}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              >
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Ultimos 4 digitos</span>
              <input
                value={form.account_last4}
                onChange={(event) => onChange("account_last4", event.target.value)}
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-ink">Moneda</span>
              <input
                value={form.currency}
                disabled
                className="w-full rounded-2xl border border-outline bg-paper-soft px-4 py-3 text-muted outline-none"
              />
            </label>
          </div>

          <div className="flex items-center lg:min-h-full">
            <article className="relative w-full overflow-hidden rounded-[2rem] border border-[#d5d2c7] bg-[linear-gradient(135deg,#f8f5ec_0%,#efe6d5_42%,#d5c09f_100%)] p-6 shadow-[0_28px_70px_rgba(60,47,31,0.18)] md:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(82,57,24,0.14),transparent_30%)]" />
              <div className="absolute right-6 top-6 h-16 w-16 rounded-full border border-white/45 bg-white/20 blur-[1px]" />
              <div className="absolute right-12 top-10 h-16 w-16 rounded-full border border-white/35 bg-white/10" />

              <div className="relative flex min-h-[230px] flex-col justify-between md:min-h-[245px]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/65 text-primary shadow-sm">
                      <BankIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/55">
                        {InstitutionLabels[form.institution]}
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink md:text-[2rem]">
                        {form.name.trim() || "Tu nueva tarjeta"}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink/70">
                    {accountTypeLabels[form.account_type] ?? form.account_type}
                  </span>
                </div>

                <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                      Identificador
                    </p>
                    <p className="text-2xl font-medium tracking-[0.22em] text-ink md:text-[1.75rem]">
                      {form.account_last4
                        ? `â€¢â€¢â€¢â€¢ ${form.account_last4}`
                        : "â€¢â€¢â€¢â€¢ â€¢â€¢â€¢â€¢"}
                    </p>
                  </div>

                  <div className="space-y-2 text-left md:text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                      Moneda
                    </p>
                    <p className="text-lg font-semibold tracking-[0.08em] text-primary">
                      {form.currency}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            <PlusIcon className="h-5 w-5" />
            {saving ? "Guardando..." : "Agregar tarjeta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>();
  const { data, loading, error } = useDashboard(selectedPeriod);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState<NewAccountForm>({
    account_type: "credito",
    account_last4: "",
    currency: CurrencyCode.CLP,
    institution: InstitutionCode.BANCO_DE_CHILE,
    name: "",
  });
  const [support, setSupport] = useState<DashboardSupportState>({
    transactions: [],
    periodTransactions: [],
    accounts: [],
    categories: [],
    loading: true,
    error: null,
  });
  const formatCurrency = useFormatCurrency();
  const dashboardPeriod = formatPeriod(data?.period_month ?? getCurrentPeriodMonth());

  useEffect(() => {
    let isMounted = true;

    async function loadSupportData() {
      setSupport((current) => ({
        ...current,
        loading: true,
        error: null,
      }));

      try {
        const periodMonth = data?.period_month ?? getCurrentPeriodMonth();
        const [periodTransactions, accounts, categories] = await Promise.all([
          loadPeriodTransactions(periodMonth),
          AccountService.getAccounts(),
          CategoryService.getCategories(),
        ]);

        if (isMounted) {
          setSupport({
            transactions: periodTransactions,
            periodTransactions,
            accounts,
            categories,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (isMounted) {
          setSupport((current) => ({
            ...current,
            loading: false,
            error:
              err instanceof Error
                ? err.message
                : "No se pudo completar el resumen complementario.",
          }));
        }
      }
    }

    void loadSupportData();

    return () => {
      isMounted = false;
    };
  }, [data?.period_month]);

  const updateNewAccountField = (field: keyof NewAccountForm, value: string) => {
    setNewAccountForm((current) => ({
      ...current,
      [field]:
        field === "account_last4"
          ? value.replace(/\D/g, "").slice(0, 4)
          : field === "institution"
            ? (value as InstitutionCode)
            : value,
    }));
  };

  const resetNewAccountForm = () => {
    setNewAccountForm({
      account_type: "credito",
      account_last4: "",
      currency: CurrencyCode.CLP,
      institution: InstitutionCode.BANCO_DE_CHILE,
      name: "",
    });
    setCreateAccountError(null);
  };

  const openCreateAccountModal = () => {
    resetNewAccountForm();
    setIsCreateAccountOpen(true);
  };

  const closeCreateAccountModal = () => {
    if (isSavingAccount) {
      return;
    }

    setIsCreateAccountOpen(false);
    setCreateAccountError(null);
  };

  const handleCreateAccount = async () => {
    if (!newAccountForm.name.trim()) {
      setCreateAccountError("Completa al menos el nombre visible de la tarjeta.");
      return;
    }

    if (newAccountForm.account_last4 && newAccountForm.account_last4.length !== 4) {
      setCreateAccountError("Los ultimos 4 digitos deben tener exactamente 4 numeros.");
      return;
    }

    setIsSavingAccount(true);
    setCreateAccountError(null);

    try {
      const payload: AccountCreate = {
        name: newAccountForm.name.trim(),
        institution: newAccountForm.institution,
        account_type: newAccountForm.account_type,
        account_last4: newAccountForm.account_last4 || null,
        currency: newAccountForm.currency,
      };

      const createdAccount = await AccountService.createAccount(payload);

      setSupport((current) => ({
        ...current,
        accounts: [createdAccount, ...current.accounts],
      }));
      setIsCreateAccountOpen(false);
      resetNewAccountForm();
    } catch (err) {
      setCreateAccountError(
        err instanceof Error ? err.message : "No fue posible crear la cuenta.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  const categoryMap = useMemo(
    () => createCategoryMap(support.categories),
    [support.categories],
  );
  const categoryTypeMap = useMemo(
    () => new Map(support.categories.map((category) => [category.id, category.type])),
    [support.categories],
  );

  const expenseBreakdown = useMemo(() => {
    const totals = new Map<string, number>();

    support.periodTransactions
      .filter(
        (transaction) =>
          transaction.transaction_type === "expense" &&
          categoryTypeMap.get(transaction.category_id ?? -1) !== "transfer",
      )
      .forEach((transaction) => {
        const category = categoryMap.get(transaction.category_id ?? -1);
        const key = getRootCategory(category, categoryMap)?.name ?? "Sin categoria";
        totals.set(key, (totals.get(key) ?? 0) + Math.abs(transaction.amount_clp));
      });

    return [...totals.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5);
  }, [categoryMap, categoryTypeMap, support.periodTransactions]);

  const investmentGains = useMemo(() => {
    const investmentCategoryIds = new Set(
      support.categories
        .filter((category) => category.name.trim().toLowerCase() === "inversiones")
        .map((category) => category.id),
    );

    const transactions = support.periodTransactions.filter(
      (transaction) =>
        transaction.transaction_type === "income" &&
        transaction.category_id !== null &&
        investmentCategoryIds.has(transaction.category_id),
    );

    return {
      total: transactions.reduce((sum, transaction) => sum + transaction.amount_clp, 0),
      count: transactions.length,
    };
  }, [support.categories, support.periodTransactions]);

  const dailyExpenseHeatmap = useMemo(() => {
    const periodMonth = data?.period_month ?? getCurrentPeriodMonth();
    const totals = new Map<string, number>();

    support.periodTransactions
      .filter(
        (transaction) =>
          transaction.transaction_type === "expense" &&
          categoryTypeMap.get(transaction.category_id ?? -1) !== "transfer",
      )
      .forEach((transaction) => {
        const dateKey = transaction.date.slice(0, 10);
        totals.set(dateKey, (totals.get(dateKey) ?? 0) + Math.abs(transaction.amount_clp));
      });

    const days = getPeriodDays(periodMonth);
    const values = days.map((day) => ({
      date: day,
      day: Number(day.slice(-2)),
      value: totals.get(day) ?? 0,
      isBlank: false,
    }));
    const firstDayOffset = days[0] ? getCalendarOffset(days[0]) : 0;
    const leadingCells = Array.from({ length: firstDayOffset }, (_, index) => ({
      date: `blank-${index}`,
      day: null,
      value: 0,
      isBlank: true,
    }));
    const max = Math.max(...values.map((item) => item.value), 0);

    return {
      cells: [...leadingCells, ...values],
      max,
      periodMonth,
    };
  }, [categoryTypeMap, data?.period_month, support.periodTransactions]);

  const topTransactions = useMemo(
    () =>
      support.transactions
        .filter(
          (transaction) =>
            !transaction.is_internal_transfer &&
            (movementFilter === "all" ||
              transaction.transaction_type === movementFilter),
        )
        .sort(
          (left, right) =>
            Math.abs(right.amount_clp) - Math.abs(left.amount_clp),
        )
        .slice(0, 5),
    [movementFilter, support.transactions],
  );

  const monthlyEvolutionOption = useMemo(() => {
    const months =
      data?.monthly_movements.map((item) => formatChartMonth(item.month)) ?? [];
    const incomes = data?.monthly_movements.map((item) => item.income) ?? [];
    const expenses =
      data?.monthly_movements.map((item) => Math.abs(item.expenses)) ?? [];

    return {
      animationDuration: 700,
      color: ["#4f7a45", "#d66c5c"],
      grid: {
        top: 56,
        right: 16,
        bottom: 8,
        left: 12,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis" as const,
        axisPointer: {
          type: "line" as const,
          lineStyle: {
            color: "#b8b4a8",
            type: "dashed" as const,
          },
        },
        backgroundColor: "#fffdf9",
        borderColor: "#d9d6cc",
        borderWidth: 1,
        textStyle: {
          color: "#1b1c17",
          fontFamily: "Geist, Aptos, Segoe UI, sans-serif",
        },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params];
          const normalized = items as Array<{
            axisValueLabel?: string;
            seriesName?: string;
            value?: number;
          }>;

          return [
            `<strong>${normalized[0]?.axisValueLabel ?? ""}</strong>`,
            ...normalized.map(
              (item) =>
                `${item.seriesName ?? ""}: ${formatCurrency(Number(item.value ?? 0))}`,
            ),
          ].join("<br/>");
        },
      },
      legend: {
        top: 4,
        right: 4,
        itemWidth: 18,
        itemHeight: 8,
        textStyle: {
          color: "#5f645b",
          fontSize: 14,
          fontFamily: "Geist, Aptos, Segoe UI, sans-serif",
        },
      },
      xAxis: {
        type: "category" as const,
        data: months,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d9d6cc" } },
        axisLabel: {
          color: "#5f645b",
          margin: 16,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: "value" as const,
        splitLine: { lineStyle: { color: "#ece8de" } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#5f645b",
          formatter: (value: number) => formatCurrency(value),
        },
      },
      series: [
        {
          name: "Ingresos",
          type: "line" as const,
          data: incomes,
          smooth: 0.32,
          symbol: "circle",
          symbolSize: 7,
          showSymbol: false,
          lineStyle: { width: 3 },
          itemStyle: {
            borderColor: "#fffdf9",
            borderWidth: 2,
          },
          areaStyle: {
            opacity: 0.12,
          },
          emphasis: {
            focus: "series" as const,
            scale: 1.4,
          },
        },
        {
          name: "Gastos",
          type: "line" as const,
          data: expenses,
          smooth: 0.32,
          symbol: "circle",
          symbolSize: 7,
          showSymbol: false,
          lineStyle: { width: 3 },
          itemStyle: {
            borderColor: "#fffdf9",
            borderWidth: 2,
          },
          areaStyle: {
            opacity: 0.1,
          },
          emphasis: {
            focus: "series" as const,
            scale: 1.4,
          },
        },
      ],
    };
  }, [data, formatCurrency]);

  const expenseBreakdownOption = useMemo(() => {
    const total = expenseBreakdown.reduce((sum, [, value]) => sum + value, 0);
    const chartData = expenseBreakdown.map(([name, value], index) => ({
      name,
      value,
      itemStyle: {
        color: expenseChartColors[index % expenseChartColors.length],
      },
    }));

    return {
      animationDuration: 650,
      tooltip: {
        trigger: "item" as const,
        backgroundColor: "#fffdf9",
        borderColor: "#d9d6cc",
        borderWidth: 1,
        textStyle: {
          color: "#1b1c17",
          fontFamily: "Geist, Aptos, Segoe UI, sans-serif",
        },
        formatter: (params: unknown) => {
          const item = params as {
            name?: string;
            value?: number;
            percent?: number;
          };
          return `<strong>${item.name ?? ""}</strong><br/>${formatCurrency(
            Number(item.value ?? 0),
          )} · ${Number(item.percent ?? 0).toFixed(1)}%`;
        },
      },
      series: [
        {
          name: "Gastos",
          type: "pie" as const,
          radius: ["56%", "78%"],
          center: ["50%", "48%"],
          avoidLabelOverlap: true,
          padAngle: 3,
          itemStyle: {
            borderColor: "#fffdf9",
            borderWidth: 3,
            borderRadius: 8,
          },
          label: {
            show: false,
          },
          emphasis: {
            scaleSize: 6,
            label: {
              show: true,
              position: "center" as const,
              fontSize: 14,
              fontWeight: "bold" as const,
              color: "#1b1c17",
              formatter: (params: { name?: string; percent?: number }) =>
                `${params.name ?? ""}\n${Number(params.percent ?? 0).toFixed(0)}%`,
            },
          },
          data: chartData,
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "42%",
          style: {
            text: "Total",
            fill: "#5f645b",
            fontSize: 13,
            fontFamily: "Geist, Aptos, Segoe UI, sans-serif",
            textAlign: "center",
          },
        },
        {
          type: "text",
          left: "center",
          top: "51%",
          style: {
            text: formatCurrency(total),
            fill: "#1b1c17",
            fontSize: 18,
            fontWeight: 600,
            fontFamily: "Geist, Aptos, Segoe UI, sans-serif",
            textAlign: "center",
          },
        },
      ],
    };
  }, [expenseBreakdown, formatCurrency]);

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Dashboard"
        title="Dashboard"
        period={
          data && data.available_periods.length > 0 ? (
            <label className="relative inline-flex items-center">
              <span className="sr-only">Seleccionar periodo del dashboard</span>
              <select
                value={selectedPeriod ?? data.period_month}
                onChange={(event) => {
                  setMovementFilter("all");
                  setSelectedPeriod(event.target.value);
                }}
                className="appearance-none bg-transparent pl-1 pr-8 text-lg font-medium text-primary outline-none md:text-[1.75rem]"
              >
                {data.available_periods.map((period) => (
                  <option key={period} value={period}>
                    {formatPeriod(period)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-1 h-4 w-4 text-primary" />
            </label>
          ) : (
            dashboardPeriod
          )
        }
      />

      {loading ? <LoadingState message="Cargando dashboard..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {support.error ? <ErrorState message={support.error} /> : null}

      {data ? (
        <>
          <section className="grid items-stretch gap-4 lg:grid-cols-3">
            {data.cards.slice(0, 3).map((card, index) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                helper={card.trend}
                helperIcon={
                  getTrendDirection(card.trend) === "up" ? (
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  ) : getTrendDirection(card.trend) === "down" ? (
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  ) : null
                }
                helperTone={getTrendTone(card.trend, index)}
                tone={index === 1 ? "income" : index === 2 ? "expense" : "neutral"}
                icon={
                  index === 0 ? (
                    <BalanceIcon className="h-5 w-5" />
                  ) : index === 1 ? (
                    <MoneyIcon className="h-5 w-5" />
                  ) : (
                    <ReceiptIcon className="h-5 w-5" />
                  )
                }
              />
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_340px]">
            <Panel>
              <div className="space-y-2">
                <h2 className="text-5xl font-medium tracking-[-0.05em]">
                  Evolucion Mensual
                </h2>
                <p className="text-muted">
                  Comparacion neta de ingresos y gastos sin transferencias internas.
                </p>
              </div>
              <EChart className="mt-8 h-[360px] w-full" option={monthlyEvolutionOption} />
            </Panel>

            <Panel className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-4xl font-medium tracking-[-0.04em]">
                  Gastos por Categoria
                </h2>
                <p className="text-sm text-muted">
                  {dashboardPeriod} · sin transferencias internas
                </p>
              </div>
              {expenseBreakdown.length > 0 ? (
                <div className="space-y-5">
                  <EChart className="h-[230px] w-full" option={expenseBreakdownOption} />
                  <div className="space-y-3">
                    {expenseBreakdown.map(([label, value], index) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                expenseChartColors[index % expenseChartColors.length],
                            }}
                          />
                          <span className="truncate text-sm text-muted">{label}</span>
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {formatCurrency(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Sin gastos recientes"
                  description="Cuando existan egresos categorizados, este bloque mostrara su distribucion."
                />
              )}
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Panel className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary-mist text-primary shadow-sm">
                <InvestmentIcon className="h-9 w-9" />
              </span>
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
                  Ganancias por inversion
                </p>
                <strong className="block text-5xl font-semibold tracking-[-0.05em] text-ink">
                  {formatCurrency(investmentGains.total)}
                </strong>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-primary-mist px-3 py-1.5 text-sm font-semibold text-primary">
                  {investmentGains.count} movimientos
                </span>
                <span className="rounded-full bg-paper-soft px-3 py-1.5 text-sm font-semibold text-muted">
                  {dashboardPeriod}
                </span>
              </div>
            </Panel>

            <Panel className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                    <CalendarIcon className="h-5 w-5" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-4xl font-medium tracking-[-0.04em]">
                      Gasto diario
                    </h2>
                    <p className="text-sm text-muted">
                      Intensidad de egresos en {dashboardPeriod}
                    </p>
                  </div>
                </div>
                <p className="rounded-full bg-danger-soft px-3 py-1.5 text-sm font-semibold text-danger">
                  Maximo diario {formatCurrency(dailyExpenseHeatmap.max)}
                </p>
              </div>
              <div className="space-y-2">
                <div className="mx-auto grid w-full max-w-[460px] grid-cols-7 gap-1.5 px-1">
                  {calendarWeekdayLabels.map((label, index) => (
                    <span
                      key={`${label}-${index}`}
                      className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mx-auto grid w-full max-w-[460px] grid-cols-7 gap-1.5">
                  {dailyExpenseHeatmap.cells.map((cell) =>
                    cell.isBlank ? (
                      <span key={cell.date} className="aspect-square rounded-lg" />
                    ) : (
                      <div
                        key={cell.date}
                        title={`${cell.date}: ${formatCurrency(cell.value)}`}
                        className="group relative flex aspect-square min-h-8 items-center justify-center rounded-lg border border-white/80 text-xs font-semibold shadow-sm transition hover:z-10 hover:scale-[1.06] hover:border-ink/20"
                        style={{
                          backgroundColor: getHeatmapColor(
                            cell.value,
                            dailyExpenseHeatmap.max,
                          ),
                          color:
                            dailyExpenseHeatmap.max > 0 &&
                            cell.value / dailyExpenseHeatmap.max >= 0.65
                              ? "#fffdf9"
                              : "#1b1c17",
                        }}
                      >
                        {cell.day}
                        <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max -translate-x-1/2 rounded-xl border border-outline bg-white px-3 py-2 text-left text-xs font-semibold text-ink shadow-paper group-hover:block">
                          <span className="block text-muted">{cell.date}</span>
                          <span>{formatCurrency(cell.value)}</span>
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(360px,1.1fr)_minmax(0,0.9fr)]">
            <Panel className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="text-4xl font-medium tracking-[-0.04em]">Cuentas Activas</h2>
                  <p className="text-muted">
                    Tus cuentas principales quedan al centro del dashboard para revisar saldo y contexto rapido.
                  </p>
                </div>
                <Button className="shrink-0" onClick={openCreateAccountModal}>
                  <PlusIcon className="h-6 w-6" />
                  Agregar tarjeta
                </Button>
              </div>

              {support.accounts.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {support.accounts.slice(0, 4).map((account) => (
                    <Link
                      key={account.id}
                      to={`/app/accounts?account_id=${account.id}`}
                      aria-label={`Ver detalle de ${account.name}`}
                      className="surface-card-soft flex min-h-[220px] flex-col justify-between p-6 transition hover:-translate-y-1 hover:border-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <InstitutionLogo institution={account.institution} />
                        <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary">
                          {account.account_type}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <p className="text-base font-medium uppercase tracking-[0.08em] text-muted">
                          {InstitutionLabels[account.institution]}
                        </p>
                        <p className="text-3xl font-semibold tracking-[-0.04em]">
                          {account.name}
                        </p>
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm text-muted">
                            {account.account_last4
                              ? `Terminada en ${account.account_last4}`
                              : `Cuenta #${account.id}`}
                          </p>
                          <p className="text-sm font-medium text-primary">{account.currency}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No hay cuentas activas"
                  description="Agrega una cuenta para verla destacada aqui y usarla durante la importacion de cartolas."
                />
              )}
            </Panel>

            <Panel className="flex h-full flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-4xl font-medium tracking-[-0.04em]">
                    Top 5 Movimientos
                  </h2>
                  <p className="text-sm text-muted">Mayores montos del periodo visible</p>
                </div>
                <div
                  className="inline-flex shrink-0 self-start rounded-full border border-outline bg-paper-soft p-1 text-sm"
                  aria-label="Filtrar movimientos"
                >
                  {[
                    { value: "all", label: "Todos" },
                    { value: "income", label: "Ingresos" },
                    { value: "expense", label: "Egresos" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMovementFilter(option.value as MovementFilter)}
                      aria-pressed={movementFilter === option.value}
                      className={
                        movementFilter === option.value
                          ? "rounded-full bg-white px-3 py-1.5 font-medium text-ink shadow-sm"
                          : "rounded-full px-3 py-1.5 text-muted transition hover:text-ink"
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {support.loading ? (
                <LoadingState message="Preparando movimientos..." />
              ) : topTransactions.length > 0 ? (
                <div className="space-y-2">
                  {topTransactions.map((transaction, index) => {
                    const Icon = movementIcons[index % movementIcons.length];

                    return (
                      <article
                        key={transaction.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-transparent px-3 py-4 transition hover:border-outline hover:bg-paper-soft/60"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-soft text-muted">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xl font-medium tracking-[-0.02em]">
                            {transaction.description}
                          </p>
                          <p className="truncate text-sm font-medium text-muted">
                            {getCategoryPath(transaction.category_id, categoryMap)}{" "}
                            |{" "}
                            {parseLocalDate(transaction.date).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </p>
                        </div>
                        <p
                          className={
                            transaction.amount_clp >= 0
                              ? "shrink-0 text-right text-xl font-semibold text-primary"
                              : "shrink-0 text-right text-xl font-semibold text-ink"
                          }
                        >
                          {formatCurrency(transaction.amount_clp)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No hay movimientos recientes"
                  description="Cargando transacciones reales podras destacar aqui tus ultimos cargos y abonos."
                />
              )}
            </Panel>
          </section>
        </>
      ) : null}

      {isCreateAccountOpen ? (
        <CreateAccountModal
          error={createAccountError}
          form={newAccountForm}
          onChange={updateNewAccountField}
          onClose={closeCreateAccountModal}
          onSubmit={() => void handleCreateAccount()}
          saving={isSavingAccount}
        />
      ) : null}
    </div>
  );
}

