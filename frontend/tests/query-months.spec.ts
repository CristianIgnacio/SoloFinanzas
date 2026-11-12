import { expect, test } from "@playwright/test";
import { setupFixture } from "../benchmarks/fixture";

test("Dashboard espera el período del servidor y comparte A, A+B y A con Análisis", async ({ page }) => {
  await setupFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/dashboard", async route => { await gate; await route.fallback(); });
  const months: string[] = [];
  const counts: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/transactions") months.push(url.searchParams.get("date_from")!);
    if (url.pathname === "/api/v1/transaction-pages") counts.push(url.searchParams.get("date_from")!);
  });
  await page.goto("/app");
  await expect(page.getByText("Cargando inicio...", { exact: true })).toBeVisible();
  expect(months).toEqual([]); expect(counts).toEqual([]);
  release();
  await expect(page.getByRole("combobox", { name: "Seleccionar período de inicio" })).toBeVisible();
  expect(months).toEqual(["2026-10-01"]); expect(counts).toEqual(["2026-10-01"]);
  await page.getByRole("link", { name: "Análisis", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  for (const checked of [true, false]) {
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Filtros del análisis", exact: true });
    await dialog.getByRole("button", { name: "Períodos", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "septiembre de 2026", exact: true }).setChecked(checked);
    await dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(page.getByText("Cargando los meses seleccionados…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tabpanel")).toBeVisible();
  }
  expect(months).toEqual(["2026-10-01", "2026-09-01"]);
  await page.getByRole("button", { name: "Quitar filtro Periodo: octubre de 2026", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("0 movimientos");
  expect(months).toHaveLength(2);
});

test("un mes de varias páginas se publica completo y un fallo no cachea páginas parciales", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient();
    const calls: number[] = [];
    let fail = true;
    h.TransactionService.getTransactions = async (filters: { offset: number }, signal: AbortSignal) => {
      if (!signal) throw new Error("missing signal");
      calls.push(filters.offset);
      if (filters.offset === 0) return Array.from({ length: h.MONTH_PAGE_SIZE }, (_, id) => ({ id }));
      if (fail) throw new Error("second page failed");
      return [{ id: 1000 }];
    };
    const options = h.monthQueries.complete("owner", "2026-10");
    await client.fetchQuery(options).catch(() => {});
    const partial = client.getQueryData(options.queryKey);
    fail = false;
    const complete = await client.fetchQuery(options);
    const cached = await client.fetchQuery(h.monthQueries.complete("owner", "2026-10"));
    client.clear();
    return { calls, partial: partial === undefined, total: complete.length, reused: cached === complete };
  });
  expect(result).toEqual({ calls: [0, 1000, 0, 1000], partial: true, total: 1001, reused: true });
});

test("máximo dos meses simultáneos; cancelar retira trabajos en espera y aborta páginas activas", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient();
    let active = 0, peak = 0, aborted = 0;
    const started: string[] = [];
    const releases: Array<() => void> = [];
    h.TransactionService.getTransactions = (filters: { date_from: string }, signal: AbortSignal) => new Promise((resolve, reject) => {
      active++; peak = Math.max(peak, active); started.push(filters.date_from);
      const abort = () => { active--; aborted++; reject(new DOMException("aborted", "AbortError")); };
      signal.addEventListener("abort", abort, { once: true });
      releases.push(() => { signal.removeEventListener("abort", abort); active--; resolve([]); });
    });
    const options = ["2026-08", "2026-09", "2026-10", "2026-11"].map(period => h.monthQueries.complete("owner", period));
    const all = Promise.allSettled(options.map(option => client.fetchQuery(option)));
    // Allow query functions to enter the limiter; no real-time polling needed.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const initial = started.length;
    await client.cancelQueries({ queryKey: options[2].queryKey, exact: true });
    releases[0]();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await client.cancelQueries({ queryKey: ["user", "owner", "transactions", "month"] });
    await all;
    const partial = options.some(option => client.getQueryData(option.queryKey)?.length);
    client.clear(); return { initial, peak, started, aborted, partial: !!partial };
  });
  expect(result.initial).toBe(2); expect(result.peak).toBe(2);
  expect(result.started).toEqual(["2026-08-01", "2026-09-01", "2026-11-01"]);
  expect(result.aborted).toBe(2); expect(result.partial).toBe(false);
});


test("Dashboard conserva resumen y mes juntos cuando falla el nuevo mes", async ({ page }) => {
  await setupFixture(page);
  await page.route("**/api/v1/dashboard**", route => {
    const period = new URL(route.request().url()).searchParams.get("period_month") ?? "2026-10";
    return route.fulfill({ json: { period_month: period, available_periods: ["2026-10", "2026-09"],
      cards: [{ label: "Saldo", value: `Resumen ${period}`, trend: "" }], monthly_movements: [] } });
  });
  let failing = true;
  await page.route("**/api/v1/transactions?**", route => {
    if (failing && new URL(route.request().url()).searchParams.get("date_from") === "2026-09-01")
      return route.fulfill({ status: 400, json: { detail: "Mes no disponible" } });
    return route.fallback();
  });
  await page.goto("/app");
  await expect(page.getByText("Resumen 2026-10", { exact: true })).toHaveCount(2);
  await page.getByRole("combobox", { name: "Seleccionar período de inicio" }).selectOption("2026-09");
  await expect(page.getByText("Mes no disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Resumen 2026-10", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Resumen 2026-09", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Sigues viendo los datos de Octubre de 2026/)).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText("Resumen 2026-09", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Resumen 2026-10", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Mes no disponible", { exact: true })).toHaveCount(0);
});
