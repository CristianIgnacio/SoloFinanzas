import { apiClient } from "../lib/apiClient";
import type { Account, AccountCreate, AccountUpdate } from "../types";

export class AccountService {
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
