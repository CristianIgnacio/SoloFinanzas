import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { apiClient } from "../lib/apiClient";
import { Button, LoadingState, ErrorState } from "../components";

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    const expired = () => {
      void supabase?.auth.signOut({ scope: "local" });
      setSession(null);
    };
    window.addEventListener("sf:session-expired", expired);
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      window.removeEventListener("sf:session-expired", expired);
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading }}>
      <Outlet />
    </AuthContext.Provider>
  );
}

function ProvisionedApp() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError("");
    void apiClient
      .get("/me", { signal: controller.signal })
      .then(() => {
        if (active) setReady(true);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  if (error)
    return (
      <div className="mx-auto max-w-xl space-y-5 p-8">
        <ErrorState message={error} />
        <p>
          El servicio puede tardar en iniciar después de un período sin uso.
        </p>
        <Button onClick={() => setAttempt(attempt + 1)}>Reintentar</Button>
        <Button
          tone="secondary"
          onClick={() => void supabase?.auth.signOut({ scope: "local" })}
        >
          Cerrar sesión
        </Button>
      </div>
    );
  if (!ready)
    return (
      <div className="p-8">
        <LoadingState message="Preparando tu espacio. El primer acceso puede tardar hasta un minuto…" />
        <SessionExit />
      </div>
    );
  return <Outlet />;
}

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="p-8">
        <LoadingState />
        <SessionExit />
      </div>
    );
  if (!session) return <Navigate to="/login" replace />;
  // Remount all financial state whenever identity changes.
  return <ProvisionedApp key={session.user.id} />;
}

function SessionExit() {
  return <div className="mt-5 text-center">
    <Link to="/" className="inline-flex min-h-11 items-center rounded-xl border border-outline px-4 py-2 font-medium text-primary">Volver a la portada</Link>
    <p className="mt-2 text-sm text-muted">Puedes volver e intentarlo más tarde.</p>
  </div>;
}
