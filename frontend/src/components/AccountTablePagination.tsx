import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Button } from "./ui";

type Props = {
  total: number;
  pageSize: number;
  offset: number;
  disabled?: boolean;
  label?: string;
  showTotal?: boolean;
  onOffsetChange: (offset: number) => void;
};

export function AccountTablePagination({ total, pageSize, offset, disabled = false, label = "Paginación de movimientos de la cuenta", showTotal = true, onOffsetChange }: Props) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  return (
    <div className="space-y-2 border-t border-outline/60 pt-3 sm:py-4">
      {showTotal && <p role="status" className="text-center text-sm text-muted">{Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)} de {total} movimientos</p>}
      <nav aria-label={label} className="flex items-center justify-between gap-2 sm:justify-center sm:gap-3">
        <Button tone="secondary" aria-label="Anterior" className="min-h-11 min-w-11 !px-3" disabled={disabled || offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}>
          <ChevronLeftIcon className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Anterior</span>
        </Button>
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Página</span>
          <select aria-label="Ir a la página" className="min-h-11 min-w-0 rounded-xl border border-outline bg-white px-2 text-base font-semibold text-ink" value={currentPage} disabled={disabled} onChange={event => onOffsetChange((Number(event.target.value) - 1) * pageSize)}>
            {Array.from({ length: pages }, (_, index) => index + 1).map(page => <option key={page} value={page}>{page}</option>)}
          </select>
          <span>de {pages}</span>
        </label>
        <Button tone="secondary" aria-label="Siguiente" className="min-h-11 min-w-11 !px-3" disabled={disabled || offset + pageSize >= total} onClick={() => onOffsetChange(offset + pageSize)}>
          <ChevronRightIcon className="h-5 w-5 sm:hidden" /><span className="hidden sm:inline">Siguiente</span>
        </Button>
      </nav>
    </div>
  );
}
