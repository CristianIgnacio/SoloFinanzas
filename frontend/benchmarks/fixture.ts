import type { Page } from "@playwright/test";

export const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function setupFixture(page: Page) {
  const exp = Math.floor(new Date("2026-11-07T16:00:00Z").getTime() / 1000);
  await page.addInitScript(value => localStorage.setItem("sb-demo-auth-token", JSON.stringify(value)), {
    access_token: `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp })).toString("base64url")}.fake`,
    refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp,
    user: { id: owner, email: "benchmark@example.test", app_metadata: { provider: "google" }, user_metadata: { full_name: "Benchmark" }, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" },
  });
  // Fixed date, with timers still running normally.
  await page.clock.setFixedTime(new Date("2026-11-07T15:00:00Z"));
  const rows = [1, 3].flatMap(account => ["2026-10", "2026-09"].flatMap((month, m) =>
    Array.from({ length: 125 }, (_, i) => ({ id: account * 1000 + m * 125 + i, account_id: account,
      category_id: null as number | null, category_version: 0, date: `${month}-01`, description: `Compra ${account}-${month}-${i + 1}`,
      amount_clp: -1000, transaction_type: "expense", origin: account === 3 ? "manual" : "pdf", is_internal_transfer: false }))));
  await page.route("https://demo.supabase.co/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const p = url.searchParams;
    let body: unknown;
    if (path === "/me") body = { id: owner, onboarding_choice: "bank" };
    else if (path === "/accounts") body = [{ id: 1, name: "Cuenta benchmark", account_type: "debito", institution: "banco_de_chile", currency: "CLP", created_at: "2026-01-01T00:00:00Z" }];
    else if (path === "/cash-account") body = { id: 3, name: "Efectivo" };
    else if (path === "/cash-account/balance") body = { opening_balance_clp: null, opening_balance_date: null, movements_clp: -250000, balance_clp: -250000, is_negative: true };
    else if (path === "/categories") body = [{ id: 1, name: "Compras", type: "expense", parent_id: null, is_active: true, is_default: true, sort_order: 1, transaction_count: rows.filter(r => r.category_id === 1).length, rule_count: 0 }];
    else if (path === "/reports/periods") body = ["2026-10", "2026-09"];
    else if (path === "/reports/accounts") body = [1, 3].map(account_id => ({ account_id, count: 250, income: 0, expenses: 250000, net: -250000 }));
    else if (path === "/dashboard") body = { period_month: "2026-10", available_periods: ["2026-10", "2026-09"], cards: [], monthly_movements: [{ month: "2026-10", income: 0, expenses: 250000 }] };
    else if (["/account-products", "/statements", "/categorization-rules/proposals"].includes(path)) body = [];
    else if (/^\/transactions\/\d+\/category$/.test(path) && route.request().method() === "PATCH") {
      const row = rows.find(r => r.id === Number(path.split("/")[2]))!;
      row.category_id = route.request().postDataJSON().category_id;
      row.category_version++;
      body = { ...row, category_event_id: 7001 };
    } else if (path === "/transactions" || path === "/transaction-pages") {
      const selected = rows.filter(r => (!p.has("account_id") || r.account_id === Number(p.get("account_id"))) &&
        (!p.has("date_from") || r.date >= p.get("date_from")!) && (!p.has("date_to") || r.date <= p.get("date_to")!) &&
        (p.get("uncategorized") !== "true" || r.category_id === null));
      const offset = Number(p.get("offset") ?? 0), limit = Number(p.get("limit") ?? 100);
      const items = selected.slice(offset, offset + limit);
      body = path === "/transactions" ? items : { items, total: selected.length, offset, limit };
    } else throw new Error(`Unmocked benchmark endpoint: ${route.request().method()} ${path}`);
    // Synthetic constant latency. Never represents Render, PostgreSQL or Supabase timing.
    await new Promise(resolve => setTimeout(resolve, 20));
    await route.fulfill({ json: body });
  });
}
