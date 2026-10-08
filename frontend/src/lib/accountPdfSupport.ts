import { supportsPdfImport } from "../types";
import type { Account, FinancialProduct } from "../types";

export type AccountPdfAvailability = {
  allowed: boolean;
  label: string;
  notice: string | null;
};

function accountKind(value: string): FinancialProduct["kind"] | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/_/g, " ").trim().replace(/\s+/g, " ");
  const aliases: Record<string, FinancialProduct["kind"]> = {
    corriente: "corriente", "cuenta corriente": "corriente",
    vista: "vista", "cuenta vista": "vista",
    ahorro: "ahorro", "cuenta de ahorro": "ahorro",
    "billetera prepago": "billetera_prepago", "billetera digital": "billetera_prepago",
    prepago: "billetera_prepago", "cuenta prepago": "billetera_prepago",
    "tarjeta de prepago": "billetera_prepago",
    credito: "credito", "tarjeta de credito": "credito",
  };
  return aliases[normalized] ?? null;
}

export function getAccountPdfAvailability(
  account: Account, products: FinancialProduct[],
): AccountPdfAvailability {
  const kind = accountKind(account.account_type);
  if (kind === "credito") {
    return { allowed: false, label: "Crédito no soportado", notice: "La importación de estados de tarjeta de crédito aún no está disponible." };
  }
  if (!supportsPdfImport(account.institution)) {
    return { allowed: false, label: "PDF no disponible", notice: "Esta institución aún no tiene parser PDF." };
  }
  if (!account.product_code) {
    return { allowed: true, label: "Cuenta sin producto", notice: "Esta cuenta antigua no tiene producto asignado. Se usará el parser de su institución; revisa los movimientos antes de confirmar." };
  }
  const product = products.find((item) => item.code === account.product_code);
  if (!product || product.institution !== account.institution || product.kind !== kind) {
    return { allowed: false, label: "Producto por revisar", notice: "El producto de esta cuenta no coincide con el catálogo. Edítala antes de importar." };
  }
  if (product.pdf_support === "no_soportado") {
    return { allowed: false, label: "PDF no soportado", notice: `La importación PDF no está disponible para ${product.name}.` };
  }
  if (product.pdf_support === "pendiente_verificacion") {
    return { allowed: true, label: "PDF por verificar", notice: `Aún no se verificó una cartola real de ${product.name}. Puedes analizarla con el parser de la institución y revisar los movimientos antes de confirmar.` };
  }
  return { allowed: true, label: "Muestra PDF probada", notice: null };
}
