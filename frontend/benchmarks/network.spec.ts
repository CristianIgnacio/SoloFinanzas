import { expect, test, type Request } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { setupFixture } from "./fixture";

test("línea base de llamadas HTTP", async ({ page }, info) => {
  await setupFixture(page);
  type Entry = { endpoint: string; outcome: string; bytes: number; durationMs: number; start: number };
  const entries = new Map<Request, Entry>();
  const bodyReads: Promise<void>[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/v1/")) return;
    entries.set(request, { endpoint: `${request.method()} ${url.pathname}`, outcome: "pending", bytes: 0, durationMs: 0, start: performance.now() });
  });
  page.on("requestfinished", request => {
    const e = entries.get(request); if (!e) return;
    e.outcome = "completed"; e.durationMs = performance.now() - e.start;
    bodyReads.push((async () => { const response = await request.response(); if (response) e.bytes = (await response.body()).length; })());
  });
  page.on("requestfailed", request => {
    const e = entries.get(request); if (!e) return;
    e.outcome = /abort|cancel/i.test(request.failure()?.errorText ?? "") ? "cancelled" : "failed";
    e.durationMs = performance.now() - e.start;
  });
  const measurements: unknown[] = [];
  async function settle() {
    await expect.poll(() => {
      const rows = [...entries.values()];
      return rows.every(r => r.outcome !== "pending") && rows.every(r => performance.now() - r.start - r.durationMs > 200);
    }).toBe(true);
    await Promise.all(bodyReads);
  }
  async function measure(name: string, action: () => Promise<unknown>, ready: () => Promise<unknown>) {
    const before = new Set(entries.keys()), start = performance.now();
    await action(); await ready();
    const usefulMs = performance.now() - start;
    await settle();
    await ready();
    const rows = [...entries].filter(([r]) => !before.has(r)).map(([, e]) => e);
    const endpoints: Record<string, { started: number; completed: number; cancelled: number; failed: number; pending: number; decodedBytes: number }> = {};
    for (const row of rows) {
      const total = endpoints[row.endpoint] ??= { started: 0, completed: 0, cancelled: 0, failed: 0, pending: 0, decodedBytes: 0 };
      total.started++; total[row.outcome as "completed"]++; total.decodedBytes += row.bytes;
    }
    measurements.push({ name, uiCheckpointMs: Math.round(usefulMs), apiCompleteMs: Math.round(Math.max(0, ...rows.map(r => r.start + r.durationMs - start))), started: rows.length, decodedBytes: rows.reduce((s, r) => s + r.bytes, 0), endpoints });
    expect(rows.filter(r => r.outcome === "failed" || r.outcome === "pending")).toHaveLength(0);
  }
  const readyScreen = async (name: string) => {
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    if (name === "Cuentas") await expect(page.getByRole("button", { name: "Movimientos (250)", exact: true })).toBeVisible();
    if (name === "Movimientos") await expect(page.getByRole("button", { name: "Mostrar detalles de Compra 1-2026-10-1", exact: true })).toBeVisible();
    if (name === "Análisis") await expect(page.getByRole("tabpanel")).toBeVisible();
    if (name === "Inicio") await expect(page.getByRole("link", { name: "Ver detalle de Efectivo" })).toBeVisible();
  };
  const navigate = (name: string) => page.getByRole("navigation", { name: "Navegación principal", exact: true }).getByRole("link", { name, exact: true }).click();
  await measure("dashboard-cold", () => page.goto("/app"), () => expect(page.getByRole("link", { name: "Ver detalle de Efectivo" })).toBeVisible());
  for (const [link, title] of [["Cuentas", "Cuentas"], ["Movimientos", "Movimientos"], ["Análisis", "Análisis"], ["Inicio", "Inicio"]]) {
    await measure(`navigation-${link}`, () => navigate(link), () => readyScreen(title));
  }
  for (const account of [1, 3]) {
    await page.goto(`/app/accounts?account_id=${account}`);
    await page.waitForLoadState("networkidle");
    if (account === 1) await page.getByRole("button", { name: "Movimientos (250)", exact: true }).click();
    const region = page.getByRole("region", { name: "Movimientos de la cuenta", exact: true });
    const pagination = page.getByRole("navigation", { name: "Paginación de movimientos de la cuenta", exact: true });
    await measure(`pagination-${account}`, () => pagination.getByRole("button", { name: "Siguiente", exact: true }).click(),
      () => expect(region.getByRole("cell", { name: `Compra ${account}-2026-10-51`, exact: true })).toBeVisible());
  }
  await navigate("Análisis"); await page.waitForLoadState("networkidle");
  for (const label of ["add-month", "remove-month"]) {
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Filtros del análisis", exact: true });
    await dialog.getByRole("button", { name: "Períodos", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "septiembre de 2026", exact: true }).setChecked(label === "add-month");
    await measure(label, () => dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click(), async () => {
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText("Cargando los meses seleccionados…", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("tabpanel")).toBeVisible();
    });
  }
  await navigate("Movimientos"); await page.waitForLoadState("networkidle");
  const description = "Compra 1-2026-10-1";
  await page.getByRole("button", { name: `Mostrar detalles de ${description}`, exact: true }).click();
  await page.getByRole("button", { name: `Categoria de ${description}`, exact: true }).click();
  await measure("save-category", () => page.getByRole("dialog", { name: "Seleccionar categoría", exact: true }).getByRole("button", { name: "Compras", exact: true }).click(),
    () => expect(page.getByRole("button", { name: "Deshacer cambio de categoría" })).toBeVisible());
  const output = info.outputPath("network-baseline.json");
  await writeFile(output, JSON.stringify({ mode: info.project.name, fixture: "v1-500-transactions-20ms", date: "2026-11-07", measurements }, null, 2));
  await info.attach("network-baseline.json", { path: output, contentType: "application/json" });
});
