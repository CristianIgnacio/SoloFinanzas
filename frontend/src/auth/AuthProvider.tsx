import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, Outlet } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { beginApiSession, endApiSession } from "../lib/apiSession";
import { createQueryClient } from "../query/createQueryClient";
import { AuthenticatedQueryProvider } from "../query/AuthenticatedQueryProvider";
import { profileQueries } from "../query/profile";
import { Button, LoadingState, ErrorState } from "../components";

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export const useAuth = () => useContext(AuthContext);

type Runtime = { transport: ReturnType<typeof beginApiSession>; client: ReturnType<typeof createQueryClient> };
function dispose(runtime: Runtime | null) {
  if (!runtime) return;
  endApiSession(runtime.transport);
  void runtime.client.cancelQueries();
  runtime.client.clear();
}

export function AuthProvider() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const runtimeRef = useRef<Runtime | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const effectGeneration = useRef(0);
  useEffect(() => {
    const generation = ++effectGeneration.current;
    let mounted = true;
    let revision = 0;
    const accept = (next: Session | null) => {
      if (!mounted) return;
      const previous = runtimeRef.current;
      if (!next || !previous?.transport.active || previous.transport.userId !== next.user.id) {
        dispose(previous);
        runtimeRef.current = next ? { transport: beginApiSession(next.user.id), client: createQueryClient() } : null;
        setRuntime(runtimeRef.current);
      }
      setSession(next);
      setLoading(false);
    };
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          if (revision === 0) accept(data.session);
        }
      })
      .catch(() => {
        if (mounted && revision === 0) accept(null);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      revision++;
      accept(next);
    });
    const expired = () => {
      revision++;
      accept(null);
      void supabase?.auth.signOut({ scope: "local" });
    };
    window.addEventListener("sf:session-expired", expired);
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      window.removeEventListener("sf:session-expired", expired);
      // StrictMode immediately re-runs this effect. Only dispose a real unmount.
      queueMicrotask(() => {
        if (effectGeneration.current === generation) {
          dispose(runtimeRef.current);
          runtimeRef.current = null;
        }
      });
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading }}>
      {runtime ? <AuthenticatedQueryProvider key={runtime.transport.id} client={runtime.client}>
        <Outlet />
      </AuthenticatedQueryProvider> : <Outlet />}
    </AuthContext.Provider>
  );
}

function ProvisionedApp() {
  const { session } = useAuth();
  const profile = useQuery(profileQueries.current(session!.user.id));
  if (profile.isError && !profile.data)
    return (
      <div className="mx-auto max-w-xl space-y-5 p-8">
        <ErrorState message={profile.error.message} />
        <p>
          El servicio puede tardar en iniciar después de un período sin uso.
        </p>
        <Button disabled={profile.isFetching} onClick={() => void profile.refetch()}>Reintentar</Button>
        <Button
          tone="secondary"
          onClick={() => void supabase?.auth.signOut({ scope: "local" })}
        >
          Cerrar sesión
        </Button>
      </div>
    );
  if (!profile.data)
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
