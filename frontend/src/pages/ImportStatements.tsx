import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  BankIcon,
  Button,
  EmptyState,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PageIntro,
  Panel,
  PdfIcon,
  StatusNotice,
  UploadIcon,
} from "../components";
import { groupCategories } from "../lib";
import { AccountService, CategoryService, StatementService } from "../services";
import { CategoryType, InstitutionLabels, supportsPdfImport } from "../types";
import { TransactionType } from "../types";
import type { Account, Category, PdfPreview, TransactionPreviewCandidate } from "../types";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type EditablePreviewTransaction = TransactionPreviewCandidate & {
  category_id: number | null;
};

function DocumentPreview({ preview }: { preview: PdfPreview | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-outline/80 bg-[#a9a79d] p-4 shadow-paper">
      <div className="absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.28),transparent_45%,rgba(0,0,0,0.08))]" />
      <div className="relative mx-auto mt-3 min-h-36 w-28 rounded-sm bg-[#f5f2e9] p-4 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
        {preview ? (
          <div className="space-y-2 text-[6px] leading-tight text-[#777267]">
            {preview.preview_lines.slice(0, 10).map((line, index) => (
              <p key={`${line}-${index}`} className="truncate">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-1 w-10 rounded bg-[#cecabe]" />
            <div className="h-1 w-12 rounded bg-[#dad6cb]" />
            <div className="mt-7 h-1 w-8 rounded bg-[#cecabe]" />
            <div className="h-1 w-12 rounded bg-[#dad6cb]" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ImportStatementsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [editableTransactions, setEditableTransactions] = useState<
    EditablePreviewTransaction[]
  >([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAccountId = searchParams.get("account_id");

  useEffect(() => {
    let cancelled = false;
    async function loadAccounts() {
      try {
        const [payload, categoriesPayload] = await Promise.all([
          AccountService.getAccounts(),
          CategoryService.getCategories(),
        ]);
        if (!cancelled) {
          const importableAccounts = payload.filter((account) =>
            supportsPdfImport(account.institution),
          );
          setAccounts(importableAccounts);
          setCategories(categoriesPayload);
          if (importableAccounts[0]) {
            const requestedAccount = importableAccounts.find(
              (account) => String(account.id) === requestedAccountId,
            );
            setSelectedAccount(String(requestedAccount?.id ?? importableAccounts[0].id));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No fue posible cargar las cuentas.");
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    }
    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [requestedAccountId]);

  const summary = useMemo(() => {
    const income = editableTransactions
      .filter((item) => item.amount_clp > 0)
      .reduce((sum, item) => sum + item.amount_clp, 0);
    const expenses = editableTransactions
      .filter((item) => item.amount_clp < 0)
      .reduce((sum, item) => sum + Math.abs(item.amount_clp), 0);
    return { income, expenses, count: editableTransactions.length };
  }, [editableTransactions]);

  const resetAnalysis = () => {
    setPreview(null);
    setEditableTransactions([]);
    setError(null);
  };

  const categoryOptionsFor = (transactionType: TransactionType) => {
    return categories.filter((category) => {
      if (!category.is_active) return false;
      if (transactionType === TransactionType.INCOME) {
        return category.type === "income" || category.type === "transfer";
      }

      return category.type === "expense" || category.type === "transfer";
    });
  };

  const categoryGroupsFor = (transactionType: TransactionType) =>
    groupCategories(categories, {
      activeOnly: true,
      type:
        transactionType === TransactionType.INCOME
          ? CategoryType.INCOME
          : CategoryType.EXPENSE,
    });

  const isCategoryCompatible = (
    categoryId: number | null,
    transactionType: TransactionType,
  ) => {
    if (!categoryId) return true;
    return categoryOptionsFor(transactionType).some((category) => category.id === categoryId);
  };

  const onFileChange = (fileList: FileList | null) => {
    const file = fileList?.[0] ?? null;
    resetAnalysis();
    if (file && file.size > MAX_PDF_SIZE) {
      setSelectedFile(null);
      setError("El PDF supera el limite de 10 MB.");
      return;
    }
    if (file && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(null);
      setError("Selecciona un archivo PDF valido.");
      return;
    }
    setSelectedFile(file);
  };

  const analyzeDocument = async () => {
    if (!selectedFile || !selectedAccount) return;
    setAnalyzing(true);
    resetAnalysis();
    try {
      const payload = await StatementService.previewPdf(
        Number(selectedAccount),
        selectedFile,
        password || undefined,
      );
      setPreview(payload);
      setEditableTransactions(
        payload.candidate_transactions.map((transaction) => ({
          ...transaction,
          category_id: transaction.suggested_category_id,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible analizar el PDF.");
    } finally {
      setAnalyzing(false);
    }
  };

  const importDocument = async () => {
    if (!selectedFile || !selectedAccount || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const response = await StatementService.importReviewedPdf(
        Number(selectedAccount),
        selectedFile,
        editableTransactions.map((transaction) => ({
          source_id: transaction.source_id,
          source_line: transaction.source_line,
          transaction_type: transaction.transaction_type,
          category_id: transaction.category_id,
        })),
        password || undefined,
      );
      navigate(`/transactions?statement_id=${response.statement.id}`, {
        state: {
          importMessage: `${response.result.inserted_count} movimientos importados correctamente.`,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible importar la cartola.");
    } finally {
      setImporting(false);
    }
  };

  const updateTransactionType = (
    sourceId: string | null,
    transactionType: TransactionType,
  ) => {
    setEditableTransactions((transactions) =>
      transactions.map((transaction) => {
        if (transaction.source_id !== sourceId) {
          return transaction;
        }

        const amount = Math.abs(transaction.amount_clp);
        const category_id = isCategoryCompatible(
          transaction.category_id,
          transactionType,
        )
          ? transaction.category_id
          : null;

        return {
          ...transaction,
          transaction_type: transactionType,
          amount_clp:
            transactionType === TransactionType.INCOME ? amount : -amount,
          category_id,
        };
      }),
    );
  };

  const updateTransactionCategory = (
    sourceId: string | null,
    categoryId: number | null,
  ) => {
    setEditableTransactions((transactions) =>
      transactions.map((transaction) =>
        transaction.source_id === sourceId
          ? { ...transaction, category_id: categoryId }
          : transaction,
      ),
    );
  };

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Importar PDF"
        title="Subir Cartola"
        description="Importa cartolas PDF de Banco de Chile, Banco Santander, CopecPay, Mercado Pago y BancoEstado."
      />

      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-medium tracking-[-0.03em]">Archivo de Datos</h2>
            <p className="text-muted">
              Selecciona una cartola PDF con texto seleccionable para analizarla.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDrop={(event) => {
              event.preventDefault();
              onFileChange(event.dataTransfer.files);
            }}
            onDragOver={(event) => event.preventDefault()}
            className="flex min-h-[360px] w-full flex-col items-center justify-center gap-6 rounded-[1.75rem] border-2 border-dashed border-outline bg-paper/80 px-6 text-center transition hover:border-primary/40 hover:bg-primary-mist/30"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-paper-soft text-primary">
              <PdfIcon className="h-9 w-9" />
            </span>
            <div className="space-y-3">
              <h3 className="text-4xl font-medium tracking-[-0.04em]">
                {selectedFile ? selectedFile.name : "Sube tu cartola bancaria aqui"}
              </h3>
              <p className="mx-auto max-w-xl text-lg leading-8 text-muted">
                Arrastra el PDF o haz clic para buscarlo en tu equipo.
              </p>
            </div>
            <p className="text-sm text-muted">PDF con texto seleccionable, maximo 10 MB.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => onFileChange(event.target.files)}
            />
          </button>
        </Panel>

        <Panel className="flex h-full flex-col justify-between gap-6">
          <div className="space-y-6">
            <DocumentPreview preview={preview} />
            <div className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-3xl font-medium tracking-[-0.03em]">Configuracion</h2>
                <p className="text-sm text-muted">
                  Elige la cuenta a la que pertenecen los movimientos.
                </p>
              </div>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Cuenta Destino</span>
                <div className="relative">
                  <select
                    value={selectedAccount}
                    onChange={(event) => {
                      setSelectedAccount(event.target.value);
                      resetAnalysis();
                    }}
                    disabled={loadingAccounts || accounts.length === 0}
                    className="w-full appearance-none rounded-xl border border-outline bg-white px-4 py-3 pr-10 outline-none transition focus:border-primary"
                  >
                    <option value="">
                      {accounts.length > 0
                        ? "Selecciona una cuenta..."
                        : "No hay cuentas con importacion PDF disponible"}
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                        {account.account_last4 ? ` **** ${account.account_last4}` : ""}
                        {" - "}
                        {InstitutionLabels[account.institution]}
                      </option>
                    ))}
                  </select>
                  <BankIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                </div>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-ink">Contrasena del Documento</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      resetAnalysis();
                    }}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-outline bg-white px-4 py-3 pr-12 outline-none transition focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </label>

              <div className="flex items-start gap-3 rounded-2xl bg-paper-soft p-4 text-sm text-muted">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="m-0 leading-6">
                  La contrasena no se guarda. Los PDFs escaneados que requieren OCR aun no estan soportados.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              tone="secondary"
              onClick={() => {
                setSelectedFile(null);
                setPassword("");
                setShowPassword(false);
                resetAnalysis();
              }}
            >
              Limpiar
            </Button>
            <Button
              className="min-h-14"
              disabled={!selectedFile || !selectedAccount || analyzing}
              onClick={analyzeDocument}
            >
              <UploadIcon className="h-5 w-5" />
              {analyzing ? "Analizando..." : "Analizar Documento"}
            </Button>
          </div>
        </Panel>
      </div>

      {preview ? (
        <Panel className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="eyebrow m-0 text-primary">Vista previa</p>
              <h2 className="text-3xl font-medium tracking-[-0.03em]">
                {summary.count} movimientos detectados
              </h2>
              <p className="text-muted">
                Periodo {preview.period_month} · {preview.page_count} pagina
                {preview.page_count === 1 ? "" : "s"} ·{" "}
                {preview.is_encrypted ? "PDF protegido" : "PDF sin contrasena"}
              </p>
            </div>
            <Button
              disabled={summary.count === 0 || importing}
              onClick={importDocument}
            >
              <UploadIcon className="h-5 w-5" />
              {importing ? "Importando..." : "Confirmar Importacion"}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-paper-soft p-4">
              <p className="text-sm text-muted">Movimientos</p>
              <p className="mt-1 text-2xl font-semibold">{summary.count}</p>
            </div>
            <div className="rounded-2xl bg-primary-mist p-4 text-primary">
              <p className="text-sm">Ingresos</p>
              <p className="mt-1 text-2xl font-semibold">
                {currencyFormatter.format(summary.income)}
              </p>
            </div>
            <div className="rounded-2xl bg-danger-soft p-4 text-danger">
              <p className="text-sm">Egresos</p>
              <p className="mt-1 text-2xl font-semibold">
                {currencyFormatter.format(summary.expenses)}
              </p>
            </div>
          </div>

          {preview.parsing_errors.length > 0 ? (
            <StatusNotice tone="error">
              {preview.parsing_errors.length} fila(s) no pudieron interpretarse. Revisa el PDF antes de confirmar.
            </StatusNotice>
          ) : null}

          <div className="max-h-[600px] overflow-auto rounded-2xl border border-outline/80">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="sticky top-0 z-10 bg-paper text-left text-sm text-muted shadow-[0_1px_0_rgba(218,214,203,0.8)]">
                <tr className="border-b border-outline/80">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripcion</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {editableTransactions.map((transaction, index) => (
                  <tr
                    key={`${transaction.source_line}-${index}`}
                    className="border-b border-outline/50 last:border-b-0"
                  >
                    <td className="px-4 py-4 text-muted">{transaction.date}</td>
                    <td className="px-4 py-4 font-medium">{transaction.description}</td>
                    <td className="px-4 py-4">
                      <select
                        value={transaction.transaction_type}
                        onChange={(event) =>
                          updateTransactionType(
                            transaction.source_id,
                            event.target.value as TransactionType,
                          )
                        }
                        className="w-full rounded-xl border border-outline bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
                      >
                        <option value={TransactionType.EXPENSE}>Egreso</option>
                        <option value={TransactionType.INCOME}>Ingreso</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={transaction.category_id ?? ""}
                        onChange={(event) =>
                          updateTransactionCategory(
                            transaction.source_id,
                            event.target.value ? Number(event.target.value) : null,
                          )
                        }
                        className="w-full rounded-xl border border-outline bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
                      >
                        <option value="">Sin categoria</option>
                        {categoryGroupsFor(transaction.transaction_type).map((group) => (
                          <optgroup key={group.root.id} label={group.root.name}>
                            <option value={group.root.id}>
                              {group.children.length > 0
                                ? `${group.root.name} (sin subcategoria)`
                                : group.root.name}
                            </option>
                            {group.children.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td
                      className={
                        transaction.amount_clp >= 0
                          ? "px-4 py-4 text-right font-medium text-primary"
                          : "px-4 py-4 text-right font-medium text-danger"
                      }
                    >
                      {currencyFormatter.format(transaction.amount_clp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <EmptyState
          title="Aun no hay una cartola analizada"
          description="Selecciona un PDF y usa Analizar Documento para revisar los movimientos antes de guardarlos."
        />
      )}
    </div>
  );
}

