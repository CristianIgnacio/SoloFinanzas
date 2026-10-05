import { NavLink, Outlet, useLocation } from "react-router-dom";

import {
  BankIcon,
  BellIcon,
  CategoriesIcon,
  DashboardIcon,
  LogoMark,
  PdfIcon,
  ReportIcon,
  SettingsIcon,
  TrendLineIcon,
  UserCircleIcon,
  cn,
} from "../components";

const navItems = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/analytics", label: "An\u00e1lisis", icon: TrendLineIcon },
  { to: "/accounts", label: "Cuentas", icon: BankIcon },
  { to: "/import", label: "Importar PDF", icon: PdfIcon },
  { to: "/transactions", label: "Movimientos", icon: ReportIcon },
  { to: "/categories", label: "Categorias", icon: CategoriesIcon },
  { to: "/settings", label: "Configuracion", icon: SettingsIcon },
];

export function RootLayout() {
  const location = useLocation();
  const currentSection =
    navItems.find((item) =>
      item.to === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.to),
    )?.label ?? "SoloFinanzas";

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-outline/70 bg-paper/90 lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:flex-col lg:justify-between lg:px-5 lg:py-7">
        <div className="space-y-9">
          <div className="flex items-center gap-3">
            <span className="text-primary">
              <LogoMark className="h-12 w-12" />
            </span>
            <div>
              <p className="text-[1.8rem] font-semibold tracking-[-0.05em] text-primary">
                SoloFinanzas
              </p>
              <p className="text-base text-muted">Gestion Personal</p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3.5 text-[1.05rem] font-medium transition",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-ink/75 hover:bg-white hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-6 w-6 shrink-0" />
                    <span>{label}</span>
                    {isActive ? (
                      <span className="absolute bottom-3 right-0 top-3 w-1 rounded-full bg-primary" />
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-6">
          <p className="max-w-[13rem] text-base leading-6 text-muted">
            Tu informacion nunca sale de esta computadora.
          </p>
          <div className="subtle-divider" />
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              UL
            </div>
            <div>
              <p className="font-medium">Usuario Local</p>
              <p className="text-sm text-muted">Sesion privada</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="subtle-divider sticky top-0 z-20 bg-paper/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10 xl:px-12">
            <div className="flex items-center gap-4">
              <span className="text-primary lg:hidden">
                <LogoMark className="h-11 w-11" />
              </span>
              <div className="space-y-1">
                <p className="text-3xl font-semibold tracking-[-0.04em] text-primary lg:hidden">
                  SoloFinanzas
                </p>
                <p className="text-lg font-medium text-primary">{currentSection}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-ink">
              <button className="rounded-full border border-transparent p-2 transition hover:bg-white">
                <BellIcon className="h-5 w-5" />
              </button>
              <button className="rounded-full border border-primary/20 bg-white p-2 text-primary shadow-paper transition hover:border-primary/40">
                <UserCircleIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <nav className="mx-auto flex max-w-[1280px] gap-2 overflow-x-auto px-4 pb-4 sm:px-6 lg:hidden lg:px-10 xl:px-12">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    isActive
                      ? "border-primary bg-primary text-white"
                      : "border-outline bg-white text-ink",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10 xl:px-12">
          <div className="mx-auto max-w-[1280px]">
            <Outlet />
          </div>
        </main>

        <footer className="subtle-divider mt-auto bg-white/70">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-4 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10 xl:px-12">
            <p className="m-0">SoloFinanzas v1.0.2 - Datos procesados localmente</p>
            <div className="flex gap-6">
              <span>Privacidad</span>
              <span>Soporte</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}


