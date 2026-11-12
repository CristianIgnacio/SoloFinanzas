import { apiClient } from "../lib/apiClient";
import type { Account, AccountCreate, AccountUpdate, CashAccount, CashBalance, CashOpeningBalanceInput, FinancialProduct } from "../types";

export class AccountService {
  static async getCashAccount(signal?: AbortSignal): Promise<CashAccount> {
    return apiClient.get<CashAccount>("/cash-account", { signal });
  }
  static async getCashBalance(signal?: AbortSignal): Promise<CashBalance> {
    return apiClient.get<CashBalance>("/cash-account/balance", { signal });
  }
  static async updateCashBalance(data: CashOpeningBalanceInput): Promise<CashBalance> {
    return apiClient.put<CashBalance>("/cash-account/balance", data);
  }
  static async clearCashBalance(): Promise<CashBalance> {
    return apiClient.delete<CashBalance>("/cash-account/balance");
  }
  static async getProducts(signal?: AbortSignal): Promise<FinancialProduct[]> {
    return apiClient.get<FinancialProduct[]>("/account-products", { signal });
  }

  static async getAccounts(signal?: AbortSignal): Promise<Account[]> {
    return apiClient.get<Account[]>("/accounts", { signal });
  }

  static async createAccount(data: AccountCreate): Promise<Account> {
    return apiClient.post<Account>("/accounts", data);
  }

  static async updateAccount(accountId: number, data: AccountUpdate): Promise<Account> {
    return apiClient.put<Account>(`/accounts/${accountId}`, data);
  }

  static async deleteAccount(accountId: number): Promise<void> {
    await apiClient.delete(`/accounts/${accountId}`);
  }
}
