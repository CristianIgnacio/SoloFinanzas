import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "../components/ui";
import { NotFoundPage } from "./NotFound";

export function RouterErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  return <main className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
    <div className="surface-card space-y-5 p-6 sm:p-8">
      <p className="eyebrow">Algo salió mal</p>
      <h1 className="page-title">No pudimos mostrar esta pantalla</h1>
      <p className="leading-7 text-muted">Ocurrió un problema al cargar la aplicación. Puedes volver a intentarlo recargando la página.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => window.location.reload()}>Recargar página</Button>
        <a href="/" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Volver a la portada</a>
      </div>
    </div>
  </main>;
}
