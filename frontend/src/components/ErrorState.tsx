type ErrorStateProps = {
  message: string;
};

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-danger/25 bg-danger-soft/50 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}
