import type { QueryClient } from "@tanstack/react-query";
import type { Transaction } from "../types";

/** Visit rows without replacing page metadata, totals or infinite pageParams. */
export function mapTransactions(data: unknown, update: (row: Transaction) => Transaction): unknown {
  if (Array.isArray(data)) return data.map(row => row && typeof row === "object" && "id" in row ? update(row) : row);
  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    if (Array.isArray(value.pages)) return { ...value, pages: value.pages.map(page => mapTransactions(page, update)) };
    if (Array.isArray(value.items)) return { ...value, items: mapTransactions(value.items, update) };
  }
  return data;
}

export function patchTransaction(data: unknown, transaction: Transaction): unknown {
  return mapTransactions(data, row => row.id === transaction.id
    && (row.category_version ?? 0) <= (transaction.category_version ?? 0) ? transaction : row);
}

export type CategoryPreview = { original: Transaction; categoryId: number | null };
const previews = new WeakMap<QueryClient, Map<number, CategoryPreview>>();
export function categoryPreviews(client: QueryClient) {
  let entries = previews.get(client);
  if (!entries) { entries = new Map(); previews.set(client, entries); }
  return entries;
}

/** A focus/refetch during a save must not erase another row's pending edit. */
export function applyCategoryPreviews<T>(client: QueryClient, data: T): T {
  const pending = previews.get(client);
  if (!pending?.size) return data;
  return mapTransactions(data, row => {
    const preview = pending.get(row.id);
    return preview && (row.category_version ?? 0) <= (preview.original.category_version ?? 0)
      ? { ...row, category_id: preview.categoryId } : row;
  }) as T;
}
