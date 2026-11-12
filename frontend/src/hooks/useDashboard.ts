import { useQuery } from "@tanstack/react-query";
import { dashboardQueries } from "../query/dashboard";
import { useQueryOwner } from "../query/shared";

export function useDashboard(periodMonth?: string) {
  const query = useQuery(dashboardQueries.summary(useQueryOwner(), periodMonth));
  return { data: query.data ?? null, loading: query.isPending, error: query.error?.message ?? null, query };
}
