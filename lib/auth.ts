import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  supabase,
  supabaseComToken,
  supabaseEfemero,
} from "@/lib/supabase";
import { urlEntrar, type Papel } from "@/lib/roles";
import {
  COOKIE_AT,
  COOKIE_RT,
  REFRESH_MAX_AGE_S,
  analisarToken,
  maxAgeAccess,
  opcoesCookie,
  perfilDeJson,
  type Perfil,
} from "@/lib/auth-cookies";

export type { Papel } from "@/lib/roles";
export type { Perfil } from "@/lib/auth-cookies";

export type Sessao = { accessToken: string; userId: string };

type TokensSupabase = { access_token: string; refresh_token: string; expires_in?: number | null };

/**
 * Lê a sessão dos cookies. Por padrão só lê (seguro em Server Components, onde
 * cookies não podem ser gravados): token expirado vira "sem sessão".
 * `{ renovar: true }` só deve ser usado em Server Action ou Route Handler:
 * troca o refresh token e regrava os cookies. Renovar sem poder gravar
 * queimaria o refresh token rotacionado e derrubaria a sessão.
 */
export async function getSessao(opcoes: { renovar?: boolean } = {}): Promise<Sessao | null> {
  const store = await cookies();
  const at = store.get(COOKIE_AT)?.value;
  const rt = store.get(COOKIE_RT)?.value;
  const info = at ? analisarToken(at, Math.floor(Date.now() / 1000)) : null;

  if (at && info && !info.renovar) return { accessToken: at, userId: info.userId };

  const atual = at && info && !info.expirado ? { accessToken: at, userId: info.userId } : null;
  if (!opcoes.renovar || !rt) return atual;

  const { data, error } = await supabaseEfemero().auth.refreshSession({ refresh_token: rt });
  if (error || !data.session) {
    if (error && error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 429) {
      await apagarSessao();
      return null;
    }
    return atual;
  }
  await gravarSessao(data.session);
  return { accessToken: data.session.access_token, userId: data.session.user.id };
}

export async function gravarSessao(tokens: TokensSupabase): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_AT, tokens.access_token, opcoesCookie(maxAgeAccess(tokens.expires_in)));
  store.set(COOKIE_RT, tokens.refresh_token, opcoesCookie(REFRESH_MAX_AGE_S));
}

export async function encerrarNoSupabase(accessToken: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {}
}

export async function apagarSessao(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_AT, "", opcoesCookie(0));
  store.set(COOKIE_RT, "", opcoesCookie(0));
}

export async function authedSupabase(opcoes: { renovar?: boolean } = {}): Promise<SupabaseClient> {
  const sessao = await getSessao(opcoes);
  return sessao ? supabaseComToken(sessao.accessToken) : supabase();
}

export async function perfilPorToken(accessToken: string): Promise<Perfil | null> {
  const { data, error } = await supabaseComToken(accessToken).rpc("get_my_profile");
  if (error) return null;
  return perfilDeJson(data);
}

export async function getPerfil(opcoes: { renovar?: boolean } = {}): Promise<Perfil | null> {
  const sessao = await getSessao(opcoes);
  if (!sessao) return null;
  return perfilPorToken(sessao.accessToken);
}

/**
 * Guarda de página/ação. `caminho` é a rota atual para o retorno pós-login
 * (Server Components não expõem o pathname; quem chama informa).
 */
export async function exigirPapel(papeis: Papel[], caminho: string = "/"): Promise<Perfil> {
  const perfil = await getPerfil();
  if (!perfil || !perfil.ativo) {
    redirect(urlEntrar(papeis, caminho));
  }
  if (!papeis.includes(perfil.papel)) redirect("/");
  return perfil;
}
