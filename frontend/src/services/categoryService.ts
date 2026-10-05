import { apiClient } from "../lib/apiClient";
import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  CategorizationRule,
  CategorizationRuleCreate,
} from "../types";

export class CategoryService {
  static async getCategories(includeInactive = true): Promise<Category[]> {
    return apiClient.get<Category[]>("/categories", {
      params: { include_inactive: includeInactive },
    });
  }

  static async createCategory(data: CategoryCreate): Promise<Category> {
    return apiClient.post<Category>("/categories", data);
  }

  static async updateCategory(
    categoryId: number,
    data: CategoryUpdate,
  ): Promise<Category> {
    return apiClient.patch<Category>(`/categories/${categoryId}`, data);
  }

  static async deleteCategory(categoryId: number): Promise<void> {
    return apiClient.delete(`/categories/${categoryId}`);
  }

  static async mergeCategory(categoryId: number, targetCategoryId: number): Promise<Category> {
    return apiClient.post<Category>(`/categories/${categoryId}/merge`, {
      target_category_id: targetCategoryId,
    });
  }

  static async getCategorizationRules(
    categoryId?: number
  ): Promise<CategorizationRule[]> {
    return apiClient.get<CategorizationRule[]>("/categorization-rules", {
      params: { category_id: categoryId },
    });
  }

  static async createCategorizationRule(
    data: CategorizationRuleCreate
  ): Promise<CategorizationRule> {
    return apiClient.post<CategorizationRule>("/categorization-rules", data);
  }

  static async updateCategorizationRule(
    ruleId: number,
    data: Partial<CategorizationRuleCreate>
  ): Promise<CategorizationRule> {
    return apiClient.patch<CategorizationRule>(
      `/categorization-rules/${ruleId}`,
      undefined,
      { params: data },
    );
  }

  static async deleteCategorizationRule(ruleId: number): Promise<void> {
    return apiClient.delete(`/categorization-rules/${ruleId}`);
  }
}
