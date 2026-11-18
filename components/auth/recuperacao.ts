import { decodificarPayloadJwt } from "@/lib/auth-cookies";

export function lerHashRecuperacao(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  if (params.get("error") || params.get("error_code")) return null;
  if (params.get("type") !== "recovery") return null;
  const token = params.get("access_token");
  return token ? token : null;
}

export type TipoAcesso = "recuperacao" | "convite";

/** Cadastro feito pela própria revendedora (formulário "Seja revendedora") grava tipo=revendedor no cadastro. */
function tokenDeRevendedora(token: string): boolean {
  const payload = decodificarPayloadJwt(token);
  const meta = payload?.user_metadata;
  return !!meta && typeof meta === "object" && (meta as Record<string, unknown>).tipo === "revendedor";
}

/**
 * Hash que o Supabase devolve ao abrir o link do e-mail:
 *  - type=recovery            → redefinir senha;
 *  - type=signup/invite/magiclink → convite de equipe (a pessoa informa nome e senha), EXCETO quando o cadastro é
 *    de revendedora que se cadastrou sozinha: esse link só confirma o e-mail e segue o fluxo normal de /entrar.
 * Erro no hash, token ausente ou tipo desconhecido = nada a fazer aqui (null).
 */
export function lerHashAcesso(hash: string): { token: string; tipo: TipoAcesso } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  if (params.get("error") || params.get("error_code")) return null;
  const token = params.get("access_token");
  if (!token) return null;
  const type = params.get("type");
  if (type === "recovery") return { token, tipo: "recuperacao" };
  if (type === "signup" || type === "invite" || type === "magiclink") {
    return tokenDeRevendedora(token) ? null : { token, tipo: "convite" };
  }
  return null;
}
