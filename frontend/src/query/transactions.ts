import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { TransactionService, type TransactionFilters } from "../services/transactionService";
import { normalizeTransactionFilters, queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";
import { applyCategoryPreviews } from "./transactionCache";

/** Option factories do not fetch until consumed by a query hook/client. */
export const transactionsQueries = {
  page: (userId: string, filters: TransactionFilters = {}) => {
    const normalized = normalizeTransactionFilters(filters);
    return queryOptions({
      ...cachePolicies.financial,
      queryKey: queryKeys.transactions.page(userId, normalized),
      queryFn: readQuery(async (signal, client) => applyCategoryPreviews(client, await TransactionService.getPage(normalized, signal))),
    });
  },
  infinite: (userId: string, filters: Omit<TransactionFilters, "offset"> = {}) => {
    const { offset: _offset, ...normalized } = normalizeTransactionFilters(filters);
    return infiniteQueryOptions({
      ...cachePolicies.financial,
      queryKey: queryKeys.transactions.infinite(userId, normalized),
      initialPageParam: 0,
      queryFn: context => readQuery(async (signal, client) => applyCategoryPreviews(client,
        await TransactionService.getPage({ ...normalized, offset: context.pageParam }, signal)))(context),
      getNextPageParam: page => {
        const next = page.offset + page.items.length;
        return page.items.length > 0 && next < page.total ? next : undefined;
      },
    });
  },
};
