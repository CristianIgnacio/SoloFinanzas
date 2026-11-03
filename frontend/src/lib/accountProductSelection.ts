import type { Account, FinancialProduct } from "../types";

type ProductSelection = Pick<Account, "institution" | "account_type" | "product_code">;

export function getProductSelectionError(
  selection: ProductSelection, products: FinancialProduct[], original?: ProductSelection,
): string | null {
  // Existing unsupported accounts may keep their product when editing details.
  if (original && selection.institution === original.institution
    && selection.account_type === original.account_type
    && (selection.product_code || null) === (original.product_code || null)) return null;
  const product = products.find((item) => item.code === selection.product_code);
  if (product?.pdf_support === "no_soportado") {
    return `${product.name} aún no está soportado. Selecciona otro producto.`;
  }
  if (selection.product_code && !product) return "El producto seleccionado no está disponible.";
  const kind = selection.account_type.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/_/g, " ").trim();
  if (["credito", "tarjeta de credito"].includes(kind) && !product) {
    return "Selecciona un producto de crédito soportado.";
  }
  return null;
}
