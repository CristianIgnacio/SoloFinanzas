import type { QueryClient } from "@tanstack/react-query";
import { isCurrentApiSession, type ApiSession } from "../lib/apiSession";
import type { Transaction } from "../types";
import { queryKeys } from "./keys";
import { assertWriteSession, executeWrite } from "./invalidation";
import { categoryPreviews, mapTransactions, patchTransaction } from "./transactionCache";

const locks = new WeakMap<QueryClient, Set<number>>();

/** Same-row exclusion covers set, confirm and undo across component instances.
 * The write coordinator includes preparation/rollback, so parallel rows share
 * one final reconciliation even when some saves fail. */
export async function executeCategoryWrite(client: QueryClient, session: ApiSession | null,
  id: number, request: () => Promise<Transaction>, categoryId?: number | null) {
  assertWriteSession(session);
  let locked = locks.get(client);
  if (!locked) { locked = new Set(); locks.set(client, locked); }
  if (locked.has(id)) throw new Error("Este movimiento ya tiene un cambio en curso.");
  locked.add(id);
  const filter = { queryKey: queryKeys.transactions.all(session.userId) };
  const pending = categoryPreviews(client);
  const originals = new Map<string, Transaction>();
  let fallback: Transaction | undefined;
  const restorePreview = () => {
    if (!isCurrentApiSession(session) || categoryId === undefined) return;
    for (const query of client.getQueryCache().findAll(filter)) {
      const original = originals.get(query.queryHash) ?? fallback;
      if (!original) continue;
      client.setQueryData(query.queryKey, data => mapTransactions(data, row =>
        row.id === id && row.category_id === categoryId
          && (row.category_version ?? 0) <= (original.category_version ?? 0) ? original : row));
    }
  };
  try {
    return await executeWrite(client, session, "financial", async () => {
      await client.cancelQueries(filter);
      assertWriteSession(session);
      for (const query of client.getQueryCache().findAll(filter)) {
        mapTransactions(query.state.data, row => {
          if (row.id === id) {
            originals.set(query.queryHash, row);
            if (!fallback || (row.category_version ?? 0) > (fallback.category_version ?? 0)) fallback = row;
          }
          return row;
        });
      }
      if (fallback && categoryId !== undefined) {
        pending.set(id, { original: fallback, categoryId });
        client.setQueriesData(filter, data => mapTransactions(data, row => row.id === id ? { ...row, category_id: categoryId } : row));
      }
      try {
        const saved = await request();
        pending.delete(id);
        return saved;
      } catch (error) {
        pending.delete(id);
        restorePreview();
        throw error;
      }
    }, saved => {
      // Remove our temporary fields before comparing server versions. Otherwise
      // an older response could leave its preview on a newer cached row.
      restorePreview();
      client.setQueriesData(filter, data => patchTransaction(data, saved));
    });
  } finally {
    pending.delete(id);
    locked.delete(id);
  }
}
