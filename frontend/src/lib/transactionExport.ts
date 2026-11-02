import type { Category, Transaction } from "../types";
import { getCategoryPath } from "./categories";

export type TransactionExportFormat = "csv" | "markdown";

function csvText(value: string) {
  // Text must remain text when the file is opened in a spreadsheet.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function markdownText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createTransactionExport(items: Transaction[], format: TransactionExportFormat, context: {
  categories: Map<number, Category>; accountNames: Map<number, string>; period: string; total: number; filters: string[];
}) {
  const headers = ["Fecha", "Descripción", "Monto CLP", "Tipo", "Cuenta", "Categoría"];
  const rows = items.map(item => [
    item.date.slice(0, 10), item.description, item.amount_clp,
    item.transaction_type === "income" ? "Ingreso" : "Gasto",
    context.accountNames.get(item.account_id) ?? `Cuenta #${item.account_id}`,
    getCategoryPath(item.category_id, context.categories),
  ]);
  if (format === "csv") {
    const content = [headers, ...rows].map(row => row.map(value =>
      typeof value === "number" ? String(value) : csvText(value),
    ).join(";")).join("\r\n");
    return new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  }
  const content = [
    `# Movimientos — ${markdownText(context.period)}`, "",
    `${items.length} de ${context.total} resultados filtrados. Orden: más recientes primero.`,
    ...(context.filters.length ? [`Filtros: ${context.filters.map(markdownText).join(" · ")}`] : []), "",
    `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.map(value => markdownText(String(value))).join(" | ")} |`),
  ].join("\n");
  return new Blob([content], { type: "text/markdown;charset=utf-8" });
}
