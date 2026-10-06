import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export async function signInWithGoogle(returnTo = "/app") {
  if (!supabase) throw new Error("El acceso está pendiente de configuración.");
  sessionStorage.setItem(
    "sf:returnTo",
    returnTo.startsWith("/app") ? returnTo : "/app",
  );
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error)
    throw new Error(
      "No se pudo iniciar el acceso con Google. Intenta nuevamente.",
    );
}
