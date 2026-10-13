import { apiClient } from "../lib/apiClient";
import type { Account, AccountCreate, AccountUpdate, CashAccount, CashBalance, CashOpeningBalanceInput, FinancialProduct } from "../types";

export class AccountService {
  static async getCashAccount(): Promise<CashAccount> {
    return apiClient.get<CashAccount>("/cash-account");
  }
  static async getCashBalance(): Promise<CashBalance> {
    return apiClient.get<CashBalance>("/cash-account/balance");
  }
  static async updateCashBalance(data: CashOpeningBalanceInput): Promise<CashBalance> {
    return apiClient.put<CashBalance>("/cash-account/balance", data);
  }
  static async clearCashBalance(): Promise<CashBalance> {
    return apiClient.delete<CashBalance>("/cash-account/balance");
  }
  static async getProducts(): Promise<FinancialProduct[]> {
    return apiClient.get<FinancialProduct[]>("/account-products");
  }

  static async getAccounts(): Promise<Account[]> {
    return apiClient.get<Account[]>("/accounts");
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
