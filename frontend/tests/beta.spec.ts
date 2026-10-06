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
