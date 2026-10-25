import { expect, test, type Page } from "@playwright/test";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("eliminar categorías propias conserva movimientos mediante traslado explícito", async ({ page }, info) => {
  await mockApi(page);
  const base = { type: "expense", parent_id: null as number | null, is_default: false,
    is_active: true, sort_order: 1, transaction_count: 0, rule_count: 0 };
  let categories = [
    { ...base, id: 1, name: "Personal usada", transaction_count: 3, rule_count: 1 },
    { ...base, id: 2, name: "Alimentación", is_default: true },
    { ...base, id: 3, name: "Ingresos", type: "income", is_default: true },
    { ...base, id: 4, name: "Archivada", is_active: false },
    { ...base, id: 5, name: "Con hijas" },
    { ...base, id: 6, name: "Subcategoría usada", parent_id: 5, transaction_count: 1 },
    { ...base, id: 7, name: "Personal vacía" },
  ];
  let merged = false;
  let deleted = false;
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: categories }));
  await page.route("**/api/v1/categories/1/merge", route => {
    expect(route.request().postDataJSON()).toEqual({ target_category_id: 2 });
    merged = true;
    categories = categories.filter(item => item.id !== 1);
    return route.fulfill({ json: categories.find(item => item.id === 2) });
  });
  await page.route("**/api/v1/categories/7", route => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    categories = categories.filter(item => item.id !== 7);
    return route.fulfill({ status: 204 });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  await page.getByRole("button", { name: "Más acciones de Subcategoría usada" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Subcategoría usada" }).getByRole("menuitem", { name: "Eliminar" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Más acciones de Alimentación" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Alimentación" }).getByRole("menuitem", { name: "Eliminar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Más acciones de Personal usada" }).click();
  await page.getByRole("menu", { name: "Acciones de Personal usada" }).getByRole("menuitem", { name: "Eliminar" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar Personal usada", exact: true });
  await expect(dialog.getByRole("button", { name: "Eliminar categoría", exact: true })).toBeDisabled();
  await expect(dialog.locator('option[value="3"]')).toHaveCount(0);
  await expect(dialog.locator('option[value="4"]')).toHaveCount(0);
  expect(merged).toBe(false);
  await dialog.getByRole("combobox").selectOption("2");
  await dialog.screenshot({ path: info.outputPath("delete-category.png") });
  await dialog.getByRole("button", { name: "Trasladar y eliminar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(merged).toBe(true);
  await page.getByRole("button", { name: "Más acciones de Con hijas" }).click();
  await page.getByRole("menu", { name: "Acciones de Con hijas" }).getByRole("menuitem", { name: "Eliminar" }).click();
  const parentDialog = page.getByRole("dialog", { name: "Eliminar Con hijas", exact: true });
  await expect(parentDialog.getByText(/Primero mueve o elimina sus subcategorías/)).toBeVisible();
  await expect(parentDialog.getByRole("button", { name: "Eliminar categoría", exact: true })).toHaveCount(0);
  await parentDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Más acciones de Personal vacía" }).click();
  await page.getByRole("menu", { name: "Acciones de Personal vacía" }).getByRole("menuitem", { name: "Eliminar" }).click();
  expect(deleted).toBe(false);
  await page.getByRole("dialog", { name: "Eliminar Personal vacía", exact: true }).getByRole("button", { name: "Eliminar categoría", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("fusionar solo aparece cuando la categoría puede fusionarse", async ({ page }, info) => {
  await mockApi(page);
  const base = { type: "expense", parent_id: null as number | null, is_default: false,
    is_active: true, sort_order: 1, transaction_count: 0, rule_count: 0 };
  let categories = [
    { ...base, id: 1, name: "Comida propia", transaction_count: 2, rule_count: 1 },
    { ...base, id: 2, name: "Alimentación", is_default: true },
    { ...base, id: 3, name: "Grupo con hijas" },
    { ...base, id: 4, name: "Café propio", parent_id: 3, transaction_count: 1 },
    { ...base, id: 5, name: "Cafeterías", parent_id: 2, is_default: true },
    { ...base, id: 6, name: "Ingresos", type: "income" },
  ];
  const requests: Array<{ source: number; target: number }> = [];
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: categories }));
  await page.route("**/api/v1/categories/*/merge", route => {
    const source = Number(route.request().url().match(/categories\/(\d+)\/merge/)?.[1]);
    const target = route.request().postDataJSON().target_category_id;
    requests.push({ source, target });
    categories = categories.filter(item => item.id !== source);
    return route.fulfill({ json: categories.find(item => item.id === target) });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");

  await expect(page.getByRole("heading", { name: "Fusionar categoria" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear subcategoría en Grupo con hijas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear subcategoría en Café propio" })).toHaveCount(0);
  await page.getByRole("button", { name: "Más acciones de Alimentación" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Alimentación" }).getByRole("menuitem", { name: "Fusionar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Más acciones de Grupo con hijas" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Grupo con hijas" }).getByRole("menuitem", { name: "Fusionar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Más acciones de Ingresos" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Ingresos" }).getByRole("menuitem", { name: "Fusionar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Crear subcategoría en Grupo con hijas" }).click();
  await expect(page.getByRole("dialog", { name: "Agregar al catalogo" })).toBeVisible();
  await page.getByRole("dialog", { name: "Agregar al catalogo" }).getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Más acciones de Comida propia" }).click();
  await page.getByRole("menu", { name: "Acciones de Comida propia" }).getByRole("menuitem", { name: "Editar" }).click();
  await expect(page.getByRole("dialog", { name: "Actualizar organizacion" })).toBeVisible();
  await page.getByRole("dialog", { name: "Actualizar organizacion" }).getByRole("button", { name: "Cancelar" }).click();

  await page.getByRole("button", { name: "Más acciones de Café propio" }).click();
  await page.getByRole("menu", { name: "Acciones de Café propio" }).getByRole("menuitem", { name: "Fusionar" }).click();
  const childDialog = page.getByRole("dialog", { name: "Fusionar Café propio" });
  await expect(childDialog.getByRole("button", { name: "Fusionar categorías" })).toBeDisabled();
  await expect(childDialog.locator('option[value="6"]')).toHaveCount(0);
  await childDialog.getByRole("combobox").selectOption("5");
  await childDialog.screenshot({ path: info.outputPath("merge-category.png") });
  await childDialog.getByRole("button", { name: "Fusionar categorías" }).click();
  await expect(childDialog).toHaveCount(0);
  expect(requests).toEqual([{ source: 4, target: 5 }]);
  await page.getByRole("button", { name: "Más acciones de Grupo con hijas" }).click();
  await expect(page.getByRole("menu", { name: "Acciones de Grupo con hijas" }).getByRole("menuitem", { name: "Fusionar" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Más acciones de Comida propia" }).click();
  await page.getByRole("menu", { name: "Acciones de Comida propia" }).getByRole("menuitem", { name: "Fusionar" }).click();
  const rootDialog = page.getByRole("dialog", { name: "Fusionar Comida propia" });
  await rootDialog.getByRole("combobox").selectOption("2");
  await rootDialog.getByRole("button", { name: "Fusionar categorías" }).click();
  await expect(rootDialog).toHaveCount(0);
  expect(requests).toEqual([{ source: 4, target: 5 }, { source: 1, target: 2 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("apariencia de categoría se guarda y se hereda en los movimientos", async ({ page }, info) => {
  await mockApi(page);
  let parent = { id: 1, name: "Mis comidas", code: "food", type: "expense", parent_id: null, is_default: true,
    icon: null as string | null, color: null as string | null, is_active: true, sort_order: 1,
    transaction_count: 0, rule_count: 0 };
  let child = { ...parent, id: 2, name: "Cafeterías", code: "cafes", parent_id: 1 };
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [parent, child] }));
  await page.route("**/api/v1/categories/1", route => {
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({ icon: "groceries", color: "sky", name: "Mis comidas" });
    parent = { ...parent, ...payload };
    return route.fulfill({ json: parent });
  });
  await page.route("**/api/v1/categories/2", route => {
    const payload = route.request().postDataJSON();
    child = { ...child, ...payload };
    return route.fulfill({ json: child });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  await page.getByRole("button", { name: "Más acciones de Mis comidas" }).click();
  await page.getByRole("menu", { name: "Acciones de Mis comidas" }).getByRole("menuitem", { name: "Editar" }).click();
  const dialog = page.getByRole("dialog", { name: "Actualizar organizacion" });
  await expect(dialog.getByRole("button", { name: "Icono: Alimentación", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: /^Icono:/ })).toHaveCount(30);
  await dialog.getByRole("button", { name: "Icono: Supermercado", exact: true }).click();
  await dialog.getByRole("button", { name: "Color: Celeste", exact: true }).click();
  await dialog.screenshot({ path: info.outputPath("category-style.png") });
  await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-category-icon="groceries"][data-category-color="sky"]')).toHaveCount(2);

  await page.getByRole("button", { name: "Más acciones de Cafeterías" }).click();
  await page.getByRole("menu", { name: "Acciones de Cafeterías" }).getByRole("menuitem", { name: "Editar" }).click();
  const childDialog = page.getByRole("dialog", { name: "Actualizar organizacion" });
  await expect(childDialog.getByText(/Sin personalización, hereda el icono/)).toBeVisible();
  await childDialog.getByRole("button", { name: "Icono: Café", exact: true }).click();
  await childDialog.getByRole("button", { name: "Color: Rojo", exact: true }).click();
  await childDialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator('[data-category-icon="coffee"][data-category-color="red"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Más acciones de Cafeterías" }).click();
  await page.getByRole("menu", { name: "Acciones de Cafeterías" }).getByRole("menuitem", { name: "Editar" }).click();
  await page.getByRole("dialog", { name: "Actualizar organizacion" }).getByRole("button", { name: "Restablecer estilo" }).click();
  await page.getByRole("dialog", { name: "Actualizar organizacion" }).getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator('[data-category-icon="groceries"][data-category-color="sky"]')).toHaveCount(2);

  const movement = { id: 71, account_id: 1, date: "2026-09-15", description: "Comercio barrio",
    amount_clp: -1000, transaction_type: "expense", origin: "pdf", category_id: 2 };
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: {
    items: [movement, { ...movement, id: 72, description: "Cafe sin clasificar", category_id: null }], total: 2, offset: 0, limit: 50,
  } }));
  await page.goto("/app/transactions");
  await expect(page.locator('[data-category-icon="groceries"][data-category-color="sky"]:visible')).toHaveCount(1);
  await expect(page.locator('[data-category-icon="uncategorized"]:visible')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("category-movements.png"), fullPage: true });
});

test("cambiar una categoría aprende sin casilla y deshacer usa la versión del servidor", async ({ page }) => {
  await mockApi(page);
  const original = { id: 71, account_id: 1, date: "2026-09-15", description: "Comercio barrio",
    normalized_description: "comercio barrio", amount_clp: -1000, transaction_type: "expense",
    origin: "pdf", category_id: null as number | null, category_source: "rule", category_reviewed: false, category_version: 0 };
  let movement = { ...original };
  let confirmations = 0;
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: {
    items: [movement], total: 1, offset: 0, limit: 50,
  } }));
  await page.route("**/api/v1/transactions/71/category", route => {
    expect(route.request().postDataJSON()).toMatchObject({ category_id: 1, action: "set",
      expected_version: 0 });
    expect(route.request().postDataJSON()).not.toHaveProperty("remember");
    confirmations += 1;
    movement = { ...original, category_id: 1, category_source: "manual", category_reviewed: true, category_version: 1 };
    return route.fulfill({ json: { ...movement, category_event_id: 701 } });
  });
  await page.route("**/api/v1/transactions/71/category/undo", route => {
    expect(route.request().postDataJSON()).toEqual({ event_id: 701, expected_version: 1 });
    movement = { ...original, category_version: 2 };
    return route.fulfill({ json: movement });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/transactions");
  await page.getByRole("button", { name: "Mostrar detalles de Comercio barrio" }).click();
  expect(confirmations).toBe(0);
  await expect(page.getByRole("checkbox", { name: "Recordar para movimientos similares" })).toHaveCount(0);
  await page.getByRole("button", { name: "Categoria de Comercio barrio", exact: true }).click();
  await page.getByRole("dialog", { name: "Seleccionar categoría" }).getByRole("button", { name: "Compras", exact: true }).click();
  await expect(page.getByRole("button", { name: "Deshacer cambio de categoría" })).toBeVisible();
  expect(confirmations).toBe(1);
  await page.getByRole("button", { name: "Deshacer cambio de categoría" }).click();
  await expect.poll(() => movement.category_version).toBe(2);
  expect(movement.category_reviewed).toBe(false);
  expect(movement.category_id).toBeNull();
});

async function movementProposalFixture(page: Page) {
  await mockApi(page);
  const movements = ["Comercio barrio", "COMERCIO BARRIO", "Comercio, barrio"].map((description, index) => ({
    id: 71 + index, account_id: 1, date: `2026-09-${15 + index}`, description,
    normalized_description: "comercio barrio", amount_clp: -1000, transaction_type: "expense",
    origin: "pdf", category_id: null as number | null, category_source: null as string | null,
    category_reviewed: false, category_version: 0,
  }));
  const state = { version: 1, status: "pending", failSave: false, proposalReads: 0, actions: [] as string[] };
  const proposal = () => ({ id: 7, version: state.version, pattern: "comercio barrio", match_type: "exact",
    transaction_type: "expense", category_id: 1, evidence_count: 3, decision_count: 3, match_count: 7,
    state: state.status, reason: "Tres decisiones coinciden.", snoozed_until: null, history: [],
    examples: movements.map(tx => ({ transaction_id: tx.id, description: tx.description, date: tx.date, category_id: 1 })) });
  const unrelated = { ...proposal(), id: 9, pattern: "otro comercio", examples: [] };
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: {
    items: movements, total: movements.length, offset: 0, limit: 50,
  } }));
  await page.route("**/api/v1/categorization-rules/proposals", route => {
    state.proposalReads += 1;
    return route.fulfill({ json: [unrelated, ...(state.status === "pending" && movements.every(tx => tx.category_id === 1) ? [proposal()] : [])] });
  });
  await page.route(/\/api\/v1\/transactions\/\d+\/category$/, route => {
    if (state.failSave) return route.fulfill({ status: 409, json: { detail: "El movimiento cambió en otra sesión." } });
    const id = Number(route.request().url().match(/transactions\/(\d+)/)?.[1]);
    const tx = movements.find(item => item.id === id)!;
    const payload = route.request().postDataJSON();
    expect(payload.expected_version).toBe(tx.category_version);
    tx.category_id = payload.category_id;
    tx.category_source = "manual";
    tx.category_reviewed = true;
    tx.category_version += 1;
    return route.fulfill({ json: { ...tx, category_event_id: tx.id + 100 } });
  });
  await page.route("**/api/v1/categorization-rules/patterns/7/decision", route => {
    const payload = route.request().postDataJSON();
    expect(payload.expected_version).toBe(state.version);
    state.actions.push(payload.action);
    state.status = payload.action === "accept" ? "accepted" : payload.action === "reject" ? "rejected" : "snoozed";
    return route.fulfill({ json: { state: state.status } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/transactions");
  await expect(page.getByRole("button", { name: "Revisar propuestas", exact: true })).toBeVisible();
  const change = async (index: number) => {
    const tx = movements[index];
    const details = page.getByRole("button", { name: `Mostrar detalles de ${tx.description}`, exact: true });
    if (await details.count()) await details.click();
    await page.getByRole("button", { name: `Categoria de ${tx.description}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Seleccionar categoría" }).getByRole("button", { name: "Compras", exact: true }).click();
  };
  return { state, movements, change };
}

test("modal de regla aparece al tercer cambio en Movimientos y acepta sin salir", async ({ page }, info) => {
  const { state, movements, change } = await movementProposalFixture(page);
  const modal = page.getByRole("dialog", { name: "¿Crear una regla automática?" });
  await expect(modal).toHaveCount(0); // An unrelated pending proposal must not interrupt.
  for (let index = 0; index < 2; index += 1) {
    const reads = state.proposalReads;
    await change(index);
    await expect.poll(() => state.proposalReads).toBeGreaterThan(reads);
    await expect(modal).toHaveCount(0);
  }
  await change(2);
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/3 movimientos de «comercio barrio»/)).toBeVisible();
  await expect(modal.getByText(/7 movimientos actuales coinciden; no se modificarán/)).toBeVisible();
  await expect(modal.getByText(/2026-09-15 · Comercio barrio/)).toBeVisible();
  expect(state.actions).toEqual([]);
  expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await modal.screenshot({ path: info.outputPath("movement-rule-proposal.png") });
  // Native modal keeps keyboard focus inside and offers an explicit decision.
  await modal.getByRole("button", { name: "Cerrar propuesta" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await modal.getByRole("button", { name: "Crear regla", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText("Regla creada para futuras importaciones.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/transactions$/);
  expect(state.actions).toEqual(["accept"]);
  expect(movements.every(tx => tx.category_id === 1)).toBe(true);
  await expect(page.getByRole("button", { name: "Deshacer cambio de categoría" })).toBeVisible();
});

for (const action of ["snooze", "reject"] as const) {
  test(`modal de regla permite cerrar, reabrir y ${action} desde Movimientos`, async ({ page }) => {
    const { state, change } = await movementProposalFixture(page);
    for (let index = 0; index < 3; index += 1) await change(index);
    const modal = page.getByRole("dialog", { name: "¿Crear una regla automática?" });
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    expect(state.actions).toEqual([]);
    // Selecting the saved category again must not repeatedly interrupt.
    await change(2);
    await expect(modal).toHaveCount(0);
    await page.getByRole("button", { name: "Revisar propuestas", exact: true }).click();
    // The unrelated older proposal is first in this mocked response.
    await modal.getByRole("button", { name: "Cerrar propuesta" }).click();
    await expect(modal.getByText(/3 movimientos de «comercio barrio»/)).toBeVisible();
    await modal.getByRole("button", { name: action === "snooze" ? "Más adelante" : "No volver a sugerir", exact: true }).click();
    await expect(modal).toHaveCount(0);
    expect(state.actions).toEqual([action]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Revisar propuestas", exact: true })).toBeVisible();
    await expect(modal).toHaveCount(0);
  });
}

test("modal de regla actualiza evidencia obsoleta sin perder la categoría guardada", async ({ page }) => {
  const { state, movements, change } = await movementProposalFixture(page);
  let attempts = 0;
  await page.route("**/api/v1/categorization-rules/patterns/7/decision", route => {
    const payload = route.request().postDataJSON();
    attempts += 1;
    if (attempts === 1) {
      expect(payload.expected_version).toBe(1);
      state.version = 2;
      return route.fulfill({ status: 409, json: { detail: "La propuesta cambió. Revisa sus ejemplos." } });
    }
    expect(payload.expected_version).toBe(2);
    state.status = "accepted";
    return route.fulfill({ json: { state: "accepted" } });
  });
  for (let index = 0; index < 3; index += 1) await change(index);
  const modal = page.getByRole("dialog", { name: "¿Crear una regla automática?" });
  await modal.getByRole("button", { name: "Crear regla", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("La propuesta cambió");
  expect(movements.every(tx => tx.category_id === 1)).toBe(true);
  await modal.getByRole("button", { name: "Crear regla", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("un cambio de categoría fallido no abre el modal de regla", async ({ page }) => {
  const { state, movements, change } = await movementProposalFixture(page);
  for (let index = 0; index < 2; index += 1) await change(index);
  state.failSave = true;
  await change(2);
  await expect(page.getByRole("alert")).toContainText("No se pudo guardar");
  await expect(page.getByRole("dialog", { name: "¿Crear una regla automática?" })).toHaveCount(0);
  expect(movements[2].category_id).toBeNull();
});

test("catálogo automático conserva categorías existentes sin solicitar aplicación manual", async ({ page }) => {
  await mockApi(page);
  let applied = false;
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { id: 1, name: "Comida", type: "expense", parent_id: null, is_active: true, sort_order: 1,
      transaction_count: 7, rule_count: 2, code: "food" },
  ] }));
  await page.route("**/api/v1/categories/catalog-preview", route => route.fulfill({ json: [
    { code: "food", name: "Comida", parent_code: null, category_id: 1, status: "present" },
    { code: "travel", name: "Viajes", parent_code: null, status: "skipped",
      reason: "La categoría coincidente está archivada." },
  ] }));
  await page.route("**/api/v1/categories/catalog-apply", route => {
    applied = true;
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  await expect(page.getByText(/Las categorías predeterminadas se incorporan automáticamente/)).toBeVisible();
  await page.getByRole("button", { name: "Ver coincidencias omitidas" }).click();
  await expect(page.getByText(/Viajes — La categoría coincidente está archivada/)).toBeVisible();
  expect(applied).toBe(false);
  await expect(page.getByRole("heading", { name: "Comida", exact: true })).toBeVisible();
  await expect(page.getByText("7 movimientos · 2 reglas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar catálogo propuesto" })).toHaveCount(0);
});

test("subcategorías se ordenan con flechas en móvil y arrastre en escritorio", async ({ page }, info) => {
  await mockApi(page);
  const base = { type: "expense", parent_id: null as number | null, is_default: true,
    is_active: true, sort_order: 0, transaction_count: 0, rule_count: 0 };
  let categories = [
    { ...base, id: 1, name: "Alimentación", code: "food" },
    { ...base, id: 2, name: "Almacén", parent_id: 1, sort_order: 10 },
    { ...base, id: 3, name: "Archivada", parent_id: 1, is_active: false, sort_order: 20 },
    { ...base, id: 4, name: "Cafeterías", parent_id: 1, sort_order: 30 },
    { ...base, id: 5, name: "Restaurantes y comidas fuera de casa", parent_id: 1, sort_order: 40 },
    { ...base, id: 6, name: "Transporte" },
    { ...base, id: 7, name: "Metro", parent_id: 6, sort_order: 50 },
  ];
  let failNextSave = info.project.name === "mobile";
  const writes: number[] = [];
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: categories }));
  await page.route(/\/api\/v1\/categories\/\d+$/, route => {
    expect(route.request().method()).toBe("PATCH");
    const id = Number(route.request().url().split("/").pop());
    writes.push(id);
    const payload = route.request().postDataJSON();
    expect(Object.keys(payload)).toEqual(["sort_order"]);
    if (id === 4 && failNextSave) {
      failNextSave = false;
      return route.fulfill({ status: 500, json: { detail: "No se pudo guardar" } });
    }
    categories = categories.map(category => category.id === id ? { ...category, ...payload } : category);
    return route.fulfill({ json: categories.find(category => category.id === id) });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  const listNames = () => page.locator("#subcategory-list-1 > div").evaluateAll(rows => rows.map(row => row.querySelector("p")?.textContent));
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const source = page.getByRole("button", { name: "Mover Almacén", exact: true });
    await expect(source).toBeVisible();
    await source.dragTo(page.getByRole("button", { name: "Mover Cafeterías", exact: true }));
    await expect(page.getByText("Orden de subcategorias guardado.", { exact: true })).toBeVisible();
    await expect.poll(listNames).toEqual(["Cafeterías", "Almacén", "Restaurantes y comidas fuera de casa"]);
    await page.reload();
    await expect.poll(listNames).toEqual(["Cafeterías", "Almacén", "Restaurantes y comidas fuera de casa"]);
    return;
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByRole("button", { name: /^Mover / })).toHaveCount(0);
  await page.getByRole("button", { name: "Más acciones de Transporte" }).click();
  await expect(page.getByRole("menuitem", { name: "Ordenar subcategorías", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Más acciones de Almacén" }).click();
  await expect(page.getByRole("menuitem", { name: "Ordenar subcategorías", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const trigger = page.getByRole("button", { name: "Más acciones de Alimentación" });
  const openOrder = async () => {
    await trigger.click();
    await page.getByRole("menuitem", { name: "Ordenar subcategorías", exact: true }).click();
  };
  await openOrder();
  const dialog = page.getByRole("dialog", { name: "Ordenar subcategorías", exact: true });
  await expect(dialog.getByRole("button", { name: "Subir Almacén" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Bajar Restaurantes y comidas fuera de casa" })).toBeDisabled();
  await expect(dialog.getByText("Archivada", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Bajar Almacén" }).click();
  await dialog.getByRole("button", { name: "Subir Restaurantes y comidas fuera de casa" }).click();
  await expect(dialog.getByRole("listitem").locator("p:first-child")).toHaveText(["Cafeterías", "Restaurantes y comidas fuera de casa", "Almacén"]);
  expect(writes).toEqual([]);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.screenshot({ path: info.outputPath("orden-subcategorias-mobile.png") });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(writes).toEqual([]);
  await expect.poll(listNames).toEqual(["Almacén", "Cafeterías", "Restaurantes y comidas fuera de casa"]);
  await openOrder();
  await dialog.getByRole("button", { name: "Listo", exact: true }).click();
  expect(writes).toEqual([]);
  await openOrder();
  await dialog.getByRole("button", { name: "Bajar Almacén" }).click();
  await dialog.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(dialog.getByText("No fue posible guardar todo el nuevo orden.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("listitem").locator("p:first-child")).toHaveText(["Cafeterías", "Almacén", "Restaurantes y comidas fuera de casa"]);
  await dialog.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(listNames).toEqual(["Cafeterías", "Almacén", "Restaurantes y comidas fuera de casa"]);
  expect(writes.every(id => [2, 3, 4, 5].includes(id))).toBe(true);
  expect(categories.find(category => category.id === 3)?.sort_order).toBe(20);
  expect(categories.find(category => category.id === 7)?.sort_order).toBe(50);
  await page.reload();
  await expect.poll(listNames).toEqual(["Cafeterías", "Almacén", "Restaurantes y comidas fuera de casa"]);
});

test("categorías en móvil abre reglas y propuestas sin perder la posición del catálogo", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Navegación del panel móvil");
  await mockApi(page);
  const base = { type: "expense", parent_id: null as number | null, is_default: true,
    is_active: true, sort_order: 1, transaction_count: 24, rule_count: 1 };
  const categories = [
    { ...base, id: 1, name: "Alimentación", code: "food" },
    { ...base, id: 2, name: "Restaurantes", parent_id: 1 },
    ...Array.from({ length: 12 }, (_, i) => ({ ...base, id: i + 3, name: `Categoría ${i + 3}` })),
  ];
  let rules = [{ id: 1, category_id: 1, keyword: "SUPERMERCADO", match_type: "contains", priority: 100, is_active: true, origin: "personal" }];
  const pattern = (id: number, category_id: number, name: string) => ({ id, category_id, pattern: name,
    version: 1, state: "pending", match_type: "exact", transaction_type: "expense", evidence_count: 3,
    decision_count: 3, match_count: 3, reason: "Regla aceptada", examples: [],
    history: [{ state: "accepted", reason: "Decisión guardada", at: "2026-10-17T12:00:00Z" }] });
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: categories }));
  await page.route("**/api/v1/categorization-rules", route => {
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      expect(payload.category_id).toBe(1);
      const created = { ...rules[0], ...payload, id: 2 };
      rules = [...rules, created];
      return route.fulfill({ json: created });
    }
    return route.fulfill({ json: rules });
  });
  await page.route("**/api/v1/categorization-rules/patterns", route => route.fulfill({ json: [
    pattern(7, 1, "Supermercado del barrio"), pattern(8, 2, "Restaurante del centro"),
  ] }));
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const add = await page.getByRole("button", { name: "Crear subcategoría en Alimentación" }).boundingBox();
    const more = await page.getByRole("button", { name: "Más acciones de Alimentación" }).boundingBox();
    const name = await page.getByRole("heading", { name: "Alimentación", exact: true }).boundingBox();
    expect(Math.abs(add!.y - more!.y)).toBeLessThan(2);
    expect(Math.abs(add!.y - name!.y)).toBeLessThan(2);
    expect(add!.x + add!.width).toBeLessThanOrEqual(more!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("heading", { name: "Alimentación", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Alimentación Gasto/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver reglas y propuestas de Alimentación" })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Más acciones de Alimentación" });
  await trigger.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await trigger.click();
  await page.getByRole("menu", { name: "Acciones de Alimentación" }).getByRole("menuitem", { name: "Ver reglas y propuestas" }).click();
  const dialog = page.getByRole("dialog", { name: "Alimentación", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("SUPERMERCADO", { exact: true })).toBeVisible();
  await dialog.getByPlaceholder("Palabra o comercio").fill("FERIA");
  await dialog.getByRole("button", { name: "Agregar regla", exact: true }).click();
  await expect(dialog.getByText("Regla creada correctamente.")).toBeVisible();
  await expect(dialog.getByText("FERIA", { exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "Propuestas", exact: true }).click();
  await expect(dialog.getByText(/3 movimientos de «Supermercado del barrio»/)).toBeVisible();
  await expect(dialog.getByText(/3 movimientos de «Restaurante del centro»/)).toHaveCount(0);
  await expect(dialog.getByText("Ver historial", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Decisión guardada/)).toHaveCount(0);
  await dialog.getByRole("tab", { name: "Propuestas", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("tab", { name: "Reglas", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab", { name: "Propuestas", exact: true })).toBeFocused();
  await dialog.screenshot({ path: info.outputPath("categoria-propuestas-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThan(2);
  await trigger.click();
  await page.getByRole("menu", { name: "Acciones de Alimentación" }).getByRole("menuitem", { name: "Ver reglas y propuestas" }).click();
  await expect(dialog.getByRole("tab", { name: "Reglas", exact: true })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByText("Restaurantes", { exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Restaurantes 24 movimientos/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Más acciones de Restaurantes" }).click();
  await page.getByRole("menu", { name: "Acciones de Restaurantes" }).getByRole("menuitem", { name: "Ver reglas y propuestas" }).click();
  const childDialog = page.getByRole("dialog", { name: "Alimentación > Restaurantes", exact: true });
  await expect(childDialog).toBeVisible();
  await expect(childDialog.getByText("Sin reglas asociadas.")).toBeVisible();
  await expect(childDialog.getByPlaceholder("Palabra o comercio")).toHaveValue("");
  await childDialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Propuestas", exact: true }).click();
  const general = page.getByRole("dialog", { name: "Propuestas de reglas", exact: true });
  await expect(general.getByText(/3 movimientos de «Supermercado del barrio»/)).toBeVisible();
  await expect(general.getByText(/3 movimientos de «Restaurante del centro»/)).toBeVisible();
  await general.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.screenshot({ path: info.outputPath("categoria-acciones-mobile.png") });
});

test("propuestas permite posponer, recuperar, descartar y aceptar sin mostrar registros internos", async ({ page }, info) => {
  await mockApi(page);
  let state = "pending";
  let version = 1;
  const actions: string[] = [];
  const pattern = () => ({ id: 7, version, pattern: "comercio barrio", match_type: "exact", transaction_type: "expense",
    category_id: 1, evidence_count: 3, decision_count: 3, match_count: 7, state, reason: "Tres decisiones coinciden.",
    snoozed_until: state === "snoozed" ? "2026-11-17T12:00:00Z" : null,
    examples: [{ transaction_id: 71, date: "2026-09-15", description: "Comercio barrio", category_id: 1 }],
    history: [{ state, reason: "Decisión guardada", at: "2026-10-17T12:00:00Z" }] });
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  const internalPatterns = ["observing", "conflict", "inactive", "covered", "accepted"].map((state, index) => ({
    ...pattern(), id: index + 20, state, pattern: `registro interno ${state}`, reason: "Detalle técnico interno",
  }));
  await page.route("**/api/v1/categorization-rules/patterns", route => route.fulfill({ json: [pattern(), ...internalPatterns] }));
  await page.route("**/api/v1/categorization-rules", route => route.fulfill({ json: state === "accepted" ? [
    { id: 17, category_id: 1, keyword: "comercio barrio", match_type: "exact", priority: 100, is_active: true, origin: "accepted" },
  ] : [] }));
  await page.route("**/api/v1/categorization-rules/patterns/7/decision", route => {
    const body = route.request().postDataJSON();
    expect(body.expected_version).toBe(version);
    actions.push(body.action);
    state = ({ snooze: "snoozed", reject: "rejected", reactivate: "pending", accept: "accepted" } as Record<string, string>)[body.action];
    version += 1;
    return route.fulfill({ json: { state } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/categories");
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Propuestas" }).click();
  await expect(page.getByRole("button", { name: "Crear regla", exact: true })).toBeVisible();
  expect(actions).toEqual([]);
  await expect(page.getByText(/registro interno|Detalle técnico interno|Decisión guardada|Patrones e historial/)).toHaveCount(0);
  await expect(page.getByText("Sugerencias descartadas y pospuestas", { exact: true })).toHaveCount(0);
  await page.getByText("Ver ejemplos y alcance", { exact: true }).click();
  await expect(page.getByText(/7 movimientos actuales coinciden; no se modificarán/)).toBeVisible();
  await page.getByRole("button", { name: "Más adelante" }).click();
  await expect(page.getByRole("button", { name: "Crear regla", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recuperar sugerencia" })).not.toBeVisible();
  await page.getByText("Sugerencias descartadas y pospuestas", { exact: true }).click();
  await page.getByRole("button", { name: "Recuperar sugerencia" }).click();
  await page.getByRole("button", { name: "No volver a sugerir", exact: true }).click();
  await page.reload();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Propuestas" }).click();
  await expect(page.getByRole("button", { name: "Crear regla", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recuperar sugerencia" })).not.toBeVisible();
  await page.getByText("Sugerencias descartadas y pospuestas", { exact: true }).click();
  await expect(page.getByText("Compras · Salidas · Descartada", { exact: true })).toBeVisible();
  await page.locator("#personalizacion").screenshot({ path: info.outputPath("dismissed-suggestions.png") });
  await page.getByRole("button", { name: "Recuperar sugerencia" }).click();
  await page.getByText("Ver ejemplos y alcance", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#personalizacion").screenshot({ path: info.outputPath("automatic-learning.png") });
  await page.getByRole("button", { name: "Crear regla", exact: true }).click();
  await expect(page.getByText("Regla creada para futuras importaciones.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear regla", exact: true })).toHaveCount(0);
  expect(actions).toEqual(["snooze", "reactivate", "reject", "reactivate", "accept"]);
  await expect(page.getByText("Sugerencias descartadas y pospuestas", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/registro interno|Detalle técnico interno|Decisión guardada/)).toHaveCount(0);
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("button", { name: "Más acciones de Compras", exact: true }).click();
    await page.getByRole("menuitem", { name: "Ver reglas y propuestas", exact: true }).click();
  } else {
    await page.getByRole("button", { name: /^Compras Gasto/ }).click();
  }
  await expect(page.getByText("comercio barrio", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Eliminar regla comercio barrio", exact: true })).toBeVisible();
});

test("inicio abre pendientes del periodo y permite categorizar y deshacer", async ({ page }) => {
  await mockApi(page);
  let categoryId: number | null = null;
  const movement = { id: 22, account_id: 1, date: "2026-09-15", description: "Compra pendiente",
    amount_clp: -1000, transaction_type: "expense", origin: "pdf", category_id: null, category_source: null };
  await page.route("**/api/v1/dashboard**", route => route.fulfill({ json: {
    period_month: "2026-09", available_periods: ["2026-09"], cards: [], monthly_movements: [],
  } }));
  await page.route("**/api/v1/categories**", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  await page.route("**/api/v1/transaction-pages**", route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("uncategorized")).toBe("true");
    expect(params.get("date_from")).toBe("2026-09-01");
    expect(params.get("date_to")).toBe("2026-09-30");
    return route.fulfill({ json: { items: categoryId === null ? [movement] : [],
      total: categoryId === null ? (params.get("limit") === "1" ? 12 : 1) : 0, offset: 0, limit: 50 } });
  });
  await page.route("**/api/v1/transactions/22/category", route => {
    categoryId = route.request().postDataJSON().category_id;
    return route.fulfill({ json: { ...movement, category_id: categoryId,
      category_reviewed: true, category_version: 1, category_event_id: 101 } });
  });
  await page.route("**/api/v1/transactions/22/category/undo", route => {
    expect(route.request().postDataJSON()).toEqual({ event_id: 101, expected_version: 1 });
    categoryId = null;
    return route.fulfill({ json: { ...movement, category_version: 2, category_reviewed: false } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("link", { name: /12 movimientos por categorizar/ }).click();
  await expect(page).toHaveURL(/month=2026-09&category=uncategorized/);
  await expect(page.getByRole("button", { name: "Quitar filtro: Sin categoría" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Quitar filtro: septiembre/i })).toBeVisible();
  await page.getByRole("button", { name: "Mostrar detalles de Compra pendiente" }).click();
  await page.getByRole("button", { name: "Categoria de Compra pendiente" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Compras", exact: true }).click();
  await expect(page.getByText("Todo categorizado para este periodo")).toBeVisible();
  await page.getByRole("button", { name: "Deshacer cambio de categoría" }).click();
  await expect(page.getByText("Compra pendiente", { exact: true })).toBeVisible();
  expect(categoryId).toBeNull();
  categoryId = 1;
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Evolucion Mensual" })).toBeVisible();
  await expect(page.getByRole("link", { name: /movimientos? por categorizar/ })).toHaveCount(0);
});

test("movimientos no desborda el ancho móvil con descripciones largas", async ({ page }, info) => {
  await mockApi(page);
  await page.route("**/api/v1/categories**", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  const description = "Transferencia_".repeat(12);
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: {
    items: [
      { id: 2, account_id: 1, date: "2026-09-30", description: "Transf a CLEO CHILE",
        amount_clp: -23600, transaction_type: "expense", origin: "pdf", category_id: null, is_internal_transfer: true },
      { id: 1, account_id: 1, date: "2026-09-30", description,
        amount_clp: -123456789, transaction_type: "expense", origin: "pdf", category_id: null },
      { id: 3, account_id: 3, date: "2026-09-29", description: "Ingreso en efectivo",
        amount_clp: 48000, transaction_type: "income", origin: "manual", category_id: null },
    ],
    total: 3, offset: 0, limit: 50,
  } }));
  const categoryUpdates: Array<number | null> = [];
  const undoEvents: number[] = [];
  await page.route("**/api/v1/transactions/2/category", route => {
    const categoryId = route.request().postDataJSON().category_id as number | null;
    categoryUpdates.push(categoryId);
    return route.fulfill({ json: { id: 2, category_id: categoryId,
      category_version: 1, category_reviewed: true, category_event_id: 202 } });
  });
  await page.route("**/api/v1/transactions/2/category/undo", route => {
    undoEvents.push(route.request().postDataJSON().event_id);
    return route.fulfill({ json: { id: 2, account_id: 1, date: "2026-09-30",
      description: "Transf a CLEO CHILE", amount_clp: -23600, transaction_type: "expense",
      origin: "pdf", is_internal_transfer: true, category_id: null, category_source: null,
      category_version: 2, category_reviewed: false } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/transactions");
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth, viewport: window.innerWidth,
      titleLeft: document.querySelector("h1")!.getBoundingClientRect().left,
    }));
    expect(bounds.page, `ancho ${width}`).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.titleLeft).toBeGreaterThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: info.outputPath("movimientos-top-desktop.png") });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.screenshot({ path: info.outputPath("movimientos-filtros-desktop.png") });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByText("Transf a CLEO CHILE").locator("xpath=ancestor::section[1]").screenshot({ path: info.outputPath("movimiento-card-desktop.png") });
  await page.getByRole("button", { name: "Categoria de Transf a CLEO CHILE", exact: true }).click();
  const desktopPicker = page.getByRole("dialog", { name: "Seleccionar categoría" });
  await expect(desktopPicker).toBeVisible();
  const desktopPickerBounds = await desktopPicker.boundingBox();
  expect(desktopPickerBounds!.width).toBeLessThanOrEqual(384);
  expect(desktopPickerBounds!.height).toBeLessThanOrEqual(480);
  await desktopPicker.screenshot({ path: info.outputPath("categorias-desktop.png") });
  await desktopPicker.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  let resumeFilter!: () => void;
  await page.route("**/api/v1/transaction-pages**", async route => {
    await new Promise<void>(resolve => { resumeFilter = resolve; });
    await route.fallback();
  }, { times: 1 });
  await page.getByRole("button", { name: "Filtrar por categoría", exact: true }).click();
  await page.getByRole("dialog", { name: "Seleccionar categoría" }).getByRole("button", { name: "Compras", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Actualizando…");
  await expect(page.getByText("Transf a CLEO CHILE", { exact: true })).toBeVisible();
  await expect.poll(() => typeof resumeFilter).toBe("function");
  resumeFilter();
  await expect(page.getByRole("status").first()).not.toContainText("Actualizando…");
  await expect(page.getByRole("button", { name: "Quitar filtro: Compras" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar filtro: Compras" })).toHaveCount(0);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filtrar por categoría", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("movimientos-top-mobile.png") });
  const movementCard = page.getByText("Transf a CLEO CHILE").locator("xpath=ancestor::section[1]");
  const regularCard = page.getByText(description, { exact: true }).locator("xpath=ancestor::section[1]");
  await expect(movementCard.getByRole("img", { name: "Transferencia interna" })).toBeVisible();
  expect((await movementCard.boundingBox())!.height).toBe((await regularCard.boundingBox())!.height);
  await movementCard.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 160));
  await expect(movementCard.getByText("Cartola PDF")).toBeHidden();
  await expect(movementCard.getByRole("combobox")).toBeHidden();
  await movementCard.screenshot({ path: info.outputPath("movimiento-card-mobile.png") });
  await movementCard.getByText("Transf a CLEO CHILE").click();
  await expect(movementCard.getByText("Cartola PDF").last()).toBeVisible();
  await expect(movementCard.locator("#transaction-details-2").getByText("Sí", { exact: true })).toBeVisible();
  await expect(movementCard.getByText(/30 de septiembre de 2026/i)).toBeVisible();
  await movementCard.screenshot({ path: info.outputPath("movimiento-detalles-mobile.png") });
  await movementCard.getByText("Transf a CLEO CHILE").click();
  await expect(movementCard.getByText("Cartola PDF")).toBeHidden();
  await expect(movementCard.getByText("Ver detalles")).toHaveCount(0);
  const manualCard = page.getByText("Ingreso en efectivo").locator("xpath=ancestor::section[1]");
  await manualCard.getByText("Ingreso en efectivo").click();
  await expect(manualCard.getByText("Registro manual").last()).toBeVisible();
  await expect(manualCard.locator("#transaction-details-3").getByText("No", { exact: true })).toBeVisible();
  await expect(manualCard.getByRole("button", { name: "Editar" })).toBeVisible();
  await movementCard.getByText("Transf a CLEO CHILE").click();
  await page.getByRole("button", { name: "Categoria de Transf a CLEO CHILE", exact: true }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Seleccionar categoría" });
  await expect(categoryDialog).toBeVisible();
  const dialogBounds = await categoryDialog.boundingBox();
  expect(dialogBounds!.width).toBeLessThanOrEqual(390 - 32);
  expect(dialogBounds!.height).toBeLessThanOrEqual(844 * 0.65 + 2);
  await page.keyboard.press("Escape");
  await expect(categoryDialog).toHaveCount(0);
  await page.getByRole("button", { name: "Categoria de Transf a CLEO CHILE", exact: true }).click();
  await categoryDialog.getByRole("button", { name: "Compras", exact: true }).click();
  await expect(categoryDialog).toHaveCount(0);
  await movementCard.getByText("Transf a CLEO CHILE").click();
  await expect(movementCard.getByText("Cartola PDF")).toBeHidden();
  await expect(movementCard.locator("span.line-clamp-1")).toHaveText("Compras");
  await expect(page.getByText("Categoría cambiada a Compras.")).toBeVisible();
  expect(categoryUpdates).toEqual([1]);
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer cambio de categoría" }).click();
  await expect(page.getByText("Cambio deshecho.")).toBeVisible();
  await expect(movementCard.locator("span.line-clamp-1")).toHaveText("Sin categoría");
  expect(categoryUpdates).toEqual([1]);
  expect(undoEvents).toEqual([202]);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath("movimientos-mobile.png"), fullPage: true });
});

test("movimientos restaura la categoría si falla el guardado inmediato", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/categories**", route => route.fulfill({ json: [
    { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 1 },
  ] }));
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: {
    items: [{ id: 2, account_id: 1, date: "2026-09-30", description: "Compra de prueba",
      amount_clp: -1000, transaction_type: "expense", origin: "pdf", category_id: null }],
    total: 1, offset: 0, limit: 50,
  } }));
  let rejectSave!: () => void;
  await page.route("**/api/v1/transactions/2/category", async route => {
    await new Promise<void>(resolve => { rejectSave = resolve; });
    await route.fulfill({ status: 500, json: { detail: "Error de prueba" } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/transactions");
  const card = page.getByText("Compra de prueba").locator("xpath=ancestor::section[1]");
  await card.getByText("Compra de prueba").click();
  await card.getByRole("button", { name: "Categoria de Compra de prueba" }).click();
  await page.getByRole("dialog", { name: "Seleccionar categoría" }).getByRole("button", { name: "Compras", exact: true }).click();
  await expect(card.locator("span.line-clamp-1")).toHaveText("Compras");
  await expect(page.getByText("Guardando categoría…")).toBeVisible();
  await expect.poll(() => typeof rejectSave).toBe("function");
  rejectSave();
  await expect(page.getByRole("alert")).toContainText("No se pudo guardar");
  await expect(card.locator("span.line-clamp-1")).toHaveText("Sin categoría");
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);
});

test("movimientos carga más al bajar y reinicia la lista al filtrar", async ({ page }) => {
  await mockApi(page);
  const items = Array.from({ length: 75 }, (_, index) => ({
    id: 75 - index, account_id: 1, date: index < 50 ? "2026-09-30" : "2026-09-29",
    description: `Movimiento ${index + 1}`, amount_clp: -1000, transaction_type: "expense",
    origin: "pdf", category_id: null,
  }));
  const requestedOffsets: number[] = [];
  await page.route("**/api/v1/transaction-pages**", route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    requestedOffsets.push(offset);
    const filtered = params.get("transaction_type") === "income" ? [] : items;
    return route.fulfill({ json: { items: filtered.slice(offset, offset + 50), total: filtered.length, offset, limit: 50 } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/transactions");
  await expect(page.getByText("Movimiento 50", { exact: true })).toBeVisible();
  await expect(page.getByText("Movimiento 51", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /30 de septiembre de 2026/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Siguiente" })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByText("Movimiento 75", { exact: true })).toBeVisible();
  await expect(page.getByText("Movimiento 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /29 de septiembre de 2026/i })).toBeVisible();
  expect(requestedOffsets.filter(offset => offset === 50)).toEqual([50]);
  await page.getByRole("button", { name: "Ingresos" }).click();
  await expect(page.getByText("Movimiento 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No hay movimientos para este filtro")).toBeVisible();
  expect(requestedOffsets.at(-1)).toBe(0);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Periodo", exact: true })).toBeVisible();
});

test("inicio conserva sus indicadores y gráficos en móvil y escritorio", async ({ page }, info) => {
  await mockApi(page);
  const names = ["Comida y restaurantes", "Servicios con un nombre largo para el gráfico móvil", "Transporte", "Salud", "Compras", "Educación", "Viajes"];
  const amounts = [50000, 20000, 10000, 8000, 5000, 4000, 3000];
  await page.route("**/api/v1/categories**", route => route.fulfill({ json: names.map((name, index) => ({
    id: index + 1, name, type: "expense", parent_id: null,
  })) }));
  await page.route("**/api/v1/transactions**", route => route.fulfill({ json: amounts.map((amount, index) => ({
    id: index + 10, account_id: 1, date: "2026-09-12", description: names[index], amount_clp: -amount,
    transaction_type: "expense", origin: "pdf", category_id: index + 1, is_internal_transfer: false,
  })) }));
  await page.route("**/api/v1/dashboard**", route => route.fulfill({ json: {
    period_month: "2026-09", available_periods: ["2026-09"],
    cards: [
      { label: "Balance", value: "-$123.456.789", trend: "Subio 5%" },
      { label: "Ingresos", value: "$8.765.432", trend: "Subio 3%" },
      { label: "Gastos", value: "$4.321.123", trend: "Bajo 2%" },
    ],
    monthly_movements: [{ month: "2026-09", income: 8765432, expenses: 4321123 }],
  } }));
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Evolucion Mensual" })).toBeVisible();
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `ancho ${width}` }).toBeLessThanOrEqual(width);
    for (const value of ["-$123.456.789", "$8.765.432", "$4.321.123"]) {
      const amount = page.getByText(value, { exact: true }).first();
      expect(await amount.evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [...range.getClientRects()];
        const bounds = el.getBoundingClientRect();
        return lines.length === 1 && lines[0].left >= bounds.left && lines[0].right <= bounds.right;
      }), `${value} completo en una línea a ${width}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const gainsCard = page.getByText("Ganancias tarjetas").locator("xpath=ancestor::section[1]");
  const gainsSize = await gainsCard.boundingBox();
  expect(gainsSize).not.toBeNull();
  expect(gainsSize!.width / gainsSize!.height).toBeLessThan(1.35);
  const categoryPanel = page.getByRole("heading", { name: "Gastos por Categoria" }).locator("xpath=ancestor::section[1]");
  await expect(categoryPanel.getByRole("button", { name: /Otras categorías/ })).toContainText("$7.000");
  await expect(categoryPanel.getByRole("status")).toContainText("Total: $100.000");
  const chart = categoryPanel.locator("canvas").first();
  await expect(chart).toBeVisible();
  const chartBox = await chart.boundingBox();
  expect(chartBox).not.toBeNull();
  await chart.click({ position: { x: chartBox!.width / 2 + 74, y: chartBox!.height * .48 } });
  await expect(categoryPanel.getByRole("status")).toContainText("Comida y restaurantes");
  await expect(categoryPanel.getByRole("status")).toContainText("50.0% del total");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("categoria-tocada-mobile.png") });
  await categoryPanel.getByRole("button", { name: /Servicios con un nombre largo/ }).click();
  await expect(categoryPanel.getByRole("status")).toContainText("20.0% del total");
  await categoryPanel.getByRole("button", { name: /Otras categorías/ }).click();
  await expect(categoryPanel.getByRole("status")).toContainText("7.0% del total");
  await categoryPanel.getByRole("button", { name: /Otras categorías/ }).click();
  await expect(categoryPanel.getByRole("status")).toContainText("Total: $100.000");
  await page.screenshot({ path: info.outputPath("inicio-mobile.png"), fullPage: true });
});
function session(owner: string) {
  const payload = { sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fake`;
  return {
    access_token: token,
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: payload.exp,
    user: {
      id: owner,
      email: "demo@example.test",
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "Demo" },
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}
async function mockApi(page: Page) {
  await page.route("https://demo.supabase.co/**", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const bearer = request.headers().authorization?.split(" ")[1];
    const owner = bearer
      ? JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString())
          .sub
      : "";
    if (!owner)
      return route.fulfill({ status: 401, json: { detail: "Ingresa" } });
    const name = owner === ownerA ? "Cuenta demo A" : "Cuenta demo B";
    const account = {
      id: owner === ownerA ? 1 : 2,
      name,
      account_type: "debito",
      institution: "banco_de_chile",
      currency: "CLP",
      account_last4: "1234",
      created_at: "2026-01-01T00:00:00Z",
    };
    let body: unknown = [];
    if (url.pathname.endsWith("/me"))
      body = { id: owner, email: "demo@example.test", display_name: "Demo", onboarding_choice: "bank" };
    if (
      url.pathname.endsWith("/accounts") &&
      !url.pathname.includes("/reports/")
    )
      body = [account];
    if (url.pathname.endsWith("/cash-account"))
      body = { id: owner === ownerA ? 3 : 4, name: "Efectivo" };
    if (url.pathname.endsWith("/cash-account/balance"))
      body = { opening_balance_clp: null, opening_balance_date: null, movements_clp: 0, balance_clp: 0, is_negative: false };
    if (url.pathname.endsWith("/transaction-pages"))
      body = { items: [], total: 0, offset: 0, limit: 50 };
    return route.fulfill({ json: body });
  });
}

test("bienvenida permite comenzar con Efectivo y persiste la elección", async ({ page }) => {
  await mockApi(page);
  let choice: "cash" | null = null;
  await page.route("**/api/v1/accounts", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: {
    id: ownerA, email: "demo@example.test", display_name: "Demo", onboarding_choice: choice,
  } }));
  await page.route("**/api/v1/me/onboarding", (route) => {
    expect(route.request().postDataJSON()).toEqual({ choice: "cash" });
    choice = "cash";
    return route.fulfill({ json: { onboarding_choice: choice } });
  });
  await page.route("**/api/v1/dashboard**", (route) => route.fulfill({ json: {
    period_month: "2026-10", available_periods: [], cards: [], monthly_movements: [],
  } }));
  await page.addInitScript((value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Empieza a tu manera" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar con efectivo" }).click();
  await expect(page).toHaveURL(/\/app\/accounts\?account_id=3#cash-account$/);
  await expect(page.getByRole("button", { name: "Registrar movimiento" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurar saldo inicial" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Empieza a tu manera" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver detalle de Efectivo" })).toBeVisible();
});

test("bienvenida bancaria abre el formulario y lleva a importar la cuenta creada", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: {
    id: ownerA, email: "demo@example.test", display_name: "Demo", onboarding_choice: null,
  } }));
  await page.route("**/api/v1/accounts", (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 201, json: {
      id: 8, ...route.request().postDataJSON(), created_at: "2026-10-12T00:00:00Z",
    } });
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: [
    { code: "banco_estado_cuenta_rut", institution: "banco_estado", name: "CuentaRUT", kind: "vista", pdf_support: "muestra_probada" },
  ] }));
  await page.route("**/api/v1/dashboard**", (route) => route.fulfill({ json: {
    period_month: "2026-10", available_periods: [], cards: [], monthly_movements: [],
  } }));
  await page.addInitScript((value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app");
  await page.getByRole("button", { name: "Agregar cuenta bancaria" }).click();
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Mi CuentaRUT");
  await page.getByRole("combobox", { name: "Institución" }).selectOption("banco_estado");
  await page.getByRole("combobox", { name: "Tipo de cuenta" }).selectOption("vista");
  await page.getByRole("combobox", { name: "Producto" }).selectOption("banco_estado_cuenta_rut");
  await page.getByRole("dialog", { name: "Elige tu producto financiero" }).getByRole("button", { name: "Agregar cuenta" }).click();
  await expect(page).toHaveURL(/\/app\/import\?account_id=8$/);
});

test("home público, diseño adaptable y rutas privadas", async ({
  page,
}, info) => {
  const financeRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) financeRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tus finanzas",
  );
  expect(financeRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("home.png"), fullPage: true });
  await page.goto("/app/accounts");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Continuar con Google" }),
  ).toBeVisible();
  await page.goto("/transactions?statement_id=8");
  await expect(page).toHaveURL(/\/login$/);
});

test("cancelación OAuth y privacidad", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied");
  await expect(page.getByRole("alert")).toContainText("canceló");
  await page.getByRole("link", { name: "Volver a ingresar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "privacidad",
  );
});

test("recarga privada, cambio de usuario y cierre de sesión", async ({
  page,
  context,
}, info) => {
  await mockApi(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/accounts");
  await expect(page.getByText("Cuenta demo A").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Cuenta demo A").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("accounts.png"),
    fullPage: true,
  });
  const otherTab = await context.newPage();
  await mockApi(otherTab);
  await otherTab.goto("/");
  await otherTab.evaluate((value) => {
    localStorage.setItem("sb-demo-auth-token", JSON.stringify(value));
    const channel = new BroadcastChannel("sb-demo-auth-token");
    channel.postMessage({ event: "SIGNED_IN", session: value });
    channel.close();
  }, session(ownerB));
  await expect(page.getByText("Cuenta demo B").first()).toBeVisible();
  await expect(page.getByText("Cuenta demo A")).toHaveCount(0);
  await otherTab.close();
  await page.goto("/app/profile");
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/login$/);
});

test("respuesta de token vencido limpia las pantallas privadas", async ({
  page,
}) => {
  await mockApi(page);
  await page.addInitScript(
    (value) =>
      localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "La sesión no es válida." } }),
  );
  await page.goto("/app/accounts");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Cuenta demo A")).toHaveCount(0);
});

test("alta de cuenta selecciona producto y deriva el tipo", async ({ page }, info) => {
  await mockApi(page);
  const products = [
    { code: "banco_de_chile_cuenta_fan", institution: "banco_de_chile", name: "Cuenta FAN", kind: "vista", pdf_support: "pendiente_verificacion" },
    { code: "banco_estado_cuenta_rut", institution: "banco_estado", name: "CuentaRUT", kind: "vista", pdf_support: "muestra_probada" },
    { code: "banco_estado_visa_smart", institution: "banco_estado", name: "Visa SMART", kind: "credito", pdf_support: "no_soportado" },
  ];
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: products }));
  let createdPayload: Record<string, unknown> | null = null;
  await page.route("**/api/v1/accounts", (route) => {
    if (route.request().method() === "POST") {
      createdPayload = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: {
        id: 8, created_at: "2026-01-01T00:00:00Z", ...createdPayload,
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/accounts");
  await page.getByRole("button", { name: "Agregar cuenta", exact: true }).click();
  const accountDialog = page.getByRole("dialog", { name: "Elige tu producto financiero" });
  const closeButton = accountDialog.getByRole("button", { name: "Cerrar", exact: true });
  const submitButton = accountDialog.getByRole("button", { name: "Agregar cuenta", exact: true });
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(submitButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Moneda" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Cuenta para gastos");
  const preview = page.getByRole("img", { name: /Vista previa de/ });
  const initialBackground = await preview.evaluate((element) => getComputedStyle(element).backgroundImage);
  await page.getByRole("combobox", { name: "Institución" }).selectOption("banco_estado");
  await expect(preview).toContainText("BancoEstado");
  expect(await preview.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe(initialBackground);
  const kindSelect = page.getByRole("combobox", { name: "Tipo de cuenta" });
  await expect(kindSelect).toBeEnabled();
  const institutionBackground = await preview.evaluate((element) => getComputedStyle(element).backgroundImage);
  await kindSelect.selectOption("credito");
  expect(await preview.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe(institutionBackground);
  const productSelect = page.getByRole("combobox", { name: "Producto" });
  await expect(productSelect).toBeEnabled();
  await productSelect.selectOption("banco_estado_visa_smart");
  await expect(preview).toContainText("Visa SMART");
  await expect(accountDialog.getByRole("button", { name: "Agregar cuenta" })).toBeDisabled();
  await kindSelect.selectOption("vista");
  await expect(productSelect.locator("option")).toHaveCount(2);
  await productSelect.selectOption("banco_estado_cuenta_rut");
  await expect(preview).toContainText("CuentaRUT");
  await accountDialog.getByRole("textbox", { name: /Últimos 4/ }).fill("1234");
  for (const [width, height] of [[800, 600], [1024, 600], [1280, 650], [1532, 730], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    const layout = await accountDialog.evaluate(dialog => {
      const panel = dialog.firstElementChild as HTMLElement;
      const bounds = panel.getBoundingClientRect();
      return { overflow: panel.scrollHeight - panel.clientHeight, widthOverflow: panel.scrollWidth - panel.clientWidth, top: bounds.top, bottom: bounds.bottom };
    });
    expect(layout.overflow, `scroll del modal a ${width}×${height}`).toBeLessThanOrEqual(1);
    expect(layout.widthOverflow).toBeLessThanOrEqual(1);
    expect(layout.top).toBeGreaterThanOrEqual(16);
    expect(layout.bottom).toBeLessThanOrEqual(height - 16);
    await expect(preview).toBeInViewport({ ratio: 1 });
    await expect(accountDialog.getByRole("textbox", { name: /Últimos 4/ })).toBeInViewport({ ratio: 1 });
    await expect(accountDialog.getByRole("button", { name: "Agregar cuenta" })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`modal-${width}x${height}.png`) });
  }
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [844, 390], [390, 400]]) {
    await page.setViewportSize({ width, height });
    await expect(closeButton).toBeInViewport({ ratio: 1 });
    await expect(submitButton).toBeInViewport({ ratio: 1 });
    const layout = await accountDialog.evaluate(dialog => {
      const panel = dialog.firstElementChild as HTMLElement;
      const body = panel.children[1] as HTMLElement;
      const bounds = panel.getBoundingClientRect();
      return { widthOverflow: body.scrollWidth - body.clientWidth, top: bounds.top, bottom: bounds.bottom };
    });
    expect(layout.widthOverflow, `ancho del modal a ${width}×${height}`).toBeLessThanOrEqual(1);
    expect(layout.top).toBeGreaterThanOrEqual(8);
    expect(layout.bottom).toBeLessThanOrEqual(height - 8);
    const last4 = accountDialog.getByRole("textbox", { name: /Últimos 4/ });
    await last4.focus();
    await last4.scrollIntoViewIfNeeded();
    const visibleField = await last4.evaluate(input => {
      const panel = input.closest("form")!;
      const header = panel.firstElementChild!.getBoundingClientRect();
      const footer = panel.lastElementChild!.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      return field.top >= header.bottom && field.bottom <= footer.top;
    });
    expect(visibleField, `campo visible a ${width}×${height}`).toBe(true);
    await expect(submitButton).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`modal-${width}x${height}.png`) });
    await productSelect.scrollIntoViewIfNeeded();
    await expect(productSelect).toBeInViewport({ ratio: 1 });
    if (height >= 568) {
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toBeInViewport({ ratio: 1 });
      await expect(closeButton).toBeInViewport({ ratio: 1 });
      await expect(submitButton).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`modal-preview-${width}x${height}.png`) });
    }
  }
  await page.keyboard.press("Escape");
  await expect(accountDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar cuenta", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Agregar cuenta", exact: true }).click();
  await accountDialog.getByRole("textbox", { name: "Nombre visible" }).fill("Cuenta para gastos");
  await page.getByRole("combobox", { name: "Institución" }).selectOption("banco_estado");
  await kindSelect.selectOption("vista");
  await productSelect.selectOption("banco_estado_cuenta_rut");
  await page.setViewportSize({ width: 390, height: 844 });
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("modal-preview.png") });
  await accountDialog.getByRole("button", { name: "Agregar cuenta" }).click();
  await expect(page.getByText("Cuenta para gastos").first()).toBeVisible();
  expect(createdPayload).toMatchObject({
    name: "Cuenta para gastos",
    institution: "banco_estado",
    account_type: "vista",
    product_code: "banco_estado_cuenta_rut",
  });
});

test("el formulario ofrece las nuevas cuentas según institución y tipo", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: [
    { code: "banco_de_chile_corriente_tradicional", institution: "banco_de_chile", name: "Cuenta Corriente (plan tradicional)", kind: "corriente", pdf_support: "pendiente_verificacion" },
    { code: "banco_estado_cuenta_pro", institution: "banco_estado", name: "Cuenta Pro (Chequera Electrónica)", kind: "vista", pdf_support: "pendiente_verificacion" },
    { code: "banco_falabella_vista", institution: "banco_falabella", name: "Cuenta Vista", kind: "vista", pdf_support: "pendiente_verificacion" },
  ] }));
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/accounts");
  await page.getByRole("button", { name: "Agregar cuenta", exact: true }).click();
  const institution = page.getByRole("combobox", { name: "Institución" });
  const kind = page.getByRole("combobox", { name: "Tipo de cuenta" });
  const product = page.getByRole("combobox", { name: "Producto" });
  const preview = page.getByRole("img", { name: /Vista previa de/ });
  for (const item of [
    { institution: "banco_de_chile", kind: "corriente", code: "banco_de_chile_corriente_tradicional", name: "Cuenta Corriente (plan tradicional)" },
    { institution: "banco_estado", kind: "vista", code: "banco_estado_cuenta_pro", name: "Cuenta Pro (Chequera Electrónica)" },
    { institution: "banco_falabella", kind: "vista", code: "banco_falabella_vista", name: "Cuenta Vista" },
  ]) {
    await institution.selectOption(item.institution);
    await kind.selectOption(item.kind);
    await product.selectOption(item.code);
    await expect(preview).toContainText(item.name);
  }
});

test("cuenta heredada sin producto conserva su tipo al editar el nombre", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: [
    { code: "banco_de_chile_cuenta_fan", institution: "banco_de_chile", name: "Cuenta FAN", kind: "vista", pdf_support: "pendiente_verificacion" },
    { code: "banco_de_chile_visa_signature", institution: "banco_de_chile", name: "Visa Signature", kind: "credito", pdf_support: "no_soportado" },
  ] }));
  const account = {
    id: 1, name: "Cuenta antigua", institution: "banco_de_chile",
    account_type: "debito", product_code: null, account_last4: "1234",
    currency: "CLP", created_at: "2026-01-01T00:00:00Z",
  };
  let updatedPayload: Record<string, unknown> | null = null;
  await page.route("**/api/v1/accounts", (route) => route.fulfill({ json: [account] }));
  await page.route("**/api/v1/accounts/1", (route) => {
    updatedPayload = route.request().postDataJSON();
    return route.fulfill({ json: { ...account, ...updatedPayload } });
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/accounts");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Producto" })).toHaveValue("");
  const kindSelect = page.getByRole("combobox", { name: "Tipo de cuenta" });
  await kindSelect.selectOption("credito");
  await expect(page.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await kindSelect.selectOption("debito");
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Cuenta antigua renovada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  expect(updatedPayload).toMatchObject({
    name: "Cuenta antigua renovada", account_type: "debito", product_code: null,
  });
});

test("importación PDF avisa sobre productos pendientes y bloquea crédito", async ({ page }) => {
  await mockApi(page);
  const accounts = [
    { id: 1, name: "Cuenta FAN", institution: "banco_de_chile", account_type: "vista", product_code: "banco_de_chile_cuenta_fan", account_last4: null, currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
    { id: 2, name: "Crédito", institution: "banco_estado", account_type: "credito", product_code: "banco_estado_visa_smart", account_last4: null, currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
    { id: 3, name: "Cuenta antigua", institution: "banco_de_chile", account_type: "debito", product_code: null, account_last4: null, currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
  ];
  const products = [
    { code: "banco_de_chile_cuenta_fan", institution: "banco_de_chile", name: "Cuenta FAN", kind: "vista", pdf_support: "pendiente_verificacion" },
    { code: "banco_estado_visa_smart", institution: "banco_estado", name: "Visa SMART", kind: "credito", pdf_support: "no_soportado" },
  ];
  await page.route("**/api/v1/accounts", (route) => route.fulfill({ json: accounts }));
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: products }));
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/import?account_id=1");
  const accountSelect = page.getByRole("combobox", { name: "Cuenta Destino" });
  await expect(accountSelect).toHaveValue("1");
  await expect(page.getByText(/Aún no se verificó una cartola real/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "demo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-demo"),
  });
  await expect(page.getByRole("button", { name: "Analizar Documento" })).toBeEnabled();
  await accountSelect.selectOption("2");
  await expect(page.getByText(/tarjeta de crédito aún no está disponible/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analizar Documento" })).toBeDisabled();
  await accountSelect.selectOption("3");
  await expect(page.getByText(/cuenta antigua no tiene producto asignado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analizar Documento" })).toBeEnabled();
});

test("cuentas y dashboard muestran alias, institución y producto", async ({ page }, info) => {
  await mockApi(page);
  const accounts = [
    { id: 1, name: "Gastos diarios", institution: "banco_estado", account_type: "vista", product_code: "banco_estado_cuenta_rut", account_last4: "4321", currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
    { id: 2, name: "Cuenta antigua", institution: "banco_de_chile", account_type: "debito", product_code: null, account_last4: null, currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
  ];
  await page.route("**/api/v1/accounts", (route) => route.fulfill({ json: accounts }));
  await page.route("**/api/v1/account-products", (route) => route.fulfill({ json: [
    { code: "banco_estado_cuenta_rut", institution: "banco_estado", name: "CuentaRUT", kind: "vista", pdf_support: "muestra_probada" },
  ] }));
  await page.route("**/api/v1/dashboard**", (route) => route.fulfill({ json: {
    period_month: "2026-01", available_periods: [], cards: [], monthly_movements: [],
  } }));
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );

  await page.goto("/app/accounts?account_id=1");
  const selectedCard = page.getByRole("button", { name: /Gastos diarios/ });
  await expect(selectedCard).toContainText("Gastos diarios");
  await expect(selectedCard).toContainText("BancoEstado");
  await expect(selectedCard).toContainText("CuentaRUT");
  await expect(selectedCard).toContainText("**** 4321");
  await expect(page.getByText("Producto sin identificar")).toBeVisible();
  await selectedCard.screenshot({ path: info.outputPath("accounts-card.png") });

  await page.goto("/app");
  const dashboardCard = page.getByRole("link", { name: "Ver detalle de Gastos diarios" });
  await expect(dashboardCard).toContainText("Gastos diarios");
  await expect(dashboardCard).toContainText("BancoEstado");
  await expect(dashboardCard).toContainText("CuentaRUT");
  await expect(dashboardCard).toContainText("**** 4321");
  await expect(dashboardCard).not.toContainText("Terminada en");
  await dashboardCard.screenshot({ path: info.outputPath("dashboard-card.png") });

  await page.goto("/app/settings?account_id=1");
  await expect(page).toHaveURL(/\/app\/accounts\?account_id=1$/);
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await page.getByLabel("Más acciones de la cuenta").click();
  await expect(page.getByRole("button", { name: "Eliminar cuenta", exact: true })).toBeVisible();
});

test("cuentas distingue variación registrada y cobertura de cartolas", async ({ page }, info) => {
  await mockApi(page);
  await page.route("**/api/v1/accounts", (route) => route.fulfill({ json: [
    { id: 1, name: "Cuenta principal", institution: "banco_estado", account_type: "vista", product_code: "banco_estado_cuenta_rut", account_last4: "1234", currency: "CLP", created_at: "2026-01-01T00:00:00Z" },
  ] }));
  await page.route("**/api/v1/statements?account_id=1", (route) => route.fulfill({ json: [
    { id: 1, account_id: 1, file_name: "enero.pdf", file_type: "application/pdf", file_checksum: null, period_month: "2026-01", status: "processed", raw_path: null, uploaded_at: "2026-02-02T10:00:00Z" },
    { id: 2, account_id: 1, file_name: "marzo.pdf", file_type: "application/pdf", file_checksum: null, period_month: "2026-03", status: "processed", raw_path: null, uploaded_at: "2026-04-03T10:00:00Z" },
    { id: 3, account_id: 1, file_name: "febrero.pdf", file_type: "application/pdf", file_checksum: null, period_month: "2026-02", status: "failed", raw_path: null, uploaded_at: "2026-04-04T10:00:00Z" },
    { id: 4, account_id: 1, file_name: "abril.pdf", file_type: "application/pdf", file_checksum: null, period_month: "2026-04", status: "pending", raw_path: null, uploaded_at: "2026-04-05T10:00:00Z" },
  ] }));
  await page.route("**/api/v1/reports/accounts", (route) => route.fulfill({ json: [
    { account_id: 1, count: 2, income: 150000, expenses: 50000, net: 100000 },
  ] }));
  await page.route("**/api/v1/transaction-pages**", route => route.fulfill({ json: { items: [], total: 82, offset: 0, limit: 50 } }));
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );

  await page.goto("/app/accounts?account_id=1");
  await expect(page.getByText("Variación registrada", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Saldo neto", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Última cartola procesada: marzo de 2026/)).toBeVisible();
  await page.getByText("Ver detalles de importación", { exact: true }).click();
  await expect(page.getByText(/Última importación correcta: 03 abr\.? 2026/)).toBeVisible();
  await expect(page.getByText("1 con error", { exact: true })).toBeVisible();
  await expect(page.getByText("1 pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("1 mes sin cartola", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sin cartola registrada entre períodos importados: febrero de 2026/)).toBeVisible();
  await expect(page.getByText("Cartolas por actualizar", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Movimientos (82)", exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("accounts-desktop.png"), fullPage: true });

  const lastClosedMonth = new Date();
  lastClosedMonth.setDate(1);
  lastClosedMonth.setMonth(lastClosedMonth.getMonth() - 1);
  const currentPeriod = `${lastClosedMonth.getFullYear()}-${String(lastClosedMonth.getMonth() + 1).padStart(2, "0")}`;
  await page.route("**/api/v1/statements?account_id=1", (route) => route.fulfill({ json: [
    { id: 5, account_id: 1, file_name: "reciente.pdf", file_type: "application/pdf", file_checksum: null, period_month: currentPeriod, status: "processed", raw_path: null, uploaded_at: new Date().toISOString() },
  ] }));
  await page.reload();
  await expect(page.getByText("Cartolas al día", { exact: true })).toBeVisible();
  await expect(page.getByText("Cartolas por actualizar", { exact: true })).toHaveCount(0);
});

test("efectivo permite crear, editar y eliminar un movimiento manual", async ({ page }) => {
  await mockApi(page);
  let movement: Record<string, unknown> | null = null;
  await page.route("**/api/v1/transaction-pages**", (route) => {
    const accountId = new URL(route.request().url()).searchParams.get("account_id");
    const items = movement && (!accountId || accountId === "3") ? [movement] : [];
    return route.fulfill({ json: { items, total: items.length, offset: 0, limit: 50 } });
  });
  await page.route("**/api/v1/cash-transactions", (route) => {
    const payload = route.request().postDataJSON();
    movement = {
      ...payload, id: 10, account_id: 3, statement_id: null, origin: "manual",
      amount_clp: payload.transaction_type === "income" ? payload.amount_clp : -payload.amount_clp,
      normalized_description: payload.description.toLowerCase(), source_row: null,
      category_source: null, rule_id_applied: null, fingerprint: null, raw_data: null,
      created_at: "2026-10-12T10:00:00Z", updated_at: null, is_internal_transfer: false,
    };
    return route.fulfill({ status: 201, json: movement });
  });
  await page.route("**/api/v1/cash-transactions/10", (route) => {
    if (route.request().method() === "DELETE") {
      movement = null;
      return route.fulfill({ status: 204, body: "" });
    }
    const payload = route.request().postDataJSON();
    movement = {
      ...movement, ...payload,
      amount_clp: payload.transaction_type === "income" ? payload.amount_clp : -payload.amount_clp,
      updated_at: "2026-10-12T11:00:00Z",
    };
    return route.fulfill({ json: movement });
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );

  await page.goto("/app/accounts");
  await expect(page.getByRole("button", { name: "Importar cartola" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar Efectivo" }).click();
  await expect(page.getByRole("button", { name: "Importar cartola" })).toHaveCount(0);
  const cash = page.locator("#cash-account");
  await expect(cash.getByRole("heading", { name: "Efectivo" })).toBeVisible();
  await expect(cash.getByText("Información de la cuenta")).toBeVisible();
  await expect(cash.getByRole("region", { name: "Resumen de movimientos de la cuenta" }).getByRole("article")).toHaveCount(4);
  await expect(cash.getByText("Cartolas", { exact: true })).toHaveCount(0);
  await cash.getByRole("button", { name: "Registrar movimiento" }).click();
  const dialog = page.getByRole("dialog", { name: "Registrar movimiento" });
  await dialog.getByLabel("Monto en pesos").fill("5000");
  await dialog.getByLabel("Descripción").fill("Almuerzo");
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(cash.getByText("Almuerzo")).toBeVisible();
  await expect(cash.getByRole("table")).toBeVisible();

  await cash.getByRole("button", { name: "Acciones de Almuerzo" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar movimiento" });
  await editDialog.getByLabel("Tipo").selectOption("income");
  await editDialog.getByLabel("Monto en pesos").fill("8000");
  await editDialog.getByLabel("Descripción").fill("Reembolso");
  await editDialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(cash.getByText("Reembolso")).toBeVisible();
  await cash.getByRole("button", { name: "Acciones de Reembolso" }).click();
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await expect(page.getByText("¿Eliminar este movimiento manual?")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar movimiento" }).click();
  await expect(cash.getByText("Reembolso")).toHaveCount(0);
});

test("efectivo permite configurar, corregir y quitar el saldo inicial", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/reports/accounts", (route) => route.fulfill({ json: [
    { account_id: 3, count: 2, net: -500, income: 1000, expenses: 1500 },
  ] }));
  let opening: { amount_clp: number; date: string } | null = null;
  await page.route("**/api/v1/cash-account/balance", (route) => {
    const method = route.request().method();
    if (method === "PUT") opening = route.request().postDataJSON();
    if (method === "DELETE") opening = null;
    const amount = opening?.amount_clp ?? 0;
    return route.fulfill({ json: {
      opening_balance_clp: opening?.amount_clp ?? null,
      opening_balance_date: opening?.date ?? null,
      movements_clp: -500,
      balance_clp: amount - 500,
      is_negative: amount < 500,
    } });
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/accounts");
  await page.getByRole("button", { name: "Seleccionar Efectivo" }).click();
  const cash = page.locator("#cash-account");
  await expect(cash.getByText("Saldo según tus registros")).toBeVisible();
  const summary = cash.getByRole("region", { name: "Resumen de movimientos de la cuenta" });
  await expect(summary.getByRole("article").filter({ hasText: "Ingresos" })).toContainText("$1.000");
  await expect(summary.getByRole("article").filter({ hasText: "Gastos" })).toContainText("$1.500");
  await expect(cash.getByText(/saldo calculado es negativo/)).toBeVisible();
  await cash.getByRole("button", { name: "Configurar saldo inicial" }).click();
  await cash.getByLabel("Saldo inicial en pesos").fill("1000");
  await cash.getByLabel("Fecha de inicio").fill("2026-10-10");
  await cash.getByRole("button", { name: "Guardar saldo" }).click();
  await expect(cash.getByText(/al comienzo del 10-10-2026/)).toBeVisible();
  await expect(summary.getByRole("article").filter({ hasText: "Saldo registrado" })).toContainText("$500");
  await expect(cash.getByText(/saldo calculado es negativo/)).toHaveCount(0);
  await cash.getByRole("button", { name: "Corregir saldo inicial" }).click();
  await cash.getByLabel("Saldo inicial en pesos").fill("0");
  await cash.getByRole("button", { name: "Guardar saldo" }).click();
  await expect(cash.getByText(/saldo calculado es negativo/)).toBeVisible();
  await cash.getByRole("button", { name: "Corregir saldo inicial" }).click();
  await cash.getByRole("button", { name: "Quitar saldo inicial" }).click();
  await expect(cash.getByText("Calculado desde cero con todos los movimientos registrados.")).toBeVisible();
});

test("retiro importado se vincula con Efectivo y se puede deshacer", async ({ page }) => {
  await mockApi(page);
  let linked = false;
  let bankCategory: number | null = null;
  const transferCategories = [
    { id: 40, name: "Transferencias", type: "transfer", parent_id: null, is_default: true, is_active: true, sort_order: 110, transaction_count: 0, rule_count: 0 },
    { id: 41, name: "Retiro de efectivo", type: "transfer", parent_id: 40, is_default: true, is_active: true, sort_order: 10, transaction_count: 0, rule_count: 0 },
    { id: 42, name: "Depósito de efectivo", type: "transfer", parent_id: 40, is_default: true, is_active: true, sort_order: 20, transaction_count: 0, rule_count: 0 },
  ];
  await page.route("**/api/v1/categories?*", (route) => route.fulfill({ json: transferCategories }));
  const bank = {
    id: 20, account_id: 1, statement_id: 5, origin: "pdf", source_row: 1,
    date: "2026-10-10", description: "Giro en cajero", normalized_description: "giro en cajero",
    amount_clp: -20000, transaction_type: "expense", category_id: null,
    category_source: null, rule_id_applied: null, fingerprint: "giro", raw_data: null,
    created_at: "2026-10-10T12:00:00Z", updated_at: null, is_internal_transfer: false,
    cash_transfer_linked: false,
  };
  await page.route("**/api/v1/transaction-pages**", (route) => {
    const items: Record<string, unknown>[] = [{ ...bank, category_id: bankCategory, is_internal_transfer: linked, cash_transfer_linked: linked }];
    if (linked) items.push({
      ...bank, id: 21, account_id: 3, statement_id: null, origin: "cash_transfer",
      description: "Retiro desde Cuenta demo A", amount_clp: 20000, transaction_type: "income",
    });
    return route.fulfill({ json: { items, total: items.length, offset: 0, limit: 50 } });
  });
  await page.route("**/api/v1/transactions/20/cash-link", (route) => {
    linked = route.request().method() === "POST";
    return route.fulfill({ json: { ...bank, category_id: bankCategory, is_internal_transfer: linked, cash_transfer_linked: linked } });
  });
  await page.route("**/api/v1/transactions/20/category", (route) => {
    bankCategory = route.request().postDataJSON().category_id;
    return route.fulfill({ json: { ...bank, category_id: bankCategory } });
  });
  await page.route("**/api/v1/transactions/21/cash-link", (route) => {
    linked = false;
    return route.fulfill({ json: bank });
  });
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );
  await page.goto("/app/transactions");
  await expect(page.getByRole("button", { name: "Vincular con Efectivo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar detalles de Giro en cajero", exact: true }).click();
  await page.getByRole("button", { name: "Categoria de Giro en cajero", exact: true }).click();
  await page.getByRole("dialog", { name: "Seleccionar categoría" }).getByRole("button", { name: "Retiro de efectivo", exact: true }).click();
  await expect.poll(() => bankCategory).toBe(41);
  await page.getByRole("button", { name: "Vincular con Efectivo" }).click();
  const confirm = page.getByRole("dialog", { name: "Vincular con Efectivo" });
  await expect(confirm.getByText("Entrada a Efectivo")).toBeVisible();
  await confirm.getByRole("button", { name: "Confirmar vínculo" }).click();
  await expect(page.getByText("Retiro desde Cuenta demo A")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^Transferencia interna$/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Deshacer vínculo" }).last().click();
  await page.getByRole("dialog", { name: "Deshacer vínculo" }).getByRole("button", { name: "Deshacer vínculo" }).click();
  await expect(page.getByText("Retiro desde Cuenta demo A")).toHaveCount(0);
  await expect(page.getByText("Giro en cajero")).toBeVisible();
});


test("tablas de cuentas adaptan columnas y paginación al móvil", async ({ page }, info) => {
  await mockApi(page);
  await page.route("**/api/v1/statements?account_id=1", route => route.fulfill({ json: [{
    id: 7, account_id: 1, file_name: "cartola_cuenta_principal_octubre_2026.pdf", file_type: "application/pdf", file_checksum: null,
    period_month: "2026-10", status: "processed", raw_path: null, uploaded_at: "2026-10-22T10:00:00Z",
  }] }));
  await page.route("**/api/v1/transaction-pages**", route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 50);
    const accountId = Number(params.get("account_id"));
    return route.fulfill({ json: { total: 125, offset, limit, items: Array.from({ length: Math.min(limit, 125 - offset) }, (_, index) => ({
      id: offset + index + 1, account_id: accountId, category_id: null, date: "2026-10-01", description: `Compra ${offset + index + 1}`,
      amount_clp: -12000, transaction_type: "expense", origin: "manual",
    })) } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  const widths = info.project.name === "mobile" ? [320, 390] : [1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/app/accounts?account_id=1");
    const statements = page.getByRole("region", { name: "Cartolas de la cuenta", exact: true });
    await expect(statements.getByRole("columnheader", { name: "Nombre", exact: true })).toBeVisible();
    await statements.scrollIntoViewIfNeeded();
    const period = statements.getByRole("cell", { name: "octubre de 2026", exact: true });
    const periodBounds = await period.boundingBox();
    expect(periodBounds!.x + periodBounds!.width).toBeLessThanOrEqual(width);
    expect(await statements.locator("table").evaluate(element => getComputedStyle(element).display)).toBe("table");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`statements-table-${width}.png`) });
    await statements.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect(statements.getByRole("button", { name: /^Deshacer importacion/ })).toBeInViewport();
    await statements.getByRole("button", { name: "Ver movimientos", exact: true }).click();
    await expect(page).toHaveURL(/statement_id=7/);
    for (const accountId of [1, 3]) {
      await page.goto(`/app/accounts?account_id=${accountId}`);
      if (accountId === 1) await page.getByRole("button", { name: "Movimientos (125)", exact: true }).click();
      const movements = page.getByRole("region", { name: "Movimientos de la cuenta", exact: true });
      await expect(movements.getByRole("cell", { name: "Compra 1", exact: true })).toBeVisible();
      await movements.scrollIntoViewIfNeeded();
      const amountBounds = await movements.getByRole("cell", { name: "$-12.000", exact: true }).first().boundingBox();
      expect(amountBounds!.x + amountBounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`movements-account-${accountId}-${width}.png`) });
      const pagination = page.getByRole("navigation", { name: "Paginación de movimientos de la cuenta", exact: true });
      await expect(pagination.getByRole("button", { name: "Anterior", exact: true })).toBeDisabled();
      await pagination.getByRole("button", { name: "Siguiente", exact: true }).click();
      await expect(movements.getByRole("cell", { name: "Compra 51", exact: true })).toBeVisible();
      await pagination.getByRole("button", { name: "Anterior", exact: true }).click();
      await expect(movements.getByRole("cell", { name: "Compra 1", exact: true })).toBeVisible();
      await pagination.getByRole("combobox", { name: "Ir a la página" }).selectOption("3");
      await expect(movements.locator("tbody tr")).toHaveCount(25);
      await expect(pagination.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
      await pagination.scrollIntoViewIfNeeded();
      const controls = await pagination.locator("button, select").evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { center: rect.y + rect.height / 2, height: rect.height, right: rect.right };
      }));
      controls.forEach(control => {
        expect(control.center).toBeCloseTo(controls[0].center, 0);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.right).toBeLessThanOrEqual(width);
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`account-pagination-${accountId}-${width}.png`) });
    }
  }
});


test("barra móvil prioriza agregar cartolas y abre el registro de movimientos", async ({ page }, info) => {
  await mockApi(page);
  let savedDescription = "";
  await page.route("**/api/v1/cash-transactions", route => {
    const payload = route.request().postDataJSON();
    savedDescription = payload.description;
    return route.fulfill({ status: 201, json: { ...payload, id: 99, account_id: 3, origin: "manual", amount_clp: -payload.amount_clp } });
  });
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/accounts");
  if (info.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "Navegación móvil", exact: true })).not.toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal", exact: true }).getByRole("link")).toHaveText(["Inicio", "Movimientos", "Análisis", "Cuentas"]);
    await expect(page.getByRole("link", { name: "Importar cartola", exact: true })).toBeVisible();
    return;
  }
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    const nav = page.getByRole("navigation", { name: "Navegación móvil", exact: true });
    await expect(nav.locator("a, button")).toHaveText(["Inicio", "Movs.", "Agregar", "Análisis", "Más"]);
    const add = nav.getByRole("button", { name: "Agregar", exact: true });
    await add.click();
    const sheet = page.getByRole("dialog", { name: "¿Qué quieres agregar?", exact: true });
    await expect(sheet).toBeVisible();
    await expect(add).toHaveAttribute("aria-expanded", "true");
    await expect(sheet.getByRole("button", { name: "Cerrar" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(sheet.getByRole("link", { name: /^Agregar movimiento/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(sheet.getByRole("button", { name: "Cerrar" })).toBeFocused();
    for (const option of await sheet.getByRole("link").all()) {
      await expect(option).toBeInViewport();
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`add-menu-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.click();
    await page.mouse.click(5, 5);
    await expect(sheet).toHaveCount(0);
    await nav.getByRole("button", { name: "Más", exact: true }).click();
    const more = page.getByRole("dialog", { name: "Más opciones", exact: true });
    await more.getByRole("link", { name: "Cuentas", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/accounts$/);
    await expect(more).toHaveCount(0);
    await add.click();
    await sheet.getByRole("link", { name: /^Agregar cartola/ }).click();
    await expect(page).toHaveURL(/\/app\/import$/);
    await expect(sheet).toHaveCount(0);
    await add.click();
    await sheet.getByRole("link", { name: /^Agregar movimiento/ }).click();
    const form = page.getByRole("dialog", { name: "Registrar movimiento", exact: true });
    await expect(form).toBeVisible();
    await expect(page).toHaveURL(/\/app\/transactions$/);
    await form.getByRole("button", { name: "Cancelar", exact: true }).click();
    await add.click();
    await sheet.getByRole("link", { name: /^Agregar movimiento/ }).click();
    await expect(form).toBeVisible();
    await form.getByLabel("Monto en pesos").fill("3500");
    await form.getByLabel("Descripción").fill(`Desde agregar ${width}`);
    await form.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(savedDescription).toBe(`Desde agregar ${width}`);
    await page.reload();
    await expect(form).toHaveCount(0);
  }
});
