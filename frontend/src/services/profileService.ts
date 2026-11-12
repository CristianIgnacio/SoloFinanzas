import { apiClient } from "../lib/apiClient";
import type { UserProfile } from "../types";

export class ProfileService {
  static exportData(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>("/me/export", { signal });
  }

  static getProfile(signal?: AbortSignal): Promise<UserProfile> {
    return apiClient.get<UserProfile>("/me", { signal });
  }

  static async deleteProfile(): Promise<void> {
    await apiClient.delete("/me");
  }

  static async startWithCash(): Promise<void> {
    await apiClient.put("/me/onboarding", { choice: "cash" });
  }
}
