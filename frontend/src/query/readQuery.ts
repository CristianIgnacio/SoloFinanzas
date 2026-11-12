import { hashKey, type QueryClient, type QueryFunction } from "@tanstack/react-query";
import { ApiRequestError } from "../lib/apiClient";
import { retryAfterMs } from "./policies";

type Cooldown = { until: number; error: ApiRequestError };
const cooldowns = new WeakMap<QueryClient, Map<string, Cooldown>>();

/** A manual refetch must also respect Retry-After after HTTP 429.
 * Per-client storage survives option factory recreation, never another session.
 * No timer, polling, or automatic resubmission is introduced.
 */
export function readQuery<T>(read: (signal: AbortSignal, client: QueryClient) => Promise<T>): QueryFunction<T> {
  return async ({ client, queryKey, signal }) => {
    let blocked = cooldowns.get(client);
    if (!blocked) { blocked = new Map(); cooldowns.set(client, blocked); }
    const now = Date.now();
    for (const [key, value] of blocked) if (value.until <= now) blocked.delete(key);
    const key = hashKey(queryKey);
    const previous = blocked.get(key);
    if (previous) throw previous.error;
    try {
      return await read(signal, client);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 429) {
        const delay = retryAfterMs(error.retryAfter);
        if (delay > 0) blocked.set(key, { until: Date.now() + delay, error });
      }
      throw error;
    }
  };
}
