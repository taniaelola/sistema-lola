"use server";

import { headers } from "next/headers";
import { apagarSessao, encerrarNoSupabase, getSessao, gravarSessao, perfilPorToken } from "@/lib/auth";
import { analisarToken, mensagemErroAuth, origemSite, resultadoCadastro } from "@/lib/auth-cookies";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { destinoPosLogin } from "@/lib/roles";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseComToken, supabaseEfemero } from "@/lib/supabase";
import { cnpjValido, emailValido, nextSeguro } from "@/lib/validators";
import { siteUrlSeguro } from "@/lib/aviso-revendedor";

type ResultadoEntrar = { error?: string; destino?: string };
type ResultadoEnvio = { error?: string; sent?: string };
type ResultadoRedefinir = { error?: string; ok?: boolean };

const SENHA_MIN = 8;
const MSG_SENHA_CURTA = `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
const MSG_EMAIL_INVALIDO = "Informe um e-mail válido.";
const MSG_LINK_INVALIDO = "Link de redefinição inválido ou expirado. Peça um novo.";

function campo(formData: FormData, nome: string): string {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

function senhaCampo(formData: FormData, nome: string): string {
  const v = formData.get(nome);
  return typeof v === "string" ? v : "";
}

function emailCampo(formData: FormData): string {
  return campo(formData, "email").toLowerCase();
}

async function origem(): Promise<string> {
  // Em produção sem NEXT_PUBLIC_SITE_URL no build, cai no domínio da loja (senão o link do e-mail abriria a home).
  return origemSite(await headers(), process.env.NEXT_PUBLIC_SITE_URL) || siteUrlSeguro(undefined);
}

export async function entrarAction(_prev: ResultadoEntrar | undefined, formData: FormData): Promise<ResultadoEntrar> {
  const email = emailCampo(formData);
  const senha = senhaCampo(formData, "senha");
  const next = nextSeguro(campo(formData, "next") || null);

  if (!emailValido(email)) return { error: MSG_EMAIL_INVALIDO };
  if (!senha) return { error: "Informe a senha." };

  const { data, error } = await supabaseEfemero().auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return { error: mensagemErroAuth(error, "entrar") };

  const sessao = data.session;
  const perfil = await perfilPorToken(sessao.access_token);
  if (!perfil || !perfil.ativo) {
    await encerrarNoSupabase(sessao.access_token);
    await apagarSessao();
    return { error: perfil ? "Conta desativada." : "Não foi possível carregar sua conta. Tente de novo." };
  }

  await gravarSessao(sessao);
  await supabaseComToken(sessao.access_token).rpc("touch_ultimo_acesso");
  return { destino: destinoPosLogin(perfil.papel, next) };
}

export async function cadastrarAction(_prev: ResultadoEnvio | undefined, formData: FormData): Promise<ResultadoEnvio> {
  // Sem varejo não há conta de cliente: só revendedora se cadastra.
  if (!(await getLojaFlags()).varejoAtivo) {
    return { error: "O cadastro de clientes está desativado. Cadastre-se como revendedora." };
  }
  const nome = campo(formData, "nome");
  const email = emailCampo(formData);
  const senha = senhaCampo(formData, "senha");

  if (!nome) return { error: "Informe seu nome." };
  if (nome.length > 120) return { error: "Nome muito longo." };
  if (!emailValido(email)) return { error: MSG_EMAIL_INVALIDO };
  if (senha.length < SENHA_MIN) return { error: MSG_SENHA_CURTA };

  const base = await origem();
  const { error } = await supabaseEfemero().auth.signUp({
    email,
    password: senha,
    options: { data: { nome }, ...(base ? { emailRedirectTo: `${base}/entrar` } : {}) },
  });
  return resultadoCadastro(error, "cliente");
}

export async function cadastrarRevendedorAction(
  _prev: ResultadoEnvio | undefined,
  formData: FormData
): Promise<ResultadoEnvio> {
  const razaoSocial = campo(formData, "razao_social");
  const cnpj = campo(formData, "cnpj");
  const nome = campo(formData, "nome");
  const email = emailCampo(formData);
  const whatsapp = campo(formData, "whatsapp").replace(/\D/g, "");
  const senha = senhaCampo(formData, "senha");

  if (!razaoSocial) return { error: "Informe a razão social." };
  if (razaoSocial.length > 200) return { error: "Razão social muito longa." };
  if (!cnpjValido(cnpj)) return { error: "CNPJ inválido." };
  if (!nome) return { error: "Informe o nome do responsável." };
  if (nome.length > 120) return { error: "Nome muito longo." };
  if (!emailValido(email)) return { error: MSG_EMAIL_INVALIDO };
  if (whatsapp.length !== 10 && whatsapp.length !== 11) return { error: "WhatsApp inválido. Use DDD + número." };
  if (senha.length < SENHA_MIN) return { error: MSG_SENHA_CURTA };

  const base = await origem();
  const { error } = await supabaseEfemero().auth.signUp({
    email,
    password: senha,
    options: {
      data: {
        tipo: "revendedor",
        nome,
        razao_social: razaoSocial,
        cnpj: cnpj.replace(/\D/g, ""),
        whatsapp,
      },
      ...(base ? { emailRedirectTo: `${base}/entrar` } : {}),
    },
  });
  return resultadoCadastro(error, "revendedor");
}

export async function esqueciAction(_prev: ResultadoEnvio | undefined, formData: FormData): Promise<ResultadoEnvio> {
  const email = emailCampo(formData);
  if (!emailValido(email)) return { error: MSG_EMAIL_INVALIDO };

  const base = await origem();
  try {
    await supabaseEfemero().auth.resetPasswordForEmail(
      email,
      base ? { redirectTo: `${base}/entrar/redefinir` } : undefined
    );
  } catch {}
  return { sent: "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha." };
}

export async function redefinirAction(
  _prev: ResultadoRedefinir | undefined,
  formData: FormData
): Promise<ResultadoRedefinir> {
  const token = campo(formData, "access_token");
  const senha = senhaCampo(formData, "senha");
  const confirmar = senhaCampo(formData, "confirmar");

  const info = token ? analisarToken(token, Math.floor(Date.now() / 1000)) : null;
  if (!info || info.expirado) return { error: MSG_LINK_INVALIDO };
  if (senha.length < SENHA_MIN) return { error: MSG_SENHA_CURTA };
  if (senha !== confirmar) return { error: "As senhas não conferem." };

  let resposta: Response;
  try {
    resposta = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: senha }),
      cache: "no-store",
    });
  } catch {
    return { error: mensagemErroAuth(null, "redefinir") };
  }
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { code?: unknown; error_code?: unknown } | null;
    const code = typeof corpo?.error_code === "string" ? corpo.error_code : typeof corpo?.code === "string" ? corpo.code : undefined;
    return { error: mensagemErroAuth({ code, status: resposta.status }, "redefinir") };
  }
  return { ok: true };
}

/**
 * Convite de equipe: a pessoa abriu o link do e-mail (já tem sessão do Supabase no token do link),
 * informa nome e senha e a conta fica pronta. O papel já foi aplicado pelo banco ao confirmar o e-mail.
 */
export async function finalizarCadastroAction(
  _prev: ResultadoRedefinir | undefined,
  formData: FormData
): Promise<ResultadoRedefinir> {
  const token = campo(formData, "access_token");
  const nome = campo(formData, "nome");
  const senha = senhaCampo(formData, "senha");
  const confirmar = senhaCampo(formData, "confirmar");

  const info = token ? analisarToken(token, Math.floor(Date.now() / 1000)) : null;
  if (!info || info.expirado) return { error: "Link inválido ou expirado. Peça um novo convite." };
  if (!nome) return { error: "Informe o seu nome." };
  if (nome.length > 120) return { error: "Nome muito longo." };
  if (senha.length < SENHA_MIN) return { error: MSG_SENHA_CURTA };
  if (senha !== confirmar) return { error: "As senhas não conferem." };

  let resposta: Response;
  try {
    resposta = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: senha, data: { nome } }),
      cache: "no-store",
    });
  } catch {
    return { error: mensagemErroAuth(null, "redefinir") };
  }
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { code?: unknown; error_code?: unknown } | null;
    const code = typeof corpo?.error_code === "string" ? corpo.error_code : typeof corpo?.code === "string" ? corpo.code : undefined;
    return { error: mensagemErroAuth({ code, status: resposta.status }, "redefinir") };
  }

  // O perfil é criado antes do nome ser informado; grava o nome nele (só o próprio usuário, só se ainda vazio).
  const { error } = await supabaseComToken(token).rpc("set_meu_nome", { p_nome: nome });
  if (error) console.error("set_meu_nome falhou:", error.message);
  return { ok: true };
}

export async function sairAction(): Promise<void> {
  try {
    const sessao = await getSessao({ renovar: true });
    if (sessao) await encerrarNoSupabase(sessao.accessToken);
  } catch {}
  await apagarSessao();
}

/**
 * Renovação silenciosa chamada por /entrar quando chega com sessão vencida
 * (Server Components não podem regravar cookies). Devolve o destino se a
 * sessão foi recuperada.
 */
export async function renovarSessaoAction(next: string | null): Promise<{ error?: string; destino?: string }> {
  const sessao = await getSessao({ renovar: true });
  if (!sessao) return {};
  const perfil = await perfilPorToken(sessao.accessToken);
  if (!perfil) return {};
  if (!perfil.ativo) {
    await encerrarNoSupabase(sessao.accessToken);
    await apagarSessao();
    return { error: "Conta desativada." };
  }
  return { destino: destinoPosLogin(perfil.papel, nextSeguro(next)) };
}
