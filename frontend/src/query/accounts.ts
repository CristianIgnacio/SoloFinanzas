import { queryOptions } from "@tanstack/react-query";
import { AccountService } from "../services/accountService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const accountsQueries = {
  list: (userId: string) => queryOptions({
    ...cachePolicies.accounts,
    queryKey: queryKeys.accounts(userId),
    queryFn: readQuery(signal => AccountService.getAccounts(signal)),
  }),
  products: (userId: string) => queryOptions({
    ...cachePolicies.products,
    queryKey: queryKeys.products(userId),
    queryFn: readQuery(signal => AccountService.getProducts(signal)),
  }),
  cash: (userId: string) => queryOptions({
    ...cachePolicies.accounts,
    queryKey: queryKeys.cashAccount(userId),
    queryFn: readQuery(signal => AccountService.getCashAccount(signal)),
  }),
  balance: (userId: string) => queryOptions({
    ...cachePolicies.financial,
    queryKey: queryKeys.cashBalance(userId),
    queryFn: readQuery(signal => AccountService.getCashBalance(signal)),
  }),
};
