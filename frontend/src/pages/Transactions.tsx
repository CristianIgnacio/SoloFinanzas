import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import {
  Button,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  ExportIcon,
  InstitutionLogo,
  LoadingState,
  MoneyIcon,
  PageIntro,
  Panel,
  QuestionIcon,
  SaveIcon,
  StatusNotice,
  Tag,
  UtensilsIcon,
} from "../components";
import { parseLocalDate } from "../lib";
import { AccountService, CategoryService, TransactionService } from "../services";
import type { Account, Category, Transaction } from "../types";

type FilterMode = "all" | "expense" | "income";

const ALL_PERIODS = "all";
const ALL_ACCOUNTS = "all";
const ALL_CATEGORIES = "all";
const UNCATEGORIZED_CATEGORY = "uncategorized";
const TRANSACTION_PAGE_SIZE = 1000;
const VISIBLE_TRANSACTION_STEP = 50;

function getMonthKey(date: string) {
  return date.slice(0, 7);
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
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
        <MoneyIcon className="h-6 w-6" />
      </span>
    );
  }

  if (transaction.description.toLowerCase().includes("cafe")) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#dbe7ff] text-secondary">
        <UtensilsIcon className="h-6 w-6" />
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffd7c2] text-clay">
      <QuestionIcon />
    </span>
  );
}

async function loadAllTransactions(statementId?: number) {
  const transactions: Transaction[] = [];
  let offset = 0;

  while (true) {
    const page = await TransactionService.getTransactions({
      statement_id: statementId,
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

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const statementId = searchParams.get("statement_id")
    ? Number(searchParams.get("statement_id"))
    : undefined;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draftCategories, setDraftCategories] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<FilterMode>("all");
  const [excludeInternalTransfers, setExcludeInternalTransfers] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(ALL_ACCOUNTS);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(
    VISIBLE_TRANSACTION_STEP,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [transactionsPayload, accountsPayload, categoriesPayload] = await Promise.all([
          loadAllTransactions(statementId),
          AccountService.getAccounts(),
          CategoryService.getCategories(),
        ]);

        if (!cancelled) {
          setTransactions(transactionsPayload);
          setAccounts(accountsPayload);
          setCategories(categoriesPayload);
          setDraftCategories({});
          setFilter("all");
          setExcludeInternalTransfers(false);
          setSelectedMonth(
            transactionsPayload[0] ? getMonthKey(transactionsPayload[0].date) : ALL_PERIODS,
          );
          setSelectedAccount(ALL_ACCOUNTS);
          setSelectedCategory(ALL_CATEGORIES);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar los movimientos.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [statementId]);

  const months = useMemo(
    () =>
      [...new Set(transactions.map((transaction) => getMonthKey(transaction.date)))].sort(
        (left, right) => right.localeCompare(left),
      ),
    [transactions],
  );

  const accountOptions = useMemo(() => {
    const accountIds = new Set(transactions.map((transaction) => transaction.account_id));
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const knownAccounts = accounts
      .filter((account) => accountIds.has(account.id))
      .map((account) => ({
        id: account.id,
        label: account.account_last4
          ? `${account.name} - **** ${account.account_last4}`
          : account.name,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "es-CL"));
    const missingAccounts = [...accountIds]
      .filter((accountId) => !accountsById.has(accountId))
      .sort((left, right) => left - right)
      .map((accountId) => ({
        id: accountId,
        label: `Tarjeta #${accountId}`,
      }));

    return [...knownAccounts, ...missingAccounts];
  }, [accounts, transactions]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const categoryFilterOptions = useMemo(() => {
    const categoryIds = new Set(
      transactions
        .map((transaction) => transaction.category_id)
        .filter((categoryId): categoryId is number => categoryId !== null),
    );
    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const knownCategories = categories
      .filter((category) => categoryIds.has(category.id))
      .map((category) => ({
        id: category.id,
        label: category.name,
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

  const visibleTransactions = useMemo(() => {
    return transactions
      .filter(
        (transaction) =>
          selectedMonth === ALL_PERIODS ||
          getMonthKey(transaction.date) === selectedMonth,
      )
      .filter(
        (transaction) =>
          selectedAccount === ALL_ACCOUNTS ||
          String(transaction.account_id) === selectedAccount,
      )
      .filter((transaction) => {
        if (selectedCategory === ALL_CATEGORIES) {
          return true;
        }

        if (selectedCategory === UNCATEGORIZED_CATEGORY) {
          return !transaction.category_id;
        }

        return String(transaction.category_id) === selectedCategory;
      })
      .filter((transaction) => {
        if (filter !== "all" && transaction.transaction_type !== filter) {
          return false;
        }

        return !excludeInternalTransfers || !transaction.is_internal_transfer;
      });
  }, [excludeInternalTransfers, filter, selectedAccount, selectedCategory, selectedMonth, transactions]);

  useEffect(() => {
    setVisibleTransactionCount(VISIBLE_TRANSACTION_STEP);
  }, [excludeInternalTransfers, filter, selectedAccount, selectedCategory, selectedMonth]);

  const displayedTransactions = useMemo(
    () => visibleTransactions.slice(0, visibleTransactionCount),
    [visibleTransactionCount, visibleTransactions],
  );

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    displayedTransactions.forEach((transaction) => {
      const current = groups.get(transaction.date) ?? [];
      current.push(transaction);
      groups.set(transaction.date, current);
    });

    return [...groups.entries()].sort((left, right) => right[0].localeCompare(left[0]));
  }, [displayedTransactions]);

  const categoryOptionsFor = (transaction: Transaction) => {
    return categories.filter((category) => {
      if (transaction.transaction_type === "income") {
        return category.type === "income" || category.type === "transfer";
      }

      return category.type === "expense" || category.type === "transfer";
    });
  };

  const pendingChanges = Object.keys(draftCategories).length;

  const exportMarkdown = () => {
    const markdown = [
      `# Movimientos - ${formatMonthLabel(selectedMonth)}`,
      "",
      ...visibleTransactions.map((transaction) => {
        const selectedCategory =
          draftCategories[transaction.id] || String(transaction.category_id ?? "");
        const categoryName =
          categories.find((category) => String(category.id) === selectedCategory)?.name ??
          "Sin categoria";

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

  const saveAllChanges = async () => {
    if (pendingChanges === 0) {
      return;
    }

    setSaving(true);
    setSuccessMessage(null);
    setError(null);

    try {
      await Promise.all(
        Object.entries(draftCategories).map(([transactionId, categoryId]) =>
          TransactionService.updateCategory(
            Number(transactionId),
            categoryId ? Number(categoryId) : null,
            "manual",
          ),
        ),
      );

      const refreshed = await loadAllTransactions(statementId);
      setTransactions(refreshed);
      setDraftCategories({});
      setSuccessMessage("Movimientos actualizados correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Periodo"
        title="Movimientos"
        period={
          <label className="relative inline-flex max-w-full items-center">
            <span className="sr-only">Filtrar movimientos por periodo</span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="max-w-full appearance-none bg-transparent pl-1 pr-8 text-lg font-medium text-primary outline-none md:text-[1.75rem]"
            >
              <option value={ALL_PERIODS}>Todos los periodos</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-1 h-4 w-4 text-primary" />
          </label>
        }
        description={
          statementId
            ? "Revisa y categoriza los movimientos de la cartola que acabas de importar."
            : "Consulta, filtra y corrige las categorias de tus transacciones."
        }
        actions={
          <>
            <Button
              tone="secondary"
              onClick={exportMarkdown}
              disabled={visibleTransactions.length === 0}
            >
              <ExportIcon className="h-5 w-5" />
              {selectedMonth === ALL_PERIODS
                ? "Exportar todos los periodos"
                : "Exportar movimientos"}
            </Button>
            <Button
              onClick={() => void saveAllChanges()}
              disabled={saving || pendingChanges === 0}
            >
              <SaveIcon className="h-5 w-5" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </>
        }
      />

      {loading ? <LoadingState message="Cargando movimientos..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {successMessage ? <StatusNotice tone="success">{successMessage}</StatusNotice> : null}
      {typeof location.state?.importMessage === "string" ? (
        <StatusNotice tone="success">{location.state.importMessage}</StatusNotice>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setFilter("all")}>
              <Tag active={filter === "all"}>Todos</Tag>
            </button>
            <button type="button" onClick={() => setFilter("expense")}>
              <Tag active={filter === "expense"}>Egreso</Tag>
            </button>
            <button type="button" onClick={() => setFilter("income")}>
              <Tag active={filter === "income"}>Ingreso</Tag>
            </button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-outline bg-white px-4 py-2.5 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={excludeInternalTransfers}
              onChange={(event) => setExcludeInternalTransfers(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Excluir transferencias internas
          </label>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto">
          <div className="relative min-w-0 sm:min-w-[250px]">
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="w-full appearance-none rounded-full border border-outline bg-white px-5 py-3 pr-12 text-lg outline-none transition focus:border-primary"
            >
              <option value={ALL_CATEGORIES}>Todas las categorias</option>
              <option value={UNCATEGORIZED_CATEGORY}>Sin categoria</option>
              {categoryFilterOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </div>

          <div className="relative min-w-0 sm:min-w-[250px]">
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              className="w-full appearance-none rounded-full border border-outline bg-white px-5 py-3 pr-12 text-lg outline-none transition focus:border-primary"
            >
              <option value={ALL_ACCOUNTS}>Todas las tarjetas</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          </div>
        </div>
      </div>

      {!loading && visibleTransactions.length > 0 ? (
        <p className="text-sm text-muted">
          Mostrando {displayedTransactions.length} de {visibleTransactions.length} movimientos
          {statementId ? " de esta importacion" : ""}.
        </p>
      ) : null}

      {groupedTransactions.length > 0 ? (
        <div className="space-y-8">
          {groupedTransactions.map(([date, items]) => (
            <section key={date} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-5 w-[3px] rounded-full bg-primary-soft" />
                <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-ink">
                  {formatDateLabel(date)}
                </h2>
              </div>

              <div className="space-y-4">
                {items.map((transaction) => {
                  const categoryValue =
                    draftCategories[transaction.id] ??
                    (transaction.category_id ? String(transaction.category_id) : "");
                  const options = categoryOptionsFor(transaction);
                  const account = accountMap.get(transaction.account_id);

                  return (
                    <Panel
                      key={transaction.id}
                      className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <MovementIcon transaction={transaction} />
                        <div className="space-y-1">
                          <p className="text-3xl font-medium tracking-[-0.03em]">
                            {transaction.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg text-muted">
                              {transaction.transaction_type === "income"
                                ? "Ingreso"
                                : "Egreso"}
                            </p>
                            {account ? (
                              <Link
                                to={`/accounts?account_id=${account.id}`}
                                aria-label={`Ver detalle de ${account.name}`}
                                className="inline-flex items-center gap-2 rounded-full border border-outline bg-white px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                <InstitutionLogo
                                  institution={account.institution}
                                  size="sm"
                                />
                                {account.name}
                              </Link>
                            ) : (
                              <span className="rounded-full border border-outline bg-paper-soft px-2.5 py-1 text-xs font-semibold text-muted">
                                Tarjeta #{transaction.account_id}
                              </span>
                            )}
                            {transaction.is_internal_transfer ? (
                              <span className="rounded-full border border-primary/20 bg-primary-mist px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                                Transferencia interna
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
                        <p
                          className={
                            transaction.amount_clp >= 0
                              ? "text-3xl font-medium text-primary"
                              : "text-3xl font-medium text-ink"
                          }
                        >
                          {new Intl.NumberFormat("es-CL", {
                            style: "currency",
                            currency: "CLP",
                            maximumFractionDigits: 0,
                          }).format(transaction.amount_clp)}
                        </p>

                        <div className="relative min-w-[250px]">
                          <select
                            value={categoryValue}
                            onChange={(event) =>
                              setDraftCategories((current) => ({
                                ...current,
                                [transaction.id]: event.target.value,
                              }))
                            }
                            className="w-full appearance-none rounded-2xl border border-outline bg-paper-soft px-4 py-3 pr-10 text-base outline-none transition focus:border-primary"
                          >
                            <option value="">Seleccionar categoria...</option>
                            {options.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </section>
          ))}

          {displayedTransactions.length < visibleTransactions.length ? (
            <div className="flex justify-center">
              <Button
                tone="secondary"
                onClick={() =>
                  setVisibleTransactionCount(
                    (current) => current + VISIBLE_TRANSACTION_STEP,
                  )
                }
              >
                Mostrar 50 mas
              </Button>
            </div>
          ) : null}
        </div>
      ) : !loading ? (
        <EmptyState
          title="No hay movimientos para este filtro"
          description="Prueba cambiando el periodo o el criterio de revision."
        />
      ) : null}
    </div>
  );
}


