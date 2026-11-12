import { expect, test } from "@playwright/test";
import { setupFixture } from "../benchmarks/fixture";

for (const partialFailure of [true, false]) {
test(`dos filas concurrentes: ${partialFailure ? "rollback individual" : "dos éxitos"}, bloqueo por ID y una reconciliación de dos páginas`, async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async partialFailure => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(); const session = h.beginApiSession("writer");
    let rows = [1, 2, 3, 4].map(id => ({ id, category_id: null, category_version: 0 }));
    const reads: number[] = [], writes: number[] = [];
    h.TransactionService.getPage = async (filters: { offset: number; limit: number }) => {
      reads.push(filters.offset);
      return { items: rows.slice(filters.offset, filters.offset + filters.limit), total: rows.length, ...filters };
    };
    let save!: () => void, finishSecond!: () => void;
    h.TransactionService.updateCategory = (id: number, categoryId: number, options: { expected_version: number }) => new Promise((resolve, reject) => {
      if (options.expected_version !== 0) throw new Error("wrong version");
      writes.push(id);
      if (id === 1) save = () => {
        const saved = { id, category_id: categoryId, category_version: 1, category_reviewed: true, category_event_id: 99 };
        rows = rows.map(row => row.id === id ? saved : row); resolve(saved);
      };
      else finishSecond = () => {
        if (partialFailure) reject(new Error("save failed"));
        else {
          const saved = { id, category_id: categoryId, category_version: 1 };
          rows = rows.map(row => row.id === id ? saved : row); resolve(saved);
        }
      };
    });
    const options = h.transactionsQueries.infinite("writer", { limit: 2 });
    await client.fetchInfiniteQuery({ ...options, pages: 2 });
    const observer = new h.InfiniteQueryObserver(client, { ...options, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    reads.length = 0;
    const actions = h.createWriteActions(client, session);
    const first = actions.transactions.updateCategory(1, 9, { expected_version: 0 });
    const second = actions.transactions.updateCategory(2, 8, { expected_version: 0 });
    const settled = Promise.allSettled([first, second]);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const optimistic = client.getQueryData(options.queryKey).pages[0].items.map((row: { category_id: number }) => row.category_id);
    const duplicate = await actions.transactions.undoCategory(1, 99, 0).then(() => false, () => true);
    save(); await first;
    const afterFirst = client.getQueryData(options.queryKey).pages[0].items;
    finishSecond(); const statuses = (await settled).map(item => item.status);
    const final = client.getQueryData(options.queryKey);
    stop(); client.clear(); h.endApiSession(session);
    return { optimistic, duplicate, afterFirst, statuses, final, reads, writes };
  }, partialFailure);
  expect(result.optimistic).toEqual([9, 8]); expect(result.duplicate).toBe(true);
  expect(result.afterFirst[0]).toMatchObject({ category_id: 9, category_reviewed: true, category_event_id: 99 });
  expect(result.afterFirst[1].category_id).toBe(8);
  expect(result.statuses).toEqual(["fulfilled", partialFailure ? "rejected" : "fulfilled"]);
  expect(result.final.pages[0].items.map((row: { category_id: number | null }) => row.category_id)).toEqual([9, partialFailure ? null : 8]);
  expect(result.final.pageParams).toEqual([0, 2]);
  expect(result.reads).toEqual([0, 2]); expect(result.writes).toEqual([1, 2]);
});
}

test("409 renueva la fila sin repetir la escritura ni aumentar expected_version", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(); const session = h.beginApiSession("writer");
    const options = h.transactionsQueries.infinite("writer", { limit: 50 });
    client.setQueryData(options.queryKey, { pages: [{ items: [{ id: 1, category_id: null, category_version: 0 }], offset: 0, total: 1, limit: 50 }], pageParams: [0] });
    let reads = 0; const versions: number[] = [];
    h.TransactionService.getPage = async () => { reads++; return { items: [{ id: 1, category_id: 7, category_version: 4 }], offset: 0, total: 1, limit: 50 }; };
    h.TransactionService.updateCategory = async (_id: number, _category: number, options: { expected_version: number }) => {
      versions.push(options.expected_version); throw new h.ApiRequestError("Conflicto de versión", "CONFLICT", "", 409);
    };
    const observer = new h.InfiniteQueryObserver(client, { ...options, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    const message = await h.createWriteActions(client, session).transactions.updateCategory(1, 9, { expected_version: 0 }).catch((error: Error) => error.message);
    const row = client.getQueryData(options.queryKey).pages[0].items[0];
    stop(); client.clear(); h.endApiSession(session);
    return { reads, versions, row, message };
  });
  expect(result).toEqual({ reads: 1, versions: [0], row: { id: 1, category_id: 7, category_version: 4 }, message: "Conflicto de versión" });
});

test("refetch durante una edición conserva la previsualización y una respuesta vieja no pisa una versión nueva", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(); const session = h.beginApiSession("writer");
    const options = h.transactionsQueries.page("writer");
    const initial = { id: 1, category_id: 1, category_version: 1 };
    const payload = { items: [initial], offset: 0, total: 1, limit: 50 };
    client.setQueryData(options.queryKey, payload);
    let save!: () => void;
    h.TransactionService.updateCategory = () => new Promise(resolve => { save = () => resolve({ id: 1, category_id: 9, category_version: 2 }); });
    h.TransactionService.getPage = async () => payload;
    const pending = h.createWriteActions(client, session).transactions.updateCategory(1, 9, { expected_version: 1 });
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await client.fetchQuery({ ...options, staleTime: 0 });
    const preview = client.getQueryData(options.queryKey).items[0].category_id;
    client.setQueryData(options.queryKey, { ...payload, items: [{ id: 1, category_id: 7, category_version: 5 }] });
    save(); await pending;
    const final = client.getQueryData(options.queryKey).items[0];
    client.clear(); h.endApiSession(session); return { preview, final };
  });
  expect(result).toEqual({ preview: 9, final: { id: 1, category_id: 7, category_version: 5 } });
});

test("infinita deduplica fetchNextPage simultáneo y termina ante página vacía", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/tests/helpers/queryHarness.ts"; const h = await import(path);
    const client = h.createQueryClient(); const offsets: number[] = [];
    let finish!: () => void;
    h.TransactionService.getPage = (filters: { offset: number; limit: number }) => {
      offsets.push(filters.offset);
      const page = { items: filters.offset === 0 ? [{ id: 1 }, { id: 2 }] : [], total: 99, ...filters };
      return filters.offset === 0 ? Promise.resolve(page) : new Promise(resolve => { finish = () => resolve(page); });
    };
    const options = h.transactionsQueries.infinite("writer", { limit: 2 });
    await client.fetchInfiniteQuery(options);
    const observer = new h.InfiniteQueryObserver(client, { ...options, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    const first = observer.fetchNextPage({ cancelRefetch: false });
    const second = observer.fetchNextPage({ cancelRefetch: false });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    finish(); await Promise.all([first, second]);
    const more = observer.getCurrentResult().hasNextPage;
    await observer.fetchNextPage({ cancelRefetch: false });
    stop(); client.clear(); return { offsets, more };
  });
  expect(result).toEqual({ offsets: [0, 2], more: false });
});

test("categorizar retira la fila del filtro sin categoría y mantiene el total correcto", async ({ page }) => {
  await setupFixture(page);
  await page.goto("/app/transactions?category=uncategorized");
  const description = "Compra 1-2026-10-1";
  await page.getByRole("button", { name: `Mostrar detalles de ${description}`, exact: true }).click();
  await page.getByRole("button", { name: `Categoria de ${description}`, exact: true }).click();
  await page.getByRole("dialog", { name: "Seleccionar categoría", exact: true }).getByRole("button", { name: "Compras", exact: true }).click();
  await expect(page.getByRole("button", { name: "Deshacer cambio de categoría", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Mostrar detalles de ${description}`, exact: true })).toHaveCount(0);
  await expect(page.getByText("499 movimientos.", { exact: true })).toBeVisible();
});

test("un fallo anterior sigue visible aunque otra fila se guarde después", async ({ page }) => {
  await setupFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/transactions/1000/category", async route => {
    await gate;
    await route.fulfill({ status: 400, json: { detail: "Error en A." } });
  });
  await page.goto("/app/transactions");
  for (const index of [1, 2]) {
    const description = `Compra 1-2026-10-${index}`;
    await page.getByRole("button", { name: `Mostrar detalles de ${description}`, exact: true }).click();
    await page.getByRole("button", { name: `Categoria de ${description}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Seleccionar categoría", exact: true }).getByRole("button", { name: "Compras", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Deshacer cambio de categoría", exact: true })).toBeVisible();
  release();
  await expect(page.getByText("No se pudo guardar: Error en A.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Categoria de Compra 1-2026-10-1", exact: true })).toContainText("Sin categoría");
  await expect(page.getByRole("button", { name: "Categoria de Compra 1-2026-10-2", exact: true })).toContainText("Compras");
});

test("la búsqueda espera 300 ms y consulta solo la última descripción", async ({ page }) => {
  await setupFixture(page);
  await page.goto("/app/transactions");
  await expect(page.getByRole("button", { name: "Mostrar detalles de Compra 1-2026-10-1", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const searches: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/transaction-pages") searches.push(url.searchParams.get("search") ?? "");
  });
  await page.clock.pauseAt(new Date("2026-11-07T15:00:10Z"));
  const search = page.getByRole("searchbox", { name: "Buscar por descripción" });
  await search.fill("Ca"); await search.fill("Café");
  await page.clock.runFor(299);
  expect(searches).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => searches).toEqual(["Café"]);
  await page.clock.resume();
});
