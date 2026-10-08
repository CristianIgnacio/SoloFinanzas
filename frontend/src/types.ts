// Dashboard types
export type SummaryCard = {
  label: string;
  value: string;
  trend: string;
};

export type MonthlyMovement = {
  month: string;
  income: number;
  expenses: number;
};

export type DashboardResponse = {
  period_month: string;
  available_periods: string[];
  cards: SummaryCard[];
  monthly_movements: MonthlyMovement[];
};

// Finance types - Enums
export enum CurrencyCode {
  CLP = "CLP",
}

export enum InstitutionCode {
  BANCO_DE_CHILE = "banco_de_chile",
  BANCO_SANTANDER = "banco_santander",
  COPECPAY = "copecpay",
  MERCADOPAGO = "mercadopago",
  BANCO_ESTADO = "banco_estado",
  BANCO_FALABELLA = "banco_falabella",
}

export enum ParserKey {
  BANCO_DE_CHILE = "banco_de_chile",
  BANCO_SANTANDER = "banco_santander",
  COPECPAY = "copecpay",
  MERCADOPAGO = "mercadopago",
  BANCO_ESTADO = "banco_estado",
  BANCO_FALABELLA = "banco_falabella",
}

export enum StatementStatus {
  PENDING = "pending",
  PROCESSED = "processed",
  FAILED = "failed",
}

export enum CategoryType {
  INCOME = "income",
  EXPENSE = "expense",
  TRANSFER = "transfer",
}

export enum TransactionType {
  INCOME = "income",
  EXPENSE = "expense",
}

export enum CategorySource {
  RULE = "rule",
  MANUAL = "manual",
  DEFAULT = "default",
}

// Account types
export type Account = {
  id: number;
  name: string;
  institution: InstitutionCode;
  account_type: string;
  product_code: string | null;
  account_last4: string | null;
  currency: CurrencyCode;
  created_at: string;
};

export type AccountCreate = Omit<Account, "id" | "created_at" | "product_code"> & {
  product_code?: string | null;
};
export type AccountUpdate = AccountCreate;

export type FinancialProduct = {
  code: string;
  institution: InstitutionCode;
  name: string;
  kind: "corriente" | "vista" | "ahorro" | "billetera_prepago" | "credito";
  pdf_support: "muestra_probada" | "pendiente_verificacion" | "no_soportado";
};

export const InstitutionLabels: Record<InstitutionCode, string> = {
  [InstitutionCode.BANCO_FALABELLA]: "Banco Falabella",
  [InstitutionCode.BANCO_DE_CHILE]: "Banco de Chile",
  [InstitutionCode.BANCO_SANTANDER]: "Banco Santander",
  [InstitutionCode.COPECPAY]: "Copec Pay",
  [InstitutionCode.MERCADOPAGO]: "Mercado Pago",
  [InstitutionCode.BANCO_ESTADO]: "BancoEstado",
};

export const InstitutionOptions = Object.values(InstitutionCode).map((value) => ({
  value,
  label: InstitutionLabels[value],
}));

export const InstitutionParserMap: Record<InstitutionCode, ParserKey> = {
  [InstitutionCode.BANCO_FALABELLA]: ParserKey.BANCO_FALABELLA,
  [InstitutionCode.BANCO_DE_CHILE]: ParserKey.BANCO_DE_CHILE,
  [InstitutionCode.BANCO_SANTANDER]: ParserKey.BANCO_SANTANDER,
  [InstitutionCode.COPECPAY]: ParserKey.COPECPAY,
  [InstitutionCode.MERCADOPAGO]: ParserKey.MERCADOPAGO,
  [InstitutionCode.BANCO_ESTADO]: ParserKey.BANCO_ESTADO,
};

export const ParserLabels: Record<ParserKey, string> = {
  [ParserKey.BANCO_FALABELLA]: "Banco Falabella PDF (cuenta corriente)",
  [ParserKey.BANCO_DE_CHILE]: "Banco de Chile PDF",
  [ParserKey.BANCO_SANTANDER]: "Santander PDF",
  [ParserKey.COPECPAY]: "CopecPay PDF",
  [ParserKey.MERCADOPAGO]: "Mercado Pago PDF",
  [ParserKey.BANCO_ESTADO]: "BancoEstado PDF",
};

export function getParserForInstitution(institution: InstitutionCode): ParserKey {
  return InstitutionParserMap[institution];
}

export function supportsPdfImport(institution: InstitutionCode): boolean {
  return institution in InstitutionParserMap;
}

// Category types
export type Category = {
  id: number;
  name: string;
  type: CategoryType;
  parent_id: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  transaction_count: number;
  rule_count: number;
};

export type CategoryCreate = Omit<
  Category,
  "id" | "transaction_count" | "rule_count"
>;

export type CategoryUpdate = Partial<
  Pick<Category, "name" | "type" | "parent_id" | "is_active" | "sort_order">
>;

// Statement types
export type Statement = {
  id: number;
  account_id: number;
  file_name: string;
  file_type: string;
  file_checksum: string | null;
  period_month: string | null;
  status: StatementStatus;
  raw_path: string | null;
  uploaded_at: string;
};

export type StatementCreate = Omit<Statement, "id" | "uploaded_at">;

export type StatementDeletionImpact = {
  statement_id: number;
  transaction_count: number;
  income_total_clp: number;
  expense_total_clp: number;
  net_total_clp: number;
  affected_periods: string[];
  internal_transfer_match_count: number;
  raw_file_delete_eligible: boolean;
};

export type StatementDeletionResult = StatementDeletionImpact & {
  raw_file_deleted: boolean;
};

export type TransactionCandidate = {
  source_id: string | null;
  source_line: string;
  date: string;
  description: string;
  normalized_description: string;
  amount_clp: number;
  transaction_type: TransactionType;
};

export type TransactionPreviewCandidate = TransactionCandidate & {
  suggested_category_id: number | null;
  category_source: CategorySource | null;
  rule_id_applied: number | null;
};

export type TransactionCandidateReview = {
  source_id: string | null;
  source_line: string;
  transaction_type: TransactionType;
  category_id: number | null;
};

export type PdfPreview = {
  parser_key: string;
  file_name: string;
  file_checksum: string;
  page_count: number;
  is_encrypted: boolean;
  used_password: boolean;
  preview_lines: string[];
  extracted_text_length: number;
  period_month: string;
  candidate_transactions: TransactionPreviewCandidate[];
  parsing_errors: string[];
};

export type PdfImportResponse = {
  statement: Statement;
  result: {
    statement_id: number;
    inserted_count: number;
    omitted_internal_count: number;
    omitted_existing_count: number;
  };
};

// Transaction types
export type Transaction = {
  id: number;
  account_id: number;
  statement_id: number;
  source_row: number | null;
  date: string;
  description: string;
  normalized_description: string;
  amount_clp: number;
  transaction_type: TransactionType;
  category_id: number | null;
  category_source: CategorySource | null;
  rule_id_applied: number | null;
  fingerprint: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  is_internal_transfer: boolean;
};

export type TransactionCreate = Omit<
  Transaction,
  "id" | "created_at" | "updated_at" | "is_internal_transfer"
>;

// Categorization Rule types
export type CategorizationRule = {
  id: number;
  keyword: string;
  category_id: number;
  priority: number;
  created_at: string;
};

export type CategorizationRuleCreate = Omit<CategorizationRule, "id" | "created_at">;

// API Response wrapper (for future error handling)
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
