import { BankIcon, PlusIcon } from "./icons";
import { Button } from "./ui";
import {
  CurrencyCode,
  InstitutionCode,
  InstitutionLabels,
  InstitutionOptions,
} from "../types";

const accountTypeOptions = [
  { value: "credito", label: "Tarjeta de credito" },
  { value: "corriente", label: "Cuenta corriente" },
  { value: "vista", label: "Cuenta vista" },
  { value: "ahorro", label: "Cuenta de ahorro" },
  { value: "prepago", label: "Tarjeta de prepago" },
  { value: "billetera_digital", label: "Billetera digital" },
];

const accountTypeLabels = Object.fromEntries(
  accountTypeOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

export type AccountFormValues = {
  account_type: string;
  account_last4: string;
  currency: CurrencyCode;
  institution: InstitutionCode;
  name: string;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8 backdrop-blur-sm">
      <div className="surface-card w-full max-w-4xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow m-0">{isEditing ? "Editar Tarjeta" : "Nueva Tarjeta"}</p>
            <h2 className="text-4xl font-medium tracking-[-0.04em] text-ink">
              {isEditing ? "Actualizar cuenta o tarjeta" : "Agregar cuenta o tarjeta"}
            </h2>
            <p className="max-w-2xl text-muted">
              Completa los datos principales y revisa al lado como se vera esta tarjeta en el dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-outline bg-white px-3 py-2 text-sm text-muted transition hover:text-ink"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.1fr)] lg:items-center">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-ink">Nombre visible</span>
              <input
                value={form.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Ej: Visa Signature"
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Institucion</span>
              <select
                value={form.institution}
                onChange={(event) => onChange("institution", event.target.value)}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              >
                {InstitutionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Tipo</span>
              <select
                value={form.account_type}
                onChange={(event) => onChange("account_type", event.target.value)}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              >
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-ink">Ultimos 4 digitos</span>
              <input
                value={form.account_last4}
                onChange={(event) => onChange("account_last4", event.target.value)}
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-ink">Moneda</span>
              <input
                value={form.currency}
                disabled
                className="w-full rounded-2xl border border-outline bg-paper-soft px-4 py-3 text-muted outline-none"
              />
            </label>
          </div>

          <div className="flex items-center lg:min-h-full">
            <article className="relative w-full overflow-hidden rounded-[2rem] border border-[#d5d2c7] bg-[linear-gradient(135deg,#f8f5ec_0%,#efe6d5_42%,#d5c09f_100%)] p-6 shadow-[0_28px_70px_rgba(60,47,31,0.18)] md:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.42),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(82,57,24,0.14),transparent_30%)]" />
              <div className="absolute right-6 top-6 h-16 w-16 rounded-full border border-white/45 bg-white/20 blur-[1px]" />
              <div className="absolute right-12 top-10 h-16 w-16 rounded-full border border-white/35 bg-white/10" />

              <div className="relative flex min-h-[230px] flex-col justify-between md:min-h-[245px]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/65 text-primary shadow-sm">
                      <BankIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/55">
                        {InstitutionLabels[form.institution]}
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink md:text-[2rem]">
                        {form.name.trim() || "Tu nueva tarjeta"}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full border border-white/60 bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink/70">
                    {accountTypeLabels[form.account_type] ?? form.account_type}
                  </span>
                </div>

                <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                      Identificador
                    </p>
                    <p className="text-2xl font-medium tracking-[0.22em] text-ink md:text-[1.75rem]">
                      {form.account_last4 ? `**** ${form.account_last4}` : "**** ****"}
                    </p>
                  </div>

                  <div className="space-y-2 text-left md:text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                      Moneda
                    </p>
                    <p className="text-lg font-semibold tracking-[0.08em] text-primary">
                      {form.currency}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            <PlusIcon className="h-5 w-5" />
            {saving
              ? isEditing
                ? "Guardando..."
                : "Creando..."
              : isEditing
                ? "Guardar cambios"
                : "Agregar tarjeta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
