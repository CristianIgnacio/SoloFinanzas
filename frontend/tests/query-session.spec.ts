import { expect, test, type Page } from "@playwright/test";
import { setupFixture, owner } from "../benchmarks/fixture";

async function sessionId(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/apiSession.ts";
    return (await import(path)).getApiSession()?.id;
  });
}

async function broadcast(page: Page, event: string, userId: string | null) {
  await page.evaluate(({ event, userId }) => {
    const previous = JSON.parse(localStorage.getItem("sb-demo-auth-token")!);
    const session = userId ? { ...previous, user: { ...previous.user, id: userId },
      access_token: `eyJhbGciOiJFUzI1NiJ9.${btoa(JSON.stringify({ sub: userId, exp: previous.expires_at }))}.fake` } : null;
    if (session) localStorage.setItem("sb-demo-auth-token", JSON.stringify(session));
    else localStorage.removeItem("sb-demo-auth-token");
    const channel = new BroadcastChannel("sb-demo-auth-token");
    channel.postMessage({ event, session }); channel.close();
  }, { event, userId });
}

test("aprovisiona antes de consultar finanzas y comparte /me al navegar y renovar token", async ({ page, context }) => {
  await setupFixture(page);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let completed = 0;
  page.on("requestfinished", request => { if (new URL(request.url()).pathname === "/api/v1/me") completed++; });
  const financial: string[] = [];
  page.on("request", request => { const p = new URL(request.url()).pathname; if (p.startsWith("/api/v1/") && p !== "/api/v1/me") financial.push(p); });
  await page.route("**/api/v1/me", async route => { await barrier; await route.fallback(); });
  await page.goto("/app");
  await expect(page.getByText(/Preparando tu espacio/)).toBeVisible();
  expect(financial).toEqual([]);
  release();
  await expect(page.getByRole("heading", { name: "Inicio", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(completed).toBe(1);
  const initialId = await sessionId(page);
  const other = await context.newPage(); await other.goto("/");
  await broadcast(other, "TOKEN_REFRESHED", owner);
  const nav = page.getByRole("navigation", { name: "Navegación principal", exact: true });
  if (await nav.isVisible()) {
    await nav.getByRole("link", { name: "Cuentas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cuentas", exact: true })).toBeVisible();
    await nav.getByRole("link", { name: "Inicio", exact: true }).click();
  }
  await page.waitForLoadState("networkidle");
  expect(await sessionId(page)).toBe(initialId);
  expect(completed).toBe(1);
  await other.close();
});

test("/me fallido requiere reintento explícito", async ({ page }) => {
  await setupFixture(page);
  let fail = true, calls = 0;
  await page.route("**/api/v1/me", route => {
    calls++;
    return fail ? route.fulfill({ status: 503, json: { detail: "Preparación temporalmente no disponible" } }) : route.fallback();
  });
  await page.goto("/app/accounts");
  await expect(page.getByText("Preparación temporalmente no disponible")).toBeVisible();
  const before = calls;
  await page.waitForTimeout(1200); // Exceeds the default retry delay; verifies no automatic retry.
  expect(calls).toBe(before);
  fail = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cuentas", exact: true })).toBeVisible();
  expect(calls).toBe(before + 1);
});

test("conserva códigos HTTP y Retry-After, y un aborto sigue siendo cancelación", async ({ page }) => {
  await setupFixture(page); await page.goto("/app/profile");
  await expect(page.getByRole("main").getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  await page.route("**/api/v1/test-error", route => route.fulfill({ status: 429, headers: { "Retry-After": "12" },
    json: { detail: { code: "RATE_LIMIT", message: "Espera", action: "Reintenta luego" } } }));
  await page.route("**/api/v1/test-validation", route => route.fulfill({ status: 422, json: { detail: [{ msg: "Monto inválido" }] } }));
  const result = await page.evaluate(async () => {
    const path = "/src/lib/apiClient.ts";
    const { apiClient } = await import(path);
    const capture = (e: any) => ({ name: e.name, status: e.status, code: e.code, action: e.action, retryAfter: e.retryAfter, message: e.message });
    const rate = await apiClient.get("/test-error").catch(capture);
    const validation = await apiClient.get("/test-validation").catch(capture);
    const controller = new AbortController(); controller.abort();
    const cancelled = await apiClient.get("/accounts", { signal: controller.signal }).catch(capture);
    return { rate, validation, cancelled };
  });
  expect(result.rate).toMatchObject({ status: 429, code: "RATE_LIMIT", retryAfter: "12", action: "Reintenta luego", message: "Espera" });
  expect(result.validation).toMatchObject({ status: 422, message: "Monto inválido" });
  expect(result.cancelled).toMatchObject({ name: "CanceledError", code: "ERR_CANCELED" });
});

test("cambio de usuario cancela lecturas y descarta un 401 tardío de escritura", async ({ page, context }) => {
  await setupFixture(page); await page.goto("/app/profile");
  await expect(page.getByRole("main").getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  const firstId = await sessionId(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let started = 0;
  await page.route("**/api/v1/pending-*", async route => {
    started++; await waiting;
    await route.fulfill({ status: route.request().method() === "PATCH" ? 401 : 200, json: { detail: "Respuesta de A" } });
  });
  await page.evaluate(async () => {
    const path = "/src/lib/apiClient.ts"; const { apiClient } = await import(path);
    const read = apiClient.get("/pending-read").catch((e: any) => {
      (window as any).cancelledRead = e.code;
      throw e;
    });
    (window as any).oldRequests = Promise.all([
      read, apiClient.patch("/pending-write", {}), apiClient.post("/pending-success", {}),
    ].map(p => p.then(() => "success", (e: any) => e.code)));
  });
  await expect.poll(() => started).toBe(3);
  const other = await context.newPage(); await other.goto("/");
  await broadcast(other, "SIGNED_IN", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  await expect.poll(() => sessionId(page)).not.toBe(firstId);
  await expect.poll(() => page.evaluate(() => (window as any).cancelledRead)).toBe("ERR_CANCELED");
  release();
  expect(await page.evaluate(() => (window as any).oldRequests)).toEqual(["ERR_CANCELED", "ERR_CANCELED", "ERR_CANCELED"]);
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("main").getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  const secondId = await sessionId(page);
  const reentry = await other.evaluate(() => localStorage.getItem("sb-demo-auth-token")!);
  await page.getByRole("main").getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await sessionId(page)).toBeUndefined();
  // Same user after sign-out must receive a fresh lifecycle as well.
  await other.evaluate(value => localStorage.setItem("sb-demo-auth-token", value), reentry);
  await broadcast(other, "SIGNED_IN", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  await expect.poll(() => sessionId(page)).toBeGreaterThan(secondId);
  await other.close();
});
