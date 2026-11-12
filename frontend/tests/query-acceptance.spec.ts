import { expect, test } from "@playwright/test";
import { setupFixture } from "../benchmarks/fixture";

test("cerrar eliminación de cuenta cancela la comprobación pendiente", async ({ page }) => {
  await setupFixture(page);
  await page.goto("/app/accounts?account_id=1");
  await page.waitForLoadState("networkidle");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/transaction-pages?**", async route => {
    if (new URL(route.request().url()).searchParams.get("limit") !== "1") return route.fallback();
    await gate;
    await route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 1 } }).catch(() => {});
  });
  await page.getByLabel("Más acciones de la cuenta").click();
  const requested = page.waitForRequest(request => new URL(request.url()).searchParams.get("limit") === "1");
  await page.getByRole("button", { name: "Eliminar cuenta", exact: true }).click();
  await requested;
  const dialog = page.getByRole("dialog", { name: "¿Eliminar Cuenta benchmark?" });
  await expect(dialog.getByRole("button", { name: "Eliminar cuenta", exact: true })).toBeDisabled();
  const aborted = page.waitForEvent("requestfailed", request => new URL(request.url()).searchParams.get("limit") === "1");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await aborted;
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Más acciones de la cuenta")).toBeFocused();
});

for (const operation of ["import", "delete"] as const) {
  test(`${operation} de cartola reconcilia todas las dependencias financieras y aísla otros usuarios`, async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async operation => {
      const harnessPath = "/tests/helpers/queryHarness.ts";
      const servicePath = "/src/services/statementService.ts";
      const h = await import(harnessPath);
      const { StatementService } = await import(servicePath);
      const client = h.createQueryClient(), session = h.beginApiSession("writer");
      const keys = [h.queryKeys.accounts("writer"), h.queryKeys.cashAccount("writer"),
        h.queryKeys.cashBalance("writer"), h.queryKeys.statements("writer"),
        h.queryKeys.transactions.month("writer", "2026-10"), h.queryKeys.reports.accounts("writer"),
        h.queryKeys.reports.periods("writer"), h.queryKeys.dashboard("writer"),
        h.queryKeys.categories("writer"), h.queryKeys.learning("writer", "proposals")];
      const inactive = h.queryKeys.transactions.month("writer", "2026-09");
      const other = h.queryKeys.accounts("other");
      const detail = h.queryKeys.statementImpact("writer", 7);
      for (const key of [...keys, inactive, other, detail]) client.setQueryData(key, { revision: 0 });
      const reads = keys.map(() => 0);
      const stops = keys.map((queryKey, index) => new h.QueryObserver(client, {
        queryKey, staleTime: Infinity,
        queryFn: async () => { reads[index]++; return { revision: 1 }; },
      }).subscribe(() => {}));
      let posts = 0;
      StatementService.importReviewedPdf = async () => { posts++; return { statement: { id: 7 }, result: { inserted_count: 2 } }; };
      StatementService.deleteStatement = async () => { posts++; return { deleted_count: 2 }; };
      const writes = h.createWriteActions(client, session);
      if (operation === "import") await writes.statements.importReviewedPdf(1, new File(["test"], "test.pdf"), []);
      else await writes.statements.deleteStatement(7);
      const result = { reads, posts, revisions: keys.map(key => client.getQueryData(key).revision),
        inactive: client.getQueryState(inactive).isInvalidated,
        other: client.getQueryState(other).isInvalidated,
        detailRemoved: client.getQueryState(detail) === undefined };
      stops.forEach(stop => stop()); client.clear(); h.endApiSession(session);
      return result;
    }, operation);
    expect(result.reads).toEqual(Array(10).fill(1));
    expect(result.revisions).toEqual(Array(10).fill(1));
    expect(result.posts).toBe(1);
    expect(result.inactive).toBe(true);
    expect(result.other).toBe(false);
    expect(result.detailRemoved).toBe(operation === "delete");
  });
}
