import { expect, test } from "@playwright/test";
import { setupFixture } from "../benchmarks/fixture";

test("perfil cancela la exportación sin descargar ni mostrar un error", async ({ page }) => {
  await setupFixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/me/export", async route => {
    await pending;
    await route.fulfill({ json: { accounts: [], transactions: [], categories: [], categorization_rules: [] } }).catch(() => {});
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.goto("/app/profile");
  const request = page.waitForRequest("**/api/v1/me/export");
  await page.getByRole("button", { name: "Exportar mis datos (JSON)", exact: true }).click();
  await request;
  const cancelled = page.waitForEvent("requestfailed", request => request.url().endsWith("/me/export"));
  await page.getByRole("button", { name: "Cancelar descarga", exact: true }).click();
  await cancelled;
  release();
  await expect(page.getByRole("button", { name: "Exportar mis datos (JSON)", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(downloads).toBe(0);
});

test("acciones explícitas bloquean doble envío, no reintentan y liberan variables sensibles", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/actionHarness.ts";
    const h = await import(path);
    const { useExplicitAction } = h;
    const client = new h.QueryClient();
    const host = document.createElement("div"); document.body.append(host);
    const root = h.createRoot(host);
    let run!: (secret: string) => Promise<string>, finish!: () => void, calls = 0;
    function Probe() {
      const action = useExplicitAction((secret: string) => {
        calls++;
        if (secret === "failure") return Promise.reject(new Error("failed"));
        return new Promise<string>(resolve => { finish = () => resolve("done"); });
      });
      run = action.run;
      return null;
    }
    root.render(h.createElement(h.QueryClientProvider, { client }, h.createElement(Probe)));
    while (!run) await new Promise(resolve => setTimeout(resolve, 10));
    const first = run("private-password");
    const blocked = await run("private-password").then(() => false, () => true);
    while (!finish) await new Promise(resolve => setTimeout(resolve, 10));
    finish(); await first;
    await run("failure").catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));
    const retained = client.getMutationCache().getAll().length;
    root.unmount(); host.remove(); client.clear();
    return { blocked, calls, retained };
  });
  expect(result).toEqual({ blocked: true, calls: 2, retained: 0 });
});
