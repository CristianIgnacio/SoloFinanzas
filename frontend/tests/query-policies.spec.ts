import { expect, test } from "@playwright/test";
import { hashKey } from "@tanstack/react-query";
import { queryKeys, normalizeSelection } from "../src/query/keys";
import { setupFixture, owner } from "../benchmarks/fixture";

test("claves normalizan defaults sin mezclar filtros, formatos ni usuarios", () => {
  const base = queryKeys.transactions.page(owner);
  expect(hashKey(base)).toBe(hashKey(queryKeys.transactions.page(owner, {
    offset: 0, limit: 50, search: "  ", uncategorized: false, exclude_internal: false,
  })));
  expect(hashKey(queryKeys.transactions.page(owner, { search: " Café " })))
    .toBe(hashKey(queryKeys.transactions.page(owner, { search: "Café" })));
  for (const filters of [{ account_id: 1 }, { statement_id: 1 }, { date_from: "2026-10-01" },
    { date_to: "2026-10-31" }, { category_id: 1 }, { transaction_type: "income" },
    { uncategorized: true }, { exclude_internal: true }, { search: "Café" }, { limit: 100 }, { offset: 50 }]) {
    expect(hashKey(queryKeys.transactions.page(owner, filters))).not.toBe(hashKey(base));
  }
  const keys = [base, queryKeys.transactions.infinite(owner), queryKeys.transactions.month(owner, "2026-10"),
    queryKeys.transactions.uncategorizedCount(owner, "2026-10"), queryKeys.transactions.page("another-user")];
  expect(new Set(keys.map(hashKey)).size).toBe(keys.length);
  expect(normalizeSelection(new Set([3, 1, 2]))).toEqual(normalizeSelection([2, 3, 1, 2]));
  expect(queryKeys.transactions.infinite(owner).at(-1)).not.toHaveProperty("offset");
  expect(() => queryKeys.profile(" ")).toThrow();
});

test("políticas y reintentos distinguen transitorios, cancelaciones y efectos laterales", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts";
    const h = await import(path);
    const transient = [502, 503, 504].map(s => new h.ApiRequestError("server", "HTTP_ERROR", "", s));
    const permanent = [400, 401, 403, 404, 409, 422, 429, 500].map(s => new h.ApiRequestError("server", "HTTP_ERROR", "", s));
    const network = new h.ApiRequestError("network", "ERR_NETWORK");
    const client = h.createQueryClient();
    let attempts = 0;
    await client.fetchQuery({ queryKey: ["retry-test"], retryDelay: 0, queryFn: async () => { attempts++; throw network; } }).catch(() => {});
    const options = [h.profileQueries.current("user"), h.learningQueries.patterns("user"), h.learningQueries.proposals("user")];
    const data = {
      transient: transient.map(e => [h.retryRead(0, e), h.retryRead(1, e)]),
      permanent: permanent.map(e => h.retryRead(0, e)),
      unknown: h.retryRead(0, new Error("bug")),
      cancelled: h.retryRead(0, { __CANCEL__: true }), attempts,
      delay: h.retryReadDelay(0, new h.ApiRequestError("server", "HTTP_ERROR", "", 503, "3")),
      longWait: h.retryRead(0, new h.ApiRequestError("server", "HTTP_ERROR", "", 503, "60")),
      special: options.map(o => [o.retry, o.refetchOnWindowFocus, o.refetchOnReconnect]),
      ttl: Object.fromEntries(Object.entries(h.cachePolicies).map(([k, v]: any) => [k, [v.staleTime, v.gcTime]])),
      mutationRetry: client.getDefaultOptions().mutations.retry,
      polling: client.getDefaultOptions().queries.refetchInterval,
    };
    client.clear(); return data;
  });
  expect(result.transient).toEqual([[true, false], [true, false], [true, false]]);
  expect(result.permanent.every(v => !v)).toBe(true);
  expect(result).toMatchObject({ unknown: false, cancelled: false, attempts: 2, delay: 3000, longWait: false, mutationRetry: false, polling: false });
  expect(result.special).toEqual([[false, false, false], [false, false, false], [false, false, false]]);
  expect(result.ttl).toEqual({ profile: [300000, 900000], products: [86400000, 1800000], accounts: [300000, 900000],
    catalog: [120000, 900000], statements: [120000, 900000], periods: [120000, 900000], financial: [30000, 600000],
    month: [60000, 300000], learning: [30000, 300000], statementImpact: [0, 60000] });
});

test("consultas equivalentes reutilizan datos y no dependen de mutar el objeto de filtros", async ({ page }) => {
  await setupFixture(page); await page.goto("/app/profile");
  await expect(page.getByRole("main").getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  const requests: URL[] = [];
  page.on("request", request => { const url = new URL(request.url()); if (url.pathname.endsWith("/transaction-pages")) requests.push(url); });
  const result = await page.evaluate(async user => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient();
    const filters = { account_id: 1, offset: 0 };
    const original = h.transactionsQueries.page(user, filters);
    filters.account_id = 3;
    const first = await client.fetchQuery(original);
    await client.fetchQuery(h.transactionsQueries.page(user, { account_id: 1, limit: 50, search: " " }));
    await client.invalidateQueries({ queryKey: h.queryKeys.transactions.all(user), refetchType: "none" });
    await client.fetchQuery(original);
    await client.fetchQuery(h.transactionsQueries.page(user, { account_id: 1, offset: 50 }));
    client.clear(); return first.items[0].account_id;
  }, owner);
  expect(result).toBe(1);
  expect(requests).toHaveLength(3);
  expect(requests.map(u => u.searchParams.get("account_id"))).toEqual(["1", "1", "1"]);
  expect(requests.map(u => u.searchParams.get("offset"))).toEqual(["0", "0", "50"]);
});

test("429 respeta Retry-After incluso con refetch explícito y otra fábrica de opciones", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(), nextSession = h.createQueryClient();
    let calls = 0, now = 1794063600000;
    const originalNow = Date.now; Date.now = () => now;
    const options = () => ({ queryKey: ["user", "same-user", "limited"], queryFn: h.readQuery(async () => {
      calls++; throw new h.ApiRequestError("limited", "LIMIT", "", 429, "2");
    }) });
    try {
      await client.fetchQuery(options()).catch(() => {});
      await client.fetchQuery(options()).catch(() => {});
      const before = calls;
      now += 2001;
      await client.fetchQuery(options()).catch(() => {});
      const after = calls;
      await nextSession.fetchQuery(options()).catch(() => {});
      return { before, after, freshSession: calls,
        dateDelay: h.retryAfterMs(new Date(now + 5000).toUTCString(), now),
        invalid: h.retryAfterMs("invalid", now), expired: h.retryAfterMs(new Date(now - 5000).toUTCString(), now) };
    } finally { Date.now = originalNow; client.clear(); nextSession.clear(); }
  });
  expect(result).toMatchObject({ before: 1, after: 2, freshSession: 3, invalid: 0, expired: 0 });
  expect(result.dateDelay).toBeGreaterThan(4000);
  expect(result.dateDelay).toBeLessThanOrEqual(5000);
});

test("datos vigentes no recargan por foco; datos obsoletos se revalidan por foco y reconexión", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(); client.mount();
    let calls = 0;
    const observer = new h.QueryObserver(client, { queryKey: ["focus-test"], staleTime: 60000, queryFn: async () => ++calls });
    const unsubscribe = observer.subscribe(() => {});
    const settle = () => new Promise(resolve => setTimeout(resolve, 30));
    try {
      await settle(); h.focusManager.setFocused(false); h.focusManager.setFocused(true); await settle();
      const fresh = calls;
      await client.invalidateQueries({ queryKey: ["focus-test"], refetchType: "none" });
      const invalidated = calls;
      h.focusManager.setFocused(false); h.focusManager.setFocused(true); await settle();
      const focus = calls;
      await client.invalidateQueries({ queryKey: ["focus-test"], refetchType: "none" });
      h.onlineManager.setOnline(false); h.onlineManager.setOnline(true); await settle();
      return { fresh, invalidated, focus, reconnect: calls };
    } finally { unsubscribe(); client.unmount(); client.clear(); h.focusManager.setFocused(undefined); h.onlineManager.setOnline(true); }
  });
  expect(result).toEqual({ fresh: 1, invalidated: 1, focus: 2, reconnect: 3 });
});
