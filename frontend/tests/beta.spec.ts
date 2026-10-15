import { expect, test, type Page } from "@playwright/test";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
    return route.fulfill({ json: { ...movement, category_id: categoryId } });
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
  await page.route("**/api/v1/transactions/2/category", route => {
    const categoryId = route.request().postDataJSON().category_id as number | null;
    categoryUpdates.push(categoryId);
    return route.fulfill({ json: { id: 2, category_id: categoryId } });
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
  expect(categoryUpdates).toEqual([1, null]);
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

test("inicio conserva sus indicadores y gráficos dentro de la pantalla móvil", async ({ page }, info) => {
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
      { label: "Balance", value: "$12.345.678", trend: "Subio 5%" },
      { label: "Ingresos", value: "$8.765.432", trend: "Subio 3%" },
      { label: "Gastos", value: "$4.321.123", trend: "Bajo 2%" },
    ],
    monthly_movements: [{ month: "2026-09", income: 8765432, expenses: 4321123 }],
  } }));
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Evolucion Mensual" })).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `ancho ${width}` }).toBeLessThanOrEqual(width);
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
  await expect(page.getByRole("button", { name: "Eliminar", exact: true })).toBeVisible();
});

test("cuentas distingue variación registrada y cobertura de cartolas", async ({ page }) => {
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
  await page.addInitScript(
    (value) => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)),
    session(ownerA),
  );

  await page.goto("/app/accounts?account_id=1");
  await expect(page.getByText("Variación registrada", { exact: true })).toBeVisible();
  await expect(page.getByText("Saldo neto", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Última cartola procesada: marzo de 2026/)).toBeVisible();
  await expect(page.getByText(/Última importación correcta: 03 abr\.? 2026/)).toBeVisible();
  await expect(page.getByText("1 con error", { exact: true })).toBeVisible();
  await expect(page.getByText("1 pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("1 mes sin cartola", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sin cartola registrada entre períodos importados: febrero de 2026/)).toBeVisible();
  await expect(page.getByText("Cartolas por actualizar", { exact: true })).toBeVisible();

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
