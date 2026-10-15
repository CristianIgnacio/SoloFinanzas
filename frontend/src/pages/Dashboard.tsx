import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AccountFormModal,
  AccountVisualCard,
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
  InvestmentIcon,
  LightningIcon,
  LoadingState,
  LockIcon,
  WalletIcon,
  MoneyIcon,
  PageIntro,
  Panel,
  PlusIcon,
  ReceiptIcon,
  StatCard,
} from "../components";
import { useDashboard, useFormatCurrency } from "../hooks";
import { accountProductName, useAccountProducts } from "../hooks/useAccountProducts";
import {
  createCategoryMap,
  getCategoryPath,
  getRootCategory,
  parseLocalDate,
} from "../lib";
import { AccountService, CategoryService, ProfileService, TransactionService } from "../services";
import {
  CurrencyCode,
  InstitutionCode,
} from "../types";
import type { Account, AccountCreate, CashAccount, CashBalance, Category, Transaction, UserProfile } from "../types";
import type { AccountFormValues } from "../components/AccountFormModal";

type DashboardSupportState = {
  transactions: Transaction[];
  periodTransactions: Transaction[];
  accounts: Account[];
  cashAccount: CashAccount | null;
  cashBalance: CashBalance | null;
  profile: UserProfile | null;
  categories: Category[];
  loading: boolean;
  error: string | null;
};

type MovementFilter = "all" | "income" | "expense";

const movementIcons = [HouseIcon, MoneyIcon, LightningIcon];
const expenseChartColors = ["#344b2e", "#6e875f", "#a8b89a", "#d5b98f", "#d77b68", "#8a9387"];
const TRANSACTION_PAGE_SIZE = 1000;
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

const compactAxisFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

function formatCompactAxisCurrency(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${compactAxisFormatter.format(value / 1_000_000)}M`;
  if (absolute >= 1_000) return `$${compactAxisFormatter.format(value / 1_000)}k`;
  return `$${compactAxisFormatter.format(value)}`;
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

function FirstAccountWelcome({ onCreateAccount, onStartCash, startingCash, cashError }: {
  onCreateAccount: () => void;
  onStartCash: () => void;
  startingCash: boolean;
  cashError: string | null;
}) {
  return (
    <Panel className="overflow-hidden p-0 md:p-0">
      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="relative isolate overflow-hidden bg-primary px-5 py-7 text-white sm:px-10 sm:py-12 lg:px-12 lg:py-14">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full border border-white/15 bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-6 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]">
            <BankIcon className="h-4 w-4" /> Primer paso
          </span>
          <h2 className="mt-6 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.045em] sm:mt-8 sm:text-5xl">
            Empieza a tu manera
          </h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/80 sm:text-lg">
            Agrega una cuenta bancaria para importar cartolas, o empieza registrando tus movimientos en Efectivo.
          </p>
          <button
            type="button"
            onClick={onCreateAccount}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-primary shadow-sm transition hover:bg-primary-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <PlusIcon className="h-4 w-4" /> Agregar cuenta bancaria
          </button>
          <button type="button" disabled={startingCash} onClick={onStartCash}
            className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <WalletIcon className="h-4 w-4" /> {startingCash ? "Preparando Efectivo..." : "Empezar con efectivo"}
          </button>
          {cashError ? <p role="alert" className="mt-3 text-sm text-white">{cashError}</p> : null}
          <p className="mt-6 flex max-w-lg items-start gap-2 text-sm leading-6 text-white/75">
            <LockIcon className="mt-1 h-4 w-4 shrink-0" />
            No conectamos tu banco ni pedimos claves. Solo usas las cartolas que decides importar.
          </p>
        </div>

        <div className="flex flex-col justify-center bg-paper-soft/60 px-5 py-7 sm:px-10 sm:py-10 lg:px-12">
          <p className="eyebrow m-0">Elige un camino</p>
          <div className="mt-7 space-y-6">
            <div className="grid grid-cols-[auto_1fr] gap-4 border-b border-outline/80 pb-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-mist text-primary"><BankIcon className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Cuenta bancaria</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Importa una cartola</h3>
                <p className="mt-2 text-sm leading-6 text-muted">Elige tu institución y producto. Al guardar, irás a importar tus movimientos.</p>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-primary"><WalletIcon className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Efectivo</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Registra a mano</h3>
                <p className="mt-2 text-sm leading-6 text-muted">Anota un ingreso o gasto, o configura tu saldo inicial.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<string>();
  const [uncategorizedSummary, setUncategorizedSummary] = useState<{ period: string; total: number } | null>(null);
  const { data, loading, error } = useDashboard(selectedPeriod);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string | null>(null);
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [startingCash, setStartingCash] = useState(false);
  const [cashStartError, setCashStartError] = useState<string | null>(null);
  const [newAccountForm, setNewAccountForm] = useState<AccountFormValues>({
    account_type: "",
    account_last4: "",
    currency: CurrencyCode.CLP,
    institution: InstitutionCode.BANCO_DE_CHILE,
    name: "",
    product_code: "",
  });
  const [support, setSupport] = useState<DashboardSupportState>({
    transactions: [],
    periodTransactions: [],
    accounts: [],
    cashAccount: null,
    cashBalance: null,
    profile: null,
    categories: [],
    loading: true,
    error: null,
  });
  const formatCurrency = useFormatCurrency();
  const { products } = useAccountProducts();
  const dashboardPeriod = formatPeriod(data?.period_month ?? getCurrentPeriodMonth());
  const showFirstAccountWelcome =
    !support.loading && !support.error && support.accounts.length === 0 && support.profile?.onboarding_choice == null;

  useEffect(() => {
    const period = data?.period_month;
    if (!period) return;
    let cancelled = false;
    void TransactionService.getPage({ ...getPeriodDateRange(period), uncategorized: true, limit: 1, offset: 0 })
      .then(page => { if (!cancelled) setUncategorizedSummary({ period, total: page.total }); })
      .catch(() => { if (!cancelled) setUncategorizedSummary(null); });
    return () => { cancelled = true; };
  }, [data?.period_month]);

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
        const [periodTransactions, accounts, categories, cashAccount, cashBalance, profile] = await Promise.all([
          loadPeriodTransactions(periodMonth),
          AccountService.getAccounts(),
          CategoryService.getCategories(),
          AccountService.getCashAccount(),
          AccountService.getCashBalance(),
          ProfileService.getProfile(),
        ]);

        if (isMounted) {
          setSupport({
            transactions: periodTransactions,
            periodTransactions,
            accounts,
            cashAccount,
            cashBalance,
            profile,
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

  const updateNewAccountField = (field: keyof AccountFormValues, value: string) => {
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
      account_type: "",
      account_last4: "",
      currency: CurrencyCode.CLP,
      institution: InstitutionCode.BANCO_DE_CHILE,
      name: "",
      product_code: "",
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
      setCreateAccountError("Completa el nombre visible de la cuenta.");
      return;
    }

    if (!newAccountForm.product_code) {
      setCreateAccountError("Selecciona un producto para la cuenta.");
      return;
    }

    const selectedProduct = products.find((item) => item.code === newAccountForm.product_code);
    if (newAccountForm.account_type === "credito"
      && (!selectedProduct || selectedProduct.pdf_support === "no_soportado")) {
      setCreateAccountError("Este producto de crédito aún no admite importación de estados de cuenta.");
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
        product_code: newAccountForm.product_code,
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
      navigate(`/app/import?account_id=${createdAccount.id}`);
    } catch (err) {
      setCreateAccountError(
        err instanceof Error ? err.message : "No fue posible crear la cuenta.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleStartCash = async () => {
    if (!support.cashAccount) return;
    setStartingCash(true);
    setCashStartError(null);
    try {
      await ProfileService.startWithCash();
      setSupport((current) => ({
        ...current,
        profile: current.profile ? { ...current.profile, onboarding_choice: "cash" } : null,
      }));
      navigate(`/app/accounts?account_id=${support.cashAccount.id}#cash-account`);
    } catch (err) {
      setCashStartError(err instanceof Error ? err.message : "No fue posible comenzar con Efectivo.");
    } finally {
      setStartingCash(false);
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
    const totals = new Map<string, { id: string; label: string; value: number }>();

    support.periodTransactions
      .filter(
        (transaction) =>
          transaction.transaction_type === "expense" &&
          !transaction.is_internal_transfer &&
          transaction.origin !== "cash_transfer" &&
          categoryTypeMap.get(transaction.category_id ?? -1) !== "transfer",
      )
      .forEach((transaction) => {
        const category = categoryMap.get(transaction.category_id ?? -1);
        const root = getRootCategory(category, categoryMap);
        const id = root ? `category-${root.id}` : "uncategorized";
        const previous = totals.get(id);
        totals.set(id, {
          id,
          label: root?.name ?? "Sin categoria",
          value: (previous?.value ?? 0) + Math.abs(transaction.amount_clp),
        });
      });

    const sorted = [...totals.values()].sort((left, right) => right.value - left.value);
    const top = sorted.slice(0, 5);
    const remaining = sorted.slice(5);
    return remaining.length > 0
      ? [...top, { id: "other", label: "Otras categorías", value: remaining.reduce((sum, item) => sum + item.value, 0) }]
      : top;
  }, [categoryMap, categoryTypeMap, support.periodTransactions]);
  const selectedExpense = expenseBreakdown.find((item) => item.id === selectedExpenseCategory);
  const expenseTotal = expenseBreakdown.reduce((sum, item) => sum + item.value, 0);

  const cardGains = useMemo(() => {
    const cardGainCategoryIds = new Set(
      support.categories
        .filter((category) =>
          category.name.trim().localeCompare("Ganancias tarjetas", "es", { sensitivity: "base" }) === 0,
        )
        .map((category) => category.id),
    );

    const transactions = support.periodTransactions.filter(
      (transaction) =>
        transaction.transaction_type === "income" &&
        !transaction.is_internal_transfer &&
        transaction.origin !== "cash_transfer" &&
        transaction.category_id !== null &&
        cardGainCategoryIds.has(transaction.category_id),
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
          !transaction.is_internal_transfer &&
          transaction.origin !== "cash_transfer" &&
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
            !transaction.is_internal_transfer && transaction.origin !== "cash_transfer" &&
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

    const baseOption = {
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

    return {
      baseOption,
      media: [{
        query: { maxWidth: 520 },
        option: {
          grid: { left: 4, right: 8 },
          yAxis: {
            splitNumber: 4,
            axisLabel: {
              fontSize: 12,
              margin: 6,
              formatter: formatCompactAxisCurrency,
            },
          },
        },
      }],
    };
  }, [data, formatCurrency]);

  const expenseBreakdownOption = useMemo(() => {
    const chartData = expenseBreakdown.map((item, index) => ({
      name: item.label,
      value: item.value,
      selected: item.id === selectedExpenseCategory,
      itemStyle: {
        color: expenseChartColors[index % expenseChartColors.length],
      },
    }));

    return {
      animationDuration: 650,
      tooltip: {
        show: false,
      },
      series: [
        {
          name: "Gastos",
          type: "pie" as const,
          selectedMode: "single" as const,
          selectedOffset: 5,
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
            label: { show: false },
          },
          data: chartData,
        },
      ],
    };
  }, [expenseBreakdown, selectedExpenseCategory]);

  return (
    <div className="space-y-5 sm:space-y-8">
      <PageIntro
        eyebrow={showFirstAccountWelcome ? "Primeros pasos" : "Dashboard"}
        title={showFirstAccountWelcome ? "Bienvenido a SoloFinanzas" : "Dashboard"}
        description={showFirstAccountWelcome ? "Elige cómo quieres comenzar." : undefined}
        period={
          !showFirstAccountWelcome && data && data.available_periods.length > 0 ? (
            <label className="relative inline-flex items-center">
              <span className="sr-only">Seleccionar periodo del dashboard</span>
              <select
                value={selectedPeriod ?? data.period_month}
                onChange={(event) => {
                  setMovementFilter("all");
                  setSelectedExpenseCategory(null);
                  setSelectedPeriod(event.target.value);
                }}
                className="appearance-none bg-transparent pl-1 pr-8 text-base font-medium text-primary outline-none sm:text-lg"
              >
                {data.available_periods.map((period) => (
                  <option key={period} value={period}>
                    {formatPeriod(period)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-1 h-4 w-4 text-primary" />
            </label>
          ) : !showFirstAccountWelcome ? (
            dashboardPeriod
          ) : undefined
        }
      />

      {loading ? <LoadingState message="Cargando dashboard..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {support.error ? <ErrorState message={support.error} /> : null}

      {showFirstAccountWelcome ? (
        <FirstAccountWelcome onCreateAccount={openCreateAccountModal} onStartCash={() => void handleStartCash()}
          startingCash={startingCash} cashError={cashStartError} />
      ) : null}

      {data && !support.loading && !showFirstAccountWelcome ? (
        <>
          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-stretch gap-4">
            {data.cards.slice(0, 3).map((card, index) => (
              <StatCard
                compactOnMobile
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

          {uncategorizedSummary?.period === data?.period_month && uncategorizedSummary && uncategorizedSummary.total > 0 ? (
            <Link to={`/app/transactions?month=${uncategorizedSummary.period}&category=uncategorized`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary-mist/40 px-4 py-3 text-primary transition hover:bg-primary-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{uncategorizedSummary.total} {uncategorizedSummary.total === 1 ? "movimiento por categorizar" : "movimientos por categorizar"}</span>
                <span className="block text-xs text-muted">De {dashboardPeriod}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold"><span className="hidden sm:inline">Revisar </span><span aria-hidden="true">→</span></span>
            </Link>
          ) : null}

          <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.65fr)_340px]">
            <Panel compactOnMobile className="min-w-0">
              <div className="space-y-2">
                <h2 className="section-title">
                  Evolucion Mensual
                </h2>
                <p className="text-muted">
                  Comparacion neta de ingresos y gastos
                  {/* sin transferencias internas. */}
                </p>
              </div>
              <EChart className="mt-5 h-[260px] w-full sm:mt-8 sm:h-[360px]" option={monthlyEvolutionOption} />
            </Panel>

            <Panel compactOnMobile className="min-w-0 space-y-4 sm:space-y-6">
              <div className="space-y-2">
                <h2 className="section-title">
                  Gastos por Categoria
                </h2>
                <p className="text-sm text-muted">
                  {/* {dashboardPeriod}
                  · sin transferencias internas */}
                </p>
              </div>
              {expenseBreakdown.length > 0 ? (
                <div className="space-y-5">
                  <div className="relative min-w-0">
                    <EChart
                      className="h-[220px] w-full sm:h-[230px]"
                      option={expenseBreakdownOption}
                      onItemClick={(index) => {
                        const id = expenseBreakdown[index]?.id;
                        if (id) setSelectedExpenseCategory((current) => current === id ? null : id);
                      }}
                    />
                    <div className="pointer-events-none absolute left-1/2 top-[48%] w-28 -translate-x-1/2 -translate-y-1/2 text-center leading-tight">
                      <span className="line-clamp-2 text-xs font-medium text-muted [overflow-wrap:anywhere]" title={selectedExpense?.label}>
                        {selectedExpense?.label ?? "Total"}
                      </span>
                      <strong className="mt-1 block text-sm font-semibold text-ink [overflow-wrap:anywhere] sm:text-base">
                        {formatCurrency(selectedExpense?.value ?? expenseTotal)}
                      </strong>
                      {selectedExpense ? (
                        <span className="block text-xs font-medium text-primary">
                          {expenseTotal > 0 ? (selectedExpense.value / expenseTotal * 100).toFixed(1) : "0.0"}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="sr-only" role="status" aria-live="polite">
                    {selectedExpense ? `${selectedExpense.label}: ${formatCurrency(selectedExpense.value)}, ${expenseTotal > 0 ? (selectedExpense.value / expenseTotal * 100).toFixed(1) : "0.0"}% del total` : `Total: ${formatCurrency(expenseTotal)}`}
                  </span>
                  <div className="space-y-3">
                    {expenseBreakdown.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selectedExpenseCategory === item.id}
                        onClick={() => setSelectedExpenseCategory((current) => current === item.id ? null : item.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                expenseChartColors[index % expenseChartColors.length],
                            }}
                          />
                          <span className="truncate text-sm text-muted">{item.label}</span>
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {formatCurrency(item.value)}
                        </span>
                      </button>
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

          <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Panel compactOnMobile className="metric-container flex aspect-[1.25] w-full max-w-[22rem] min-w-0 flex-col items-center justify-center gap-3 justify-self-center text-center sm:aspect-auto sm:min-h-[240px] sm:max-w-none sm:gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary-mist text-primary shadow-sm sm:h-20 sm:w-20">
                <InvestmentIcon className="h-7 w-7 sm:h-9 sm:w-9" />
              </span>
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary/80">
                  Ganancias tarjetas
                </p>
                <strong className="metric-value text-ink">
                  {formatCurrency(cardGains.total)}
                </strong>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-primary-mist px-3 py-1.5 text-sm font-semibold text-primary">
                  {cardGains.count} movimientos
                </span>
                <span className="rounded-full bg-paper-soft px-3 py-1.5 text-sm font-semibold text-muted">
                  {dashboardPeriod}
                </span>
              </div>
            </Panel>

            <Panel compactOnMobile className="min-w-0 space-y-4 sm:space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                    <CalendarIcon className="h-5 w-5" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="section-title">
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
                        className="group relative flex aspect-square min-h-0 items-center justify-center rounded-lg border border-white/80 text-xs font-semibold shadow-sm transition hover:z-10 hover:scale-[1.06] hover:border-ink/20 sm:min-h-8"
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

          <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(360px,1.1fr)_minmax(0,0.9fr)]">
            <Panel compactOnMobile className="min-w-0 space-y-4 sm:space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="section-title">Tus cuentas</h2>
                  <p className="text-sm text-muted">Las más recientes aparecen primero.</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link to="/app/accounts" className="text-sm font-semibold text-primary transition hover:underline">Ver todas</Link>
                  <Button className="px-4 py-2.5 text-sm" onClick={openCreateAccountModal}>
                    <PlusIcon className="h-4 w-4" />Agregar cuenta
                  </Button>
                </div>
              </div>

              {support.accounts.length > 0 || support.cashAccount ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {support.cashAccount ? (
                    <Link to={`/app/accounts?account_id=${support.cashAccount.id}#cash-account`}
                      aria-label="Ver detalle de Efectivo"
                      className="block min-w-0 rounded-[1.6rem] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                      <AccountVisualCard variant="cash" name={support.cashAccount.name} cashBalance={support.cashBalance?.balance_clp ?? null} compact />
                    </Link>
                  ) : null}
                  {[...support.accounts]
                    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
                    .slice(0, support.cashAccount ? 3 : 4)
                    .map((account) => (
                    <Link
                      key={account.id}
                      to={`/app/accounts?account_id=${account.id}`}
                      aria-label={`Ver detalle de ${account.name}`}
                      className="block min-w-0 rounded-[1.6rem] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    >
                      <AccountVisualCard
                        institution={account.institution}
                        accountType={account.account_type}
                        productCode={account.product_code}
                        productName={accountProductName(account, products)}
                        name={account.name}
                        accountLast4={account.account_last4}
                        currency={account.currency}
                        compact
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-outline px-5 py-8 text-center text-sm text-muted">
                  Aún no tienes cuentas. Agrega una para verla aquí.
                </p>
              )}
            </Panel>

            <Panel compactOnMobile className="flex h-full min-w-0 flex-col gap-4 sm:gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="section-title">
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
                    { value: "expense", label: "Gastos" },
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
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-2xl border border-transparent px-2 py-3 transition hover:border-outline hover:bg-paper-soft/60 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-3 sm:py-4"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-soft text-muted sm:h-12 sm:w-12">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium tracking-[-0.02em] sm:text-xl">
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
                              ? "col-start-2 max-w-full text-left text-base font-semibold text-primary [overflow-wrap:anywhere] sm:col-start-auto sm:shrink-0 sm:text-right sm:text-xl"
                              : "col-start-2 max-w-full text-left text-base font-semibold text-ink [overflow-wrap:anywhere] sm:col-start-auto sm:shrink-0 sm:text-right sm:text-xl"
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
        <AccountFormModal
          error={createAccountError}
          form={newAccountForm}
          mode="create"
          onChange={updateNewAccountField}
          onClose={closeCreateAccountModal}
          onSubmit={() => void handleCreateAccount()}
          saving={isSavingAccount}
        />
      ) : null}
    </div>
  );
}

