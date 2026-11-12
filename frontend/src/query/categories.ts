import { queryOptions } from "@tanstack/react-query";
import { CategoryService } from "../services/categoryService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const categoriesQueries = {
  list: (userId: string, includeInactive = true) => queryOptions({
    ...cachePolicies.catalog,
    queryKey: queryKeys.categories(userId, includeInactive),
    queryFn: readQuery(signal => CategoryService.getCategories(includeInactive, signal)),
  }),
  rules: (userId: string, categoryId?: number) => queryOptions({
    ...cachePolicies.catalog,
    queryKey: queryKeys.rules(userId, categoryId),
    queryFn: readQuery(signal => CategoryService.getCategorizationRules(categoryId, signal)),
  }),
  catalog: (userId: string) => queryOptions({
    ...cachePolicies.catalog,
    queryKey: queryKeys.categoryCatalog(userId),
    queryFn: readQuery(signal => CategoryService.catalogPreview(signal)),
  }),
};
