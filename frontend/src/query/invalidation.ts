import type { QueryClient, Query } from "@tanstack/react-query";
import { CanceledError } from "axios";
import { isCurrentApiSession, type ApiSession } from "../lib/apiSession";
import { ApiRequestError } from "../lib/apiClient";

// Cross-account matching does not return all affected IDs. Invalidate these
// families for this user, including inactive pages and old/new periods.
export const financialResources = ["accounts", "cash-account", "cash-balance", "statements",
  "transactions", "reports", "dashboard", "categories", "learning", "statement-impact"] as const;
export const writePolicies = {
  account: ["accounts", "reports", "dashboard", "profile"],
  financial: financialResources,
  category: [...financialResources, "category-catalog", "rules"],
  rule: ["rules", "learning", "categories", "transactions"],
  onboarding: ["profile"],
} as const;
export type WritePolicy = keyof typeof writePolicies;
type Pending = { count: number; dirty: Set<string> };
const pending = new WeakMap<QueryClient, Map<number, Pending>>();

export function assertWriteSession(session: ApiSession | null): asserts session is ApiSession {
  if (!isCurrentApiSession(session)) throw new CanceledError("La sesión de esta operación ya terminó.");
}

/** Shared by all component instances. Concurrent successes reconcile once,
 * even when a sibling fails; writes are never retried here. */
export async function executeWrite<T>(client: QueryClient, session: ApiSession | null,
  policy: WritePolicy, request: () => Promise<T>, patch?: (result: T) => void): Promise<T> {
  assertWriteSession(session);
  let sessions = pending.get(client);
  if (!sessions) { sessions = new Map(); pending.set(client, sessions); }
  let group = sessions.get(session.id);
  if (!group) { group = { count: 0, dirty: new Set() }; sessions.set(session.id, group); }
  group.count++;
  const matches = (resources: ReadonlySet<string>) => (q: Query) =>
    q.queryKey[0] === "user" && q.queryKey[1] === session.userId && resources.has(String(q.queryKey[2]));
  try {
    const result = await request();
    assertWriteSession(session);
    const resources = new Set<string>(writePolicies[policy]);
    await client.cancelQueries({ predicate: matches(resources) });
    assertWriteSession(session);
    patch?.(result);
    resources.forEach(resource => group.dirty.add(resource));
    await client.invalidateQueries({ predicate: matches(resources), refetchType: "none" });
    return result;
  } catch (error) {
    // A version conflict is not retried. Reconcile the authoritative data once
    // the other concurrent writes have finished (after any row rollback).
    if (error instanceof ApiRequestError && error.status === 409 && isCurrentApiSession(session)) {
      const resources = new Set<string>(writePolicies[policy]);
      resources.forEach(resource => group.dirty.add(resource));
      await client.invalidateQueries({ predicate: matches(resources), refetchType: "none" });
    }
    throw error;
  } finally {
    group.count--;
    if (group.count === 0) {
      sessions.delete(session.id);
      if (isCurrentApiSession(session) && group.dirty.size) {
        // A failed refresh must not turn a committed write into a save error.
        await client.refetchQueries({ predicate: matches(group.dirty), type: "active" }).catch(() => {});
      }
    }
  }
}
