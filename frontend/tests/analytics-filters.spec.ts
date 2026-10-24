import { expect, test, type Locator, type Page } from "@playwright/test";
const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("modal de filtros aplica la selección múltiple y cancela cambios pendientes", async ({ page }, info) => {
  await setupAnalysis(page);
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filtros del análisis", exact: true });
  const categories = page.getByRole("dialog", { name: "Seleccionar categorías", exact: true });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await expect(filters).toBeVisible();
  await expect(filters.getByRole("button", { name: "Períodos", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(filters.getByRole("checkbox")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("filters-modal.png") });
  await filters.getByRole("button", { name: "Categorías", exact: true }).click();
  await filters.getByRole("button", { name: "Filtrar por categorías", exact: true }).click();
  await categories.getByRole("button", { name: "Alimentación (todas)", exact: true }).click();
  await categories.getByRole("button", { name: "Transporte", exact: true }).click();
  await categories.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(filters).toBeVisible();
  await filters.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Compra semanal", exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "Viaje", exact: true })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "Otro gasto", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filtros", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await filters.getByRole("button", { name: "Restablecer", exact: true }).click();
  await filters.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Otro gasto", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await filters.getByRole("button", { name: "Categorías", exact: true }).click();
  await filters.getByRole("button", { name: "Filtrar por categorías", exact: true }).click();
  await categories.getByRole("button", { name: "Todas las categorías", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(categories).toHaveCount(0);
  await expect(filters).toBeVisible();
  await filters.getByRole("button", { name: "Períodos", exact: true }).click();
  await filters.getByRole("checkbox", { name: "octubre de 2026", exact: true }).uncheck();
  await expect(filters.getByRole("button", { name: "Aplicar filtros", exact: true })).toBeDisabled();
  await filters.getByRole("button", { name: "Últimos 3 meses", exact: true }).click();
  await expect(filters.getByRole("checkbox", { name: "agosto de 2026", exact: true })).toBeChecked();
  await expect(filters.getByRole("button", { name: "Períodos", exact: true })).toContainText("3 filtros activos");
  await page.screenshot({ path: info.outputPath("filters-expanded.png") });
  await filters.getByRole("button", { name: "Último mes disponible", exact: true }).click();
  await filters.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Otro gasto", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(filters).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filtros", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("Resumen y Movimientos conservan filtros, búsqueda y omisiones", async ({ page }, info) => {
  await setupAnalysis(page);
  const panel = page.getByRole("tabpanel");
  await expect(page.getByRole("tab", { name: "Gráficos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("heading", { name: "Evolución temporal", exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Distribución por categoría", exact: true })).toBeVisible();
  await expect(panel.getByRole("table")).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Comparación por cuenta" })).toHaveCount(1);
  await expect(panel.locator("canvas")).toHaveCount(5);
  await expect(page.getByRole("tab", { name: "Explorar", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /Explorar|Ver movimientos del período/ })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("summary.png"), fullPage: true });

  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("dialog", { name: "Filtros del análisis" }).getByRole("button", { name: "Tipos", exact: true }).click();
  await page.getByRole("checkbox", { name: "Gastos", exact: true }).check();
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar filtro Tipo: Gastos", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Movimientos", exact: true })).toBeFocused();
  await page.getByRole("searchbox", { name: "Buscar en los movimientos" }).fill("VIAJE");
  await expect(page.getByRole("cell", { name: "Viaje", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Compra semanal", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Omitir Viaje del análisis", exact: true }).click();
  await page.getByRole("tab", { name: "Gráficos", exact: true }).click();
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("VIAJE");
  await expect(page.getByRole("button", { name: "Incluir Viaje en el análisis", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("sin coincidencias");
  await expect(page.getByText("No hay movimientos que coincidan con la búsqueda.", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.screenshot({ path: info.outputPath("movements.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.getByRole("tab", { name: "Gráficos", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("checkbox", { name: "Evolución temporal", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Distribución por categoría", exact: true }).uncheck();
  const customize = page.getByRole("dialog", { name: "Personalizar gráficos", exact: true });
  await expect(customize.getByRole("checkbox")).toHaveCount(6);
  await customize.getByRole("checkbox", { name: "Gastos por día de la semana", exact: true }).uncheck();
  await customize.getByRole("checkbox", { name: "Principales descripciones", exact: true }).uncheck();
  await customize.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Comparación por cuenta");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await customize.getByRole("checkbox", { name: "Comparación por cuenta", exact: true }).uncheck();
  await page.getByRole("dialog", { name: "Personalizar gráficos", exact: true }).getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("tab", { name: "Gráficos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aún no hay gráficos seleccionados" })).toBeVisible();
  await page.getByRole("tab", { name: "Gráficos", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Movimientos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Quitar filtro Tipo: Gastos", exact: true })).toBeVisible();
});

test("la barra sigue visible al bajar y abre filtros sin perder la posición", async ({ page }, info) => {
  await setupAnalysis(page);
  await expect(page.getByRole("tabpanel").locator("canvas")).toHaveCount(5);
  await page.evaluate(() => window.scrollTo(0, 650));
  const bar = page.getByTestId("analysis-navigation");
  const bounds = await bar.boundingBox();
  const headerHeight = await page.locator("header.sticky").evaluate(header => header.getBoundingClientRect().bottom);
  expect(bounds!.y).toBeGreaterThanOrEqual(headerHeight - 1);
  expect(bounds!.y).toBeLessThan(headerHeight + 3);
  await page.screenshot({ path: info.outputPath("sticky-navigation.png") });
  const position = await page.evaluate(() => window.scrollY);
  const filterBounds = await page.getByRole("button", { name: "Filtros", exact: true }).boundingBox();
  const customizeBounds = await page.getByRole("button", { name: "Personalizar", exact: true }).boundingBox();
  expect(customizeBounds!.y).toBeCloseTo(filterBounds!.y, 0);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Personalizar gráficos", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(position, 0);
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(bar).toBeInViewport();
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 740 });
    const button = await page.getByRole("button", { name: "Filtros", exact: true }).boundingBox();
    expect(button!.x + button!.width).toBeLessThanOrEqual(320);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aplicar filtros", exact: true })).toBeInViewport();
  }
});

test("categorías abre movimientos desde la barra y permite volver o quitar el detalle", async ({ page }, info) => {
  await setupAnalysis(page);
  const base = { type: "expense", parent_id: null, is_active: true, is_default: true, sort_order: 1 };
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { ...base, id: 1, name: "Alimentación", code: "food" },
    { ...base, id: 2, name: "Supermercado", parent_id: 1 },
    { ...base, id: 4, name: "Cafetería", parent_id: 1 },
    { ...base, id: 3, name: "Transporte", code: "transport" },
  ] }));
  const transaction = { account_id: 1, date: "2026-10-01", transaction_type: "expense", origin: "pdf" };
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { ...transaction, id: 1, category_id: 2, description: "Compra semanal", amount_clp: -12000 },
    { ...transaction, id: 2, category_id: 4, description: "Café", amount_clp: -2000 },
    { ...transaction, id: 3, category_id: 1, description: "Comida", amount_clp: -500 },
    { ...transaction, id: 4, category_id: 3, description: "Viaje", amount_clp: -1000 },
    { ...transaction, id: 5, category_id: null, description: "Otro gasto", amount_clp: -300 },
    { ...transaction, id: 6, category_id: 2, description: "Ingreso en la misma categoría", amount_clp: 50000, transaction_type: "income" },
  ] }));
  await page.reload();
  const chart = page.getByRole("region", { name: "Gráfico de categorías", exact: true });
  const cell = (name: string) => page.getByRole("cell", { name, exact: true });
  // Exercise a real canvas click on the top (largest) expense bar.
  const canvas = chart.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.scrollIntoViewIfNeeded();
  const barPoint = (last = false) => canvas.evaluate((element, last) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let row = 0; row < canvas.height; row += 2) {
      const y = last ? canvas.height - 1 - row : row;
      for (let x = 0; x < canvas.width; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] === 215 && pixels[offset + 1] === 123 && pixels[offset + 2] === 104 && pixels[offset + 3] === 255) {
          return { x: (x + 0.5) * canvas.clientWidth / canvas.width, y: (y + (last ? -0.5 : 0.5)) * canvas.clientHeight / canvas.height };
        }
      }
    }
    return null;
  }, last);
  await expect.poll(() => barPoint()).not.toBeNull();
  await waitForChartToSettle(canvas);
  const firstBar = (await barPoint())!;
  await canvas.hover({ position: firstBar });
  await expect(chart).toContainText("91,8% del gasto");
  await canvas.click({ position: firstBar });
  await expect(page.getByRole("tab", { name: "Movimientos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(cell("Compra semanal")).toHaveCount(1);
  await expect(cell("Café")).toHaveCount(1);
  await expect(cell("Comida")).toHaveCount(1);
  await expect(cell("Viaje")).toHaveCount(0);
  await expect(cell("Ingreso en la misma categoría")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitar filtro Movimiento: Movimientos normales", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("category-movements.png") });
  await page.getByRole("button", { name: "Volver al gráfico", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Gráficos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(chart).toBeFocused();

  await page.getByRole("switch", { name: "Ver subcategorías" }).click();
  await page.mouse.move(0, 0);
  await canvas.scrollIntoViewIfNeeded();
  await waitForChartToSettle(canvas);
  await expect.poll(() => barPoint()).not.toBeNull();
  await canvas.click({ position: (await barPoint())! });
  await expect(cell("Compra semanal")).toHaveCount(1);
  await expect(cell("Café")).toHaveCount(0);
  await expect(cell("Comida")).toHaveCount(0);
  await expect(cell("Ingreso en la misma categoría")).toHaveCount(0);
  await page.getByRole("button", { name: "Volver al gráfico", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Gráficos", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("switch", { name: "Ver subcategorías" })).toBeChecked();
  await canvas.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await waitForChartToSettle(canvas);
  await expect.poll(() => barPoint(true)).not.toBeNull();
  await canvas.click({ position: (await barPoint(true))! });
  await expect(cell("Otro gasto")).toHaveCount(1);
  await expect(cell("Compra semanal")).toHaveCount(0);
  await page.getByRole("button", { name: "Quitar selección del gráfico: Sin categoría", exact: true }).click();
  await expect(cell("Compra semanal")).toHaveCount(1);
  await expect(cell("Viaje")).toHaveCount(1);
});

test("los gráficos adaptan el período y no presentan ingresos como gastos", async ({ page }, info) => {
  await setupAnalysis(page);
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { id: 10, account_id: 1, category_id: 2, date: "2026-10-01", description: "Ingreso de prueba", amount_clp: 50000, transaction_type: "income", origin: "pdf" },
  ] }));
  await page.reload();
  await expect(page.getByText("Ingresos y gastos por semana.", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay gastos por categoría con los filtros actuales.")).toBeVisible();
  await expect(page.getByText("No hay gastos por descripción con los filtros actuales.")).toBeVisible();
  await expect(page.getByText("No hay gastos por día de la semana con los filtros actuales.")).toBeVisible();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filtros del análisis", exact: true });
  await filters.getByRole("button", { name: "Períodos", exact: true }).click();
  await filters.getByRole("button", { name: "Últimos 3 meses", exact: true }).click();
  await filters.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByText("Ingresos y gastos por mes.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("income-only.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("la evolución agrupa por semana y los nuevos gráficos se pueden personalizar", async ({ page }, info) => {
  await setupAnalysis(page);
  const base = { account_id: 1, origin: "pdf", category_id: 2, transaction_type: "expense" };
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { ...base, id: 1, date: "2026-10-01", description: "Compra", amount_clp: -12000 },
    { ...base, id: 2, date: "2026-10-04", description: "Domingo", amount_clp: -3000 },
    { ...base, id: 3, date: "2026-10-05", description: "Lunes", amount_clp: -2000 },
    { ...base, id: 4, date: "2026-10-02", description: "Ingreso", amount_clp: 10000, transaction_type: "income", category_id: null },
    { ...base, id: 5, date: "2026-10-06", description: "Otro ingreso", amount_clp: 20000, transaction_type: "income", category_id: null },
  ] }));
  await page.reload();
  const panel = page.getByRole("tabpanel");
  const evolution = page.getByRole("region", { name: "Gráfico de evolución", exact: true });
  const canvas = evolution.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.scrollIntoViewIfNeeded();
  const expensePoint = () => canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] === 215 && pixels[offset + 1] === 123 && pixels[offset + 2] === 104 && pixels[offset + 3] === 255) {
          return { x: (x + 2) * canvas.clientWidth / canvas.width, y: (y + 2) * canvas.clientHeight / canvas.height };
        }
      }
    }
    return null;
  });
  await expect.poll(expensePoint).not.toBeNull();
  await canvas.hover({ position: (await expensePoint())! });
  await expect(panel).toContainText("1–4 oct");
  await expect(panel).toContainText("15.000");
  await page.screenshot({ path: info.outputPath("weekly-evolution.png") });

  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const customize = page.getByRole("dialog", { name: "Personalizar gráficos", exact: true });
  await expect(customize.getByRole("checkbox", { name: "Balance acumulado", exact: true })).toHaveCount(0);
  await expect(customize.getByRole("checkbox", { name: "Ingresos por categoría", exact: true })).toHaveCount(0);
  for (const title of ["Frecuencia de gastos por categoría"]) {
    await customize.getByRole("checkbox", { name: title, exact: true }).check();
  }
  await customize.getByRole("button", { name: "Listo", exact: true }).click();
  await page.reload();
  await expect(panel.locator("canvas")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("frecuencia permite subcategorías y conserva el contexto de nombres repetidos", async ({ page }, info) => {
  await setupAnalysis(page);
  const baseCategory = { type: "expense", parent_id: null, is_active: true, is_default: true, sort_order: 1 };
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { ...baseCategory, id: 1, name: "Alimentación" },
    { ...baseCategory, id: 2, name: "Compras", parent_id: 1 },
    { ...baseCategory, id: 3, name: "Transporte" },
    { ...baseCategory, id: 4, name: "Compras", parent_id: 3 },
  ] }));
  const base = { account_id: 1, origin: "pdf", date: "2026-10-01", transaction_type: "expense" };
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { ...base, id: 1, category_id: 2, description: "Compra A", amount_clp: -1000 },
    { ...base, id: 2, category_id: 2, description: "Compra B", amount_clp: -2000 },
    { ...base, id: 3, category_id: 1, description: "Gasto general", amount_clp: -500 },
    { ...base, id: 4, category_id: 4, description: "Compra C", amount_clp: -10000 },
    { ...base, id: 5, category_id: null, description: "Sin categoría", amount_clp: -300 },
  ] }));
  await page.reload();
  await enableFrequency(page);
  const chart = page.getByRole("region", { name: "Gráfico de frecuencia de gastos", exact: true });
  const canvas = chart.locator("canvas");
  const point = () => canvas.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] === 215 && pixels[offset + 1] === 123 && pixels[offset + 2] === 104 && pixels[offset + 3] === 255) {
          return { x: (x + 2) * canvas.clientWidth / canvas.width, y: (y + 2) * canvas.clientHeight / canvas.height };
        }
      }
    }
    return null;
  });
  await expect(canvas).toHaveCount(1);
  await canvas.scrollIntoViewIfNeeded();
  await waitForChartToSettle(canvas);
  await expect.poll(point).not.toBeNull();
  await canvas.hover({ position: (await point())! });
  await expect(chart).toContainText("3 gastos");
  await chart.getByRole("switch", { name: "Ver subcategorías" }).click();
  await page.mouse.move(0, 0);
  await canvas.scrollIntoViewIfNeeded();
  await waitForChartToSettle(canvas);
  await expect.poll(point).not.toBeNull();
  await canvas.hover({ position: (await point())! });
  await expect(chart).toContainText("Alimentación > Compras");
  await expect(chart).toContainText("2 gastos");
  await page.mouse.move(0, 0);
  await waitForChartToSettle(canvas);
  await chart.screenshot({ path: info.outputPath("frequency-subcategories.png") });
  const categories = page.getByRole("region", { name: "Gráfico de categorías", exact: true });
  await expect(categories.getByRole("switch", { name: "Ver subcategorías" })).not.toBeChecked();
  await categories.getByRole("switch", { name: "Ver subcategorías" }).click();
  await page.mouse.move(0, 0);
  await waitForChartToSettle(categories.locator("canvas"));
  await categories.screenshot({ path: info.outputPath("expense-subcategories.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("todos los gráficos abren sus movimientos y vuelven al gráfico de origen", async ({ page }) => {
  await setupAnalysis(page);
  const base = { origin: "pdf", account_id: 1, transaction_type: "expense" };
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { ...base, id: 1, category_id: 2, date: "2026-10-01", description: "Compra semanal", amount_clp: -12000 },
    { ...base, id: 2, category_id: 3, date: "2026-10-02", description: "Viaje", amount_clp: -1000 },
    { ...base, id: 3, category_id: null, date: "2026-10-03", description: "Otro gasto", amount_clp: -500 },
    { ...base, id: 4, account_id: 2, category_id: 2, date: "2026-10-08", description: "Compra semanal", amount_clp: -3000 },
    { ...base, id: 5, category_id: 2, date: "2026-10-01", description: "Ingreso A", amount_clp: 20000, transaction_type: "income" },
    { ...base, id: 6, account_id: 2, category_id: 2, date: "2026-10-08", description: "Ingreso B", amount_clp: 5000, transaction_type: "income" },
  ] }));
  await page.reload();
  await enableFrequency(page);
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await page.getByRole("searchbox").fill("Viaje");
  await page.getByRole("tab", { name: "Gráficos", exact: true }).click();
  const cases = [
    { chart: "evolution", income: false, expected: [1, 1, 1, 0, 0] },
    { chart: "evolution", income: true, expected: [0, 0, 0, 1, 0] },
    { chart: "accounts", income: false, expected: [1, 1, 1, 0, 0] },
    { chart: "accounts", income: true, expected: [0, 0, 0, 1, 0] },
    { chart: "weekdays", income: false, expected: [2, 0, 0, 0, 0] },
    { chart: "descriptions", income: false, expected: [2, 0, 0, 0, 0] },
    { chart: "expenseFrequency", income: false, expected: [2, 0, 0, 0, 0] },
  ];
  for (const item of cases) {
    const chart = page.locator(`#analysis-chart-${item.chart}`);
    const canvas = chart.locator("canvas");
    await canvas.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await waitForChartToSettle(canvas);
    const point = await canvas.evaluate((element, income) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const color = income ? [52, 75, 46] : [215, 123, 104];
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] === color[0] && pixels[offset + 1] === color[1] && pixels[offset + 2] === color[2] && pixels[offset + 3] === 255) {
            return { x: (x + 2) * canvas.clientWidth / canvas.width, y: (y + 2) * canvas.clientHeight / canvas.height };
          }
        }
      }
      return null;
    }, item.income);
    expect(point).not.toBeNull();
    await canvas.click({ position: point! });
    await expect(page.getByRole("tab", { name: "Movimientos", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    const descriptions = ["Compra semanal", "Viaje", "Otro gasto", "Ingreso A", "Ingreso B"];
    for (const [index, description] of descriptions.entries()) {
      await expect(page.getByRole("cell", { name: description, exact: true })).toHaveCount(item.expected[index]);
    }
    await page.getByRole("button", { name: "Volver al gráfico", exact: true }).click();
    await expect(chart).toBeFocused();
  }
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("Viaje");
});

test("el análisis se adapta a 320 y 390 píxeles sin ocultar acciones móviles", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Validación de tamaños móviles");
  await setupAnalysis(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.getByRole("tab", { name: "Gráficos", exact: true }).click();
    const chartTab = await page.getByRole("tab", { name: "Gráficos", exact: true }).boundingBox();
    const movementTab = await page.getByRole("tab", { name: "Movimientos", exact: true }).boundingBox();
    const customizeButton = await page.getByRole("button", { name: "Personalizar", exact: true }).boundingBox();
    const filtersButton = await page.getByRole("button", { name: "Filtros", exact: true }).boundingBox();
    for (const item of [movementTab, customizeButton, filtersButton]) {
      expect(item!.y + item!.height / 2).toBeCloseTo(chartTab!.y + chartTab!.height / 2, 0);
      expect(item!.height).toBeGreaterThanOrEqual(44);
    }
    expect(customizeButton!.x).toBeGreaterThanOrEqual(movementTab!.x + movementTab!.width);
    expect(filtersButton!.x + filtersButton!.width).toBeLessThanOrEqual(width);
    const metrics = page.getByRole("region", { name: "Indicadores del análisis" });
    await expect(metrics).toBeVisible();
    expect(await metrics.locator("strong").evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`charts-${width}.png`) });
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await expect(page.getByRole("button", { name: "Aplicar filtros", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`filters-${width}.png`) });
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
    const dateHeader = page.getByRole("columnheader").filter({ has: page.getByRole("button", { name: /^Ordenar Fecha / }) });
    const previousSort = await dateHeader.getAttribute("aria-sort");
    await dateHeader.getByRole("button").click();
    await expect(dateHeader).toHaveAttribute("aria-sort", previousSort === "ascending" ? "descending" : "ascending");
    await expect(page.getByRole("cell", { name: "Compra semanal", exact: true })).toBeVisible();
    const table = page.getByRole("table");
    const scrollRegion = page.getByRole("region", { name: "Tabla de movimientos", exact: true });
    await expect(page.getByRole("columnheader", { name: "Análisis", exact: true })).toBeVisible();
    expect(await table.evaluate(element => getComputedStyle(element).display)).toBe("table");
    expect(await scrollRegion.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.getByRole("checkbox", { name: "Seleccionar movimiento Compra semanal", exact: true }).check();
    const bulk = page.getByRole("group", { name: "Acciones de movimientos seleccionados", exact: true }).last();
    const buttons = await bulk.getByRole("button").evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { y: bounds.y, height: bounds.height, width: bounds.width, right: bounds.right };
    }));
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.y).toBeCloseTo(buttons[0].y, 0);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.right).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: info.outputPath(`selected-${width}.png`) });
    await bulk.getByRole("button", { name: "Limpiar selección", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Seleccionar movimiento Compra semanal", exact: true })).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Seleccionar movimiento Compra semanal", exact: true }).check();
    await bulk.getByRole("button", { name: "Omitir del análisis", exact: true }).click();
    await expect(page.getByRole("button", { name: "Incluir Compra semanal en el análisis", exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Seleccionar movimiento Compra semanal", exact: true }).check();
    await bulk.getByRole("button", { name: "Incluir en el análisis", exact: true }).click();
    await expect(page.getByRole("button", { name: "Omitir Compra semanal del análisis", exact: true })).toBeVisible();
    await scrollRegion.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    const omitButton = page.getByRole("button", { name: "Omitir Compra semanal del análisis", exact: true });
    await expect(omitButton).toBeInViewport();
    await omitButton.click();
    await page.getByRole("button", { name: "Incluir Compra semanal en el análisis", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`movements-columns-${width}.png`) });
    await scrollRegion.evaluate(element => { element.scrollLeft = 0; });
    await table.scrollIntoViewIfNeeded();
    const amount = table.getByRole("cell", { name: "$-12.000", exact: true });
    const descriptionBounds = await table.getByRole("cell", { name: "Compra semanal", exact: true }).boundingBox();
    const amountBounds = await amount.boundingBox();
    expect(descriptionBounds!.x).toBeGreaterThanOrEqual(0);
    expect(amountBounds!.x + amountBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`movements-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("la paginación móvil permite avanzar, retroceder y saltar de página sin desbordar", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Paginación compacta móvil");
  await setupAnalysis(page);
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: Array.from({ length: 160 }, (_, index) => ({
    id: index + 1, account_id: 1, category_id: 2, date: "2026-10-01", description: `Movimiento ${index + 1}`,
    amount_clp: -1000, transaction_type: "expense", origin: "pdf",
  })) }));
  await page.reload();
  await page.getByRole("tab", { name: "Movimientos", exact: true }).click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    const pagination = page.getByRole("navigation", { name: "Paginación de movimientos" });
    const selector = pagination.getByRole("combobox", { name: "Ir a la página" });
    await selector.selectOption("1");
    await expect(pagination.getByRole("button", { name: "Anterior", exact: true })).toBeDisabled();
    await pagination.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(selector).toHaveValue("2");
    await pagination.getByRole("button", { name: "Anterior", exact: true }).click();
    await expect(selector).toHaveValue("1");
    await selector.selectOption("7");
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(10);
    await expect(pagination.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
    await pagination.scrollIntoViewIfNeeded();
    const controls = await pagination.locator("button:visible, select:visible").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { y: rect.y, right: rect.right, height: rect.height };
    }));
    expect(controls).toHaveLength(3);
    controls.forEach(control => {
      expect(control.y).toBeCloseTo(controls[0].y, 0);
      expect(control.right).toBeLessThanOrEqual(width);
      expect(control.height).toBeGreaterThanOrEqual(44);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`pagination-${width}.png`) });
  }
});

// Canvas interactions must use the final bar positions after ECharts transitions.
async function waitForChartToSettle(canvas: Locator) {
  let previous = "";
  let stableFrames = 0;
  await expect.poll(async () => {
    const current = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    stableFrames = current === previous ? stableFrames + 1 : 0;
    previous = current;
    return stableFrames;
  }, { intervals: [100] }).toBeGreaterThanOrEqual(3);
}

async function enableFrequency(page: Page) {
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const customize = page.getByRole("dialog", { name: "Personalizar gráficos", exact: true });
  await customize.getByRole("checkbox", { name: "Frecuencia de gastos por categoría", exact: true }).check();
  await customize.getByRole("button", { name: "Listo", exact: true }).click();
}

async function setupAnalysis(page: Page) {
  await mockApi(page);
  const base = { type: "expense", parent_id: null, is_active: true, is_default: true, sort_order: 1 };
  await page.route("**/api/v1/categories?*", route => route.fulfill({ json: [
    { ...base, id: 1, name: "Alimentación", code: "food" },
    { ...base, id: 2, name: "Supermercado", parent_id: 1 },
    { ...base, id: 3, name: "Transporte", code: "transport" },
  ] }));
  await page.route("**/api/v1/reports/periods", route => route.fulfill({ json: ["2026-10", "2026-09", "2026-08"] }));
  await page.route("**/api/v1/transactions?*", route => route.fulfill({ json: [
    { id: 1, account_id: 1, category_id: 2, date: "2026-10-01", description: "Compra semanal", amount_clp: -12000, transaction_type: "expense", origin: "pdf" },
    { id: 2, account_id: 1, category_id: 3, date: "2026-10-02", description: "Viaje", amount_clp: -1000, transaction_type: "expense", origin: "pdf" },
    { id: 3, account_id: 1, category_id: null, date: "2026-10-03", description: "Otro gasto", amount_clp: -500, transaction_type: "expense", origin: "pdf" },
  ] }));
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), session(ownerA));
  await page.goto("/app/analytics");
 }

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
