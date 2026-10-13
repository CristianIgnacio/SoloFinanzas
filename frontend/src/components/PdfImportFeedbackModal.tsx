import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { PdfPreview } from "../types";
import { BankIcon, PdfIcon, WarningIcon } from "./icons";
import { Button } from "./ui";

type ImportError = { code: string; message: string; action: string };

type PdfImportFeedbackModalProps = {
  issues?: PdfPreview["issues"];
  error?: ImportError;
  errorTitle?: string;
  fileName: string | null;
  accountName: string | null;
  institutionName: string | null;
  transactionCount?: number;
  acknowledgementChecked?: boolean;
  onAcknowledgementChange?: (checked: boolean) => void;
  onAccept?: () => void;
  onChangeAccount?: () => void;
  onReviewMovements?: () => void;
  onClose: () => void;
};

const issueTitles: Record<string, string> = {
  BANK_MISMATCH: "El banco es distinto",
  DOCUMENT_TYPE_MISMATCH: "El tipo de documento es distinto",
  CARD_LAST4_MISMATCH: "La tarjeta es distinta",
  CARD_LAST4_UNREADABLE: "No pudimos comprobar la tarjeta",
  CARD_LAST4_NOT_CONFIGURED: "Falta identificar la tarjeta",
  TOTAL_MISMATCH: "Los movimientos no cuadran",
  ROWS_UNREADABLE: "Hay filas sin interpretar",
};

export function PdfImportFeedbackModal({
  issues = [], error, errorTitle, fileName, accountName, institutionName,
  transactionCount, acknowledgementChecked = false, onAcknowledgementChange,
  onAccept, onChangeAccount, onReviewMovements, onClose,
}: PdfImportFeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const restoreFocusRef = useRef(true);
  onCloseRef.current = onClose;
  const hasIssues = issues.length > 0;
  const canChangeAccount = issues.some((issue) => [
    "BANK_MISMATCH", "DOCUMENT_TYPE_MISMATCH", "CARD_LAST4_MISMATCH", "CARD_LAST4_NOT_CONFIGURED",
  ].includes(issue.code));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocusRef.current) previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 px-3 py-5 backdrop-blur-md sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-feedback-title"
        aria-describedby="pdf-feedback-description"
        className="flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(23,32,20,0.35)]"
      >
        <div className="relative overflow-hidden bg-[linear-gradient(125deg,#fff1e9_0%,#fce0d5_56%,#fff8ee_100%)] px-6 py-7 sm:px-9 sm:py-9">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-danger/15 bg-white/20" />
          <div className="relative flex items-start gap-4 pr-8 sm:gap-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-danger text-white shadow-[0_10px_24px_rgba(150,59,49,0.24)] sm:h-16 sm:w-16 sm:rounded-[1.35rem]">
              <WarningIcon className="h-6 w-6 sm:h-7 sm:w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-xs font-bold uppercase tracking-[0.17em] text-danger">
                {hasIssues ? "Revisión necesaria" : "No pudimos continuar"}
              </p>
              <h2 id="pdf-feedback-title" className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-4xl">
                {hasIssues ? "Hay diferencias en tu documento" : errorTitle ?? "No pudimos analizar el PDF"}
              </h2>
              <p id="pdf-feedback-description" className="mt-3 max-w-xl text-sm leading-6 text-ink/75 sm:text-base">
                {hasIssues
                  ? "Analizamos el PDF, pero hay datos que debes revisar antes de guardarlos. Tú decides si esta cuenta es la correcta."
                  : "Revisa el detalle y corrige el archivo o la configuración para volver a intentarlo."}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar ventana"
              className="absolute right-0 top-0 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-danger/20 bg-white/70 text-xl leading-none text-ink transition hover:bg-white"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6 sm:px-9">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-outline bg-paper-soft/70 p-4">
              <PdfIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Documento</p>
                <p className="truncate font-semibold text-ink" title={fileName ?? undefined}>{fileName ?? "PDF seleccionado"}</p>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-outline bg-paper-soft/70 p-4">
              <BankIcon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Cuenta de destino</p>
                <p className="truncate font-semibold text-ink" title={accountName ?? undefined}>{accountName ?? "Sin cuenta"}</p>
                {institutionName ? <p className="text-xs text-muted">{institutionName}</p> : null}
              </div>
            </div>
          </div>

          {hasIssues ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{issues.length} {issues.length === 1 ? "diferencia detectada" : "diferencias detectadas"}</p>
                <span className="rounded-full bg-primary-mist px-3 py-1 text-xs font-semibold text-primary">
                  {transactionCount ?? 0} movimientos detectados
                </span>
              </div>
              <ol className="space-y-3">
                {issues.map((issue, index) => (
                  <li key={issue.code} className="flex gap-4 rounded-2xl border border-danger/20 bg-danger-soft/40 p-4 sm:p-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-sm font-bold text-white">{index + 1}</span>
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-semibold text-ink">{issueTitles[issue.code] ?? "Dato por revisar"}</h3>
                      <p className="text-sm leading-6 text-ink/80">{issue.message}</p>
                      <p className="text-sm leading-6 text-danger">{issue.action}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-primary/25 bg-primary-mist/60 p-4 sm:p-5">
                <input
                  type="checkbox"
                  checked={acknowledgementChecked}
                  onChange={(event) => onAcknowledgementChange?.(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-primary"
                />
                <span className="text-sm font-medium leading-6 text-ink">
                  Revisé las diferencias y acepto guardar los movimientos detectados en {accountName ?? "esta cuenta"} bajo mi responsabilidad.
                </span>
              </label>
            </>
          ) : error ? (
            <div className="rounded-2xl border border-danger/25 bg-danger-soft/50 p-5">
              <p className="text-lg font-semibold text-ink">{error.message}</p>
              {error.action ? <p className="mt-2 leading-6 text-danger">{error.action}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-outline bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9">
          {hasIssues && canChangeAccount ? (
            <Button tone="ghost" onClick={() => {
              restoreFocusRef.current = false;
              onChangeAccount?.();
            }} className="sm:mr-auto">Cambiar cuenta</Button>
          ) : <span />}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button tone="secondary" onClick={hasIssues ? () => {
              restoreFocusRef.current = false;
              onReviewMovements?.();
            } : onClose}>
              {hasIssues ? "Revisar movimientos" : "Cerrar"}
            </Button>
            {hasIssues ? (
              <Button onClick={() => {
                restoreFocusRef.current = false;
                onAccept?.();
              }} disabled={!acknowledgementChecked} className="border-danger bg-danger text-white hover:bg-[#9d4337]">
                Continuar con esta cuenta
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
