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
};

export function PageIntro({
  eyebrow,
  title,
  description,
  period,
  actions,
}: PageIntroProps) {
  return (
    <section className="subtle-divider pb-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-primary">
            {eyebrow ? <p className="eyebrow m-0">{eyebrow}</p> : null}
            {period ? (
              <span className="border-b-2 border-primary pb-1 text-lg font-medium md:text-[1.75rem]">
                {period}
              </span>
            ) : null}
          </div>
          <div className="space-y-3">
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-ink md:text-6xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-lg leading-8 text-muted md:text-[1.35rem]">
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
};

export function Panel({ className, children, ...props }: PanelProps) {
  return (
    <section className={cn("surface-card p-6 md:p-8", className)} {...props}>
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
};

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  helper,
  helperIcon,
  helperTone = "neutral",
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
    <article className="surface-card flex h-full min-h-[190px] flex-col justify-between gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-base font-medium text-muted">{label}</p>
        {icon ? (
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              toneClass,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="space-y-3">
        <strong className="block text-4xl font-semibold tracking-[-0.04em] text-ink md:text-5xl">
          {value}
        </strong>
        {helper ? (
          <p
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
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
};

export function Button({
  className,
  tone = "primary",
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
        "inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
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
        "inline-flex items-center rounded-full border px-4 py-2 text-base transition",
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
