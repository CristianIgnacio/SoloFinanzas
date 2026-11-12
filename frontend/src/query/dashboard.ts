import { queryOptions } from "@tanstack/react-query";
import { DashboardService } from "../services/dashboardService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const dashboardQueries = {
  summary: (userId: string, requestedPeriod?: string) => queryOptions({
    ...cachePolicies.financial,
    queryKey: queryKeys.dashboard(userId, requestedPeriod),
    queryFn: readQuery(signal => DashboardService.getDashboard(requestedPeriod, signal)),
  }),
};
