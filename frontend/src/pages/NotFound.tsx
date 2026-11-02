import { Link } from "react-router-dom";

import { EmptyState, PageIntro } from "../components";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <PageIntro
        eyebrow="Error"
        title="404 - Página no encontrada"
        description="La ruta que buscas no existe o fue movida dentro de la app."
      />
      <EmptyState
        title="Volvamos al tablero principal"
        description="Puedes regresar al dashboard para seguir explorando tus cuentas, movimientos e importaciones."
        action={
          <Link to="/app" className="inline-flex rounded-2xl bg-primary px-5 py-3 font-medium text-white">
            Ir al dashboard
          </Link>
        }
      />
    </div>
  );
}
