import { InstitutionLogo } from "./InstitutionLogo";
import { InstitutionCode, InstitutionLabels } from "../types";

type CardTheme = { background: string; ink: string; glow: string; accent: string };

const institutionThemes: Record<InstitutionCode, CardTheme> = {
  [InstitutionCode.BANCO_DE_CHILE]: { background: "linear-gradient(125deg, #173f64, #071b33)", ink: "#fff", glow: "#6bd5e2", accent: "#a8e7ee" },
  [InstitutionCode.BANCO_SANTANDER]: { background: "linear-gradient(125deg, #e44d53, #991b31)", ink: "#fff", glow: "#ffbcb9", accent: "#ffe5de" },
  [InstitutionCode.BANCO_ESTADO]: { background: "linear-gradient(125deg, #f09738, #b84731)", ink: "#fff", glow: "#ffd494", accent: "#fff2dc" },
  [InstitutionCode.BANCO_FALABELLA]: { background: "linear-gradient(125deg, #9acb57, #287651)", ink: "#163e27", glow: "#e2f6a7", accent: "#234d32" },
  [InstitutionCode.MERCADOPAGO]: { background: "linear-gradient(125deg, #8dd9e9, #248eb8)", ink: "#073b56", glow: "#e5faff", accent: "#075c78" },
  [InstitutionCode.COPECPAY]: { background: "linear-gradient(125deg, #062bc9 0%, #0738eb 64%, #057fc7 86%, #02bd83 100%)", ink: "#fff", glow: "#00e49c", accent: "#a8ffda" },
};

// Bocetos propios para reconocer productos; no reproducen tarjetas oficiales.
const productThemes: Record<string, CardTheme> = {
  banco_de_chile_cuenta_fan: { background: "linear-gradient(125deg, #a6e5e3, #3f9bad)", ink: "#103d4a", glow: "#fff", accent: "#205d69" },
  banco_de_chile_corriente_digital: institutionThemes[InstitutionCode.BANCO_DE_CHILE],
  banco_de_chile_corriente_tradicional: { background: "linear-gradient(125deg, #244d70, #0c233d)", ink: "#fff", glow: "#93d9e2", accent: "#d0f2f2" },
  banco_de_chile_plan_estudiante: { background: "linear-gradient(125deg, #4e95ae, #1a456d)", ink: "#fff", glow: "#b3e9f2", accent: "#e2faff" },
  banco_de_chile_fan_ahorro: { background: "linear-gradient(125deg, #9bd7c5, #287768)", ink: "#103d35", glow: "#e0fff1", accent: "#175649" },
  banco_de_chile_visa_signature: { background: "linear-gradient(125deg, #29333d, #080d15)", ink: "#f7f2e8", glow: "#c59a5d", accent: "#ddbc87" },
  banco_de_chile_visa_infinite: { background: "linear-gradient(125deg, #1c2735, #03070c)", ink: "#f7f1e4", glow: "#e2bd76", accent: "#f0d69a" },
  banco_de_chile_visa_fan: { background: "linear-gradient(125deg, #95e0de, #318a9d)", ink: "#103c48", glow: "#f2fffe", accent: "#174e5b" },
  banco_de_chile_visa_platinum: { background: "linear-gradient(125deg, #d2d9dd, #677d8b)", ink: "#17313f", glow: "#fff", accent: "#203d4c" },
  banco_de_chile_visa_dorada: { background: "linear-gradient(125deg, #d4aa65, #8b6438)", ink: "#2b211a", glow: "#fff0cc", accent: "#382817" },
  banco_de_chile_mastercard_dorada: { background: "linear-gradient(125deg, #b18a57, #5e4739)", ink: "#fff9ec", glow: "#f4d89e", accent: "#f8e5c0" },
  banco_de_chile_mastercard_platinum: { background: "linear-gradient(125deg, #aebac0, #4d6474)", ink: "#102939", glow: "#effaff", accent: "#173747" },
  banco_de_chile_mastercard_black: { background: "linear-gradient(125deg, #283142, #080e19)", ink: "#fff4e7", glow: "#d9aa70", accent: "#f4d0a0" },
  banco_de_chile_universal: { background: "linear-gradient(125deg, #34799a, #123953)", ink: "#fff", glow: "#9bd4eb", accent: "#d1effb" },
  banco_santander_mas_lucas: { background: "linear-gradient(125deg, #fff3e9, #f9b7ad)", ink: "#6f2637", glow: "#fff", accent: "#8a3044" },
  banco_santander_corriente_digital: institutionThemes[InstitutionCode.BANCO_SANTANDER],
  banco_santander_corriente_life: { background: "linear-gradient(125deg, #eb777b, #9f3041)", ink: "#fff", glow: "#ffd6ce", accent: "#fff0e9" },
  banco_santander_ahorro: { background: "linear-gradient(125deg, #edc9a3, #a95a5a)", ink: "#4b242b", glow: "#fff2d8", accent: "#6d3137" },
  banco_santander_platinum_latam_pass: { background: "linear-gradient(125deg, #4e4d67, #171624)", ink: "#fff", glow: "#e6b7b6", accent: "#f1d8d7" },
  banco_santander_worldmember_latam_pass: { background: "linear-gradient(125deg, #3d3b56, #141624)", ink: "#fff", glow: "#db9eaa", accent: "#f4ced4" },
  banco_santander_life: { background: "linear-gradient(125deg, #ed9c9d, #a73d51)", ink: "#fff", glow: "#ffe6df", accent: "#fff1eb" },
  banco_santander_worldmember_limited_latam_pass: { background: "linear-gradient(125deg, #312e42, #0e101a)", ink: "#fff", glow: "#dcaaae", accent: "#eed0cf" },
  banco_santander_amex_platinum_latam_pass: { background: "linear-gradient(125deg, #b4bec6, #566579)", ink: "#162331", glow: "#f8fcff", accent: "#22374b" },
  banco_santander_gold_latam_pass: { background: "linear-gradient(125deg, #d6af79, #865950)", ink: "#332422", glow: "#fff0ce", accent: "#422c29" },
  banco_estado_cuenta_rut: institutionThemes[InstitutionCode.BANCO_ESTADO],
  banco_estado_cuenta_pro: { background: "linear-gradient(125deg, #dc7730, #833141)", ink: "#fff", glow: "#f8bc72", accent: "#ffdcaa" },
  banco_estado_corriente_digital: { background: "linear-gradient(125deg, #477faf, #173d65)", ink: "#fff", glow: "#f3aa64", accent: "#e0efff" },
  banco_estado_ahorro_premium: { background: "linear-gradient(125deg, #e0a46d, #96584c)", ink: "#fff", glow: "#ffe1ad", accent: "#fff0d3" },
  banco_estado_ahorro_vivienda: { background: "linear-gradient(125deg, #84a88f, #316f6d)", ink: "#fff", glow: "#c9ead1", accent: "#e2f6e9" },
  banco_estado_visa_smart: { background: "linear-gradient(125deg, #204569, #071b31)", ink: "#fff", glow: "#f3a45b", accent: "#c4e1fb" },
  banco_estado_visa_smart_plus: { background: "linear-gradient(125deg, #183c62, #08172a)", ink: "#fff", glow: "#ef9a53", accent: "#f9c999" },
  banco_estado_mastercard_estandar: { background: "linear-gradient(125deg, #cb7555, #73384a)", ink: "#fff", glow: "#ffd0a0", accent: "#ffe1c2" },
  banco_estado_visa_platinum: { background: "linear-gradient(125deg, #9db3c3, #3c5d78)", ink: "#122e44", glow: "#ecf6fc", accent: "#193e56" },
  banco_estado_mastercard_black: { background: "linear-gradient(125deg, #313844, #101925)", ink: "#fff", glow: "#f2a86e", accent: "#ffd4a8" },
  banco_falabella_corriente: institutionThemes[InstitutionCode.BANCO_FALABELLA],
  banco_falabella_vista: { background: "linear-gradient(125deg, #c9e48a, #4b9652)", ink: "#183f2d", glow: "#f3ffd0", accent: "#214d34" },
  banco_falabella_ahorro: { background: "linear-gradient(125deg, #a5ce83, #3d8064)", ink: "#173b29", glow: "#eaffc8", accent: "#214d38" },
  banco_falabella_cmr_mastercard: { background: "linear-gradient(125deg, #4d7152, #152a22)", ink: "#f5ffe9", glow: "#b9df76", accent: "#d7eca5" },
  banco_falabella_cmr_mastercard_premium: { background: "linear-gradient(125deg, #7aa575, #274c42)", ink: "#fff", glow: "#d5f4a1", accent: "#e6f7c8" },
  banco_falabella_cmr_mastercard_elite: { background: "linear-gradient(125deg, #344d3f, #0e211b)", ink: "#f8f8e8", glow: "#c2d984", accent: "#e1edb7" },
  mercadopago_cuenta: institutionThemes[InstitutionCode.MERCADOPAGO],
  copecpay_cuenta_digital: institutionThemes[InstitutionCode.COPECPAY],
};

const kindLabels: Record<string, string> = {
  corriente: "Cuenta corriente",
  vista: "Cuenta vista",
  ahorro: "Cuenta de ahorro",
  billetera_prepago: "Billetera o prepago",
  billetera_digital: "Billetera digital",
  prepago: "Billetera o prepago",
  credito: "Tarjeta de crédito",
  debito: "Cuenta de débito",
};

const shortKindLabels: Record<string, string> = {
  corriente: "Corriente",
  vista: "Vista",
  ahorro: "Ahorro",
  billetera_prepago: "Prepago",
  billetera_digital: "Digital",
  prepago: "Prepago",
  credito: "Crédito",
  debito: "Débito",
};

const kindOverlays: Record<string, string> = {
  corriente: "linear-gradient(145deg, transparent 48%, rgba(255,255,255,0.16) 49%, transparent 66%)",
  vista: "radial-gradient(circle at 78% 42%, rgba(255,255,255,0.24), transparent 42%)",
  ahorro: "linear-gradient(40deg, rgba(125,221,165,0.26), transparent 70%)",
  billetera_prepago: "linear-gradient(40deg, rgba(123,216,255,0.26), transparent 70%)",
  billetera_digital: "linear-gradient(40deg, rgba(123,216,255,0.26), transparent 70%)",
  prepago: "linear-gradient(40deg, rgba(123,216,255,0.26), transparent 70%)",
  credito: "linear-gradient(40deg, rgba(20,25,42,0.3), transparent 70%)",
};

const kindAliases: Record<string, string> = {
  cuenta_corriente: "corriente",
  cuenta_vista: "vista",
  cuenta_de_ahorro: "ahorro",
  cuenta_prepago: "billetera_prepago",
  tarjeta_de_prepago: "billetera_prepago",
  tarjeta_de_credito: "credito",
};

type AccountVisualCardProps = {
  institution: InstitutionCode;
  accountType: string;
  productCode?: string | null;
  productName: string;
  name?: string;
  accountLast4?: string | null;
  currency?: string;
  compact?: boolean;
  preview?: boolean;
  className?: string;
};

export function AccountVisualCard({
  institution, accountType, productCode, productName, name,
  accountLast4, currency = "CLP", compact = false, preview = false, className = "",
}: AccountVisualCardProps) {
  const rawKind = accountType.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[\s_]+/g, "_");
  const kind = kindAliases[rawKind] ?? rawKind;
  const productTheme = productThemes[productCode ?? ""];
  const theme = productTheme ?? institutionThemes[institution];
  const background = productTheme || !kindOverlays[kind]
    ? theme.background
    : `${kindOverlays[kind]}, ${theme.background}`;
  const kindLabel = kindLabels[kind] ?? (accountType || "Cuenta");
  const displayName = name?.trim() || "Tu nombre para esta cuenta";
  const isCopecPay = institution === InstitutionCode.COPECPAY;

  return (
    <div
      role="img"
      aria-label={`${preview ? "Vista previa de" : "Cuenta"} ${productName} de ${InstitutionLabels[institution]}${preview ? "" : `, ${displayName}`}`}
      className={`relative flex aspect-[1.55] min-h-[180px] w-full flex-col justify-between overflow-hidden rounded-[1.6rem] shadow-[0_20px_42px_rgba(21,35,51,0.22)] ${compact ? "p-5" : "p-6 sm:p-7"} ${className}`}
      style={{ background, color: theme.ink }}
    >
      {isCopecPay ? (
        <>
          <div className="pointer-events-none absolute -right-[19%] -top-[28%] h-[145%] w-[46%] rotate-[29deg] bg-white/10" />
          <div className="pointer-events-none absolute -right-[22%] -top-[28%] h-[145%] w-[14%] rotate-[29deg] bg-[#00e49c]/30" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute -right-[15%] -top-[45%] h-[105%] w-[75%] rounded-full opacity-20" style={{ background: theme.glow }} />
          <div className="pointer-events-none absolute -bottom-[75%] right-[10%] h-[120%] w-[80%] rounded-full border opacity-40" style={{ borderColor: theme.glow }} />
        </>
      )}
      {kind === "corriente" ? <div className="pointer-events-none absolute inset-y-0 right-[18%] w-[8%] -skew-x-12 opacity-10" style={{ background: theme.glow }} /> : null}
      {kind === "ahorro" ? <div className="pointer-events-none absolute right-[10%] top-[28%] h-[35%] w-[22%] rounded-full border-2 opacity-40" style={{ borderColor: theme.glow }} /> : null}
      {!isCopecPay && (kind === "billetera_prepago" || kind === "billetera_digital" || kind === "prepago") ? <div className="pointer-events-none absolute right-[10%] top-[30%] h-[28%] w-[28%] rotate-12 rounded-2xl border-2 opacity-40" style={{ borderColor: theme.glow }} /> : null}
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <InstitutionLogo institution={institution} size="sm" className={isCopecPay ? "!h-9 !w-24 !rounded-lg" : "!h-9 !w-12 !rounded-lg"} />
          {!isCopecPay ? <span className="truncate text-xs font-bold sm:text-sm">{InstitutionLabels[institution]}</span> : null}
        </div>
        <span className="max-w-[40%] shrink-0 truncate rounded-full border border-current/30 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.1em]">
          <span className="sm:hidden">{shortKindLabels[kind] ?? kindLabel}</span>
          <span className="hidden sm:inline">{kindLabel}</span>
        </span>
      </div>
      <div className="relative min-w-0 max-w-[88%]">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] opacity-70">Producto financiero</p>
        <p className={`mt-1 line-clamp-2 font-semibold leading-tight tracking-[-0.04em] ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>{productName}</p>
      </div>
      <div className="relative flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {accountLast4 ? <p className="mt-1 text-xs font-semibold tracking-[0.1em] opacity-75">**** {accountLast4}</p> : null}
        </div>
        <span className="text-sm font-bold tracking-[0.1em]" style={{ color: theme.accent }}>{currency}</span>
      </div>
    </div>
  );
}
