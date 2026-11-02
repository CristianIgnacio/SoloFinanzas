type Row = Record<string, unknown>;

/** Explicit fields keep database identifiers and internal metadata out of downloads. */
export function createProfileExport(data: Record<string, unknown>) {
  const rows = (key: string): Row[] => Array.isArray(data[key]) ? data[key] as Row[] : [];
  const accounts = rows("accounts");
  const categories = rows("categories");
  const rules = rows("categorization_rules");
  const references = (items: Row[], prefix: string) => new Map(items.map((item, index) => [item.id, `${prefix} ${index + 1}`]));
  const accountRefs = references(accounts, "Cuenta");
  const categoryRefs = references(categories, "Categoría");
  const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
  return {
    formato: "SoloFinanzas — copia personal", version: 1,
    cuentas: accounts.map(row => ({ referencia: accountRefs.get(row.id), ...pick(row, ["name", "institution", "account_kind", "account_type", "product_code", "currency", "opening_balance_clp", "opening_balance_date"]) })),
    categorias: categories.map(row => ({ referencia: categoryRefs.get(row.id), categoria_padre: categoryRefs.get(row.parent_id) ?? null, ...pick(row, ["name", "type", "is_active", "sort_order", "icon", "color"]) })),
    movimientos: rows("transactions").map(row => ({ cuenta: accountRefs.get(row.account_id) ?? null, categoria: categoryRefs.get(row.category_id) ?? null, ...pick(row, ["date", "description", "amount_clp", "transaction_type", "origin"]) })),
    reglas: rules.map(row => ({ categoria: categoryRefs.get(row.category_id) ?? null, ...pick(row, ["keyword", "match_type", "priority", "is_active"]) })),
  };
}
