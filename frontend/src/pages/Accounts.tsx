import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BankIcon,
  Button,
  DeleteStatementModal,
  EmptyState,
  ErrorState,
  InstitutionLogo,
  LoadingState,
  PageIntro,
  Panel,
  PdfIcon,
  PlusIcon,
  ReceiptIcon,
  StatCard,
  StatusNotice,
  TrashIcon,
  cn,
} from "../components";
import { useFormatCurrency } from "../hooks";
import { createCategoryMap, getCategoryPath, parseLocalDate } from "../lib";
import {
  AccountService,
  CategoryService,
  StatementService,
  TransactionService,
} from "../services";
import { InstitutionLabels, StatementStatus } from "../types";
import type {
  Account,
  Category,
  Statement,
  StatementDeletionImpact,
  Transaction,
} from "../types";

type DetailTab = "statements" | "transactions";
const PAGE_SIZE = 1000;

const statusLabels: Record<StatementStatus, string> = {
  [StatementStatus.PENDING]: "Pendiente",
  [StatementStatus.PROCESSED]: "Procesada",
  [StatementStatus.FAILED]: "Con error",
};

async function loadTransactions(accountId: number) {
  const result: Transaction[] = [];
  let offset = 0;
  while (true) {
    const page = await TransactionService.getTransactions({
      account_id: accountId,
      limit: PAGE_SIZE,
      offset,
    });
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
    offset += PAGE_SIZE;
  }
}

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

export function AccountsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("statements");
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statementPendingDelete, setStatementPendingDelete] = useState<Statement | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<StatementDeletionImpact | null>(null);
  const [loadingDeletionImpact, setLoadingDeletionImpact] = useState(false);
  const [deletingStatementId, setDeletingStatementId] = useState<number | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const formatCurrency = useFormatCurrency();

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
      setError(null);
      try {
        const [statementData, transactionData] = await Promise.all([
          StatementService.getStatements(selectedAccountId as number),
          loadTransactions(selectedAccountId as number),
        ]);
        if (!cancelled) {
          setStatements(statementData);
          setTransactions(transactionData);
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
  }, [selectedAccountId]);

  const account = accounts.find((item) => item.id === selectedAccountId) ?? null;
  const selectedIndex = accounts.findIndex((item) => item.id === selectedAccountId);
  const categoryMap = useMemo(
    () => createCategoryMap(categories),
    [categories],
  );
  const summary = useMemo(() => {
    const income = transactions
      .filter((item) => item.amount_clp > 0)
      .reduce((sum, item) => sum + item.amount_clp, 0);
    const expenses = transactions
      .filter((item) => item.amount_clp < 0)
      .reduce((sum, item) => sum + Math.abs(item.amount_clp), 0);
    return { income, expenses, net: income - expenses, count: transactions.length };
  }, [transactions]);

  const selectAccount = (accountId: number) => {
    setSelectedAccountId(accountId);
    setSearchParams({ account_id: String(accountId) }, { replace: true });
  };

  const moveSelection = (direction: -1 | 1) => {
    if (accounts.length < 2 || selectedIndex < 0) return;
    const nextIndex = (selectedIndex + direction + accounts.length) % accounts.length;
    selectAccount(accounts[nextIndex].id);
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
        const [statementData, transactionData] = await Promise.all([
          StatementService.getStatements(accountId),
          loadTransactions(accountId),
        ]);
        setStatements(statementData);
        setTransactions(transactionData);
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
          account ? (
            <Button onClick={() => navigate(`/import?account_id=${account.id}`)}>
              <PlusIcon className="h-5 w-5" />
              Importar nueva cartola
            </Button>
          ) : null
        }
      />

      {loading ? <LoadingState message="Cargando cuentas..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}

      {!loading && accounts.length === 0 ? (
        <EmptyState
          title="Todavia no tienes cuentas"
          description="Crea tu primera cuenta desde Configuracion para comenzar a importar cartolas."
          action={<Button onClick={() => navigate("/settings")}>Ir a Configuracion</Button>}
        />
      ) : null}

      {account ? (
        <>
          <section className="space-y-4" aria-label="Selector de cuentas">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow m-0 text-primary">Selector de tarjetas</p>
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
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-2xl transition hover:border-primary disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => moveSelection(1)}
                  disabled={accounts.length < 2}
                  aria-label="Cuenta siguiente"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-outline bg-white text-2xl transition hover:border-primary disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="flex snap-x gap-4 overflow-x-auto pb-3">
              {accounts.map((item) => {
                const active = item.id === account.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectAccount(item.id)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-[180px] min-w-[280px] snap-start rounded-[1.75rem] border p-6 text-left transition sm:min-w-[340px]",
                      active
                        ? "border-primary bg-primary text-white shadow-paper"
                        : "border-outline bg-white text-ink hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-full flex-col justify-between gap-8">
                      <div className="flex items-start justify-between gap-4">
                        <InstitutionLogo institution={item.institution} />
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-semibold uppercase",
                            active ? "bg-white/15 text-white" : "bg-paper-soft text-muted",
                          )}
                        >
                          {item.account_type}
                        </span>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{item.name}</p>
                        <p className={active ? "text-white/75" : "text-muted"}>
                          {item.account_last4
                            ? `•••• ${item.account_last4}`
                            : InstitutionLabels[item.institution]}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => navigate("/settings?new_account=1")}
                className="flex min-h-[180px] min-w-[280px] snap-start flex-col items-center justify-center gap-4 rounded-[1.75rem] border-2 border-dashed border-outline bg-paper-soft/60 p-6 text-center text-muted transition hover:border-primary/50 hover:bg-primary-mist/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:min-w-[340px]"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                  <PlusIcon className="h-6 w-6" />
                </span>
                <span>
                  <strong className="block text-xl text-ink">Agregar nueva tarjeta</strong>
                  <span className="mt-1 block text-sm">Configura otra cuenta para importar sus cartolas.</span>
                </span>
              </button>
            </div>
          </section>

          <Panel className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-center gap-5">
              <InstitutionLogo institution={account.institution} size="lg" />
              <div>
                <p className="eyebrow m-0 text-primary">Informacion de la cuenta</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                  {account.name}
                </h2>
                <p className="mt-1 text-muted">{InstitutionLabels[account.institution]}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Tipo</dt>
                <dd className="mt-1 font-semibold capitalize">{account.account_type}</dd>
              </div>
              <div>
                <dt className="text-muted">Identificador</dt>
                <dd className="mt-1 font-semibold">
                  {account.account_last4 ? `•••• ${account.account_last4}` : "No definido"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Moneda</dt>
                <dd className="mt-1 font-semibold">{account.currency}</dd>
              </div>
            </dl>
          </Panel>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Saldo neto" value={formatCurrency(summary.net)} icon={<BankIcon className="h-5 w-5" />} />
            <StatCard label="Ingresos" value={formatCurrency(summary.income)} tone="income" icon={<ArrowUpIcon className="h-5 w-5" />} />
            <StatCard label="Gastos" value={formatCurrency(summary.expenses)} tone="expense" icon={<ArrowDownIcon className="h-5 w-5" />} />
            <StatCard label="Movimientos" value={String(summary.count)} icon={<ReceiptIcon className="h-5 w-5" />} />
          </section>

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

              {!loadingDetails && activeTab === "statements" && statements.length > 0 ? (
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
                                onClick={() => navigate(`/transactions?statement_id=${statement.id}`)}
                              >
                                Ver movimientos
                              </Button>
                              <Button
                                aria-label={`Deshacer importacion de ${statement.file_name}`}
                                className="px-3 py-2 text-sm text-danger hover:bg-danger-soft"
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

              {!loadingDetails && activeTab === "transactions" && transactions.length > 0 ? (
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

              {!loadingDetails && activeTab === "statements" && statements.length === 0 ? (
                <EmptyState
                  title="No hay cartolas importadas"
                  description="Importa la primera cartola de esta cuenta para comenzar a registrar movimientos."
                  action={
                    <Button onClick={() => navigate(`/import?account_id=${account.id}`)}>
                      Importar cartola
                    </Button>
                  }
                />
              ) : null}

              {!loadingDetails && activeTab === "transactions" && transactions.length === 0 ? (
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
    </div>
  );
}


