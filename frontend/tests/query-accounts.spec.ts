import { expect, test } from "@playwright/test";
import { setupFixture } from "../benchmarks/fixture";

for (const account of [1, 3]) {
  test(`paginar cuenta ${account} pide solo una página de movimientos`, async ({ page }) => {
    await setupFixture(page);
    await page.goto(`/app/accounts?account_id=${account}`);
    await page.waitForLoadState("networkidle");
    if (account === 1) await page.getByRole("button", { name: "Movimientos (250)", exact: true }).click();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/transaction-pages?**", async route => {
      if (new URL(route.request().url()).searchParams.get("offset") === "50") await gate;
      await route.fallback();
    });
    const urls: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/v1/")) urls.push(request.url()); });
    const pagination = page.getByRole("navigation", { name: "Paginación de movimientos de la cuenta", exact: true });
    await pagination.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.getByText("Cargando movimientos… Se muestra la página anterior.", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: `Compra ${account}-2026-10-1`, exact: true })).toBeVisible();
    await expect(pagination.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("cell", { name: `Compra ${account}-2026-10-51`, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).pathname).toBe("/api/v1/transaction-pages");
    expect(new URL(urls[0]).searchParams.get("offset")).toBe("50");
    // Returning to a fresh page uses its cached data.
    urls.length = 0;
    await pagination.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(page.getByRole("cell", { name: `Compra ${account}-2026-10-1`, exact: true })).toBeVisible();
    expect(urls).toHaveLength(0);
  });
}

test("cambiar de cuenta reinicia offset y no muestra filas anteriores bajo el nuevo título", async ({ page }) => {
  await setupFixture(page);
  await page.route("**/api/v1/accounts", route => route.fulfill({ json: [1, 2].map(id => ({ id, name: `Banco ${id}`, account_type: "debito", institution: "banco_de_chile", currency: "CLP" })) }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const offsets: string[] = [];
  await page.route("**/api/v1/transaction-pages?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("account_id") !== "2") return route.fallback();
    offsets.push(params.get("offset")!);
    await gate;
    await route.fulfill({ json: { items: [], total: 0, limit: 50, offset: 0 } });
  });
  await page.goto("/app/accounts?account_id=1");
  await page.getByRole("button", { name: "Movimientos (250)", exact: true }).click();
  await page.getByRole("navigation", { name: "Paginación de movimientos de la cuenta", exact: true }).getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Compra 1-2026-10-51", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar Banco 2 de Banco de Chile", exact: true }).click();
  await expect.poll(() => offsets.length).toBe(1);
  await expect(page.getByRole("cell", { name: /Compra 1-/ })).toHaveCount(0);
  expect(offsets).toEqual(["0"]);
  release();
  await expect(page.getByRole("button", { name: "Movimientos (0)", exact: true })).toBeVisible();
});

test("navegar entre efectivo y movimientos reutiliza catálogos y saldo vigentes", async ({ page }) => {
  await setupFixture(page);
  const paths: string[] = [];
  page.on("request", request => { const url = new URL(request.url()); if (url.pathname.startsWith("/api/v1/")) paths.push(url.pathname); });
  await page.goto("/app/accounts?account_id=3");
  await expect(page.getByRole("cell", { name: "Compra 3-2026-10-1", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const catalogs = ["/accounts", "/account-products", "/categories", "/cash-account", "/cash-account/balance", "/me"];
  const before = catalogs.map(path => paths.filter(value => value === `/api/v1${path}`).length);
  await page.getByRole("link", { name: "Ver todos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Movimientos", exact: true, level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await expect(page.getByRole("cell", { name: "Compra 3-2026-10-1", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(catalogs.map(path => paths.filter(value => value === `/api/v1${path}`).length)).toEqual(before);
});
