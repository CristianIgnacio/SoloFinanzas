import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]) {
  return values.filter(Boolean).join(" ");
}

type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  period?: ReactNode;
  actions?: ReactNode;
  compactOnMobile?: boolean;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  period,
  actions,
  compactOnMobile = false,
}: PageIntroProps) {
  return (
    <section className={cn("subtle-divider", compactOnMobile ? "pb-5 sm:pb-8" : "pb-8")}>
      <div className={cn("flex flex-col lg:flex-row lg:items-end lg:justify-between", compactOnMobile ? "gap-4 sm:gap-6" : "gap-6")}>
        <div className={cn("min-w-0 max-w-3xl", compactOnMobile ? "space-y-3 sm:space-y-4" : "space-y-4")}>
          <div className="flex flex-wrap items-center gap-4 text-primary">
            {eyebrow ? <p className="eyebrow m-0">{eyebrow}</p> : null}
            {period ? (
              <span className="min-w-0 max-w-full border-b-2 border-primary pb-1 text-base font-medium sm:text-lg">
                {period}
              </span>
            ) : null}
          </div>
          <div className="space-y-3">
            <h1 className="page-title">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  compactOnMobile?: boolean;
  dense?: boolean;
};

export function Panel({ className, children, compactOnMobile = false, dense = false, ...props }: PanelProps) {
  return (
    <section className={cn("surface-card", dense ? "p-3.5 sm:p-5 md:p-7" : compactOnMobile ? "p-4 sm:p-6 md:p-8" : "p-6 md:p-8", className)} {...props}>
      {children}
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "income" | "expense" | "neutral";
  helper?: string;
  helperIcon?: ReactNode;
  helperTone?: "positive" | "negative" | "neutral";
  compactOnMobile?: boolean;
};

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  helper,
  helperIcon,
  helperTone = "neutral",
  compactOnMobile = false,
}: StatCardProps) {
  const toneClass =
    tone === "income"
      ? "bg-primary-mist text-primary"
      : tone === "expense"
        ? "bg-danger-soft text-danger"
        : "bg-paper-soft text-clay";
  const helperToneClass =
    helperTone === "positive"
      ? "bg-primary-mist text-primary"
      : helperTone === "negative"
        ? "bg-danger-soft text-danger"
        : "bg-paper-soft text-muted";

  return (
    <article className={cn("surface-card metric-container flex h-full flex-col justify-between", compactOnMobile ? "min-h-[136px] gap-3 p-4 sm:min-h-[190px] sm:gap-6 sm:p-6" : "min-h-[190px] gap-6 p-6")}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-base font-medium text-muted">{label}</p>
        {icon ? (
          <span
            className={cn(
                compactOnMobile ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12" : "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              toneClass,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className={compactOnMobile ? "min-w-0 space-y-2 sm:space-y-3" : "space-y-3"}>
        <strong className="metric-value text-ink">
          {value}
        </strong>
        {helper ? (
          <p
            className={cn(
              "inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              helperToneClass,
            )}
          >
            {helperIcon ? (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {helperIcon}
              </span>
            ) : null}
            <span className="leading-tight">{helper}</span>
          </p>
        ) : null}
      </div>
    </article>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  compactOnMobile?: boolean;
};

export function Button({
  className,
  tone = "primary",
  compactOnMobile = false,
  type = "button",
  ...props
}: ButtonProps) {
  const toneClass =
    tone === "primary"
      ? "border-primary bg-primary text-white hover:bg-[#2c4127]"
      : tone === "secondary"
        ? "border-outline bg-paper-soft text-ink hover:bg-white"
        : "border-transparent bg-transparent text-muted hover:bg-paper-soft";

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl border font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        compactOnMobile ? "min-h-11 px-3 py-2.5 text-sm sm:px-5 sm:py-3 sm:text-base" : "px-5 py-3 text-base",
        toneClass,
        className,
      )}
      {...props}
    />
  );
}

type TagProps = {
  children: ReactNode;
  active?: boolean;
};

export function Tag({ children, active = false }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition sm:px-4 sm:text-base",
        active
          ? "border-primary bg-primary text-white"
          : "border-outline bg-white text-ink",
      )}
    >
      {children}
    </span>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="surface-card-soft flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <p className="mx-auto max-w-lg text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

type StatusNoticeProps = {
  tone?: "info" | "error" | "success";
  children: ReactNode;
  className?: string;
};

export function StatusNotice({
  tone = "info",
  children,
  className,
}: StatusNoticeProps) {
  const toneClass =
    tone === "error"
      ? "border-danger/30 bg-danger-soft/60 text-danger"
      : tone === "success"
        ? "border-primary/30 bg-primary-mist text-primary"
        : "border-outline bg-paper-soft text-ink";

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", toneClass, className)}>
      {children}
    </div>
  );
}
