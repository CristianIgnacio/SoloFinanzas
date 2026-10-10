import { ReportService, type AccountTotal } from '../services/reportService';
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  AccountVisualCard,
  AccountFormModal,
  BankIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteStatementModal,
  EmptyState,
  ErrorState,
  InstitutionLogo,
  LoadingState,
  PageIntro,
  Panel,
  PdfIcon,
  PlusIcon,
  PencilIcon,
  ReceiptIcon,
  StatCard,
  StatusNotice,
  TrashIcon,
  cn,
} from "../components";
import { useFormatCurrency } from "../hooks";
import { accountProductName, useAccountProducts } from "../hooks/useAccountProducts";
import { createCategoryMap, getCategoryPath, parseLocalDate } from "../lib";
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
          <h2 id="delete-account-title" className="text-3xl font-medium text-ink">¿Eliminar {account.name}?</h2>
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
  const [statements, setStatements] = useState<Statement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
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
        const [accountData, categoryData] = await Promise.all([
          AccountService.getAccounts(),
          CategoryService.getCategories(),
        ]);
        if (cancelled) return;
        setAccounts(accountData);
        setCategories(categoryData);
        const requestedId = Number(searchParams.get("account_id"));
        const initial =
          accountData.find((account) => account.id === requestedId) ?? accountData[0];
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
    if (selectedAccountId === null) return;
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
  }, [selectedAccountId, pageOffset]);

  const account = accounts.find((item) => item.id === selectedAccountId) ?? null;
  const selectedIndex = accounts.findIndex((item) => item.id === selectedAccountId);
  const categoryMap = useMemo(
    () => createCategoryMap(categories),
    [categories],
  );
  const summary = totals.find(item => item.account_id === selectedAccountId) ?? {income: 0, expenses: 0, net: 0, count: 0};
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
    if (accounts.length < 2 || selectedIndex < 0) return;
    const nextIndex = (selectedIndex + direction + accounts.length) % accounts.length;
    selectAccount(accounts[nextIndex].id);
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
    if (accountForm.account_type === "credito" && !originalCredit) {
      setAccountFormError("Las tarjetas de crédito aún no se pueden registrar.");
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
        ? remaining[0]?.id ?? null
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
    <div className="space-y-8">
      <PageIntro
        eyebrow="Cuentas"
        title="Mis cuentas"
        description="Selecciona una cuenta para revisar sus cartolas, movimientos y resultados acumulados."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button tone="secondary" onClick={openCreateAccountModal}>
              <PlusIcon className="h-5 w-5" />
              Agregar cuenta
            </Button>
            {account ? (
              <Button onClick={() => navigate(`/app/import?account_id=${account.id}`)}>
                <PlusIcon className="h-5 w-5" />
                Importar cartola
              </Button>
            ) : null}
          </div>
        }
      />

      {loading ? <LoadingState message="Cargando cuentas..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}

      {!loading && accounts.length === 0 ? (
        <EmptyState
          title="Todavia no tienes cuentas"
          description="Crea tu primera cuenta para comenzar a importar cartolas."
          action={<Button onClick={openCreateAccountModal}>Crear primera cuenta</Button>}
        />
      ) : null}

      {account ? (
        <>
          <section className="space-y-4" aria-label="Selector de cuentas">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow m-0 text-primary">Selector de cuentas</p>
                <p className="mt-1 text-sm text-muted">
                  {selectedIndex + 1} de {accounts.length}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => moveSelection(-1)}
                  disabled={accounts.length < 2}
                  aria-label="Cuenta anterior"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-muted transition-colors hover:border-primary/40 hover:bg-primary-mist hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSelection(1)}
                  disabled={accounts.length < 2}
                  aria-label="Cuenta siguiente"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-muted transition-colors hover:border-primary/40 hover:bg-primary-mist hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div ref={accountSelectorRef} className="flex snap-x gap-4 overflow-x-auto px-1 py-2 pb-4">
              {accounts.map((item) => {
                const active = item.id === account.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-account-id={item.id}
                    onClick={() => selectAccount(item.id)}
                    aria-pressed={active}
                    aria-label={`Seleccionar ${item.name} de ${InstitutionLabels[item.institution]}`}
                    className={cn(
                      "w-[280px] shrink-0 snap-start rounded-[1.6rem] text-left transition sm:w-[340px]",
                      active
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:-translate-y-1",
                    )}
                  >
                    <AccountVisualCard
                      institution={item.institution}
                      accountType={item.account_type}
                      productCode={item.product_code}
                      productName={accountProductName(item, products)}
                      name={item.name}
                      accountLast4={item.account_last4}
                      currency={item.currency}
                      compact
                    />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openCreateAccountModal}
                className="flex min-h-[180px] min-w-[280px] snap-start flex-col items-center justify-center gap-4 rounded-[1.75rem] border-2 border-dashed border-outline bg-paper-soft/60 p-6 text-center text-muted transition hover:border-primary/50 hover:bg-primary-mist/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:min-w-[340px]"
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

          <Panel className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <InstitutionLogo institution={account.institution} size="lg" />
                <div className="min-w-0">
                  <p className="eyebrow m-0 text-primary">Información de la cuenta</p>
                  <h2 className="mt-2 break-words text-3xl font-semibold tracking-[-0.03em]">
                    {account.name}
                  </h2>
                  <p className="mt-1 text-muted">{InstitutionLabels[account.institution]}</p>
                </div>
              </div>
              <div aria-label="Acciones de la cuenta" className="flex shrink-0 items-center justify-end gap-2 sm:pl-4">
                <Button tone="secondary" onClick={() => openEditAccountModal(account)}>
                  <PencilIcon className="h-4 w-4" />Editar
                </Button>
                <Button tone="ghost" className="text-danger hover:!border-danger hover:!bg-danger hover:!text-white" onClick={() => setAccountPendingDelete(account)}>
                  <TrashIcon className="h-4 w-4" />Eliminar
                </Button>
              </div>
            </div>
            <div className="subtle-divider" />
            <dl className="grid divide-y divide-outline/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="py-3 sm:pr-5 sm:pl-0">
                <dt className="text-sm text-muted">Producto</dt>
                <dd className="mt-1 break-words font-semibold">{accountProductName(account, products)}</dd>
              </div>
              <div className="py-3 sm:px-5">
                <dt className="text-sm text-muted">Identificador</dt>
                <dd className="mt-1 font-semibold">
                  {account.account_last4 ? `•••• ${account.account_last4}` : "No definido"}
                </dd>
              </div>
              <div className="py-3 sm:pl-5 sm:pr-0">
                <dt className="text-sm text-muted">Moneda</dt>
                <dd className="mt-1 font-semibold">{account.currency}</dd>
              </div>
            </dl>
            <div className="subtle-divider" />
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
                    {statementCoverage.lastUploadedAt ? (
                      <p className="mt-1 text-sm text-muted">Última importación correcta: {formatDate(statementCoverage.lastUploadedAt)}</p>
                    ) : null}
                    {statementCoverage.missingPeriods.length > 0 ? (
                      <p className="mt-2 text-sm text-muted">
                        Sin cartola registrada entre períodos importados: {statementCoverage.missingPeriods.slice(0, 3).map(formatPeriod).join(", ")}
                        {statementCoverage.missingPeriods.length > 3 ? ` y ${statementCoverage.missingPeriods.length - 3} más` : ""}.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              {detailsReady ? (
                <div className="flex flex-wrap gap-2 sm:justify-end" aria-label="Avisos de cartolas">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
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
                    <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-semibold text-danger">
                      {statementCoverage.failedCount} con error
                    </span>
                  ) : null}
                  {statementCoverage.pendingCount > 0 ? (
                    <span className="rounded-full bg-paper-soft px-3 py-1 text-xs font-semibold text-muted">
                      {statementCoverage.pendingCount} pendiente{statementCoverage.pendingCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {statementCoverage.missingPeriods.length > 0 ? (
                    <span className="rounded-full bg-[#fff4e5] px-3 py-1 text-xs font-semibold text-[#8a592e]">
                      {statementCoverage.missingPeriods.length} mes{statementCoverage.missingPeriods.length === 1 ? "" : "es"} sin cartola
                    </span>
                  ) : null}
                  {statementCoverage.processedWithoutPeriod > 0 ? (
                    <span className="rounded-full bg-paper-soft px-3 py-1 text-xs font-semibold text-muted">
                      {statementCoverage.processedWithoutPeriod} sin período identificado
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="space-y-3">
            <p className="text-sm text-muted">Resumen de todo el historial importado. La variación registrada no es el saldo disponible del banco.</p>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de movimientos de la cuenta">
              <StatCard label="Variación registrada" value={detailsReady ? formatCurrency(summary.net) : "—"} icon={<BankIcon className="h-5 w-5" />} />
              <StatCard label="Ingresos" value={detailsReady ? formatCurrency(summary.income) : "—"} tone="income" icon={<ArrowUpIcon className="h-5 w-5" />} />
              <StatCard label="Gastos" value={detailsReady ? formatCurrency(summary.expenses) : "—"} tone="expense" icon={<ArrowDownIcon className="h-5 w-5" />} />
              <StatCard label="Movimientos" value={detailsReady ? String(summary.count) : "—"} icon={<ReceiptIcon className="h-5 w-5" />} />
            </section>
          </div>

          <Panel className="p-0 md:p-0">
            <div className="flex gap-2 overflow-x-auto border-b border-outline px-5 pt-5 md:px-8 md:pt-7">
              <button
                type="button"
                onClick={() => setActiveTab("statements")}
                className={cn(
                  "whitespace-nowrap border-b-2 px-4 py-3 font-semibold transition",
                  activeTab === "statements"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                Cartolas importadas ({statements.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={cn(
                  "whitespace-nowrap border-b-2 px-4 py-3 font-semibold transition",
                  activeTab === "transactions"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                Movimientos ({transactions.length})
              </button>
            </div>

            <div className="p-5 md:p-8">
              {loadingDetails ? <LoadingState message="Cargando detalle de la cuenta..." /> : null}

              {detailsReady && activeTab === "statements" && statements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[840px] border-collapse">
                    <thead className="text-left text-sm text-muted">
                      <tr className="border-b border-outline">
                        <th className="px-4 py-3 font-medium">Nombre</th>
                        <th className="px-4 py-3 font-medium">Periodo</th>
                        <th className="px-4 py-3 font-medium">Importada</th>
                        <th className="px-4 py-3 font-medium">Estado</th>
                        <th className="px-4 py-3 text-right font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statements.map((statement) => (
                        <tr key={statement.id} className="border-b border-outline/60 last:border-0">
                          <td className="px-4 py-4 font-medium">
                            <span className="inline-flex items-center gap-3">
                              <PdfIcon className="h-5 w-5 text-primary" />
                              {statement.file_name}
                            </span>
                          </td>
                          <td className="px-4 py-4 capitalize text-muted">{formatPeriod(statement.period_month)}</td>
                          <td className="px-4 py-4 text-muted">{formatDate(statement.uploaded_at)}</td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold",
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
                          <td className="px-4 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                className="px-3 py-2 text-sm"
                                tone="ghost"
                                onClick={() => navigate(`/app/transactions?statement_id=${statement.id}`)}
                              >
                                Ver movimientos
                              </Button>
                              <Button
                                aria-label={`Deshacer importacion de ${statement.file_name}`}
                                className="px-3 py-2 text-sm text-danger hover:!border-danger hover:!bg-danger hover:!text-white"
                                disabled={deletingStatementId !== null}
                                onClick={() => void openDeleteStatementModal(statement)}
                                title={`Deshacer importacion de ${statement.file_name}`}
                                tone="ghost"
                              >
                                <TrashIcon className="h-4 w-4" />
                                {deletingStatementId === statement.id ? "Eliminando..." : "Deshacer"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {detailsReady && activeTab === "transactions" && transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead className="text-left text-sm text-muted">
                      <tr className="border-b border-outline">
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Descripcion</th>
                        <th className="px-4 py-3 font-medium">Categoria</th>
                        <th className="px-4 py-3 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-outline/60 last:border-0">
                          <td className="whitespace-nowrap px-4 py-4 text-muted">{formatDate(transaction.date)}</td>
                          <td className="px-4 py-4 font-medium">{transaction.description}</td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-paper-soft px-3 py-1 text-sm text-muted">
                              {getCategoryPath(transaction.category_id, categoryMap)}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-4 py-4 text-right font-semibold",
                              transaction.amount_clp >= 0 ? "text-primary" : "text-ink",
                            )}
                          >
                            {formatCurrency(transaction.amount_clp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {activeTab === 'transactions' && detailsReady && <div className="flex justify-center gap-3 py-4">
                <Button tone="secondary" disabled={loadingDetails || pageOffset === 0} onClick={() => setPageOffset(Math.max(0, pageOffset - PAGE_SIZE))}>Anterior</Button>
                <span className="self-center">{summary.count} movimientos · página {Math.floor(pageOffset / PAGE_SIZE) + 1}</span>
                <Button tone="secondary" disabled={loadingDetails || pageOffset + PAGE_SIZE >= summary.count} onClick={() => setPageOffset(pageOffset + PAGE_SIZE)}>Siguiente</Button>
              </div>}
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


