import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PlusIcon } from "./icons";
import { AccountVisualCard } from "./AccountVisualCard";
import { Button } from "./ui";
import { useAccountProducts } from "../hooks/useAccountProducts";
import {
  CurrencyCode,
  InstitutionCode,
  InstitutionOptions,
} from "../types";
import type { FinancialProduct } from "../types";

type AccountKind = FinancialProduct["kind"];

const accountKinds: { value: AccountKind; label: string }[] = [
  { value: "corriente", label: "Cuenta corriente" },
  { value: "vista", label: "Cuenta vista" },
  { value: "ahorro", label: "Cuenta de ahorro" },
  { value: "billetera_prepago", label: "Billetera o prepago" },
  { value: "credito", label: "Tarjeta de crédito" },
];

const kindLabels: Record<string, string> = {
  ...Object.fromEntries(accountKinds.map(({ value, label }) => [value, label])),
  prepago: "Billetera o prepago",
  billetera_digital: "Billetera digital",
};

export type AccountFormValues = {
  account_type: string;
  account_last4: string;
  currency: CurrencyCode;
  institution: InstitutionCode;
  name: string;
  product_code: string;
};

type AccountFormModalProps = {
  error: string | null;
  form: AccountFormValues;
  mode: "create" | "edit";
  onChange: (field: keyof AccountFormValues, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
};

export function AccountFormModal({
  error,
  form,
  mode,
  onChange,
  onClose,
  onSubmit,
  saving,
}: AccountFormModalProps) {
  const isEditing = mode === "edit";
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const original = useRef({ accountType: form.account_type, institution: form.institution }).current;
  const { products, loading: loadingCatalog, error: catalogError } = useAccountProducts();
  const selectedProduct = products.find((product) => product.code === form.product_code);
  const selectedKind = selectedProduct?.kind ?? form.account_type;
  const institutionProducts = products.filter((product) => product.institution === form.institution);
  const availableKinds = accountKinds.filter((kind) =>
    institutionProducts.some((product) => product.kind === kind.value),
  );
  const legacyKind = selectedKind && !availableKinds.some((kind) => kind.value === selectedKind);
  const showLegacyType = isEditing && form.institution === original.institution
    && original.accountType && !accountKinds.some((kind) => kind.value === original.accountType);
  const availableProducts = institutionProducts.filter((product) => product.kind === selectedKind);
  const originalCredit = isEditing && ["credito", "tarjeta de credito", "tarjeta de crédito"].includes(original.accountType.toLowerCase());
  const creditPreviewOnly = selectedKind === "credito" && !originalCredit
    && (!selectedProduct || selectedProduct.pdf_support === "no_soportado");
  const selectorsDisabled = loadingCatalog || Boolean(catalogError);

  const changeInstitution = (institution: string) => {
    onChange("institution", institution);
    onChange("account_type", "");
    onChange("product_code", "");
  };

  const changeKind = (kind: string) => {
    onChange("account_type", kind);
    onChange("product_code", "");
  };

  const changeProduct = (code: string) => {
    onChange("product_code", code);
    const product = products.find((item) => item.code === code);
    if (product) onChange("account_type", product.kind);
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });

    // The on-screen keyboard can resize the visual viewport without changing 100dvh.
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!viewport || viewport.scale !== 1) return;
      overlayRef.current?.style.setProperty("--account-modal-height", `${viewport.height}px`);
      overlayRef.current?.style.setProperty("--account-modal-top", `${viewport.offsetTop}px`);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const fieldClassName = "h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 text-base text-ink outline-none transition focus:border-primary disabled:opacity-60 sm:h-10 sm:rounded-lg sm:text-sm";

  return createPortal(
    <div ref={overlayRef} role="dialog" aria-modal="true" aria-labelledby="account-form-title" aria-describedby="account-form-description"
      className="fixed inset-x-0 top-[var(--account-modal-top,0px)] z-50 flex h-[min(100dvh,var(--account-modal-height,100dvh))] items-center justify-center bg-ink/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!saving) onClose();
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) ?? []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <form ref={panelRef} tabIndex={-1} noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !selectorsDisabled && !creditPreviewOnly) onSubmit();
        }}
        className="surface-card flex max-h-full w-full max-w-[820px] min-w-0 flex-col overflow-hidden outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-outline/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{isEditing ? "Editar cuenta" : "Nueva cuenta"}</p>
            <h2 id="account-form-title" className="dialog-title">
              {isEditing ? "Actualiza tu cuenta" : "Elige tu producto financiero"}
            </h2>
            <p id="account-form-description" className="mt-1 text-sm leading-6 text-muted">Completa los datos para identificar tu cuenta.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline text-muted transition hover:bg-paper-soft hover:text-ink disabled:opacity-50">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-3 py-3 [scroll-padding-block:12px] sm:px-5">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-outline bg-white p-3 sm:px-4 md:col-span-2">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">Detalles de tu cuenta</p>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-semibold text-ink">Nombre visible</span>
                <input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Ej: Mi cuenta para gastos" autoComplete="off" className={fieldClassName} />
              </label>
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-semibold text-ink">Últimos 4 {selectedKind === "credito" ? "de la tarjeta" : "de la cuenta"} <span className="font-normal text-muted">(opcional)</span></span>
                <input value={form.account_last4} onChange={(event) => onChange("account_last4", event.target.value)} placeholder="1234" inputMode="numeric" maxLength={4} autoComplete="off" className={fieldClassName} />
              </label>
            </div>
            </div>
          <div className="min-w-0 space-y-2.5 rounded-2xl border border-outline bg-paper-soft/50 p-3 sm:px-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Define tu cuenta</p>
                <label className="block space-y-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-white">1</span> Institución</span>
                  <select value={form.institution} onChange={(event) => changeInstitution(event.target.value)} className={fieldClassName}>
                    {InstitutionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-white">2</span> Tipo de cuenta</span>
                  <select value={selectedKind} onChange={(event) => changeKind(event.target.value)} disabled={selectorsDisabled} className={fieldClassName}>
                    <option value="">Selecciona un tipo de cuenta</option>
                    {showLegacyType ? <option value={original.accountType}>Tipo anterior: {kindLabels[original.accountType] ?? original.accountType}</option> : null}
                    {availableKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-white">3</span> Producto</span>
                  <select value={form.product_code} onChange={(event) => changeProduct(event.target.value)} disabled={selectorsDisabled || !selectedKind || Boolean(legacyKind)} className={fieldClassName}>
                    <option value="">{isEditing ? "Sin producto asignado" : "Selecciona un producto"}</option>
                    {availableProducts.map((product) => <option key={product.code} value={product.code}>{product.name}</option>)}
                  </select>
                </label>
            {loadingCatalog ? <p className="text-sm text-muted">Cargando productos...</p> : null}
            {catalogError ? <p className="text-sm text-danger">{catalogError}</p> : null}

          </div>

          <div className="flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-outline bg-[#f4f6f5] p-3 sm:px-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Vista previa</p>
            <div className="mx-auto w-full max-w-[300px]">
            <AccountVisualCard
              institution={form.institution}
              accountType={selectedKind}
              productCode={form.product_code || availableProducts[0]?.code}
              productName={selectedProduct?.name ?? (selectedKind ? "Elige un producto" : "Tu próxima cuenta")}
              name={form.name}
              accountLast4={form.account_last4}
              currency={form.currency}
              compact
              compactOnDesktop
              preview
              className="!aspect-auto min-h-[196px] gap-3 !p-4 sm:min-h-[180px] sm:gap-2"
            />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-semibold">
              <span className="rounded-lg bg-white px-1 py-1 text-primary">Institución ✓</span>
              <span className={`rounded-lg px-1 py-1 ${selectedKind ? "bg-white text-primary" : "bg-white/55 text-muted"}`}>Tipo {selectedKind ? "✓" : "·"}</span>
              <span className={`rounded-lg px-1 py-1 ${selectedProduct ? "bg-white text-primary" : "bg-white/55 text-muted"}`}>Producto {selectedProduct ? "✓" : "·"}</span>
            </div>
          </div>

          </div>

          {error ? <div ref={errorRef} role="alert" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft/60 px-3 py-2 text-sm text-danger [overflow-wrap:anywhere]">{error}</div> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-outline/70 bg-white px-4 py-3 sm:px-5">
          <Button compactOnMobile className="!text-sm" tone="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button compactOnMobile type="submit" className="min-w-0 flex-1 !text-sm sm:flex-none" disabled={saving || selectorsDisabled || creditPreviewOnly}>
            <PlusIcon className="h-4 w-4 shrink-0" />
            {saving ? (isEditing ? "Guardando..." : "Creando...") : (isEditing ? "Guardar cambios" : "Agregar cuenta")}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
