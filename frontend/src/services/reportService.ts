import { apiClient } from "../lib/apiClient";

export type AccountTotal = {
  account_id: number;
  count: number;
  net: number;
  income: number;
  expenses: number;
};
export const ReportService = {
  accounts: () => apiClient.get<AccountTotal[]>("/reports/accounts"),
  periods: (statement_id?: number) =>
    apiClient.get<string[]>("/reports/periods", { params: { statement_id } }),
};
