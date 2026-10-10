import { expect, test, type Page } from "@playwright/test";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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
      body = { id: owner, email: "demo@example.test", display_name: "Demo" };
    if (
      url.pathname.endsWith("/accounts") &&
      !url.pathname.includes("/reports/")
    )
      body = [account];
    if (url.pathname.endsWith("/transaction-pages"))
      body = { items: [], total: 0, offset: 0, limit: 50 };
    return route.fulfill({ json: body });
  });
}

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
        id: 3, created_at: "2026-01-01T00:00:00Z", ...createdPayload,
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
