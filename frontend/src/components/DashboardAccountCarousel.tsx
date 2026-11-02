import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, PlusIcon, ReceiptIcon, UploadIcon } from "./icons";

type CarouselAccount = { id: number; name: string; cash?: boolean; card: ReactNode };

export function DashboardAccountCarousel({ accounts, onAddAccount }: {
  accounts: CarouselAccount[];
  onAddAccount: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const index = Math.max(0, accounts.findIndex(account => account.id === selectedId));
  const selected = accounts[index];
  if (!selected) return null;

  const select = (next: number) => {
    const container = track.current;
    const slide = container?.children[next] as HTMLElement | undefined;
    if (!container || !slide || !accounts[next]) return;
    container.scrollTo({ left: container.scrollLeft + slide.getBoundingClientRect().left - container.getBoundingClientRect().left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const shortcut = "flex min-w-0 flex-col items-center gap-2 rounded-xl text-center text-xs font-medium leading-4 text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
  const circle = "flex h-11 w-11 items-center justify-center rounded-full border border-primary/25 bg-primary-mist/40";
  return <div className="min-w-0 sm:hidden">
    <div ref={track} role="region" aria-roledescription="carrusel" aria-label="Tus cuentas" tabIndex={0}
      onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          select(Math.min(accounts.length - 1, Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1))));
        }
      }}
      onScroll={() => {
        const container = track.current;
        if (!container) return;
        const left = container.getBoundingClientRect().left;
        let nearest = 0;
        let distance = Infinity;
        accounts.forEach((_, i) => {
          const delta = Math.abs(container.children[i].getBoundingClientRect().left - left);
          if (delta < distance) { distance = delta; nearest = i; }
        });
        setSelectedId(accounts[nearest].id);
      }}
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {accounts.map(account => <div key={account.id} role="group" aria-roledescription="tarjeta" aria-label={account.name}
        className={`min-w-0 shrink-0 snap-start ${accounts.length === 1 ? "basis-full" : "basis-[92%]"}`}>
        <Link to={`/app/accounts?account_id=${account.id}${account.cash ? "#cash-account" : ""}`} aria-label={`Ver datos de ${account.name}`} className="block rounded-[1.6rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{account.card}</Link>
      </div>)}
      {accounts.length > 1 && <div aria-hidden="true" className="basis-[8%] shrink-0" />}
    </div>
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label="Cuenta anterior" disabled={index === 0} onClick={() => select(index - 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary disabled:opacity-25"><ChevronLeftIcon className="h-4 w-4" /></button>
      <p aria-live="polite" className="min-w-0 text-center text-xs text-muted"><span className="block truncate font-medium text-ink">{selected.name}</span>{index + 1} de {accounts.length}</p>
      <button type="button" aria-label="Cuenta siguiente" disabled={index === accounts.length - 1} onClick={() => select(index + 1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary disabled:opacity-25"><ChevronRightIcon className="h-4 w-4" /></button>
    </div>
    <nav aria-label={`Atajos de ${selected.name}`} className="mt-3 grid grid-cols-4 items-start gap-1 border-t border-outline/60 pb-2 pt-4">
      <Link className={shortcut} to={`/app/accounts?account_id=${selected.id}${selected.cash ? "#cash-account" : ""}`}><span className={circle}><EyeIcon className="h-5 w-5" /></span>Ver datos</Link>
      <Link className={shortcut} aria-label={`Ver movimientos de ${selected.name}`} to={`/app/transactions?account_id=${selected.id}`}><span className={circle}><ReceiptIcon className="h-5 w-5" /></span>Ver movs.</Link>
      <Link className={shortcut} to={selected.cash ? `/app/transactions?account_id=${selected.id}&new_movement=1` : `/app/import?account_id=${selected.id}`}><span className={circle}>{selected.cash ? <PlusIcon className="h-5 w-5" /> : <UploadIcon className="h-5 w-5" />}</span>{selected.cash ? "Registrar" : "Subir cartola"}</Link>
      <button type="button" className={shortcut} onClick={onAddAccount}><span className={circle}><PlusIcon className="h-5 w-5" /></span>Agregar cuenta</button>
    </nav>
  </div>;
}
