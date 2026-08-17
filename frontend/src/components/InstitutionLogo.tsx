import bancoDeChileLogo from "../assets/institutions/banco_de_chile.png";
import bancoEstadoLogo from "../assets/institutions/banco_estado.png";
import bancoSantanderLogo from "../assets/institutions/banco_santander.png";
import copecPayLogo from "../assets/institutions/copec_pay.webp";
import mercadoPagoLogo from "../assets/institutions/mercadopago.png";
import { InstitutionCode, InstitutionLabels } from "../types";

type InstitutionLogoProps = {
  institution: InstitutionCode;
  className?: string;
  size?: "lg" | "md" | "sm";
};

const institutionLogos: Partial<Record<InstitutionCode, string>> = {
  [InstitutionCode.BANCO_DE_CHILE]: bancoDeChileLogo,
  [InstitutionCode.BANCO_ESTADO]: bancoEstadoLogo,
  [InstitutionCode.BANCO_SANTANDER]: bancoSantanderLogo,
  [InstitutionCode.COPECPAY]: copecPayLogo,
  [InstitutionCode.MERCADOPAGO]: mercadoPagoLogo,
};

const fallbackLabels: Record<InstitutionCode, string> = {
  [InstitutionCode.BANCO_DE_CHILE]: "BC",
  [InstitutionCode.BANCO_ESTADO]: "BE",
  [InstitutionCode.BANCO_SANTANDER]: "ST",
  [InstitutionCode.COPECPAY]: "CP",
  [InstitutionCode.MERCADOPAGO]: "MP",
};

export function InstitutionLogo({
  institution,
  className = "",
  size = "md",
}: InstitutionLogoProps) {
  const logo = institutionLogos[institution];
  const label = InstitutionLabels[institution];
  const containerClass =
    size === "sm"
      ? "flex h-5 w-8 shrink-0 items-center justify-center rounded-md bg-white"
      : size === "lg"
        ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-outline bg-white shadow-sm"
        : "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline bg-white shadow-sm";
  const imageClass =
    size === "sm" ? "max-h-4 max-w-7" : size === "lg" ? "max-h-10 max-w-12" : "max-h-8 max-w-10";
  const fallbackClass =
    size === "sm"
      ? "text-[0.6rem] font-bold tracking-[0.04em] text-primary"
      : "text-xs font-bold tracking-[0.08em] text-primary";

  return (
    <span
      className={`${containerClass} ${className}`}
      title={label}
      aria-label={label}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          className={`${imageClass} object-contain`}
          loading="lazy"
        />
      ) : (
        <span className={fallbackClass}>{fallbackLabels[institution]}</span>
      )}
    </span>
  );
}


