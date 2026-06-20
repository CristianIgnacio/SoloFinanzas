import { apiClient } from "../lib/apiClient";
import type {
  PdfImportResponse,
  PdfPreview,
  Statement,
  StatementCreate,
  TransactionCandidateReview,
} from "../types";

export class StatementService {
  static async getStatements(accountId?: number): Promise<Statement[]> {
    return apiClient.get<Statement[]>("/statements", {
      params: { account_id: accountId },
    });
  }

  static async createStatement(data: StatementCreate): Promise<Statement> {
    return apiClient.post<Statement>("/statements", data);
  }

  static async updateStatus(
    statementId: number,
    status: string
  ): Promise<Statement> {
    return apiClient.patch<Statement>(
      `/statements/${statementId}/status`,
      undefined,
      { params: { status } },
    );
  }

  static async previewPdf(
    accountId: number,
    file: File,
    password?: string,
  ): Promise<PdfPreview> {
    return apiClient.postForm<PdfPreview>(
      "/statement-imports/pdf/preview",
      this.buildPdfForm(accountId, file, password),
    );
  }

  static async importPdf(
    accountId: number,
    file: File,
    password?: string,
  ): Promise<PdfImportResponse> {
    return apiClient.postForm<PdfImportResponse>(
      "/statement-imports/pdf",
      this.buildPdfForm(accountId, file, password),
    );
  }

  static async importReviewedPdf(
    accountId: number,
    file: File,
    reviewedTransactions: TransactionCandidateReview[],
    password?: string,
  ): Promise<PdfImportResponse> {
    const form = this.buildPdfForm(accountId, file, password);
    form.append("reviewed_transactions", JSON.stringify(reviewedTransactions));
    return apiClient.postForm<PdfImportResponse>(
      "/statement-imports/pdf/reviewed",
      form,
    );
  }

  private static buildPdfForm(
    accountId: number,
    file: File,
    password?: string,
  ): FormData {
    const form = new FormData();
    form.append("account_id", String(accountId));
    form.append("file", file);
    if (password) {
      form.append("password", password);
    }
    return form;
  }
}
