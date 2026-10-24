import { AccountTablePagination } from "../components/AccountTablePagination";
import { ReportService, type AccountTotal } from '../services/reportService';
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  AccountActivitySummary,
  AccountMovementsTable,
  AccountVisualCard,
  AccountFormModal,
  CashAccountPanel,
  BankIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteStatementModal,
  EmptyState,
  EyeIcon,
  ErrorState,
  InstitutionLogo,
  LoadingState,
  PageIntro,
  Panel,
  PdfIcon,
  PlusIcon,
  PencilIcon,
  StatusNotice,
  TrashIcon,
  cn,
} from "../components";
import { useFormatCurrency } from "../hooks";
import { accountProductName, useAccountProducts } from "../hooks/useAccountProducts";
import { createCategoryMap, parseLocalDate } from "../lib";
import {
  AccountService,
  CategoryService,
  StatementService,
  TransactionService,
} from "../services";
import { CurrencyCode, InstitutionCode, InstitutionLabels, StatementStatus } from "../types";
import type { AccountCreate, AccountUpdate } from "../types";
import type { AccountFormValues } from "../components/AccountFormModal";
import type {
  Account,
  CashAccount,
  CashBalance,
  Category,
  Statement,
  StatementDeletionImpact,
  Transaction,
} from "../types";

type DetailTab = "statements" | "transactions";
const PAGE_SIZE = 50;

function createEmptyAccountForm(): AccountFormValues {
  return {
    account_type: "",
    account_last4: "",
    currency: CurrencyCode.CLP,
    institution: InstitutionCode.BANCO_DE_CHILE,
    name: "",
    product_code: "",
  };
}

function toAccountFormValues(account: Account): AccountFormValues {
  return {
    account_type: account.account_type,
    account_last4: account.account_last4 ?? "",
    currency: account.currency,
    institution: account.institution,
    name: account.name,
    product_code: account.product_code ?? "",
  };
}

function DeleteAccountModal({ account, deleting, onCancel, onConfirm }: {
  account: Account;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8 backdrop-blur-sm">
      <div className="surface-card w-full max-w-xl p-6 md:p-8">
        <div className="space-y-3">
          <p className="eyebrow m-0 text-danger">Eliminar cuenta</p>
          <h2 id="delete-account-title" className="dialog-title">¿Eliminar {account.name}?</h2>
          <p className="text-muted">Si esta cuenta tiene cartolas o movimientos asociados, el sistema protegerá esos datos y no permitirá eliminarla.</p>
        </div>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onCancel} disabled={deleting}>Cancelar</Button>
          <Button className="border-danger bg-danger text-white hover:bg-[#9d4337]" onClick={onConfirm} disabled={deleting}>
            <TrashIcon className="h-5 w-5" />{deleting ? "Eliminando..." : "Eliminar cuenta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const statusLabels: Record<StatementStatus, string> = {
  [StatementStatus.PENDING]: "Pendiente",
  [StatementStatus.PROCESSED]: "Procesada",
  [StatementStatus.FAILED]: "Con error",
};

function formatPeriod(period: string | null) {
  if (!period) return "Sin periodo";
  const [year, month] = period.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function periodIndex(period: string | null): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period ?? "");
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function periodFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function getStatementCoverage(statements: Statement[]) {
  const processed = statements.filter((statement) => statement.status === StatementStatus.PROCESSED);
  const periodIndexes = [...new Set(
    processed.map((statement) => periodIndex(statement.period_month))
      .filter((index): index is number => index !== null),
  )].sort((a, b) => a - b);
  const recordedPeriods = new Set(periodIndexes);
  const missingPeriods: string[] = [];
  if (periodIndexes.length > 1) {
    for (let index = periodIndexes[0] + 1; index < periodIndexes[periodIndexes.length - 1]; index += 1) {
      if (!recordedPeriods.has(index)) missingPeriods.push(periodFromIndex(index));
    }
  }
  const lastUploadedAt = processed.reduce<string | null>((latest, statement) =>
    !latest || statement.uploaded_at > latest ? statement.uploaded_at : latest, null);
  const failedCount = statements.filter((statement) => statement.status === StatementStatus.FAILED).length;
  const pendingCount = statements.filter((statement) => statement.status === StatementStatus.PENDING).length;
  const processedWithoutPeriod = processed.length - processed.filter((statement) => periodIndex(statement.period_month) !== null).length;
  const today = new Date();
  const lastClosedPeriodIndex = today.getFullYear() * 12 + today.getMonth() - 1;
  const isUpToDate = periodIndexes.length > 0
    && periodIndexes[periodIndexes.length - 1] >= lastClosedPeriodIndex
    && missingPeriods.length === 0
    && failedCount === 0
    && pendingCount === 0
    && processedWithoutPeriod === 0;
  return {
    latestPeriod: periodIndexes.length ? periodFromIndex(periodIndexes[periodIndexes.length - 1]) : null,
    lastClosedPeriod: periodFromIndex(lastClosedPeriodIndex),
    lastUploadedAt,
    missingPeriods,
    failedCount,
    pendingCount,
    processedWithoutPeriod,
    isUpToDate,
  };
}

export function AccountsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashAccount, setCashAccount] = useState<CashAccount | null>(null);
  const [cashBalance, setCashBalance] = useState<CashBalance | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [totals, setTotals] = useState<AccountTotal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("statements");
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadedDetailsAccountId, setLoadedDetailsAccountId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statementPendingDelete, setStatementPendingDelete] = useState<Statement | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<StatementDeletionImpact | null>(null);
  const [loadingDeletionImpact, setLoadingDeletionImpact] = useState(false);
  const [deletingStatementId, setDeletingStatementId] = useState<number | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [modalAccountId, setModalAccountId] = useState<number | null>(null);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormValues>(createEmptyAccountForm);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountPendingDelete, setAccountPendingDelete] = useState<Account | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const accountSelectorRef = useRef<HTMLDivElement>(null);
  const formatCurrency = useFormatCurrency();
  const { products } = useAccountProducts();

  useEffect(() => {
    if (searchParams.get("new_account") !== "1") return;
    setModalMode("create");
    setModalAccountId(null);
    setAccountForm(createEmptyAccountForm());
    setAccountFormError(null);
    setIsAccountModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new_account");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      try {
        const [accountData, categoryData, cashData, balanceData] = await Promise.all([
          AccountService.getAccounts(),
          CategoryService.getCategories(),
          AccountService.getCashAccount(),
          AccountService.getCashBalance(),
        ]);
        if (cancelled) return;
        setAccounts(accountData);
        setCategories(categoryData);
        setCashAccount(cashData);
        setCashBalance(balanceData);
        const requestedId = Number(searchParams.get("account_id"));
        const initial =
          accountData.find((account) => account.id === requestedId) ??
          (cashData.id === requestedId ? cashData : null) ?? accountData[0] ?? cashData;
        setSelectedAccountId(initial?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No fue posible cargar las cuentas.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || window.location.hash !== "#cash-account") return;
    const target = document.getElementById("cash-account");
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [loading]);

  useEffect(() => {
    if (selectedAccountId === null) return;
    if (selectedAccountId === cashAccount?.id) {
      setLoadedDetailsAccountId(null);
      setLoadingDetails(false);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      setLoadingDetails(true);
      setLoadedDetailsAccountId(null);
      setError(null);
      try {
        const [statementData, transactionData, accountTotals] = await Promise.all([
          StatementService.getStatements(selectedAccountId as number),
          TransactionService.getPage({account_id: selectedAccountId as number, limit: PAGE_SIZE, offset: pageOffset}),
          ReportService.accounts(),
        ]);
        if (!cancelled) {
          setStatements(statementData);
          setTransactions(transactionData.items);
          setTransactionTotal(transactionData.total);
          setTotals(accountTotals);
          setLoadedDetailsAccountId(selectedAccountId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No fue posible cargar el detalle.");
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, pageOffset, cashAccount?.id]);

  const account = accounts.find((item) => item.id === selectedAccountId) ?? null;
  const selectableAccounts: (Account | CashAccount)[] = cashAccount ? [cashAccount, ...accounts] : accounts;
  const selectedIndex = selectableAccounts.findIndex((item) => item.id === selectedAccountId);
  const categoryMap = useMemo(
    () => createCategoryMap(categories),
    [categories],
  );
  const summary = totals.find(item => item.account_id === selectedAccountId) ?? {account_id: selectedAccountId ?? 0, income: 0, expenses: 0, net: 0, count: 0};
  const detailsReady = !loadingDetails && loadedDetailsAccountId === selectedAccountId;
  const statementCoverage = getStatementCoverage(statements);

  useEffect(() => {
    if (selectedAccountId === null || !accountSelectorRef.current) return;
    const selector = accountSelectorRef.current;
    const selectedCard = selector.querySelector<HTMLElement>(`[data-account-id="${selectedAccountId}"]`);
    if (!selectedCard) return;

    const selectorRect = selector.getBoundingClientRect();
    const cardRect = selectedCard.getBoundingClientRect();
    const inset = 12;
    const delta = cardRect.left < selectorRect.left + inset
      ? cardRect.left - selectorRect.left - inset
      : cardRect.right > selectorRect.right - inset
        ? cardRect.right - selectorRect.right + inset
        : 0;

    if (delta !== 0) selector.scrollBy({ left: delta, behavior: "smooth" });
  }, [selectedAccountId]);

  const selectAccount = (accountId: number) => {
    setPageOffset(0);
    setSelectedAccountId(accountId);
    setSearchParams({ account_id: String(accountId) }, { replace: true });
  };

  const moveSelection = (direction: -1 | 1) => {
    if (selectableAccounts.length < 2 || selectedIndex < 0) return;
    const nextIndex = (selectedIndex + direction + selectableAccounts.length) % selectableAccounts.length;
    selectAccount(selectableAccounts[nextIndex].id);
  };

  const openCreateAccountModal = () => {
    setModalMode("create");
    setModalAccountId(null);
    setAccountForm(createEmptyAccountForm());
    setAccountFormError(null);
    setFeedback(null);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (selected: Account) => {
    setModalMode("edit");
    setModalAccountId(selected.id);
    setAccountForm(toAccountFormValues(selected));
    setAccountFormError(null);
    setFeedback(null);
    setIsAccountModalOpen(true);
  };

  const updateAccountFormField = (field: keyof AccountFormValues, value: string) => {
    setAccountForm((current) => ({
      ...current,
      [field]: field === "account_last4" ? value.replace(/\D/g, "").slice(0, 4)
        : field === "institution" ? value as InstitutionCode : value,
    }));
  };

  const handleSubmitAccount = async () => {
    if (!accountForm.name.trim()) {
      setAccountFormError("Completa el nombre visible de la cuenta.");
      return;
    }
    const original = accounts.find((item) => item.id === modalAccountId);
    if (!accountForm.product_code && (modalMode === "create" || accountForm.institution !== original?.institution || !accountForm.account_type)) {
      setAccountFormError("Selecciona un producto para la cuenta.");
      return;
    }
    const originalCredit = original && ["credito", "tarjeta de credito", "tarjeta de crédito"].includes(original.account_type.toLowerCase());
    const selectedProduct = products.find((item) => item.code === accountForm.product_code);
    if (accountForm.account_type === "credito" && !originalCredit
      && (!selectedProduct || selectedProduct.pdf_support === "no_soportado")) {
      setAccountFormError("Este producto de crédito aún no admite importación de estados de cuenta.");
      return;
    }
    if (accountForm.account_last4 && accountForm.account_last4.length !== 4) {
      setAccountFormError("Los últimos 4 dígitos deben tener exactamente 4 números.");
      return;
    }
    const payload: AccountCreate | AccountUpdate = {
      name: accountForm.name.trim(), institution: accountForm.institution,
      account_type: accountForm.account_type, product_code: accountForm.product_code || null,
      account_last4: accountForm.account_last4 || null, currency: accountForm.currency,
    };
    setIsSavingAccount(true);
    setAccountFormError(null);
    try {
      if (modalMode === "create") {
        const created = await AccountService.createAccount(payload);
        setAccounts((current) => [created, ...current]);
        setPageOffset(0);
        setSelectedAccountId(created.id);
        setSearchParams({ account_id: String(created.id) }, { replace: true });
        setFeedback("Cuenta creada correctamente.");
      } else if (modalAccountId !== null) {
        const updated = await AccountService.updateAccount(modalAccountId, payload);
        setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item));
        setFeedback("Cuenta actualizada correctamente.");
      }
      setIsAccountModalOpen(false);
      setModalAccountId(null);
      setAccountForm(createEmptyAccountForm());
    } catch (err) {
      setAccountFormError(err instanceof Error ? err.message : "No fue posible guardar la cuenta.");
    } finally {
      setIsSavingAccount(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!accountPendingDelete) return;
    const target = accountPendingDelete;
    setDeletingAccountId(target.id);
    setError(null);
    try {
      await AccountService.deleteAccount(target.id);
      const remaining = accounts.filter((item) => item.id !== target.id);
      setAccounts(remaining);
      setAccountPendingDelete(null);
      const nextSelectedId = target.id === selectedAccountId
        ? remaining[0]?.id ?? cashAccount?.id ?? null
        : selectedAccountId;
      setPageOffset(0);
      setSelectedAccountId(nextSelectedId);
      setSearchParams(nextSelectedId === null ? {} : { account_id: String(nextSelectedId) }, { replace: true });
      setFeedback("Cuenta eliminada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible eliminar la cuenta.");
      setAccountPendingDelete(null);
    } finally {
      setDeletingAccountId(null);
    }
  };
  const openDeleteStatementModal = async (statement: Statement) => {
    setStatementPendingDelete(statement);
    setDeletionImpact(null);
    setDeletionError(null);
    setFeedback(null);
    setLoadingDeletionImpact(true);

    try {
      const impact = await StatementService.getDeletionImpact(statement.id);
      setDeletionImpact(impact);
    } catch (err) {
      setDeletionError(
        err instanceof Error
          ? err.message
          : "No fue posible calcular el impacto de esta eliminacion.",
      );
    } finally {
      setLoadingDeletionImpact(false);
    }
  };

  const closeDeleteStatementModal = () => {
    if (loadingDeletionImpact || deletingStatementId !== null) return;
    setStatementPendingDelete(null);
    setDeletionImpact(null);
    setDeletionError(null);
  };

  const confirmDeleteStatement = async () => {
    if (!statementPendingDelete || !deletionImpact || selectedAccountId === null) return;

    const statement = statementPendingDelete;
    const accountId = selectedAccountId;
    setDeletingStatementId(statement.id);
    setDeletionError(null);
    setError(null);

    try {
      const result = await StatementService.deleteStatement(statement.id);
      setStatements((current) => current.filter((item) => item.id !== statement.id));
      setTransactions((current) =>
        current.filter((transaction) => transaction.statement_id !== statement.id),
      );
      setStatementPendingDelete(null);
      setDeletionImpact(null);
      setFeedback(
        `Importacion deshecha: ${result.transaction_count} movimiento${
          result.transaction_count === 1 ? "" : "s"
        } eliminado${result.transaction_count === 1 ? "" : "s"}.${
          result.raw_file_deleted ? " El PDF original tambien fue eliminado." : ""
        }`,
      );

      try {
        setLoadedDetailsAccountId(null);
        const [statementData, transactionData, accountTotals] = await Promise.all([
          StatementService.getStatements(accountId),
          TransactionService.getPage({account_id: accountId, limit: PAGE_SIZE, offset: 0}),
          ReportService.accounts(),
        ]);
        setStatements(statementData);
        setTransactions(transactionData.items);
        setTransactionTotal(transactionData.total);
        setTotals(accountTotals);
        setLoadedDetailsAccountId(accountId);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? `La cartola fue eliminada, pero no se pudo actualizar la vista: ${refreshError.message}`
            : "La cartola fue eliminada, pero no se pudo actualizar la vista.",
        );
      }
    } catch (err) {
      setDeletionError(
        err instanceof Error ? err.message : "No fue posible deshacer esta importacion.",
      );
    } finally {
      setDeletingStatementId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <PageIntro
        compactOnMobile
        eyebrow="Cuentas"
        title="Mis cuentas"
        description="Tus cuentas, cartolas y movimientos en un solo lugar."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button compactOnMobile tone="secondary" onClick={openCreateAccountModal}>
              <PlusIcon className="h-5 w-5" />
              Agregar cuenta
            </Button>
          </div>
        }
      />

      {loading ? <LoadingState message="Cargando cuentas..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}

      {!loading && selectableAccounts.length === 0 ? (
        <EmptyState
          title="Todavía no tienes cuentas bancarias"
          description="Puedes usar Efectivo o agregar una cuenta financiera para importar cartolas."
          action={<Button onClick={openCreateAccountModal}>Crear primera cuenta</Button>}
        />
      ) : null}

      {!loading && selectedAccountId !== null ? (
        <>
          <section className="min-w-0 space-y-2 sm:space-y-4" aria-label="Selector de cuentas">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="m-0 text-sm font-semibold text-primary sm:text-base">Elige una cuenta</p>
                <p className="mt-1 text-sm text-muted" aria-live="polite">
                  {selectedIndex + 1} de {selectableAccounts.length}<span className="sm:hidden"> · Desliza para ver más</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveSelection(-1)}
                  disabled={selectableAccounts.length < 2}
                  aria-label="Cuenta anterior"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-muted transition-colors hover:border-primary/40 hover:bg-primary-mist hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSelection(1)}
                  disabled={selectableAccounts.length < 2}
                  aria-label="Cuenta siguiente"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-muted transition-colors hover:border-primary/40 hover:bg-primary-mist hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div ref={accountSelectorRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 py-2 pb-4 [scroll-padding-inline:4px] sm:gap-4">
              {selectableAccounts.map((item) => {
                const active = item.id === selectedAccountId;
                const financial = "institution" in item ? item : null;
                return (
                  <button
                    key={financial ? `financial-${item.id}` : `cash-${item.id}`}
                    type="button"
                    data-account-id={item.id}
                    onClick={() => selectAccount(item.id)}
                    aria-pressed={active}
                    aria-label={financial ? `Seleccionar ${item.name} de ${InstitutionLabels[financial.institution]}` : `Seleccionar ${item.name}`}
                    className={cn(
                      "w-[min(280px,calc(100%_-_16px))] shrink-0 snap-start rounded-[1.6rem] text-left transition sm:w-[340px] lg:w-[280px]",
                      active
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:-translate-y-1",
                    )}
                  >
                    {financial ? (
                      <AccountVisualCard
                        institution={financial.institution}
                        accountType={financial.account_type}
                        productCode={financial.product_code}
                        productName={accountProductName(financial, products)}
                        name={financial.name}
                        accountLast4={financial.account_last4}
                        currency={financial.currency}
                        compactOnDesktop className="shadow-sm"
                        compact
                      />
                    ) : <AccountVisualCard variant="cash" name={item.name} cashBalance={cashBalance?.balance_clp ?? null} compactOnDesktop className="shadow-sm" compact />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openCreateAccountModal}
                className="flex min-h-[180px] w-[min(280px,calc(100%_-_16px))] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-[1.6rem] border-2 border-dashed border-outline bg-paper-soft/60 p-5 text-center text-muted transition hover:border-primary/50 hover:bg-primary-mist/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:w-[340px] lg:w-[280px]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                  <PlusIcon className="h-6 w-6" />
                </span>
                <span>
                  <strong className="block text-xl text-ink">Agregar nueva cuenta</strong>
                  <span className="mt-1 block text-sm">Configura otra cuenta para importar sus cartolas.</span>
                </span>
              </button>
            </div>
          </section>

          {account ? <>
          <Panel compactOnMobile className="space-y-4 sm:space-y-6 lg:space-y-0 lg:p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <InstitutionLogo institution={account.institution} size="lg" />
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium text-muted lg:hidden">Información de la cuenta</p>
                  <h2 className="mt-1 section-title lg:mt-0">
                    {account.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted lg:hidden">{InstitutionLabels[account.institution]}</p>
                  <p className="mt-1 hidden text-sm text-muted lg:block">
                    {accountProductName(account, products)} · {account.account_last4 ? `•••• ${account.account_last4}` : "Sin identificador"} · {account.currency}
                  </p>
                </div>
              </div>
              <div aria-label="Acciones de la cuenta" className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:pl-4">
                <Button compactOnMobile className="col-span-2 sm:col-auto" onClick={() => navigate(`/app/import?account_id=${account.id}`)}>
                  <PlusIcon className="h-4 w-4" />Importar cartola
                </Button>
                <Button compactOnMobile tone="secondary" onClick={() => openEditAccountModal(account)}>
                  <PencilIcon className="h-4 w-4" />Editar
                </Button>
                <details className="relative" key={account.id}>
                  <summary aria-label="Más acciones de la cuenta" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-outline text-xl text-muted hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">⋯</summary>
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-outline bg-white p-1 shadow-lg">
                    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft" onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      setAccountPendingDelete(account);
                    }}>
                      <TrashIcon className="h-4 w-4" />Eliminar cuenta
                    </button>
                  </div>
                </details>
              </div>
            </div>
            <div className="subtle-divider lg:hidden" />
            <dl className="grid grid-cols-2 gap-y-3 rounded-2xl bg-paper-soft/70 p-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-outline/70 sm:bg-transparent sm:p-0 lg:hidden">
              <div className="col-span-2 border-b border-outline/70 pb-3 sm:col-span-1 sm:border-0 sm:py-3 sm:pr-5">
                <dt className="text-sm text-muted">Producto</dt>
                <dd className="mt-1 break-words font-semibold">{accountProductName(account, products)}</dd>
              </div>
              <div className="min-w-0 sm:px-5 sm:py-3">
                <dt className="text-sm text-muted">Identificador</dt>
                <dd className="mt-1 font-semibold">
                  {account.account_last4 ? `•••• ${account.account_last4}` : "No definido"}
                </dd>
              </div>
              <div className="border-l border-outline/70 pl-3 sm:border-0 sm:py-3 sm:pl-5 sm:pr-0">
                <dt className="text-sm text-muted">Moneda</dt>
                <dd className="mt-1 font-semibold">{account.currency}</dd>
              </div>
            </dl>

          </Panel>

          <AccountActivitySummary
            compactOnDesktop
            description="Resumen de todo el historial importado. Ingresos y gastos excluyen transferencias internas; la variación registrada incluye todos los movimientos y no es el saldo disponible del banco."
            firstLabel="Variación registrada"
            firstValue={detailsReady ? formatCurrency(summary.net) : "—"}
            firstIcon={<BankIcon className="h-5 w-5" />}
            summary={summary}
            ready={detailsReady}
            formatCurrency={formatCurrency}
          />

          <Panel className="!p-0">
            <div className="grid grid-cols-2 gap-1 border-b border-outline px-3 pt-3 sm:flex sm:gap-2 sm:px-5 sm:pt-5 md:px-8 md:pt-7">
              <button
                type="button"
                onClick={() => setActiveTab("statements")}
                className={cn(
                  "min-w-0 border-b-2 px-1 py-3 text-sm font-semibold transition sm:whitespace-nowrap sm:px-4 sm:text-base",
                  activeTab === "statements"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className="sm:hidden">Cartolas</span><span className="hidden sm:inline">Cartolas importadas</span> ({detailsReady ? statements.length : "…"})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={cn(
                  "min-w-0 border-b-2 px-1 py-3 text-sm font-semibold transition sm:whitespace-nowrap sm:px-4 sm:text-base",
                  activeTab === "transactions"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                Movimientos ({detailsReady ? transactionTotal : "…"})
              </button>
            </div>

            <div className="p-4 sm:p-5 md:p-8">
              {loadingDetails ? <LoadingState message="Cargando detalle de la cuenta..." /> : null}

              {activeTab === "statements" ? (
                <div className="mb-5 border-b border-outline/70 pb-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="eyebrow m-0 text-primary">Estado de cartolas</p>
                      {!detailsReady ? (
                        <p className="mt-2 text-sm text-muted">Cargando información de cartolas...</p>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-ink">
                            {statementCoverage.latestPeriod
                              ? <>Última cartola procesada: <strong className="capitalize">{formatPeriod(statementCoverage.latestPeriod)}</strong></>
                              : statementCoverage.lastUploadedAt
                                ? "Hay cartolas procesadas, pero su período no está identificado."
                                : "Aún no hay cartolas procesadas para esta cuenta."}
                          </p>
                          {statementCoverage.lastUploadedAt || statementCoverage.missingPeriods.length > 0 ? (
                            <details className="mt-2 text-sm text-muted">
                              <summary className="w-fit cursor-pointer rounded text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Ver detalles de importación</summary>
                          {statementCoverage.lastUploadedAt ? (
                            <p className="mt-1 text-sm text-muted">Última importación correcta: {formatDate(statementCoverage.lastUploadedAt)}</p>
                          ) : null}
                          {statementCoverage.missingPeriods.length > 0 ? (
                            <p className="mt-2 text-sm text-muted">
                              Sin cartola registrada entre períodos importados: {statementCoverage.missingPeriods.slice(0, 3).map(formatPeriod).join(", ")}
                              {statementCoverage.missingPeriods.length > 3 ? ` y ${statementCoverage.missingPeriods.length - 3} más` : ""}.
                            </p>
                          ) : null}
                            </details>
                          ) : null}
                        </>
                      )}
                    </div>
                    {detailsReady ? (
                      <div className="flex flex-wrap gap-2 sm:justify-end" aria-label="Avisos de cartolas">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-sm font-semibold",
                            statementCoverage.isUpToDate
                              ? "bg-primary-mist text-primary"
                              : statementCoverage.latestPeriod
                                ? "bg-[#fff4e5] text-[#8a592e]"
                                : "bg-paper-soft text-muted",
                          )}
                          title={`Según las cartolas importadas, se considera al día si hay una procesada de ${formatPeriod(statementCoverage.lastClosedPeriod)} o posterior, sin meses intermedios faltantes ni importaciones pendientes o con error. No consulta el banco en tiempo real.`}
                        >
                          {statementCoverage.isUpToDate
                            ? "Cartolas al día"
                            : statementCoverage.latestPeriod
                              ? "Cartolas por actualizar"
                              : statementCoverage.lastUploadedAt
                                ? "Sin período verificable"
                                : "Sin cartolas procesadas"}
                        </span>
                        {statementCoverage.failedCount > 0 ? (
                          <span className="rounded-full bg-danger-soft px-3 py-1 text-sm font-semibold text-danger">
                            {statementCoverage.failedCount} con error
                          </span>
                        ) : null}
                        {statementCoverage.pendingCount > 0 ? (
                          <span className="rounded-full bg-paper-soft px-3 py-1 text-sm font-semibold text-muted">
                            {statementCoverage.pendingCount} pendiente{statementCoverage.pendingCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {statementCoverage.missingPeriods.length > 0 ? (
                          <span className="rounded-full bg-[#fff4e5] px-3 py-1 text-sm font-semibold text-[#8a592e]">
                            {statementCoverage.missingPeriods.length} mes{statementCoverage.missingPeriods.length === 1 ? "" : "es"} sin cartola
                          </span>
                        ) : null}
                        {statementCoverage.processedWithoutPeriod > 0 ? (
                          <span className="rounded-full bg-paper-soft px-3 py-1 text-sm font-semibold text-muted">
                            {statementCoverage.processedWithoutPeriod} sin período identificado
                          </span>
                        ) : null}
                </div>
              ) : null}
            </div>
                </div>
              ) : null}

              {detailsReady && activeTab === "statements" && statements.length > 0 ? (
                <div className="-mx-4 sm:mx-0">
                  <p className="border-b border-outline px-3 py-2 text-xs text-muted sm:hidden">Desliza para ver estado, importación y acciones.</p>
                  <div className="account-table-scroll overflow-x-auto" role="region" aria-label="Cartolas de la cuenta" tabIndex={0}>
                  <table role="table" className="account-data-table account-statements-table w-full min-w-[840px] table-fixed border-collapse text-sm lg:min-w-0">
                    <thead role="rowgroup" className="text-left text-sm text-muted">
                      <tr className="border-b border-outline">
                        <th className="px-4 lg:px-2 py-3 font-medium">Nombre</th>
                        <th className="px-4 lg:px-2 py-3 font-medium">Periodo</th>
                        <th className="px-4 lg:px-2 py-3 font-medium">Estado</th>
                        <th className="px-4 lg:px-2 py-3 font-medium">Importada</th>
                        <th className="px-4 lg:px-2 py-3 text-right font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup" >
                      {statements.map((statement) => (
                        <tr role="row" key={statement.id} className="border-b border-outline/60 last:border-0">
                          <td role="cell" className="px-4 py-4 font-medium lg:px-2">
                            <span className="flex items-start gap-2 [overflow-wrap:anywhere]">
                              <PdfIcon className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
                              <span className="min-w-0">{statement.file_name}</span>
                            </span>
                          </td>
                          <td role="cell" className="px-4 py-4 capitalize text-muted lg:px-2">{formatPeriod(statement.period_month)}</td>
                          <td role="cell" className="px-4 py-4 lg:px-2">
                            <span
                              className={cn(
                                "inline-block rounded-full px-2 py-1 text-xs font-semibold sm:px-3 sm:text-sm",
                                statement.status === StatementStatus.PROCESSED
                                  ? "bg-primary-mist text-primary"
                                  : statement.status === StatementStatus.FAILED
                                    ? "bg-danger-soft text-danger"
                                    : "bg-paper-soft text-muted",
                              )}
                            >
                              {statusLabels[statement.status]}
                            </span>
                          </td>
                          <td role="cell" className="px-4 py-4 text-muted lg:px-2">{formatDate(statement.uploaded_at)}</td>
                          <td role="cell" className="px-4 py-4 text-right lg:px-2">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                compactOnMobile
                                className="px-2 py-2 text-sm"
                                tone="ghost"
                                aria-label="Ver movimientos"
                                title={`Ver movimientos de ${statement.file_name}`}
                                onClick={() => navigate(`/app/transactions?statement_id=${statement.id}`)}
                              >
                                <EyeIcon className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Ver movimientos</span>
                              </Button>
                              <Button
                                aria-label={`Deshacer importacion de ${statement.file_name}`}
                                compactOnMobile
                                className="px-2 py-2 text-sm text-danger hover:!border-danger hover:!bg-danger hover:!text-white"
                                disabled={deletingStatementId !== null}
                                onClick={() => void openDeleteStatementModal(statement)}
                                title={`Deshacer importacion de ${statement.file_name}`}
                                tone="ghost"
                              >
                                <TrashIcon className="h-4 w-4" />
                                <span className="sr-only sm:not-sr-only lg:sr-only">{deletingStatementId === statement.id ? "Eliminando..." : "Deshacer"}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ) : null}

              {detailsReady && activeTab === "transactions" && transactions.length > 0 ? (
                <AccountMovementsTable transactions={transactions} categoryMap={categoryMap} formatCurrency={formatCurrency} />
              ) : null}

              {activeTab === "transactions" && detailsReady ? (
                <AccountTablePagination total={transactionTotal} pageSize={PAGE_SIZE} offset={pageOffset} disabled={loadingDetails} onOffsetChange={setPageOffset} />
              ) : null}
              {detailsReady && activeTab === "statements" && statements.length === 0 ? (
                <EmptyState
                  title="No hay cartolas importadas"
                  description="Importa la primera cartola de esta cuenta para comenzar a registrar movimientos."
                  action={
                    <Button onClick={() => navigate(`/app/import?account_id=${account.id}`)}>
                      Importar cartola
                    </Button>
                  }
                />
              ) : null}

              {detailsReady && activeTab === "transactions" && transactions.length === 0 ? (
                <EmptyState
                  title="No hay movimientos"
                  description="Los movimientos apareceran cuando importes una cartola para esta cuenta."
                />
              ) : null}
            </div>
          </Panel>
          </> : cashAccount && selectedAccountId === cashAccount.id ? (
            <CashAccountPanel account={cashAccount} categories={categories} onBalanceChange={setCashBalance} />
          ) : null}
        </>
      ) : null}
      {statementPendingDelete ? (
        <DeleteStatementModal
          deleting={deletingStatementId === statementPendingDelete.id}
          error={deletionError}
          impact={deletionImpact}
          loadingImpact={loadingDeletionImpact}
          onCancel={closeDeleteStatementModal}
          onConfirm={() => void confirmDeleteStatement()}
          statement={statementPendingDelete}
        />
      ) : null}
      {isAccountModalOpen ? (
        <AccountFormModal
          error={accountFormError}
          form={accountForm}
          mode={modalMode}
          onChange={updateAccountFormField}
          onClose={() => { if (!isSavingAccount) setIsAccountModalOpen(false); }}
          onSubmit={() => void handleSubmitAccount()}
          saving={isSavingAccount}
        />
      ) : null}
      {accountPendingDelete ? (
        <DeleteAccountModal
          account={accountPendingDelete}
          deleting={deletingAccountId === accountPendingDelete.id}
          onCancel={() => { if (deletingAccountId === null) setAccountPendingDelete(null); }}
          onConfirm={() => void confirmDeleteAccount()}
        />
      ) : null}
    </div>
  );
}


