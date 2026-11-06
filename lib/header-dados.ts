import "server-only";

import { getPerfil } from "@/lib/auth";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { getTextos, TEXTOS_PADRAO } from "@/lib/textos";
import type { CategoriaNav, PerfilNav } from "@/lib/header-menu";

export type DadosHeader = {
  categorias: CategoriaNav[];
  varejoAtivo: boolean;
  perfil: PerfilNav | null;
  avisoTexto: string;
  avisoAtivo: string;
};

export type DadosRodape = {
  categorias: CategoriaNav[];
  varejoAtivo: boolean;
  textos: Record<string, string>;
};

// Categorias de varejo só voltam com a migração que religar o varejo: as tabelas do catálogo
// estão fechadas para anon/authenticated e o cabeçalho/rodapé não consulta mais produto.
export async function getCategoriasNav(): Promise<CategoriaNav[]> {
  return [];
}

async function getPerfilNav(): Promise<PerfilNav | null> {
  try {
    const perfil = await getPerfil();
    if (!perfil || !perfil.ativo) return null;
    return { nome: perfil.nome, papel: perfil.papel };
  } catch {
    return null;
  }
}

export async function carregarDadosHeader(): Promise<DadosHeader> {
  const [categorias, perfil, textos, flags] = await Promise.all([
    getCategoriasNav(),
    getPerfilNav(),
    getTextos().catch(() => TEXTOS_PADRAO),
    getLojaFlags(),
  ]);
  return {
    categorias,
    varejoAtivo: flags.varejoAtivo,
    perfil,
    avisoTexto: textos["aviso.texto"],
    avisoAtivo: textos["aviso.ativo"],
  };
}

export async function carregarDadosRodape(): Promise<DadosRodape> {
  const [categorias, textos, flags] = await Promise.all([
    getCategoriasNav(),
    getTextos().catch(() => TEXTOS_PADRAO),
    getLojaFlags(),
  ]);
  return { categorias, varejoAtivo: flags.varejoAtivo, textos };
}
