import { Link } from "react-router-dom";

import { Button, EmptyState, PageIntro } from "../components";

export function NotFoundPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Error"
        title="404 - Pagina no encontrada"
        description="La ruta que buscas no existe o fue movida dentro de la app."
      />
      <EmptyState
        title="Volvamos al tablero principal"
        description="Puedes regresar al dashboard para seguir explorando tus cuentas, movimientos e importaciones."
        action={
          <Link to="/">
            <Button>Ir al dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
