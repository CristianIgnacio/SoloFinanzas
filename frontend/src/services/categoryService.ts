import { apiClient } from "../lib/apiClient";
import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  CategorizationRule,
  CategorizationRuleCreate,
} from "../types";

export type CategoryPattern = {
  id: number; version: number; pattern: string; match_type: "exact" | "contains";
  transaction_type: string; category_id: number | null; state: string; reason: string;
  evidence_count: number; decision_count: number; match_count: number; snoozed_until: string | null;
  examples: { transaction_id: number; description: string; date: string; category_id: number }[];
  history: { state: string; reason: string; at: string }[];
};

export class CategoryService {
  static async patterns(): Promise<CategoryPattern[]> {
    return apiClient.get("/categorization-rules/patterns");
  }

  static async decidePattern(id: number, action: string, expectedVersion: number): Promise<void> {
    await apiClient.post(`/categorization-rules/patterns/${id}/decision`, { action, expected_version: expectedVersion });
  }
  static async catalogPreview(): Promise<{ code: string; name: string; parent_code: string | null; status: string; reason?: string }[]> {
    return apiClient.get("/categories/catalog-preview");
  }

  static async memory(): Promise<{ pattern: string; match_type: "exact" | "contains"; transaction_type: string; category_id: number; evidence_count: number }[]> {
    return apiClient.get("/categorization-rules/memory");
  }

  static async forgetMemory(pattern: string, transactionType: string): Promise<void> {
    await apiClient.post("/categorization-rules/memory/forget", { pattern, transaction_type: transactionType });
  }

  static async ruleProposals(): Promise<CategoryPattern[]> {
    return apiClient.get("/categorization-rules/proposals");
  }

  static async acceptRuleProposal(proposal: { pattern: string; match_type: "exact" | "contains"; transaction_type: string; category_id: number }): Promise<CategorizationRule> {
    return apiClient.post("/categorization-rules/proposals", proposal);
  }
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

  static async previewCategorizationRule(data: CategorizationRuleCreate): Promise<{ match_count: number; examples: string[] }> {
    return apiClient.post("/categorization-rules/preview", data);
  }

  static async updateCategorizationRule(
    ruleId: number,
    data: Partial<CategorizationRuleCreate> & { is_active?: boolean }
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
