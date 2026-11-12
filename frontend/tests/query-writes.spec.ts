import { expect, test } from "@playwright/test";

test("escrituras concurrentes: éxito parcial, un refetch activo, inactivos y otros usuarios", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts";
    const h = await import(path);
    const client = h.createQueryClient();
    const session = h.beginApiSession("writer");
    const active = h.queryKeys.categories("writer");
    const inactive = h.queryKeys.transactions.month("writer", "2026-10");
    const other = h.queryKeys.categories("other");
    for (const key of [active, inactive, other]) client.setQueryData(key, []);
    let reads = 0;
    const observer = new h.QueryObserver(client, { queryKey: active, staleTime: Infinity, queryFn: async () => { reads++; return []; } });
    const unsubscribe = observer.subscribe(() => {});
    let succeed!: () => void;
    let fail!: () => void;
    const first = h.executeWrite(client, session, "category", () => new Promise<void>(resolve => { succeed = resolve; }));
    const second = h.executeWrite(client, session, "category", () => new Promise<void>((_, reject) => { fail = () => reject(new Error("conflict")); }));
    const settled = Promise.allSettled([first, second]);
    succeed();
    await first;
    const before = reads;
    fail();
    const statuses = (await settled).map(r => r.status);
    const result = { before, reads, statuses, inactive: client.getQueryState(inactive)?.isInvalidated, other: client.getQueryState(other)?.isInvalidated };
    unsubscribe(); client.clear(); h.endApiSession(session);
    return result;
  });
  expect(result).toEqual({ before: 0, reads: 1, statuses: ["fulfilled", "rejected"], inactive: true, other: false });
});

test("respuestas confirmadas actualizan filas y borrar una cuenta retira sus detalles", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts";
    const h = await import(path);
    const client = h.createQueryClient(); const session = h.beginApiSession("writer");
    const accounts = h.queryKeys.accounts("writer");
    const detail = h.queryKeys.transactions.page("writer", { account_id: 1 });
    const month = h.queryKeys.transactions.month("writer", "2026-10");
    client.setQueryData(accounts, [{ id: 1, name: "old" }]);
    client.setQueryData(detail, { items: [{ id: 10, category_version: 1 }], total: 1 });
    client.setQueryData(month, [{ id: 10, category_version: 3 }]);
    h.AccountService.updateAccount = async () => ({ id: 1, name: "new" });
    h.AccountService.deleteAccount = async () => {};
    h.TransactionService.updateCategory = async () => ({ id: 10, category_version: 2, category_id: 9 });
    const writes = h.createWriteActions(client, session);
    await writes.accounts.updateAccount(1, {});
    const updated = client.getQueryData(accounts);
    await writes.transactions.updateCategory(10, 9);
    const patched = client.getQueryData(detail);
    const newer = client.getQueryData(month);
    await writes.accounts.deleteAccount(1);
    const result = { updated, patched, newer, removed: client.getQueryState(detail) === undefined, accounts: client.getQueryData(accounts) };
    client.clear(); h.endApiSession(session); return result;
  });
  expect(result.updated).toEqual([{ id: 1, name: "new" }]);
  expect(result.patched).toEqual({ items: [{ id: 10, category_version: 2, category_id: 9 }], total: 1 });
  expect(result.newer).toEqual([{ id: 10, category_version: 3 }]);
  expect(result.removed).toBe(true); expect(result.accounts).toEqual([]);
});

test("fallos y respuestas de sesiones anteriores no modifican la caché", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts";
    const h = await import(path);
    const client = h.createQueryClient(); const session = h.beginApiSession("writer");
    const key = h.queryKeys.accounts("writer"); client.setQueryData(key, ["original"]);
    let calls = 0; let patches = 0;
    await h.executeWrite(client, session, "financial", async () => { calls++; throw new Error("failed"); }, () => patches++).catch(() => {});
    let finish!: () => void;
    const request = h.executeWrite(client, session, "financial", () => new Promise<void>(resolve => { finish = resolve; }), () => patches++);
    const next = h.beginApiSession("writer");
    finish(); const canceled = await request.then(() => false, (error: Error) => error.name === "CanceledError");
    await h.executeWrite(client, session, "financial", async () => { calls++; }).catch(() => {});
    const result = { calls, patches, canceled, stale: client.getQueryState(key)?.isInvalidated, data: client.getQueryData(key) };
    client.clear(); h.endApiSession(next); return result;
  });
  expect(result).toEqual({ calls: 1, patches: 0, canceled: true, stale: false, data: ["original"] });
});
