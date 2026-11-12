import { queryOptions } from "@tanstack/react-query";
import { CategoryService } from "../services/categoryService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const learningQueries = {
  patterns: (userId: string) => queryOptions({
    ...cachePolicies.learning,
    queryKey: queryKeys.learning(userId, "patterns"),
    queryFn: readQuery(signal => CategoryService.patterns(signal)),
  }),
  proposals: (userId: string) => queryOptions({
    ...cachePolicies.learning,
    queryKey: queryKeys.learning(userId, "proposals"),
    queryFn: readQuery(signal => CategoryService.ruleProposals(signal)),
  }),
  memory: (userId: string) => queryOptions({
    ...cachePolicies.learning,
    queryKey: queryKeys.learning(userId, "memory"),
    queryFn: readQuery(signal => CategoryService.memory(signal)),
  }),
};
