import { useExplicitAction } from "../query/useExplicitAction";
import { ProfileService } from "../services/profileService";
import { useWriteActions } from "../query/writes";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { createProfileExport } from "../lib/profileExport";
import { supabase, signInWithGoogle } from "../lib/supabase";
import { Button, PageIntro, Panel } from "../components";

export function ProfilePage() {
  const writes = useWriteActions();
  const exportAction = useExplicitAction(ProfileService.exportData);
  const deleteAction = useExplicitAction(writes.profile.deleteProfile);
  const exportController = useRef<AbortController | null>(null);
  const actionRunning = useRef(false);
  useEffect(() => () => exportController.current?.abort(), []);
  const { session } = useAuth();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [exportError, setExportError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  return (
    <div className="space-y-8">
      <PageIntro
        title="Perfil"
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
          onClick={async () => {
            setSignOutError("");
            try {
              const result = await supabase?.auth.signOut({ scope: "local" });
              if (result?.error) throw result.error;
            } catch (error) {
              setSignOutError(error instanceof Error ? error.message : "No se pudo cerrar la sesión. Inténtalo de nuevo.");
            }
          }}
        >
          Cerrar sesión
        </Button>
        {signOutError && <p role="alert" className="mt-3 text-danger">{signOutError}</p>}
      </Panel>
      <Panel>
        <h2 className="text-2xl font-semibold">Descargar mis datos</h2>
        <p className="my-4 text-muted">
          Descarga cuentas, movimientos, categorías y reglas en formato JSON.
          La copia usa referencias propias del archivo en lugar de identificadores internos y omite los dígitos de las cuentas. Conserva nombres, descripciones e importes. Los PDFs originales no se conservan.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            if (actionRunning.current) return;
            actionRunning.current = true;
            setBusy(true);
            setExporting(true);
            setExportStatus("");
            setExportError("");
            try {
              exportController.current = new AbortController();
              const data = await exportAction.run(exportController.current.signal);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(createProfileExport(data), null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "solofinanzas.json";
              document.body.appendChild(a);
              a.click();
              a.remove();
              setExportStatus("Archivo JSON preparado. La descarga se inició en tu navegador.");
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (err) {
              if (!exportController.current?.signal.aborted) setExportError(err instanceof Error ? err.message : "No se pudieron descargar tus datos. Inténtalo de nuevo.");
            } finally {
              setBusy(false);
              setExporting(false);
              exportController.current = null;
              actionRunning.current = false;
            }
          }}
        >
          {exporting ? "Preparando JSON…" : "Exportar mis datos (JSON)"}
        </Button>
        {exporting && <Button tone="secondary" onClick={() => exportController.current?.abort()}>Cancelar descarga</Button>}
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">{exporting ? "Preparando tus cuentas, movimientos, categorías y reglas…" : exportStatus}</p>
        {exportError && <p role="alert" className="mt-3 text-danger">{exportError}</p>}
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
          onClick={async () => {
            setIdentityError("");
            try { await signInWithGoogle("/app/profile"); }
            catch (error) { setIdentityError(error instanceof Error ? error.message : "No se pudo confirmar tu identidad. Inténtalo de nuevo."); }
          }}
        >
          Confirmar identidad con Google
        </Button>
        {identityError && <p role="alert" className="mt-3 text-danger">{identityError}</p>}
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
            if (actionRunning.current) return;
            actionRunning.current = true;
            setBusy(true);
            setDeleteError("");
            try {
              await deleteAction.run();
              navigate("/", { replace: true });
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar tu cuenta. Inténtalo de nuevo.");
            } finally {
              setBusy(false);
              actionRunning.current = false;
            }
          }}
        >
          Eliminar definitivamente
        </Button>
        {deleteError && <p role="alert" className="mt-3 text-danger">{deleteError}</p>}
      </Panel>

    </div>
  );
}
