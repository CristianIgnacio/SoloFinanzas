import { expect, test, type Page } from "@playwright/test";

const pdf = { name: "cartola_septiembre_2026_cuenta_principal.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-test") };
const preview = {
  parser_key: "banco_estado", file_name: pdf.name, file_checksum: "test", page_count: 2,
  is_encrypted: false, used_password: false, period_month: "2026-09", extracted_text_length: 500,
  preview_lines: ["Cartola de movimientos", "Septiembre de 2026"], parsing_errors: [], issues: [],
  candidate_transactions: [
    { source_id: "salary", source_line: "Abono remuneración", date: "2026-09-01", description: "Abono remuneración", normalized_description: "abono remuneracion", amount_clp: 1500000, transaction_type: "income", suggested_category_id: 3, category_source: "rule", rule_id_applied: null },
    { source_id: "shop", source_line: "Compra supermercado", date: "2026-09-02", description: "Compra de supermercado y artículos para el hogar con descripción extensa", normalized_description: "compra supermercado", amount_clp: -12500, transaction_type: "expense", suggested_category_id: 2, category_source: "rule", rule_id_applied: null },
    { source_id: "other", source_line: "Compra sin categoría", date: "2026-09-03", description: "Compra sin categoría", normalized_description: "compra sin categoria", amount_clp: -3000, transaction_type: "expense", suggested_category_id: null, category_source: null, rule_id_applied: null },
  ],
};

async function prepare(page: Page) {
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), {
    access_token: `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp })).toString("base64url")}.fake`,
    refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp,
    user: { id: owner, email: "demo@example.test", app_metadata: { provider: "google" }, user_metadata: { full_name: "Demo" }, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" },
  });
  await page.route("https://demo.supabase.co/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path.endsWith("/me")) json = { id: owner, display_name: "Demo", onboarding_choice: "bank" };
    if (path.endsWith("/accounts")) json = [1, 2].map(id => ({ id, name: id === 1 ? "Cuenta principal del hogar" : "Cuenta de ahorro", institution: "banco_estado", account_type: "vista", product_code: "banco_estado_cuenta_rut", account_last4: "1234", currency: "CLP", created_at: "2026-01-01T00:00:00Z" }));
    if (path.endsWith("/account-products")) json = [{ code: "banco_estado_cuenta_rut", institution: "banco_estado", name: "CuentaRUT", kind: "vista", pdf_support: "muestra_probada" }];
    if (path.endsWith("/categories")) json = [
      { id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, sort_order: 0 },
      { id: 2, name: "Supermercado", type: "expense", parent_id: 1, is_active: true, sort_order: 1 },
      { id: 3, name: "Sueldo", type: "income", parent_id: null, is_active: true, sort_order: 0 },
    ];
    if (path.endsWith("/transaction-pages")) json = { items: [], total: 0, offset: 0, limit: 50 };
    return route.fulfill({ json });
  });
  await page.goto("/app/import?account_id=1");
  await expect(page.getByRole("combobox", { name: "Cuenta Destino" })).toHaveValue("1");
}

test("cartolas largas conservan todas las correcciones al buscar, filtrar y paginar", async ({ page }, info) => {
  test.setTimeout(60000);
  await prepare(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transactions = Array.from({ length: 45 }, (_, index) => ({
    ...preview.candidate_transactions[1],
    source_id: index === 0 || index === 44 ? null : `row-${index}`,
    source_line: `Movimiento ${index + 1}`,
    description: index === 21 ? "Café y alimentación" : `Movimiento ${index + 1}`,
    suggested_category_id: index === 0 || index === 44 ? null : 2,
    suggestion_conflict: index === 21,
  }));
  await page.route("**/statement-imports/pdf/preview", route => route.fulfill({ json: { ...preview, candidate_transactions: transactions } }));
  let submitted: { source_id: string | null; category_id: number | null; transaction_type: string }[] = [];
  await page.route("**/statement-imports/pdf/reviewed", route => {
    const field = route.request().postData()!.split('name="reviewed_transactions"\r\n\r\n')[1].split("\r\n--")[0];
    submitted = JSON.parse(field);
    return route.fulfill({ json: { statement: { id: 5 }, result: { inserted_count: 45 } } });
  });
  await page.locator('input[type="file"]').setInputFiles(pdf);
  await page.getByRole("button", { name: "Analizar Documento", exact: true }).click();
  const controls = page.getByRole("region", { name: "Herramientas de revisión" });
  const types = page.getByRole("combobox", { name: /^Tipo del movimiento/ });
  const search = page.getByRole("searchbox", { name: "Buscar movimientos por descripción" });
  const filter = (name: string) => controls.getByRole("button", { name, exact: true });
  await expect(page.getByRole("heading", { name: "45 movimientos detectados" })).toBeVisible();
  await expect(types).toHaveCount(20);
  await expect(filter("Sin categoría 2")).toBeVisible();
  await expect(filter("Con advertencias 1")).toBeVisible();
  await expect(filter("Modificados 0")).toBeVisible();
  await page.getByRole("combobox", { name: "Ir a la página" }).selectOption("3");
  await expect(types).toHaveCount(5);
  await page.getByRole("button", { name: "Categoría del movimiento 45", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supermercado", exact: true }).click();
  await expect(filter("Sin categoría 1")).toBeVisible();
  await filter("Sin categoría 1").click();
  await expect(types).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Categoría del movimiento 1", exact: true })).toHaveText("Sin categoría");
  await filter("Con advertencias 1").click();
  await search.fill("CAFE");
  await expect(types).toHaveCount(1);
  await page.getByRole("button", { name: "Categoría del movimiento 22", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supermercado", exact: true }).click();
  await expect(filter("Con advertencias 0")).toBeVisible();
  await expect(page.getByText("No hay movimientos que coincidan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(types).toHaveCount(20);
  await page.getByRole("combobox", { name: "Ir a la página" }).selectOption("2");
  await page.getByRole("combobox", { name: "Tipo del movimiento 21", exact: true }).selectOption("income");
  await filter("Modificados 2").click();
  await expect(types).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Tipo del movimiento 21", exact: true })).toHaveValue("income");
  await search.fill("inexistente");
  await expect(types).toHaveCount(0);
  await search.fill("Movimiento 45");
  await expect(types).toHaveCount(1);
  await page.getByRole("button", { name: "Categoría del movimiento 45", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sin categoría", exact: true }).click();
  await expect(filter("Modificados 1")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await controls.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`revision-filtros-${width}.png`) });
  }
  await filter("Modificados 1").click();
  await page.getByRole("button", { name: "Confirmar importación", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/transactions\?statement_id=5$/);
  expect(submitted).toHaveLength(45);
  expect(submitted[20]).toMatchObject({ source_id: "row-20", transaction_type: "income" });
  expect(submitted[0].category_id).toBeNull();
  expect(submitted[44].category_id).toBeNull();
});

test("importación conserva correcciones, anima durante el análisis y se adapta sin desbordar", async ({ page }, info) => {
  test.setTimeout(60000);
  await prepare(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/statement-imports/pdf/preview", async route => { await pending; await route.fulfill({ json: preview }); });
  let submitted = "";
  await page.route("**/statement-imports/pdf/reviewed", async route => {
    submitted = route.request().postData() ?? "";
    await route.fulfill({ json: { statement: { id: 5 }, result: { inserted_count: 3 } } });
  });
  const password = page.getByLabel("Contraseña del documento", { exact: true });
  await expect(password).toBeVisible();
  await password.fill("clave-demo");
  await page.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(pdf);
  await expect(page.getByRole("button", { name: "Analizar Documento", exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("importar-preparacion.png"), fullPage: true });
  await page.getByRole("button", { name: "Analizar Documento", exact: true }).click();
  try {
    await expect(page.getByText("Analizando tu cartola", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Cuenta Destino" })).toBeDisabled();
    await expect(password).toBeDisabled();
    await expect(page.getByRole("button", { name: "Limpiar", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Cambiar archivo PDF" })).toBeDisabled();
    await expect(page.locator(".pdf-analysis-scan")).toHaveCSS("animation-name", "pdf-scan");
    await page.locator(".pdf-analysis-scene").screenshot({ path: info.outputPath("analizando-pdf.png") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".pdf-analysis-scan")).toHaveCSS("animation-name", "none");
  } finally { release(); }
  await expect(page.getByRole("heading", { name: "3 movimientos detectados" })).toBeVisible();
  await expect(page.locator(".pdf-analysis-scan")).toHaveCount(0);
  const type = page.getByRole("combobox", { name: "Tipo del movimiento 2", exact: true });
  const category = page.getByRole("button", { name: "Categoría del movimiento 2", exact: true });
  const categories = page.getByRole("dialog", { name: "Seleccionar categoría", exact: true });
  await category.click();
  await expect(categories.getByRole("button", { name: "Supermercado", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("importar-selector-categorias.png") });
  await categories.getByRole("button", { name: "Sin categoría", exact: true }).click();
  await expect(category).toHaveText("Sin categoría");
  await expect(category).toBeFocused();
  await category.click();
  await categories.getByRole("button", { name: "Supermercado", exact: true }).click();
  await type.selectOption("income");
  await expect(category).toHaveText("Sin categoría");
  await category.click();
  await expect(categories.getByRole("button", { name: "Supermercado", exact: true })).toHaveCount(0);
  await categories.getByRole("button", { name: "Sueldo", exact: true }).click();
  const preparation = page.getByRole("region", { name: "Preparación de la cartola" });
  await expect(preparation).toContainText(pdf.name);
  await expect(preparation).toContainText("Cuenta principal del hogar");
  await expect(preparation).toContainText("Ingresada");
  await expect(page.getByRole("combobox", { name: "Cuenta Destino" })).toHaveCount(0);
  await expect(password).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("clave-demo");
  await preparation.getByRole("button", { name: "Cambiar", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Cuenta Destino" })).toBeFocused();
  await expect(password).toHaveValue("clave-demo");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Volver a la revisión", exact: true }).click();
  await expect(type).toHaveValue("income");
  await expect(category).toHaveText("Sueldo");
  const confirm = page.getByRole("button", { name: "Confirmar importación", exact: true });
  const table = page.getByRole("table", { name: "Movimientos por importar" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(type).toHaveValue("income");
    await expect(category).toHaveText("Sueldo");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("heading", { name: "3 movimientos detectados" }).scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`importar-revision-${width}.png`), fullPage: true });
    if (width < 1280) expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await confirm.click();
  await expect(page).toHaveURL(/\/app\/transactions\?statement_id=5$/);
  expect(submitted).toContain('"source_id":"shop","source_line":"Compra supermercado","transaction_type":"income","category_id":3');
  expect(submitted).toContain("clave-demo");
  expect(submitted).toContain('name="accepted_issues"\r\n\r\n[]');
});

test("contraseña, diferencias y duplicados mantienen sus controles de importación", async ({ page }, info) => {
  await prepare(page);
  await page.setViewportSize({ width: 320, height: 568 });
  let previewCalls = 0;
  await page.route("**/statement-imports/pdf/preview", route => {
    previewCalls += 1;
    return previewCalls === 1
      ? route.fulfill({ status: 400, json: { detail: { code: "PASSWORD_REQUIRED", message: "El PDF requiere una contraseña.", action: "Escribe la contraseña del documento." } } })
      : route.fulfill({ json: { ...preview, is_encrypted: true, issues: [{ code: "BANK_MISMATCH", message: "El banco detectado es distinto al de la cuenta.", action: "Comprueba la cuenta de destino antes de continuar." }] } });
  });
  let accepted = "";
  await page.route("**/statement-imports/pdf/reviewed", route => {
    accepted = route.request().postData() ?? "";
    return route.fulfill({ status: 409, json: { detail: { code: "DUPLICATE_STATEMENT", message: "Esta cartola ya fue importada.", action: "Revisa los movimientos existentes." } } });
  });
  await page.locator('input[type="file"]').setInputFiles(pdf);
  const analyze = page.getByRole("button", { name: "Analizar Documento", exact: true });
  await analyze.click();
  await expect(page.getByRole("dialog", { name: "Falta la contraseña" })).toBeVisible();
  await expect(page.locator(".pdf-analysis-scan")).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByLabel("Contraseña del documento", { exact: true }).fill("clave-demo");
  await analyze.click();
  const dialog = page.getByRole("dialog", { name: "Hay diferencias en tu documento" });
  const accept = dialog.getByRole("button", { name: "Continuar con esta cuenta" });
  const confirm = page.getByRole("button", { name: "Confirmar importación", exact: true });
  await expect(accept).toBeDisabled();
  await expect(confirm).toBeDisabled();
  for (const [width, height] of [[320, 568], [844, 390], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await expect(accept).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Cerrar ventana" })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => dialog.evaluate((el, viewportHeight) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 7 && rect.bottom <= viewportHeight - 7;
    }, height)).toBe(true);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`importar-avisos-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Cambiar cuenta", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Cuenta Destino" })).toBeFocused();
  await page.getByRole("button", { name: "Volver a la revisión", exact: true }).click();
  await expect(confirm).toBeDisabled();
  await page.getByRole("button", { name: "Revisar diferencias", exact: true }).click();
  await dialog.getByRole("checkbox").check();
  await accept.click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole("dialog", { name: "Cartola ya importada" })).toBeVisible();
  expect(accepted).toContain('["BANK_MISMATCH"]');
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("region", { name: "Preparación de la cartola" }).getByRole("button", { name: "Cambiar", exact: true }).click();
  await page.getByRole("combobox", { name: "Cuenta Destino" }).selectOption("2");
  await expect(page.getByRole("table", { name: "Movimientos por importar" })).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
});

test("cambiar contraseña o archivo exige analizar de nuevo antes de importar", async ({ page }) => {
  await prepare(page);
  let analyses = 0;
  await page.route("**/statement-imports/pdf/preview", route => {
    analyses += 1;
    return route.fulfill({ json: preview });
  });
  await page.locator('input[type="file"]').setInputFiles(pdf);
  const analyze = page.getByRole("button", { name: "Analizar Documento", exact: true });
  const preparation = page.getByRole("region", { name: "Preparación de la cartola" });
  await analyze.click();
  await expect(preparation).toContainText("Sin contraseña");
  for (const field of ["password", "file"]) {
    await preparation.getByRole("button", { name: "Cambiar", exact: true }).click();
    if (field === "password") await page.getByLabel("Contraseña del documento", { exact: true }).fill("clave-nueva");
    else await page.locator('input[type="file"]').setInputFiles({ ...pdf, name: "otra_cartola.pdf" });
    await expect(page.getByRole("table", { name: "Movimientos por importar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirmar importación", exact: true })).toHaveCount(0);
    await expect(analyze).toBeEnabled();
    await analyze.click();
    await expect(preparation).toBeVisible();
  }
  await expect(preparation).toContainText("otra_cartola.pdf");
  await expect(preparation).toContainText("Ingresada");
  expect(analyses).toBe(3);
});

test("rechaza archivos inválidos, permite volver a elegir el mismo PDF y no importa una vista vacía", async ({ page }) => {
  await prepare(page);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "archivo.txt", mimeType: "text/plain", buffer: Buffer.from("demo") });
  await expect(page.getByText("Selecciona un archivo PDF válido.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await input.setInputFiles({ name: "grande.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByText("El PDF supera el límite de 10 MB.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.route("**/statement-imports/pdf/preview", route => route.fulfill({ json: { ...preview, candidate_transactions: [] } }));
  await input.setInputFiles(pdf);
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await input.setInputFiles(pdf);
  await page.getByRole("button", { name: "Analizar Documento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No se detectaron movimientos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar importación", exact: true })).toBeDisabled();
});
