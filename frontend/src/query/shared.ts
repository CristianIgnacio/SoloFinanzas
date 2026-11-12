import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { accountsQueries } from "./accounts";
import { categoriesQueries } from "./categories";
import { reportsQueries } from "./reports";
import { statementsQueries } from "./statements";
import { transactionsQueries } from "./transactions";

// Stable empty data prevents effects/memos from running on each pending render.
export const emptyList: never[] = [];
export function useQueryOwner() { return useAuth().session!.user.id; }
export function useAccounts() { return useQuery(accountsQueries.list(useQueryOwner())); }
export function useProducts() { return useQuery(accountsQueries.products(useQueryOwner())); }
export function useCashAccount() { return useQuery(accountsQueries.cash(useQueryOwner())); }
export function useCashBalance() { return useQuery(accountsQueries.balance(useQueryOwner())); }
export function useCategories() { return useQuery(categoriesQueries.list(useQueryOwner())); }
export function useRules() { return useQuery(categoriesQueries.rules(useQueryOwner())); }
export function useCategoryCatalog() { return useQuery(categoriesQueries.catalog(useQueryOwner())); }
export function useAccountTotals() { return useQuery(reportsQueries.accounts(useQueryOwner())); }
export function usePeriods(statementId?: number) { return useQuery(reportsQueries.periods(useQueryOwner(), statementId)); }
export function useAccountStatements(accountId: number | null) {
  return useQuery({ ...statementsQueries.list(useQueryOwner(), accountId ?? undefined), enabled: accountId !== null });
}
export function useStatementImpact(statementId: number | null) {
  return useQuery({ ...statementsQueries.impact(useQueryOwner(), statementId ?? 0), enabled: statementId !== null });
}
export function useAccountMovements(accountId: number | null, offset: number, limit: number) {
  return useQuery({
    ...transactionsQueries.page(useQueryOwner(), { account_id: accountId ?? undefined, offset, limit }),
    enabled: accountId !== null,
    // Only offset may differ. Never show another account's rows under this title.
    placeholderData: (previous, query) => {
      const filters = query?.queryKey[4] as { account_id?: number; limit?: number } | undefined;
      return filters?.account_id === accountId && filters?.limit === limit ? previous : undefined;
    },
  });
}
