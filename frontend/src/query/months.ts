import { queryOptions, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CanceledError } from "axios";
import { TransactionService } from "../services/transactionService";
import type { Transaction } from "../types";
import { queryKeys, normalizeSelection } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";
import { useQueryOwner } from "./shared";
import { applyCategoryPreviews } from "./transactionCache";

export const MONTH_PAGE_SIZE = 1000;
export function monthRange(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Período inválido.");
  const [year, month] = period.split("-").map(Number);
  return { date_from: `${period}-01`, date_to: `${period}-${new Date(year, month, 0).getDate()}` };
}

/** Partial pages stay local: Query receives data only after the entire month. */
export async function loadCompleteMonth(period: string, signal: AbortSignal) {
  const rows: Transaction[] = [];
  for (let offset = 0; ; offset += MONTH_PAGE_SIZE) {
    if (signal.aborted) throw new CanceledError();
    const page = await TransactionService.getTransactions({ ...monthRange(period), limit: MONTH_PAGE_SIZE, offset }, signal);
    if (signal.aborted) throw new CanceledError();
    rows.push(...page);
    if (page.length < MONTH_PAGE_SIZE) return rows;
  }
}

type Queue = { active: number; waiting: Array<() => void> };
const queues = new WeakMap<QueryClient, Queue>();
/** A slot covers all pages of a month; queued work can be canceled without HTTP. */
async function inMonthSlot<T>(client: QueryClient, signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  let queue = queues.get(client);
  if (!queue) { queue = { active: 0, waiting: [] }; queues.set(client, queue); }
  const state = queue;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      state.waiting = state.waiting.filter(entry => entry !== start);
      reject(new CanceledError());
    };
    const start = () => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) { reject(new CanceledError()); return; }
      state.active++;
      resolve();
    };
    if (signal.aborted) { reject(new CanceledError()); return; }
    if (state.active < 2) start();
    else { state.waiting.push(start); signal.addEventListener("abort", abort, { once: true }); }
  });
  try {
    if (signal.aborted) throw new CanceledError();
    return await read();
  } finally {
    state.active--;
    while (state.active < 2 && state.waiting.length) state.waiting.shift()!();
  }
}

export const monthQueries = {
  complete: (userId: string, period: string) => queryOptions({
    ...cachePolicies.month,
    queryKey: queryKeys.transactions.month(userId, period),
    queryFn: context => inMonthSlot(context.client, context.signal,
      async () => readQuery(async (signal, client) => applyCategoryPreviews(client, await loadCompleteMonth(period, signal)))(context)),
  }),
  uncategorized: (userId: string, period: string) => queryOptions({
    ...cachePolicies.financial,
    queryKey: queryKeys.transactions.uncategorizedCount(userId, period),
    queryFn: readQuery(async signal => (await TransactionService.getPage({ ...monthRange(period), uncategorized: true, limit: 1, offset: 0 }, signal)).total),
  }),
};

type Snapshot = { periods: string[]; transactions: Transaction[] };
const emptySnapshot: Snapshot = { periods: [], transactions: [] };
/** Keep selection and last complete display separate, never sum partial months. */
export function useCompleteMonths(selection: Iterable<string>) {
  const owner = useQueryOwner();
  const client = useQueryClient();
  const selectionKey = JSON.stringify(normalizeSelection(selection));
  const periods = useMemo<string[]>(() => JSON.parse(selectionKey), [selectionKey]);
  const combine = useCallback((results: UseQueryResult<Transaction[], Error>[]) => ({
    snapshot: results.every(result => result.isSuccess && !result.isFetching)
      ? { periods, transactions: results.flatMap(result => result.data!) } : null,
    loading: results.some(result => result.isPending || result.isFetching),
    error: results.find(result => result.error)?.error ?? null,
  }), [periods]);
  const combined = useQueries({ queries: periods.map(period => monthQueries.complete(owner, period)), combine });
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const complete = periods.length === 0 ? emptySnapshot : combined.snapshot;
  useEffect(() => { if (complete) setPrevious(complete); }, [complete]);
  const retry = () => client.refetchQueries({ predicate: query => query.queryKey[0] === "user"
    && query.queryKey[1] === owner && query.queryKey[2] === "transactions" && query.queryKey[3] === "month"
    && periods.includes(String(query.queryKey[4])) && query.state.status === "error", type: "active" });
  return { ...combined, snapshot: complete ?? previous, complete, retry };
}
