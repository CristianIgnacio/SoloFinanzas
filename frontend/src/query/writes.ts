import { patchTransaction } from "./transactionCache";
import { executeCategoryWrite } from "./categoryMutations";
import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getApiSession, type ApiSession } from "../lib/apiSession";
import type { Account, CashBalance, Transaction, UserProfile } from "../types";
import { queryKeys } from "./keys";
import { assertWriteSession, executeWrite, type WritePolicy } from "./invalidation";
import { AccountService } from "../services/accountService";
import { CategoryService } from "../services/categoryService";
import { TransactionService } from "../services/transactionService";
import { StatementService } from "../services/statementService";
import { ProfileService } from "../services/profileService";

export function createWriteActions(client: QueryClient, session: ApiSession | null) {
  const userId = session?.userId ?? "";
  function bind<A extends unknown[], R>(request: (...args: A) => Promise<R>, policy: WritePolicy,
    patch?: (result: R, args: A) => void) {
    return (...args: A) => executeWrite(client, session, policy, () => request(...args), result => patch?.(result, args));
  }
  const accountPatch = (account: Account) => client.setQueryData<Account[]>(queryKeys.accounts(userId), old =>
    old ? old.some(row => row.id === account.id) ? old.map(row => row.id === account.id ? account : row) : [...old, account] : old);
  const balancePatch = (balance: CashBalance) => client.setQueryData(queryKeys.cashBalance(userId), balance);
  const transactionPatch = (transaction: Transaction) => client.setQueriesData(
    { queryKey: queryKeys.transactions.all(userId) }, old => patchTransaction(old, transaction));
  function removeDetails(kind: "account" | "statement", id: number) {
    client.removeQueries({ predicate: q => {
      const key = q.queryKey;
      if (key[0] !== "user" || key[1] !== userId) return false;
      if (kind === "statement" && key[2] === "statement-impact" && key[3] === id) return true;
      return key.slice(3).some(part => part && typeof part === "object" &&
        ((part as Record<string, unknown>)[kind + "_id"] === id || (part as Record<string, unknown>)[kind + "Id"] === id));
    } });
  }
  return {
    accounts: {
      createAccount: bind(AccountService.createAccount.bind(AccountService), "account", accountPatch),
      updateAccount: bind(AccountService.updateAccount.bind(AccountService), "account", accountPatch),
      deleteAccount: bind(AccountService.deleteAccount.bind(AccountService), "financial", (_result, [id]) => { client.setQueryData<Account[]>(queryKeys.accounts(userId), old => old?.filter(row => row.id !== id)); removeDetails("account", id); }),
      updateCashBalance: bind(AccountService.updateCashBalance.bind(AccountService), "financial", balancePatch),
      clearCashBalance: bind(AccountService.clearCashBalance.bind(AccountService), "financial", balancePatch),
    },
    categories: {
      createCategory: bind(CategoryService.createCategory.bind(CategoryService), "category"),
      updateCategory: bind(CategoryService.updateCategory.bind(CategoryService), "category"),
      deleteCategory: bind(CategoryService.deleteCategory.bind(CategoryService), "category"),
      mergeCategory: bind(CategoryService.mergeCategory.bind(CategoryService), "category"),
      decidePattern: bind(CategoryService.decidePattern.bind(CategoryService), "rule"),
      forgetMemory: bind(CategoryService.forgetMemory.bind(CategoryService), "rule"),
      acceptRuleProposal: bind(CategoryService.acceptRuleProposal.bind(CategoryService), "rule"),
      createCategorizationRule: bind(CategoryService.createCategorizationRule.bind(CategoryService), "rule"),
      updateCategorizationRule: bind(CategoryService.updateCategorizationRule.bind(CategoryService), "rule"),
      deleteCategorizationRule: bind(CategoryService.deleteCategorizationRule.bind(CategoryService), "rule"),
    },
    transactions: {
      linkCash: bind(TransactionService.linkCash.bind(TransactionService), "financial", transactionPatch),
      unlinkCash: bind(TransactionService.unlinkCash.bind(TransactionService), "financial", transactionPatch),
      createCashTransaction: bind(TransactionService.createCashTransaction.bind(TransactionService), "financial", transactionPatch),
      updateCashTransaction: bind(TransactionService.updateCashTransaction.bind(TransactionService), "financial", transactionPatch),
      deleteCashTransaction: bind(TransactionService.deleteCashTransaction.bind(TransactionService), "financial"),
      createTransaction: bind(TransactionService.createTransaction.bind(TransactionService), "financial", transactionPatch),
      createBulkTransactions: bind(TransactionService.createBulkTransactions.bind(TransactionService), "financial"),
      updateCategory: (...args: Parameters<typeof TransactionService.updateCategory>) =>
        executeCategoryWrite(client, session, args[0], () => TransactionService.updateCategory(...args), args[1]),
      undoCategory: (...args: Parameters<typeof TransactionService.undoCategory>) =>
        executeCategoryWrite(client, session, args[0], () => TransactionService.undoCategory(...args)),
    },
    statements: {
      createStatement: bind(StatementService.createStatement.bind(StatementService), "financial"),
      updateStatus: bind(StatementService.updateStatus.bind(StatementService), "financial"),
      deleteStatement: bind(StatementService.deleteStatement.bind(StatementService), "financial", (_result, [id]) => removeDetails("statement", id)),
      importPdf: bind(StatementService.importPdf.bind(StatementService), "financial"),
      importReviewedPdf: bind(StatementService.importReviewedPdf.bind(StatementService), "financial"),
    },
    profile: {
      startWithCash: bind(ProfileService.startWithCash.bind(ProfileService), "onboarding", () => { client.setQueryData<UserProfile>(queryKeys.profile(userId), old => old ? { ...old, onboarding_choice: "cash" } : old); }),
      deleteProfile: async () => {
        assertWriteSession(session);
        await ProfileService.deleteProfile();
        assertWriteSession(session);
        window.dispatchEvent(new Event("sf:session-expired"));
      },
    },
  };
}

export function useWriteActions() {
  const client = useQueryClient();
  const session = getApiSession();
  return useMemo(() => createWriteActions(client, session), [client, session]);
}
