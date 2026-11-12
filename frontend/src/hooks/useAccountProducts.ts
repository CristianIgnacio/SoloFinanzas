import { useProducts, emptyList } from "../query/shared";
import type { Account, FinancialProduct } from "../types";

export function useAccountProducts() {
  const query = useProducts();
  return { products: query.data ?? emptyList, loading: query.isPending,
    error: query.error ? "No se pudo cargar el catálogo de productos." : null };
}

export function accountProductName(account: Account, products: FinancialProduct[]): string {
  if (!account.product_code) return "Producto sin identificar";
  return products.find((product) => product.code === account.product_code)?.name
    ?? "Producto no disponible";
}
