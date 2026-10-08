import { useRef } from "react";
import { BankIcon, PlusIcon } from "./icons";
import { AccountVisualCard } from "./AccountVisualCard";
import { Button } from "./ui";
import { useAccountProducts } from "../hooks/useAccountProducts";
import {
  CurrencyCode,
  InstitutionCode,
  InstitutionLabels,
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
  const creditPreviewOnly = selectedKind === "credito" && !originalCredit;
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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="account-form-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-3 py-4 backdrop-blur-sm sm:px-5">
      <div className="surface-card max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto p-5 sm:p-7 lg:p-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow m-0">{isEditing ? "Editar cuenta" : "Nueva cuenta"}</p>
            <h2 id="account-form-title" className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
              {isEditing ? "Actualiza tu cuenta" : "Elige tu producto financiero"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
              Recorre institución, tipo de cuenta y producto. La vista previa cambia con tu selección.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-full border border-outline bg-white px-3 py-2 text-sm text-muted transition hover:text-ink">
            Cerrar
          </button>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <div className="rounded-[1.5rem] border border-outline/80 bg-paper-soft/50 p-4 sm:p-5">
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-muted">Define tu cuenta</p>
              <div className="space-y-5">
                <label className="block space-y-2">
                  <span className="flex items-center gap-3 text-sm font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs text-white">1</span> Institución</span>
                  <select value={form.institution} onChange={(event) => changeInstitution(event.target.value)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-ink outline-none transition focus:border-primary">
                    {InstitutionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="flex items-center gap-3 text-sm font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs text-white">2</span> Tipo de cuenta</span>
                  <select value={selectedKind} onChange={(event) => changeKind(event.target.value)} disabled={selectorsDisabled} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-ink outline-none transition focus:border-primary disabled:opacity-60">
                    <option value="">Selecciona un tipo de cuenta</option>
                    {showLegacyType ? <option value={original.accountType}>Tipo anterior: {kindLabels[original.accountType] ?? original.accountType}</option> : null}
                    {availableKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="flex items-center gap-3 text-sm font-semibold text-ink"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs text-white">3</span> Producto</span>
                  <select value={form.product_code} onChange={(event) => changeProduct(event.target.value)} disabled={selectorsDisabled || !selectedKind || Boolean(legacyKind)} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 text-ink outline-none transition focus:border-primary disabled:opacity-60">
                    <option value="">{isEditing ? "Sin producto asignado" : "Selecciona un producto"}</option>
                    {availableProducts.map((product) => <option key={product.code} value={product.code}>{product.name}</option>)}
                  </select>
                </label>
              </div>
              {loadingCatalog ? <p className="mt-4 text-xs text-muted">Cargando productos...</p> : null}
              {catalogError ? <p className="mt-4 text-xs text-danger">{catalogError}</p> : null}
            </div>

          </div>

          <div className="rounded-[1.75rem] border border-outline/80 bg-[#f4f6f5] p-4 sm:p-6 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Vista previa</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">Así se verá tu cuenta</h3>
              </div>
              <span className="rounded-full border border-outline bg-white px-3 py-1 text-xs font-medium text-muted">Diseño conceptual</span>
            </div>

            <AccountVisualCard
              institution={form.institution}
              accountType={selectedKind}
              productCode={form.product_code || availableProducts[0]?.code}
              productName={selectedProduct?.name ?? (selectedKind ? "Elige un producto" : "Tu próxima cuenta")}
              name={form.name}
              accountLast4={form.account_last4}
              currency={form.currency}
              preview
              className="transition-transform duration-300 hover:-translate-y-1"
            />

            <div className="mt-5 grid grid-cols-3 items-center gap-2 text-center text-xs font-semibold">
              <span className="rounded-xl bg-white px-2 py-2 text-primary">Institución ✓</span>
              <span className={`rounded-xl px-2 py-2 ${selectedKind ? "bg-white text-primary" : "bg-white/55 text-muted"}`}>Tipo {selectedKind ? "✓" : "·"}</span>
              <span className={`rounded-xl px-2 py-2 ${selectedProduct ? "bg-white text-primary" : "bg-white/55 text-muted"}`}>Producto {selectedProduct ? "✓" : "·"}</span>
            </div>
            <div className="mt-4 flex items-start gap-3 border-t border-outline/80 pt-4 text-sm text-muted">
              <BankIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>{selectedProduct ? `${selectedProduct.name} es un producto de ${InstitutionLabels[form.institution]}.` : "Selecciona un producto para completar la vista previa."} Este boceto ayuda a identificar la cuenta; no representa una tarjeta emitida.</p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-outline/80 bg-white p-4 sm:p-5 lg:col-start-1 lg:row-start-2">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-muted">Detalles de tu cuenta</p>
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink">Nombre visible</span>
                <input value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Ej: Mi cuenta para gastos" className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary" />
              </label>
              <label className="block max-w-xs space-y-2">
                <span className="text-sm font-semibold text-ink">Últimos 4 de la cuenta <span className="font-normal text-muted">(opcional)</span></span>
                <input value={form.account_last4} onChange={(event) => onChange("account_last4", event.target.value)} placeholder="1234" inputMode="numeric" maxLength={4} className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary" />
              </label>
            </div>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger">{error}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-outline/70 pt-5 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={saving || selectorsDisabled || creditPreviewOnly}>
            <PlusIcon className="h-5 w-5" />
            {saving ? (isEditing ? "Guardando..." : "Creando...") : (isEditing ? "Guardar cambios" : "Agregar cuenta")}
          </Button>
        </div>
      </div>
    </div>
  );
}
