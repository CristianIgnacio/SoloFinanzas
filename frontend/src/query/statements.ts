import { queryOptions } from "@tanstack/react-query";
import { StatementService } from "../services/statementService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const statementsQueries = {
  list: (userId: string, accountId?: number) => queryOptions({
    ...cachePolicies.statements,
    queryKey: queryKeys.statements(userId, accountId),
    queryFn: readQuery(signal => StatementService.getStatements(accountId, signal)),
  }),
  impact: (userId: string, statementId: number) => queryOptions({
    ...cachePolicies.statementImpact,
    queryKey: queryKeys.statementImpact(userId, statementId),
    queryFn: readQuery(signal => StatementService.getDeletionImpact(statementId, signal)),
  }),
};
