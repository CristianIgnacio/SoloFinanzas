import { queryOptions } from "@tanstack/react-query";
import { ReportService } from "../services/reportService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const reportsQueries = {
  accounts: (userId: string) => queryOptions({
    ...cachePolicies.financial,
    queryKey: queryKeys.reports.accounts(userId),
    queryFn: readQuery(signal => ReportService.accounts(signal)),
  }),
  periods: (userId: string, statementId?: number) => queryOptions({
    ...cachePolicies.periods,
    queryKey: queryKeys.reports.periods(userId, statementId),
    queryFn: readQuery(signal => ReportService.periods(statementId, signal)),
  }),
};
