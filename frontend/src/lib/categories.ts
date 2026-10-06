import { CategoryType } from "../types";
import type { Category } from "../types";

export type CategoryGroup = {
  root: Category;
  children: Category[];
};

export function createCategoryMap(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

export function getRootCategory(
  category: Category | undefined,
  categoryMap: Map<number, Category>,
): Category | undefined {
  if (!category) return undefined;
  return category.parent_id ? categoryMap.get(category.parent_id) ?? category : category;
}

export function getCategoryPath(
  categoryId: number | null,
  categoryMap: Map<number, Category>,
): string {
  if (categoryId === null) return "Sin categoria";
  const category = categoryMap.get(categoryId);
  if (!category) return `Categoria #${categoryId}`;
  const parent = category.parent_id ? categoryMap.get(category.parent_id) : undefined;
  return parent ? `${parent.name} > ${category.name}` : category.name;
}

export function categoryMatchesSelection(
  transactionCategoryId: number | null,
  selectedCategoryId: number,
  categoryMap: Map<number, Category>,
): boolean {
  if (transactionCategoryId === selectedCategoryId) return true;
  return categoryMap.get(transactionCategoryId ?? -1)?.parent_id === selectedCategoryId;
}

export function groupCategories(
  categories: Category[],
  options: { activeOnly?: boolean; type?: CategoryType } = {},
): CategoryGroup[] {
  const visible = categories.filter(
    (category) =>
      (!options.activeOnly || category.is_active) &&
      (!options.type || category.type === options.type || category.type === CategoryType.TRANSFER),
  );
  const visibleIds = new Set(visible.map((category) => category.id));
  const children = new Map<number, Category[]>();
  visible.forEach((category) => {
    if (category.parent_id !== null && visibleIds.has(category.parent_id)) {
      children.set(category.parent_id, [
        ...(children.get(category.parent_id) ?? []),
        category,
      ]);
    }
  });
  const order = (left: Category, right: Category) =>
    left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es");
  return visible
    .filter((category) => category.parent_id === null || !visibleIds.has(category.parent_id))
    .sort(order)
    .map((root) => ({
      root,
      children: (children.get(root.id) ?? []).sort(order),
    }));
}
