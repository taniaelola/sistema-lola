import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Em build/CI as envs podem faltar; só quebrar em runtime real.
  if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
    console.warn("Supabase env vars ausentes — configure nas variáveis do Worker na Cloudflare.");
  }
}

export function supabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function supabaseEfemero() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Cliente só para PostgREST/RPC: envia o JWT do usuário; `auth.*` fica indisponível.
export function supabaseComToken(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => accessToken,
  });
}
