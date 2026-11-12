import { isCancelledError, type DefaultOptions } from "@tanstack/react-query";
import axios from "axios";
import { ApiRequestError } from "../lib/apiClient";

const minute = 60_000;

/** Retry-After supports both seconds and an HTTP date. Invalid headers imply no delay. */
export function retryAfterMs(value?: string, now = Date.now()): number {
  if (!value?.trim()) return 0;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function retryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1 || axios.isCancel(error) || isCancelledError(error)) return false;
  if (!(error instanceof ApiRequestError)) return false;
  // A long server-imposed delay requires an explicit retry, not a hidden long wait.
  if (retryAfterMs(error.retryAfter) > 5000) return false;
  return error.status === undefined
    ? ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error.code)
    : [502, 503, 504].includes(error.status);
}

export function retryReadDelay(_attempt: number, error: unknown): number {
  return Math.min(5000, Math.max(1000, error instanceof ApiRequestError ? retryAfterMs(error.retryAfter) : 0));
}

export const queryDefaults = {
  queries: {
    staleTime: 30_000, gcTime: 10 * minute,
    retry: retryRead, retryDelay: retryReadDelay,
    refetchOnMount: true, refetchOnWindowFocus: true, refetchOnReconnect: true,
    refetchInterval: false,
  },
  mutations: { retry: false },
} satisfies DefaultOptions;

export const cachePolicies = {
  profile: { staleTime: 5 * minute, gcTime: 15 * minute, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false },
  products: { staleTime: 24 * 60 * minute, gcTime: 30 * minute },
  accounts: { staleTime: 5 * minute, gcTime: 15 * minute },
  catalog: { staleTime: 2 * minute, gcTime: 15 * minute },
  statements: { staleTime: 2 * minute, gcTime: 15 * minute },
  periods: { staleTime: 2 * minute, gcTime: 15 * minute },
  financial: { staleTime: 30_000, gcTime: 10 * minute },
  month: { staleTime: minute, gcTime: 5 * minute },
  learning: { staleTime: 30_000, gcTime: 5 * minute, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false },
  statementImpact: { staleTime: 0, gcTime: minute },
} as const;
