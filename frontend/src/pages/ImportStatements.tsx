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
  WarningIcon,
  cn,
} from "../components";
import { PdfAnalysisVisual } from "../components/PdfAnalysisVisual";
import { PdfImportFeedbackModal } from "../components/PdfImportFeedbackModal";
import { getAccountPdfAvailability, groupCategories } from "../lib";
import { ApiRequestError } from "../lib/apiClient";
import { AccountService, CategoryService, StatementService } from "../services";
import { CategoryType, InstitutionLabels } from "../types";
import { TransactionType } from "../types";
import type { Account, Category, FinancialProduct, PdfPreview, TransactionPreviewCandidate } from "../types";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const issueTitles: Record<string, string> = {
  BANK_MISMATCH: "El banco es distinto",
  DOCUMENT_TYPE_MISMATCH: "El tipo de documento es distinto",
  CARD_LAST4_MISMATCH: "La tarjeta es distinta",
  CARD_LAST4_UNREADABLE: "No pudimos comprobar la tarjeta",
  CARD_LAST4_NOT_CONFIGURED: "Falta identificar la tarjeta",
  TOTAL_MISMATCH: "Los movimientos no cuadran",
  ROWS_UNREADABLE: "Hay filas sin interpretar",
  PASSWORD_REQUIRED: "Falta la contraseña",
  PASSWORD_INVALID: "Contraseña incorrecta",
  UNSUPPORTED_FORMAT: "Formato no reconocido",
  NO_SELECTABLE_TEXT: "PDF sin texto seleccionable",
  DUPLICATE_STATEMENT: "Cartola ya importada",
};

type EditablePreviewTransaction = TransactionPreviewCandidate & {
  category_id: number | null;
  action: "unchanged" | "set" | "confirm";
  original_type: TransactionType;
};

export function ImportStatementsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<FinancialProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codedError, setCodedError] = useState<ApiRequestError | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [issuesAccepted, setIssuesAccepted] = useState(false);
  const [acknowledgementChecked, setAcknowledgementChecked] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<"issues" | "error" | null>(null);
  const [editableTransactions, setEditableTransactions] = useState<
    EditablePreviewTransaction[]
  >([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountSelectRef = useRef<HTMLSelectElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAccountId = searchParams.get("account_id");

  useEffect(() => {
    if (error) feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    async function loadAccounts() {
      try {
        const [payload, productsPayload, categoriesPayload] = await Promise.all([
          AccountService.getAccounts(),
          AccountService.getProducts(),
          CategoryService.getCategories(),
        ]);
        if (!cancelled) {
          const importableAccounts = payload.filter((account) =>
            getAccountPdfAvailability(account, productsPayload).allowed,
          );
          setAccounts(payload);
          setProducts(productsPayload);
          setCategories(categoriesPayload);
          if (payload.length > 0) {
            const requestedAccount = payload.find(
              (account) => String(account.id) === requestedAccountId,
            );
            setSelectedAccount(String(requestedAccount?.id ?? importableAccounts[0]?.id ?? ""));
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

  const account = accounts.find((item) => String(item.id) === selectedAccount);
  const pdfAvailability = account ? getAccountPdfAvailability(account, products) : null;
  const busy = analyzing || importing;

  const scrollTo = (element: HTMLElement | null) => element?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });

  useEffect(() => {
    if (analyzing) scrollTo(analysisRef.current);
    else if (preview && preview.issues.length === 0) scrollTo(previewRef.current);
  }, [analyzing, preview]);

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
    setCodedError(null);
    setIssuesAccepted(false);
    setAcknowledgementChecked(false);
    setFeedbackModal(null);
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
    if (busy || !fileList?.length) return;
    const file = fileList?.[0] ?? null;
    resetAnalysis();
    if (file && file.size > MAX_PDF_SIZE) {
      setSelectedFile(null);
      setCodedError(new ApiRequestError("El PDF supera el límite de 10 MB.", "FILE_TOO_LARGE", "Selecciona un archivo más pequeño."));
      setFeedbackModal("error");
      return;
    }
    if (file && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(null);
      setCodedError(new ApiRequestError("Selecciona un archivo PDF válido.", "INVALID_FILE_TYPE", "El archivo debe tener extensión .pdf."));
      setFeedbackModal("error");
      return;
    }
    setSelectedFile(file);
  };

  const analyzeDocument = async () => {
    if (busy || !selectedFile || !selectedAccount || !pdfAvailability?.allowed) return;
    setAnalyzing(true);
    resetAnalysis();
    try {
      const payload = await StatementService.previewPdf(
        Number(selectedAccount),
        selectedFile,
        password || undefined,
      );
      setPreview(payload);
      if (payload.issues.length > 0) setFeedbackModal("issues");
      setEditableTransactions(
        payload.candidate_transactions.map((transaction) => ({
          ...transaction,
          category_id: transaction.suggested_category_id,
          action: "unchanged",
          original_type: transaction.transaction_type,
        })),
      );
    } catch (err) {
      setCodedError(err instanceof ApiRequestError
        ? err
        : new ApiRequestError("No fue posible analizar el PDF.", "PROCESSING_FAILED", "Intenta nuevamente con otro archivo."));
      setFeedbackModal("error");
    } finally {
      setAnalyzing(false);
    }
  };

  const importDocument = async () => {
    if (busy || editableTransactions.length === 0 || !selectedFile || !selectedAccount || !preview || !pdfAvailability?.allowed
      || (preview.issues.length > 0 && !issuesAccepted)) return;
    setImporting(true);
    setError(null);
    setCodedError(null);
    try {
      const response = await StatementService.importReviewedPdf(
        Number(selectedAccount),
        selectedFile,
        editableTransactions.map((transaction) => ({
          source_id: transaction.source_id,
          source_line: transaction.source_line,
          transaction_type: transaction.transaction_type,
          category_id: transaction.category_id,
          action: transaction.action,
        })),
        password || undefined,
        preview.issues.map((issue) => issue.code),
      );
      navigate(`/app/transactions?statement_id=${response.statement.id}`, {
        state: {
          importMessage: `${response.result.inserted_count} movimientos importados correctamente.`,
        },
      });
    } catch (err) {
      setCodedError(err instanceof ApiRequestError
        ? err
        : new ApiRequestError("No fue posible importar la cartola.", "IMPORT_FAILED", "Revisa el PDF e inténtalo nuevamente."));
      setFeedbackModal("error");
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
        const category_id = transaction.action === "unchanged" ? null : isCategoryCompatible(
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
          action: transaction.action === "unchanged" ? "unchanged" : "set",
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
          ? { ...transaction, category_id: categoryId,
              action: categoryId === transaction.suggested_category_id ? "confirm" : "set" }
          : transaction,
      ),
    );
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <PageIntro compactOnMobile eyebrow="Importar PDF" title="Importar cartola"
        description="Selecciona tu cuenta, analiza el PDF y revisa los movimientos antes de guardarlos." />

      <ol aria-label="Etapas de importación" className="grid grid-cols-3 gap-2 sm:gap-4">
        {["Preparar", "Revisar", "Guardar"].map((label, index) => {
          const active = importing ? index === 2 : preview ? index === 1 : index === 0;
          return <li key={label} aria-current={active ? "step" : undefined}
            className={cn("flex min-w-0 items-center gap-1.5 rounded-2xl border px-2 py-2.5 text-xs font-semibold sm:gap-2 sm:p-3 sm:text-sm", active ? "border-primary/25 bg-primary-mist text-primary" : "border-outline/70 bg-white/60 text-muted")}>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full sm:h-7 sm:w-7", active ? "bg-primary text-white" : "bg-paper-soft")}>{index + 1}</span>{label}
          </li>;
        })}
      </ol>

      {error || codedError ? (
        <div ref={feedbackRef} className="scroll-mt-28">
          {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
          {codedError ? <button type="button" onClick={() => setFeedbackModal("error")}
            className="flex w-full items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft/40 p-4 text-left transition hover:bg-danger-soft/70">
            <WarningIcon className="h-5 w-5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{issueTitles[codedError.code] ?? "No pudimos continuar"}</span>
              <span className="mt-1 block text-sm text-muted">Ver el detalle y cómo resolverlo</span>
            </span>
          </button> : null}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start xl:gap-6">
        <Panel compactOnMobile className="min-w-0 space-y-4 sm:space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-mist text-primary"><BankIcon className="h-5 w-5" /></span>
            <div><h2 className="text-xl font-semibold tracking-tight">Cuenta de destino</h2><p className="mt-1 text-sm text-muted">Elige la cuenta de esta cartola.</p></div>
          </div>
          <label className="block min-w-0 space-y-2 text-sm">
            <span className="font-medium text-ink">Cuenta Destino</span>
            <select ref={accountSelectRef} value={selectedAccount} onChange={(event) => {
              setSelectedAccount(event.target.value);
              resetAnalysis();
            }} disabled={busy || loadingAccounts || accounts.length === 0}
              className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 py-3 text-base outline-none transition focus:border-primary disabled:opacity-60">
              <option value="">{accounts.length > 0 ? "Selecciona una cuenta..." : "No hay cuentas registradas"}</option>
              {accounts.map(item => <option key={item.id} value={item.id}>{item.name}{item.account_last4 ? ` · •••• ${item.account_last4}` : ""} · {InstitutionLabels[item.institution]}</option>)}
            </select>
          </label>
          {pdfAvailability?.notice ? <StatusNotice tone={pdfAvailability.allowed ? "info" : "error"}>{pdfAvailability.notice}</StatusNotice> : null}
          {!loadingAccounts && accounts.length === 0 ? <Button compactOnMobile tone="secondary" onClick={() => navigate("/app/accounts?new_account=1")}>Agregar cuenta</Button> : null}
          <div className="space-y-2">
            <label htmlFor="pdf-password" className="flex items-center gap-2 text-sm font-medium text-ink"><LockIcon className="h-4 w-4 text-muted" />Contraseña del documento</label>
            <div className="relative">
              <input id="pdf-password" type={showPassword ? "text" : "password"} value={password} disabled={busy}
                onChange={(event) => { setPassword(event.target.value); resetAnalysis(); }} placeholder="Opcional" autoComplete="off"
                className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 py-3 pr-14 text-base outline-none transition focus:border-primary disabled:opacity-60" />
              <button type="button" onClick={() => setShowPassword(visible => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink">
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-sm leading-5 text-muted">Complétala si tu PDF está protegido. La contraseña no se almacena.</p>
          </div>
          {preview ? <p className="border-t border-outline/70 pt-3 text-sm leading-5 text-muted">Si cambias la cuenta, la contraseña o el archivo, deberás analizar la cartola otra vez.</p> : null}
        </Panel>

        <Panel compactOnMobile className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Tu cartola PDF</h2>
            <span className="shrink-0 rounded-full bg-paper-soft px-2.5 py-1 text-sm font-medium text-muted">Máx. 10 MB</span>
          </div>
          {!preview ? <div ref={analysisRef} className="scroll-mt-28"><PdfAnalysisVisual analyzing={analyzing} hasFile={Boolean(selectedFile)} /></div> : (
            <div role="status" className="rounded-xl bg-primary-mist p-3 text-sm text-primary">Análisis completado · {summary.count} movimientos detectados</div>
          )}
          <button type="button" disabled={busy} aria-label={selectedFile ? "Cambiar archivo PDF" : "Seleccionar archivo PDF"}
            onClick={() => fileInputRef.current?.click()}
            onDrop={(event) => { event.preventDefault(); onFileChange(event.dataTransfer.files); }} onDragOver={event => event.preventDefault()}
            className={cn("flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-dashed border-outline bg-paper/70 p-4 text-left transition hover:border-primary/40 hover:bg-primary-mist/30 disabled:cursor-wait disabled:opacity-60", !selectedFile && "min-h-28")}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-primary"><PdfIcon className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink [overflow-wrap:anywhere]">{selectedFile?.name ?? "Selecciona tu cartola"}</span>
              <span className="mt-1 block text-sm leading-5 text-muted">{selectedFile ? `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(selectedFile.size / 1024)} KB · Toca para cambiar el archivo` : "Busca un PDF con texto seleccionable en tus archivos."}</span>
              {!selectedFile ? <span className="mt-1 hidden text-sm text-muted xl:block">También puedes arrastrarlo aquí.</span> : null}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" disabled={busy} className="hidden" onChange={(event) => {
            onFileChange(event.target.files);
            event.target.value = "";
          }} />
          <div className="flex gap-2 border-t border-outline/70 pt-4">
            <Button compactOnMobile tone="secondary" disabled={busy || (!selectedFile && !password)} onClick={() => {
              setSelectedFile(null); setPassword(""); setShowPassword(false); resetAnalysis();
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}>Limpiar</Button>
            <Button compactOnMobile className="min-w-0 flex-1" aria-label={analyzing ? "Analizando..." : "Analizar Documento"} disabled={!selectedFile || !selectedAccount || !pdfAvailability?.allowed || busy} onClick={analyzeDocument}>
              <UploadIcon className="h-5 w-5 shrink-0" />{analyzing ? "Analizando..." : "Analizar PDF"}
            </Button>
          </div>
        </Panel>
      </div>

      {preview ? (
        <div ref={previewRef} className="min-w-0 scroll-mt-28 space-y-4" aria-busy={importing}>
          <Panel compactOnMobile className="min-w-0 space-y-5">
            <div className="space-y-2">
              <p className="eyebrow m-0 text-primary">Revisa antes de guardar</p>
              <h2 className="section-title">{summary.count} movimientos detectados</h2>
              <p className="text-sm leading-6 text-muted">Período {preview.period_month} · {preview.page_count} {preview.page_count === 1 ? "página" : "páginas"} · {preview.is_encrypted ? "PDF protegido" : "PDF sin contraseña"}</p>
              <p className="text-sm text-muted">Puedes corregir el tipo y la categoría de cada movimiento.</p>
            </div>
            <div className={cn("grid gap-3 sm:grid-cols-3", [summary.income, summary.expenses].some(value => currencyFormatter.format(value).length > 10) ? "grid-cols-1" : "grid-cols-2")} aria-label="Resumen de la importación">
              <div className="col-span-full flex items-center justify-between rounded-2xl bg-paper-soft p-4 sm:col-span-1 sm:block"><p className="text-sm text-muted">Movimientos</p><p className="text-2xl font-semibold tabular-nums sm:mt-1">{summary.count}</p></div>
              <div className="metric-container rounded-2xl bg-primary-mist p-3 text-primary sm:p-4"><p className="text-sm">Ingresos</p><p className="metric-value mt-1">{currencyFormatter.format(summary.income)}</p></div>
              <div className="metric-container rounded-2xl bg-danger-soft p-3 text-danger sm:p-4"><p className="text-sm">Gastos</p><p className="metric-value mt-1">{currencyFormatter.format(summary.expenses)}</p></div>
            </div>
            {preview.issues.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-danger/25 bg-danger-soft/40 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                  <div><p className="text-sm font-semibold">{issuesAccepted ? "Diferencias revisadas" : "Tu documento requiere revisión"}</p>
                    <p className="mt-1 text-sm leading-5 text-muted">{preview.issues.length} {preview.issues.length === 1 ? "diferencia detectada" : "diferencias detectadas"}. {issuesAccepted ? "Aceptaste continuar con esta cuenta." : "Revisa el detalle para habilitar la importación."}</p></div>
                </div>
                <Button compactOnMobile tone="secondary" disabled={importing} onClick={() => { setAcknowledgementChecked(issuesAccepted); setFeedbackModal("issues"); }}>{issuesAccepted ? "Ver diferencias" : "Revisar diferencias"}</Button>
              </div>
            ) : null}
            {preview.parsing_errors.length > 0 ? <StatusNotice tone="error">{preview.parsing_errors.length} fila(s) no pudieron interpretarse. Revisa el PDF antes de confirmar.</StatusNotice> : null}

            {summary.count > 0 ? <div className="xl:max-h-[min(65vh,680px)] xl:overflow-auto xl:rounded-2xl xl:border xl:border-outline/80">
              <table role="table" aria-label="Movimientos por importar" className="block w-full border-collapse xl:table xl:min-w-[760px]">
                <thead role="rowgroup" className="sr-only text-left text-sm text-muted xl:not-sr-only xl:sticky xl:top-0 xl:z-10 xl:table-header-group xl:bg-paper">
                  <tr role="row"><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Descripción</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Categoría</th><th className="px-3 py-3 text-right font-medium">Monto</th></tr>
                </thead>
                <tbody role="rowgroup" className="grid gap-3 md:grid-cols-2 xl:table-row-group">
                  {editableTransactions.map((transaction, index) => (
                    <tr role="row" key={`${transaction.source_line}-${index}`} className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-3 rounded-2xl border border-outline/80 p-3.5 xl:table-row xl:rounded-none xl:border-x-0 xl:border-t-0 xl:p-0 xl:last:border-b-0">
                      <td role="cell" className="col-start-1 row-start-1 block self-center text-sm text-muted xl:table-cell xl:whitespace-nowrap xl:px-3 xl:py-4">{transaction.date}</td>
                      <td role="cell" className="col-span-2 row-start-2 block min-w-0 text-sm font-medium [overflow-wrap:anywhere] xl:table-cell xl:px-3 xl:py-4">{transaction.description}</td>
                      <td role="cell" className="col-span-2 row-start-3 block min-w-0 xl:table-cell xl:w-32 xl:px-3 xl:py-4">
                        <label className="block min-w-0 space-y-1.5">
                          <span className="text-sm font-medium text-muted xl:sr-only">Tipo <span className="sr-only">del movimiento {index + 1}</span></span>
                          <select value={transaction.transaction_type} disabled={importing} onChange={event => updateTransactionType(transaction.source_id, event.target.value as TransactionType)}
                            className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 py-2 text-base outline-none transition focus:border-primary disabled:opacity-60 xl:text-sm">
                            <option value={TransactionType.EXPENSE}>Gasto</option><option value={TransactionType.INCOME}>Ingreso</option>
                          </select>
                        </label>
                      </td>
                      <td role="cell" className="col-span-2 row-start-4 block min-w-0 xl:table-cell xl:w-48 xl:px-3 xl:py-4">
                        <label className="block min-w-0 space-y-1.5">
                          <span className="text-sm font-medium text-muted xl:sr-only">Categoría <span className="sr-only">del movimiento {index + 1}</span></span>
                          <select value={transaction.category_id ?? ""} disabled={importing} onChange={event => updateTransactionCategory(transaction.source_id, event.target.value ? Number(event.target.value) : null)}
                            className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 py-2 text-base outline-none transition focus:border-primary disabled:opacity-60 xl:text-sm">
                            <option value="">Sin categoría</option>
                            {categoryGroupsFor(transaction.transaction_type).map(group => <optgroup key={group.root.id} label={group.root.name}>
                              <option value={group.root.id}>{group.children.length > 0 ? `${group.root.name} (sin subcategoría)` : group.root.name}</option>
                              {group.children.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </optgroup>)}
                          </select>
                        </label>
                        {transaction.transaction_type === transaction.original_type && transaction.personalized_category_id && transaction.personalized_category_id !== transaction.category_id ? (
                          <button type="button" disabled={importing} className="mt-1 text-left text-xs text-primary underline"
                            onClick={() => updateTransactionCategory(transaction.source_id, transaction.personalized_category_id)}>
                            Sugerencia personal: {categories.find(item => item.id === transaction.personalized_category_id)?.name}
                          </button>
                        ) : null}
                        {transaction.suggestion_conflict ? <span className="block text-xs text-muted">Hay decisiones anteriores con categorías diferentes; elige la categoría.</span> : null}
                        {transaction.action === "unchanged" && transaction.transaction_type !== transaction.original_type ? (
                          <span className="block text-xs text-muted">La categoría se volverá a calcular al importar.</span>
                        ) : null}
                        {transaction.category_id !== null && transaction.action === "unchanged" ? (
                          <button type="button" disabled={importing} className="mt-1 text-xs text-primary underline"
                            onClick={() => updateTransactionCategory(transaction.source_id, transaction.category_id)}>
                            Confirmar esta categoría
                          </button>
                        ) : null}
                        {transaction.action !== "unchanged" && transaction.category_id !== null ? (
                          <p className="mt-1 text-xs text-muted">Esta decisión se incorporará al aprendizaje al importar.</p>
                        ) : null}
                      </td>
                      <td role="cell" className={cn("col-start-2 row-start-1 block min-w-0 self-center text-right text-sm font-semibold tabular-nums [overflow-wrap:anywhere] xl:table-cell xl:whitespace-nowrap xl:px-3 xl:py-4", transaction.amount_clp >= 0 ? "text-primary" : "text-danger")}>{currencyFormatter.format(transaction.amount_clp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div> : <EmptyState title="No se detectaron movimientos" description="Revisa el documento o selecciona otra cartola para volver a analizarla." />}

            {preview.preview_lines.length > 0 ? <details className="rounded-xl border border-outline/70 p-3 text-sm">
              <summary className="min-h-8 cursor-pointer font-medium text-primary">Ver texto detectado en el PDF</summary>
              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm leading-5 text-muted [overflow-wrap:anywhere]">{preview.preview_lines.map((line, index) => <p key={index}>{line}</p>)}</div>
            </details> : null}
          </Panel>
          <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-30 flex flex-col gap-3 rounded-2xl border border-outline bg-white/95 p-3 shadow-paper backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-4 lg:bottom-4">
            <div className="min-w-0"><p className="truncate text-sm font-semibold" title={account?.name}>{account?.name}</p>
              <p className="mt-1 text-sm text-muted" role="status">{importing ? "Guardando tus movimientos..." : preview.issues.length > 0 && !issuesAccepted ? "Revisa las diferencias antes de confirmar." : `${summary.count} movimientos · Se guardarán al confirmar.`}</p>
            </div>
            <Button compactOnMobile disabled={summary.count === 0 || !pdfAvailability?.allowed || busy || (preview.issues.length > 0 && !issuesAccepted)} onClick={importDocument}>
              <UploadIcon className="h-5 w-5 shrink-0" />{importing ? "Importando..." : "Confirmar importación"}
            </Button>
          </div>
        </div>
      ) : null}

      {feedbackModal === "issues" && preview?.issues.length ? (
        <PdfImportFeedbackModal
          issues={preview.issues}
          fileName={selectedFile?.name ?? null}
          accountName={account?.name ?? null}
          institutionName={account ? InstitutionLabels[account.institution] : null}
          transactionCount={summary.count}
          acknowledgementChecked={acknowledgementChecked}
          onAcknowledgementChange={setAcknowledgementChecked}
          onAccept={() => {
            setIssuesAccepted(true);
            setFeedbackModal(null);
            scrollTo(previewRef.current);
          }}
          onChangeAccount={() => {
            setFeedbackModal(null);
            scrollTo(accountSelectRef.current);
            accountSelectRef.current?.focus({ preventScroll: true });
          }}
          onReviewMovements={() => {
            setFeedbackModal(null);
            scrollTo(previewRef.current);
          }}
          onClose={() => {
            setFeedbackModal(null);
            setAcknowledgementChecked(issuesAccepted);
          }}
        />
      ) : null}
      {feedbackModal === "error" && codedError ? (
        <PdfImportFeedbackModal
          error={codedError}
          errorTitle={issueTitles[codedError.code] ?? "No pudimos analizar el PDF"}
          fileName={selectedFile?.name ?? null}
          accountName={account?.name ?? null}
          institutionName={account ? InstitutionLabels[account.institution] : null}
          onClose={() => setFeedbackModal(null)}
        />
      ) : null}
    </div>
  );
}
