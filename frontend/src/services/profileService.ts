import { apiClient } from "../lib/apiClient";
import type { UserProfile } from "../types";

export class ProfileService {
  static getProfile(): Promise<UserProfile> {
    return apiClient.get<UserProfile>("/me");
  }

  static async startWithCash(): Promise<void> {
    await apiClient.put("/me/onboarding", { choice: "cash" });
  }
}
