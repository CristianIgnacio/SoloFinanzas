import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LogoMark,
  Button,
  BankIcon,
  PdfIcon,
  CategoriesIcon,
  InstitutionLogo,
} from "../components";
import { InstitutionOptions } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { signInWithGoogle, supabase } from "../lib/supabase";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  return (
    <div className="min-h-screen text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 md:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 text-xl font-semibold tracking-tight text-primary"
        >
          <LogoMark className="h-9 w-9" />
          SoloFinanzas
        </Link>
        <Link
          to={session ? "/app" : "/login"}
          className="rounded-full border border-primary/25 bg-white px-5 py-2.5 text-sm font-medium text-primary"
        >
          {session ? "Ir a mi espacio" : "Ingresar"}
        </Link>
      </header>
      <main>{children}</main>
      <footer className="mx-auto mt-16 flex max-w-6xl flex-wrap justify-between gap-4 border-t border-outline px-5 py-8 text-sm text-muted md:px-8">
        <span>SoloFinanzas · Finanzas personales en Chile</span>
        <div className="flex gap-6">
          <Link to="/privacy">Privacidad</Link>
          <Link to="/help">Ayuda</Link>
        </div>
      </footer>
    </div>
  );
}

export function HomePage() {
  const { session } = useAuth();
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-12 md:px-8 md:py-20 lg:grid-cols-2">
        <div className="space-y-7">
          <p className="eyebrow">UN POCO MÁS DE CLARIDAD, CADA MES</p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.05em] md:text-7xl">
            Tus finanzas,
            <br />
            <span className="text-primary">en un solo lugar.</span>
          </h1>
          <p className="max-w-lg text-lg leading-8 text-muted">
            Dale sentido a tus movimientos. Importa tus cartolas, organiza tus
            gastos y descubre cómo cambia tu mes.
          </p>
          <Link
            to={session ? "/app" : "/login"}
            className="inline-flex rounded-2xl bg-primary px-7 py-4 font-medium text-white"
          >
            {session ? "Ir a mi espacio" : "Comenzar con Google"}
            <span aria-hidden className="ml-5">
              ↗
            </span>
          </Link>
          <p className="text-sm text-muted">
            Beta gratuita · Sin conectar tus claves bancarias
          </p>
        </div>
        <div className="relative">
          <div className="absolute -inset-5 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <div className="surface-card -rotate-1 p-6 md:p-8">
            <div className="mb-8 flex justify-between text-sm">
              <span className="font-medium text-primary">
                Un vistazo a tu mes
              </span>
              <span className="text-muted">Datos de ejemplo</span>
            </div>
            <p className="text-muted">Balance del mes</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">
              $320.000
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-primary/10 p-4">
                <p className="text-sm text-muted">Ingresos</p>
                <p className="mt-1 text-xl font-semibold text-primary">
                  $1.200.000
                </p>
              </div>
              <div className="rounded-2xl bg-paper-soft p-4">
                <p className="text-sm text-muted">Gastos</p>
                <p className="mt-1 text-xl font-semibold">$880.000</p>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              {[
                ["Alimentación", "68%"],
                ["Transporte", "43%"],
                ["Tiempo para ti", "27%"],
              ].map(([label, width]) => (
                <div key={label}>
                  <p className="mb-2 text-sm text-muted">{label}</p>
                  <div className="h-2 rounded-full bg-paper-soft">
                    <div
                      style={{ width }}
                      className="h-2 rounded-full bg-primary/65"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section
        id="como-funciona"
        className="mx-auto max-w-6xl px-5 py-10 md:px-8"
      >
        <p className="eyebrow">DE LA CARTOLA A LA CLARIDAD</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Un hábito simple para entender tu dinero.
        </h2>
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: BankIcon,
              title: "01. Crea tu cuenta",
              text: "Agrega tus cuentas y billeteras para ver cada movimiento en su lugar.",
            },
            {
              icon: PdfIcon,
              title: "02. Importa tu cartola",
              text: "Sube un PDF compatible y revisa los movimientos antes de guardarlos.",
            },
            {
              icon: CategoriesIcon,
              title: "03. Entiende tu mes",
              text: "Personaliza tus categorías, identifica transferencias y consulta tus resultados.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="surface-card p-7">
              <Icon className="mb-6 h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <h2 className="text-2xl font-semibold">
          Tus cuentas, juntas y ordenadas.
        </h2>
        <p className="mt-3 text-muted">
          Compatible con cartolas de estas instituciones. Los formatos admitidos
          se explican en Ayuda.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          {InstitutionOptions.map(({ value, label }) => (
            <div
              key={value}
              className="flex items-center gap-3 rounded-2xl border border-outline bg-white px-4 py-3"
            >
              <InstitutionLogo institution={value} className="h-7 w-7" />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="rounded-[2rem] bg-primary px-7 py-10 text-white md:p-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            Tu espacio es solo tuyo.
          </h2>
          <p className="mt-4 max-w-2xl leading-8 text-white/80">
            Tus movimientos se guardan en la nube y están separados de los de
            otras personas. Procesamos el PDF para extraerlos y descartamos el
            archivo original al terminar.
          </p>
          <Link
            to="/privacy"
            className="mt-5 inline-block underline underline-offset-4"
          >
            Conoce cómo tratamos tus datos
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

export function LoginPage() {
  const { session } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (session) navigate("/app", { replace: true });
  }, [session, navigate]);
  return (
    <PublicShell>
      <section className="mx-auto my-10 max-w-lg px-5">
        <div className="surface-card space-y-6 p-8">
          <p className="eyebrow">BIENVENIDO A TU ESPACIO</p>
          <h1 className="page-title">
            Más claridad empieza aquí.
          </h1>
          <p className="leading-7 text-muted">
            Usa tu cuenta de Google para crear tu espacio o volver a tus
            finanzas.
          </p>
          <Button
            className="w-full"
            disabled={!supabase || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await signInWithGoogle();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            Continuar con Google
          </Button>
          {!supabase && (
            <p role="status" className="text-sm text-muted">
              El acceso estará disponible cuando se conecte el proyecto de
              Supabase.
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <p className="text-sm leading-6 text-muted">
            Esta beta utiliza únicamente Google.{" "}
            <Link to="/privacy" className="underline">
              Consulta la información de privacidad.
            </Link>
          </p>
        </div>
      </section>
    </PublicShell>
  );
}

let exchange: Promise<unknown> | null = null;
export function AuthCallbackPage() {
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    if (query.has("error") || !code || !supabase) {
      setError("El acceso se canceló o el enlace ya no es válido.");
      return;
    }
    exchange ??= supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) throw error;
      });
    void exchange
      .then(() => {
        if (!active) return;
        const target = sessionStorage.getItem("sf:returnTo") ?? "/app";
        sessionStorage.removeItem("sf:returnTo");
        navigate(
          target === "/app" || target.startsWith("/app/") ? target : "/app",
          { replace: true },
        );
      })
      .catch(() => {
        if (active)
          setError(
            "No pudimos completar el acceso. Vuelve a ingresar desde este navegador.",
          );
      });
    return () => {
      active = false;
    };
  }, [navigate]);
  return (
    <PublicShell>
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-3xl font-semibold">
          {error ? "No se completó el acceso" : "Preparando tu sesión…"}
        </h1>
        {error && (
          <>
            <p role="alert" className="my-5">
              {error}
            </p>
            <Link to="/login" className="underline">
              Volver a ingresar
            </Link>
          </>
        )}
      </div>
    </PublicShell>
  );
}

export function InformationPage({ privacy = false }: { privacy?: boolean }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-5 py-12 leading-8">
        <h1 className="page-title">
          {privacy
            ? "Tu información y tu privacidad"
            : "Cómo usar SoloFinanzas"}
        </h1>
        {privacy ? (
          <>
            <p>
              SoloFinanzas guarda tu identidad, cuentas, movimientos, categorías
              y reglas para ofrecerte un espacio financiero privado. Supabase
              gestiona Google y PostgreSQL; Render procesa las solicitudes y los
              PDFs; Vercel aloja la interfaz.
            </p>
            <p>
              Los PDFs y sus contraseñas se usan temporalmente durante la
              importación. El original se descarta y no puede descargarse
              después. No solicitamos acceso a tu banca en línea.
            </p>
            <p>
              Desde tu perfil puedes descargar tus datos o eliminar la cuenta.
              Los respaldos cifrados se conservan durante siete copias diarias;
              la eliminación de esos respaldos ocurre por rotación y depende de
              que la tarea de respaldo se ejecute.
            </p>
            <p>
              El navegador conserva la sesión para que no debas ingresar cada
              vez. En un equipo compartido, cierra sesión cuando termines. Esta
              beta depende de servicios gratuitos que pueden detenerse al
              alcanzar sus límites.
            </p>
          </>
        ) : (
          <>
            <section aria-labelledby="help-accounts-title">
              <h2 id="help-accounts-title" className="text-2xl font-semibold">Cuentas e importaciones</h2>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  Ingresa con Google. En <strong>Cuentas</strong>, agrega una
                  cuenta financiera y selecciona institución, tipo y producto.
                  También puedes comenzar con <strong>Efectivo</strong> desde el
                  inicio para registrar movimientos manualmente.
                </li>
                <li>
                  Para importar, descarga una cartola PDF con texto seleccionable
                  y elige la cuenta correspondiente. Se admiten archivos de
                  hasta 10 MB y 50 páginas.
                </li>
                <li>
                  Antes de guardar, revisa los movimientos, categorías y avisos
                  del análisis. El formato admitido depende del producto; el
                  importador muestra si está probado o pendiente de verificación.
                  Los PDF escaneados que requieren OCR no se admiten.
                </li>
              </ol>
              <p className="mt-4">
                Se pueden registrar productos de Banco de Chile, Santander,
                BancoEstado, Banco Falabella, Mercado Pago y Copec Pay. Algunas
                tarjetas de crédito están pendientes de verificación y ciertos
                formatos todavía no se admiten. Revisa siempre el resultado del
                análisis antes de confirmar.
              </p>
            </section>
            <section aria-labelledby="help-review-title">
              <h2 id="help-review-title" className="text-2xl font-semibold">Movimientos y organización</h2>
              <ul className="list-disc space-y-3 pl-6">
                <li>
                  En <strong>Movimientos</strong>, filtra por período, cuenta,
                  tipo o categoría y corrige la categoría cuando lo necesites.
                </li>
                <li>
                  En <strong>Categorías</strong>, organiza categorías y
                  subcategorías, y administra las reglas de clasificación.
                </li>
                <li>
                  En <strong>Efectivo</strong>, registra, edita o elimina
                  movimientos y configura un saldo inicial. Puedes vincular sus
                  traspasos con movimientos bancarios para reconocerlos como
                  transferencias entre tus cuentas.
                </li>
                <li>
                  En el detalle de una cuenta puedes revisar sus cartolas y
                  movimientos. Para deshacer una importación, abre la acción de
                  eliminar cartola y revisa primero el impacto que se muestra.
                </li>
              </ul>
            </section>
            <p>
              Desde <strong>Perfil</strong> puedes descargar tus datos o
              eliminar tu cuenta. Si el servicio demora en responder después de
              un período inactivo, espera un momento y vuelve a intentarlo.
            </p>
          </>
        )}
      </article>
    </PublicShell>
  );
}
