import { useEffect, useState } from "react";
import { AccountService } from "../services";
import type { Account, FinancialProduct } from "../types";

export function useAccountProducts() {
  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void AccountService.getProducts()
      .then((catalog) => {
        if (active) setProducts(catalog);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar el catálogo de productos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { products, loading, error };
}

export function accountProductName(account: Account, products: FinancialProduct[]): string {
  if (!account.product_code) return "Producto sin identificar";
  return products.find((product) => product.code === account.product_code)?.name
    ?? "Producto no disponible";
}
