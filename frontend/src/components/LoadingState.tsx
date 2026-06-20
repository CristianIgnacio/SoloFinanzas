type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "Cargando..." }: LoadingStateProps) {
  return (
    <div className="surface-card-soft flex items-center gap-3 px-4 py-3 text-sm text-muted">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
      <p className="m-0">{message}</p>
    </div>
  );
}
