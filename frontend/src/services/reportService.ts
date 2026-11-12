import { apiClient } from "../lib/apiClient";

export type AccountTotal = {
  account_id: number;
  count: number;
  net: number;
  income: number;
  expenses: number;
};
export const ReportService = {
  accounts: (signal?: AbortSignal) => apiClient.get<AccountTotal[]>("/reports/accounts", { signal }),
  periods: (statement_id?: number, signal?: AbortSignal) =>
    apiClient.get<string[]>("/reports/periods", { params: { statement_id }, signal }),
};
