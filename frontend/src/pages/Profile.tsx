import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/apiClient";
import { supabase, signInWithGoogle } from "../lib/supabase";
import { Button, PageIntro, Panel } from "../components";

export function ProfilePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-8">
      <PageIntro
        title="Tu perfil"
        description="Tu acceso y el control de tus datos."
      />
      <Panel>
        <p className="text-xl font-semibold">
          {session?.user.user_metadata.full_name || "Tu cuenta"}
        </p>
        <p className="mt-2 text-muted">{session?.user.email}</p>
        <Button
          className="mt-5"
          tone="secondary"
          onClick={() => void supabase?.auth.signOut({ scope: "local" })}
        >
          Cerrar sesión
        </Button>
      </Panel>
      <Panel>
        <h2 className="text-2xl font-semibold">Descargar mis datos</h2>
        <p className="my-4 text-muted">
          Descarga cuentas, movimientos, categorías y reglas en formato JSON.
          Los PDFs originales no se conservan.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              const data = await apiClient.get("/me/export");
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "solofinanzas.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Exportar mis datos
        </Button>
      </Panel>
      <Panel>
        <h2 className="text-2xl font-semibold">Eliminar mi cuenta</h2>
        <p className="my-4 text-muted">
          Esta acción elimina tus datos y tu acceso. Descarga una copia antes de
          continuar. Por seguridad, debes haber ingresado con Google en los
          últimos diez minutos.
        </p>
        <Button
          tone="secondary"
          onClick={() =>
            void signInWithGoogle("/app/profile").catch((err) =>
              setMessage(err.message),
            )
          }
        >
          Confirmar identidad con Google
        </Button>
        <label className="my-5 block space-y-2">
          <span>Escribe ELIMINAR para confirmar</span>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="block w-full max-w-sm rounded-xl border border-outline bg-white p-3"
            autoComplete="off"
          />
        </label>
        <Button
          disabled={confirmation !== "ELIMINAR" || busy}
          className="border-danger bg-danger"
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await apiClient.delete("/me");
              await supabase?.auth.signOut({ scope: "local" });
              navigate("/", { replace: true });
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Eliminar definitivamente
        </Button>
      </Panel>
      {message && (
        <p role="alert" className="text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
