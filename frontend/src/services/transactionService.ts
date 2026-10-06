import { apiClient } from "../lib/apiClient";
import type { Transaction, TransactionCreate } from "../types";

export type TransactionFilters = {
  account_id?: number; statement_id?: number; date_from?: string; date_to?: string;
  transaction_type?: string; category_id?: number; uncategorized?: boolean;
  exclude_internal?: boolean; limit?: number; offset?: number;
};
export class TransactionService {
  static async getPage(filters: TransactionFilters) {
    return apiClient.get<{ items: Transaction[]; total: number; limit: number; offset: number }>('/transaction-pages', { params: filters });
  }

  static async getTransactions(filters?: {
    account_id?: number;
    statement_id?: number;
    date_from?: string;
    date_to?: string;
    transaction_type?: string;
    category_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    return apiClient.get<Transaction[]>("/transactions", {
      params: filters,
    });
  }

  static async createTransaction(data: TransactionCreate): Promise<Transaction> {
    return apiClient.post<Transaction>("/transactions", data);
  }

  static async createBulkTransactions(
    data: TransactionCreate[]
  ): Promise<Transaction[]> {
    return apiClient.post<Transaction[]>("/transactions/bulk", data);
  }

  static async updateCategory(
    transactionId: number,
    categoryId: number | null,
    categorySource?: string
  ): Promise<Transaction> {
    return apiClient.patch<Transaction>(
      `/transactions/${transactionId}/category`,
      {
        category_id: categoryId,
        category_source: categorySource,
      },
    );
  }
}
