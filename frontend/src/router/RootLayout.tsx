import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  BankIcon,
  CategoriesIcon,
  DashboardIcon,
  LogoMark,
  MoreIcon,
  PdfIcon,
  PlusIcon,
  WalletIcon,
  ReportIcon,
  SignOutIcon,
  TrendLineIcon,
  UserCircleIcon,
  cn,
} from "../components";

const navItems = [
  { to: "/app", label: "Inicio", icon: DashboardIcon },
  { to: "/app/transactions", label: "Movimientos", icon: ReportIcon },
  { to: "/app/analytics", label: "Análisis", icon: TrendLineIcon },
  { to: "/app/accounts", label: "Cuentas", icon: BankIcon },
];

const organizationItem = {
  to: "/app/categories",
  label: "Categorías",
  icon: CategoriesIcon,
};
const OrganizationIcon = organizationItem.icon;

export function RootLayout() {
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const { session } = useAuth();
  const [mobileMenu, setMobileMenu] = useState<"more" | "add" | null>(null);
  const moreOpen = mobileMenu === "more";
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  const name = session?.user.user_metadata.full_name || session?.user.email || "Mi espacio";
  const moreIsActive = ["/app/accounts", "/app/categories", "/app/profile"].some((path) =>
    location.pathname.startsWith(path),
  );

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => header.parentElement?.style.setProperty("--app-header-height", `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (location.hash) return;
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const currentSection =
    location.pathname.startsWith("/app/import")
      ? "Importar cartola"
      : location.pathname.startsWith("/app/categories")
        ? "Organización · Categorías"
        : location.pathname.startsWith("/app/profile")
          ? "Perfil"
          : navItems.find((item) =>
              item.to === "/app"
                ? location.pathname === "/app"
                : location.pathname.startsWith(item.to),
            )?.label ?? "SoloFinanzas";

  const navLinkClass = (isActive: boolean, compact = false) =>
    cn(
      compact
        ? "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition"
        : "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3.5 text-[1.05rem] font-medium transition",
      isActive
        ? compact
          ? "border-primary bg-primary text-white"
          : "bg-primary/10 text-primary"
        : compact
          ? "border-outline bg-white text-ink"
          : "text-ink/75 hover:border-outline/70 hover:bg-white hover:text-ink",
    );

  useEffect(() => {
    setMobileMenu(null);
  }, [location.key]);

  useEffect(() => {
    if (!mobileMenu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = mobileDialogRef.current;
    const trigger = mobileMenu === "add" ? addButtonRef.current : moreButtonRef.current;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileMenu(null); };
    desktop.addEventListener("change", closeOnDesktop);
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
    );
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenu(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", closeOnDesktop);
      trigger?.focus();
    };
  }, [mobileMenu]);

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-outline/70 bg-paper/90 lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:flex-col lg:justify-between lg:px-5 lg:py-7">
        <div className="space-y-9">
          <div className="flex items-center gap-3">
            <span className="text-primary"><LogoMark className="h-12 w-12" /></span>
            <div>
              <p className="text-[1.8rem] font-semibold tracking-[-0.05em] text-primary">SoloFinanzas</p>
              <p className="text-base text-muted">Gestión personal</p>
            </div>
          </div>

          <nav aria-label="Navegación principal" className="space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === "/app"} className={({ isActive }) => navLinkClass(isActive)}>
                {({ isActive }) => <>
                  <Icon className="h-6 w-6 shrink-0" />
                  <span>{label}</span>
                  {isActive ? <span className="absolute bottom-3 right-0 top-3 w-1 rounded-full bg-primary" /> : null}
                </>}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-3">
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Organización</p>
            <NavLink to={organizationItem.to} className={({ isActive }) => navLinkClass(isActive)}>
              {({ isActive }) => <>
                <OrganizationIcon className="h-6 w-6 shrink-0" />
                <span>{organizationItem.label}</span>
                {isActive ? <span className="absolute bottom-3 right-0 top-3 w-1 rounded-full bg-primary" /> : null}
              </>}
            </NavLink>
          </div>

          <Link to="/app/import" className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-semibold text-white transition hover:bg-primary/90">
            <PdfIcon className="h-5 w-5" />
            Importar cartola
          </Link>
        </div>

        <div className="space-y-6">
          <div className="subtle-divider" />
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {String(name).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <Link to="/app/profile" className="block truncate font-medium">{name}</Link>
              <p className="text-sm text-muted">Perfil y sesión</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header ref={headerRef} className="subtle-divider sticky top-0 z-20 bg-paper/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10 xl:px-12">
            <div className="flex items-center gap-4">
              <span className="text-primary lg:hidden"><LogoMark className="h-11 w-11" /></span>
              <div className="space-y-1">
                <p className="text-3xl font-semibold tracking-[-0.04em] text-primary lg:hidden">SoloFinanzas</p>
                <p className="text-lg font-medium text-primary">{currentSection}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-ink">
              <button onClick={() => void supabase?.auth.signOut({ scope: "local" })} className="hidden rounded-full px-3 py-2 text-sm lg:inline-flex">Salir</button>
              <Link
                aria-label="Mi perfil"
                to="/app/profile"
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-white text-primary transition hover:border-primary/40 hover:bg-primary-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:inline-flex"
              >
                <UserCircleIcon className="h-6 w-6" />
              </Link>
            </div>
          </div>

        </header>

        <main className="min-w-0 flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-10 lg:py-10 xl:px-12">
          <div className="mx-auto max-w-[1280px]"><Outlet /></div>
        </main>

        <footer className="subtle-divider mt-auto bg-white/70">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-4 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10 xl:px-12">
            <p className="m-0">SoloFinanzas · Beta · Tu espacio privado</p>
            <div className="flex gap-6"><Link to="/privacy">Privacidad</Link><Link to="/help">Ayuda</Link></div>
          </div>
        </footer>
      </div>

      <nav aria-label="Navegación móvil" className="fixed inset-x-0 bottom-0 z-40 border-t border-outline/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(21,35,33,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid min-h-16 max-w-[1280px] grid-cols-5 items-stretch px-1">
          {navItems.filter(item => item.to !== "/app/accounts").map(({ to, label, icon: Icon }, index) => (
            <Fragment key={to}>
              {index === 2 ? (
                <button ref={addButtonRef} type="button" aria-haspopup="dialog" aria-expanded={mobileMenu === "add"} aria-controls="mobile-menu" onClick={() => setMobileMenu("add")}
                  className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-primary focus-visible:z-10">
                  <span className="flex h-9 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm"><PlusIcon className="h-5 w-5" /></span>
                  <span>Agregar</span>
                </button>
              ) : null}
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              aria-label={label}
              className={({ isActive }) => cn(
                "flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-0 text-xs font-medium transition-colors focus-visible:z-10",
                isActive ? "text-primary" : "text-muted hover:text-ink",
              )}
            >
              {({ isActive }) => <>
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className="max-w-full truncate">{label === "Movimientos" ? "Movs." : label}</span>
              </>}
            </NavLink>
            </Fragment>
          ))}
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-menu"
            aria-haspopup="dialog"
            onClick={() => setMobileMenu("more")}
            className={cn(
              "flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-0 text-xs font-medium transition-colors focus-visible:z-10",
              moreIsActive || moreOpen ? "text-primary" : "text-muted hover:text-ink",
            )}
          >
            <MoreIcon className="h-5 w-5" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {mobileMenu ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-[2px] lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMobileMenu(null);
          }}
        >
          <div
            ref={mobileDialogRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            className="surface-card max-h-[90dvh] w-full overflow-y-auto rounded-b-none rounded-t-[1.75rem] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-outline" />
            <div className="mb-4 flex items-center justify-between">
              <h2 id="mobile-menu-title" className="text-xl font-semibold">{mobileMenu === "add" ? "¿Qué quieres agregar?" : "Más opciones"}</h2>
              <button
                type="button"
                onClick={() => setMobileMenu(null)}
                className="min-h-11 shrink-0 rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-paper-soft hover:text-ink"
              >
                Cerrar
              </button>
            </div>
            {mobileMenu === "add" ? (
              <div className="space-y-3">
                <Link to="/app/import" onClick={() => setMobileMenu(null)} className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary-mist p-4 transition hover:border-primary/40">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><PdfIcon className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-semibold text-primary">Agregar cartola</span><span className="mt-1 block text-sm text-muted">Importa los movimientos de tu cuenta.</span></span>
                </Link>
                <Link to="/app/transactions?new_movement=1" onClick={() => setMobileMenu(null)} className="flex items-center gap-4 rounded-2xl border border-outline p-4 transition hover:bg-paper-soft">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper-soft text-primary"><WalletIcon className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-semibold">Agregar movimiento</span><span className="mt-1 block text-sm text-muted">Registra un ingreso o gasto en efectivo.</span></span>
                </Link>
              </div>
            ) : (
            <div className="space-y-1">
              <NavLink to="/app/accounts" onClick={() => setMobileMenu(null)} className={({ isActive }) => cn(
                "flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium",
                isActive ? "bg-primary-mist text-primary" : "text-ink hover:bg-paper-soft",
              )}><BankIcon className="h-5 w-5" /> Cuentas</NavLink>
              <NavLink
                to={organizationItem.to}
                onClick={() => setMobileMenu(null)}
                className={({ isActive }) => cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium",
                  isActive ? "bg-primary-mist text-primary" : "text-ink hover:bg-paper-soft",
                )}
              >
                <OrganizationIcon className="h-5 w-5" /> Categorías
              </NavLink>
              <NavLink
                to="/app/profile"
                onClick={() => setMobileMenu(null)}
                className={({ isActive }) => cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium",
                  isActive ? "bg-primary-mist text-primary" : "text-ink hover:bg-paper-soft",
                )}
              >
                <UserCircleIcon className="h-5 w-5" /> Perfil
              </NavLink>
              <button
                type="button"
                onClick={() => void supabase?.auth.signOut({ scope: "local" })}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 font-medium text-ink hover:bg-paper-soft"
              >
                <SignOutIcon className="h-5 w-5" /> Salir
              </button>
            </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
