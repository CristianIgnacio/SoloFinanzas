import { apiClient } from "../lib/apiClient";
import type { DashboardResponse } from "../types";

export class DashboardService {
  static async getDashboard(periodMonth?: string, signal?: AbortSignal): Promise<DashboardResponse> {
    return apiClient.get<DashboardResponse>("/dashboard", {
      params: { period_month: periodMonth }, signal,
    });
  }
}
