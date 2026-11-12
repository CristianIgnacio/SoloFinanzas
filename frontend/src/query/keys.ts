import type { TransactionFilters } from "../services/transactionService";

/** Every business resource is scoped to an explicit authenticated identity. */
export function userKey(userId: string) {
  if (!userId.trim()) throw new Error("A user ID is required for financial queries.");
  return ["user", userId] as const;
}

export function resourceKey<T extends readonly unknown[]>(userId: string, ...parts: T) {
  return [...userKey(userId), ...parts] as const;
}

/** Match the API defaults and use the same snapshot for the key and HTTP params. */
export function normalizeTransactionFilters(filters: TransactionFilters = {}) {
  return {
    account_id: filters.account_id ?? undefined,
    statement_id: filters.statement_id ?? undefined,
    date_from: filters.date_from ?? undefined,
    date_to: filters.date_to ?? undefined,
    transaction_type: filters.transaction_type ?? undefined,
    category_id: filters.category_id ?? undefined,
    uncategorized: filters.uncategorized ?? false,
    exclude_internal: filters.exclude_internal ?? false,
    search: filters.search?.trim() || undefined,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
  };
}

/** For future multi-select keys: order and duplicates must not create new entries. */
export function normalizeSelection<T extends string | number>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort((a, b) => typeof a === "number" && typeof b === "number"
    ? a - b : String(a).localeCompare(String(b), "en"));
}

export const queryKeys = {
  user: userKey,
  profile: (userId: string) => resourceKey(userId, "profile"),
  accounts: (userId: string) => resourceKey(userId, "accounts"),
  products: (userId: string) => resourceKey(userId, "account-products"),
  cashAccount: (userId: string) => resourceKey(userId, "cash-account"),
  cashBalance: (userId: string) => resourceKey(userId, "cash-balance"),
  categories: (userId: string, includeInactive = true) => resourceKey(userId, "categories", { includeInactive }),
  rules: (userId: string, categoryId?: number) => resourceKey(userId, "rules", { categoryId: categoryId ?? undefined }),
  categoryCatalog: (userId: string) => resourceKey(userId, "category-catalog"),
  statements: (userId: string, accountId?: number) => resourceKey(userId, "statements", { accountId: accountId ?? undefined }),
  statementImpact: (userId: string, statementId: number) => resourceKey(userId, "statement-impact", statementId),
  dashboard: (userId: string, requestedPeriod?: string) => resourceKey(userId, "dashboard", { requestedPeriod: requestedPeriod ?? undefined }),
  reports: {
    accounts: (userId: string) => resourceKey(userId, "reports", "accounts"),
    periods: (userId: string, statementId?: number) => resourceKey(userId, "reports", "periods", { statementId: statementId ?? undefined }),
  },
  transactions: {
    all: (userId: string) => resourceKey(userId, "transactions"),
    page: (userId: string, filters: TransactionFilters = {}) => resourceKey(userId, "transactions", "page", normalizeTransactionFilters(filters)),
    infinite: (userId: string, filters: Omit<TransactionFilters, "offset"> = {}) => {
      const { offset: _offset, ...normalized } = normalizeTransactionFilters(filters);
      return resourceKey(userId, "transactions", "infinite", normalized);
    },
    month: (userId: string, period: string) => resourceKey(userId, "transactions", "month", period),
    uncategorizedCount: (userId: string, period: string) => resourceKey(userId, "transactions", "uncategorized-count", period),
  },
  learning: (userId: string, resource: "patterns" | "proposals" | "memory") => resourceKey(userId, "learning", resource),
};
