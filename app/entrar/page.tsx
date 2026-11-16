import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginView from "@/components/auth/LoginView";
import { normalizarModo } from "@/components/auth/form";
import { getPerfil } from "@/lib/auth";
import { COOKIE_RT } from "@/lib/auth-cookies";
import { destinoPosLogin } from "@/lib/roles";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { getTextos } from "@/lib/textos";
import { nextSeguro } from "@/lib/validators";

export const metadata: Metadata = { title: "Entrar — LOLA", robots: { index: false } };

type SearchParams = Promise<{ [chave: string]: string | string[] | undefined }>;

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function EntrarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const nextBruto = primeiro(sp.next);
  const next = nextBruto ? nextSeguro(nextBruto) : null;

  const perfil = await getPerfil();
  if (perfil?.ativo) redirect(destinoPosLogin(perfil.papel, next));

  const temRefresh = (await cookies()).has(COOKIE_RT);
  const [textos, flags] = await Promise.all([getTextos(), getLojaFlags()]);

  return (
    <LoginView
      modoInicial={normalizarModo(sp.modo, flags.varejoAtivo)}
      varejoAtivo={flags.varejoAtivo}
      next={next}
      etiqueta={textos["login.etiqueta"]}
      titulo={textos["login.titulo"]}
      renovar={temRefresh}
    />
  );
}
