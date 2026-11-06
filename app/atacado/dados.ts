import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { precoAtacado } from "@/lib/pricing";
import { selecionarLancamentos } from "@/lib/home";
import {
  descontoMaximo,
  normalizarCarrinho,
  normalizarPedidos,
  type CarrinhoAtacado,
  type PedidoAtacado,
} from "@/lib/atacado";
import { precoVarejo, type Product } from "@/lib/types";
import { DEMO, PRODUTOS_DEMO } from "@/lib/demo-catalogo";

export type CadastroRevendedor = {
  status: "pendente" | "aprovado" | "recusado";
  razao_social: string;
} | null;

export type CorCatalogo = {
  id: string;
  nome: string;
  hex: string | null;
  imagem: string | null;
  tamanhos: { id: string; tamanho: string; estoque: number }[];
};

export type ProdutoCatalogo = {
  id: string;
  nome: string;
  categoria: string;
  /** Preço de varejo de referência para a revenda. */
  precoVarejo: number;
  /** Preço de atacado (hoje derivado em TS; o banco passa a entregá-lo pronto na Task 9). */
  preco: number;
  cores: CorCatalogo[];
};

export type Novidade = { id: string; nome: string; preco: number; foto: string | null };

export function registrarErro(contexto: string, erro: { code?: string; message?: string } | null | undefined) {
  console.error(`[atacado] ${contexto}`, { code: erro?.code ?? null, message: erro?.message ?? null });
}

export function agora(): Date {
  return new Date();
}

export async function carregarCadastro(db: SupabaseClient): Promise<CadastroRevendedor> {
  const { data, error } = await db.rpc("atacado_me");
  if (error) {
    registrarErro("atacado_me", error);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const r = data as { status?: unknown; razao_social?: unknown };
  if (r.status !== "pendente" && r.status !== "aprovado" && r.status !== "recusado") return null;
  return { status: r.status, razao_social: typeof r.razao_social === "string" ? r.razao_social : "" };
}

export async function cadastroAprovado(db: SupabaseClient): Promise<boolean> {
  return (await carregarCadastro(db))?.status === "aprovado";
}

export async function carregarCarrinho(db: SupabaseClient): Promise<CarrinhoAtacado | null> {
  if (DEMO) return { itens: [], sku_distintos: 0, total: 0 };
  const { data, error } = await db.rpc("atacado_cart_get");
  if (error) {
    registrarErro("atacado_cart_get", error);
    return null;
  }
  return normalizarCarrinho(data);
}

export async function carregarPedidos(db: SupabaseClient): Promise<PedidoAtacado[] | null> {
  if (DEMO) return [];
  const { data, error } = await db.rpc("atacado_my_orders");
  if (error) {
    registrarErro("atacado_my_orders", error);
    return null;
  }
  return normalizarPedidos(data);
}

type LinhaProduto = Product & { created_at?: string | null };

const SELECT_CATALOGO =
  "id, nome, preco, preco_atacado, ordem, ativo, created_at, categoria:categorias!inner(id, nome, desconto_atacado_percentual, ativo), colors:product_colors(id, nome, hex, imagens, ordem, sizes:product_sizes(id, tamanho, estoque))";

function primeiraImagem(imagens: string[] | null | undefined): string | null {
  return imagens?.find((i) => typeof i === "string" && i !== "") ?? null;
}

function cores(p: LinhaProduto): CorCatalogo[] {
  return [...(p.colors ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      hex: c.hex,
      imagem: primeiraImagem(c.imagens),
      tamanhos: (c.sizes ?? []).map((s) => ({
        id: s.id,
        tamanho: s.tamanho,
        estoque: Number(s.estoque),
      })),
    }));
}

export async function carregarCatalogo(
  db: SupabaseClient
): Promise<ProdutoCatalogo[] | null> {
  if (DEMO) {
    return PRODUTOS_DEMO.map((p) => ({
      id: p.id,
      nome: p.nome,
      categoria: p.categoria?.nome ?? "",
      precoVarejo: precoVarejo(p), // removido na Task 9
      preco: precoAtacado(p, p.categoria),
      cores: p.colors.map((c) => ({
        id: c.id,
        nome: c.nome,
        hex: c.hex,
        imagem: c.imagens[0] ?? null,
        tamanhos: c.sizes.map((s) => ({ id: s.id, tamanho: s.tamanho, estoque: s.estoque })),
      })),
    }));
  }
  const { data, error } = await db
    .from("products")
    .select(SELECT_CATALOGO)
    .eq("ativo", true)
    .eq("categoria.ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error || !data) {
    registrarErro("catalogo", error);
    return null;
  }

  const linhas = data as unknown as LinhaProduto[];
  return linhas.map<ProdutoCatalogo>((p) => ({
    id: p.id,
    nome: p.nome,
    categoria: p.categoria?.nome ?? "",
    precoVarejo: precoVarejo(p), // removido na Task 9
    preco: precoAtacado(p, p.categoria),
    cores: cores(p),
  }));
}

const JANELA_NOVIDADES = 12;

export async function carregarNovidades(
  db: SupabaseClient
): Promise<Novidade[] | null> {
  if (DEMO) {
    return PRODUTOS_DEMO.slice(0, 4).map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: precoAtacado(p, p.categoria),
      foto: p.colors[0]?.imagens[0] ?? null,
    }));
  }
  const { data, error } = await db
    .from("products")
    .select(SELECT_CATALOGO)
    .eq("ativo", true)
    .eq("categoria.ativo", true)
    .order("created_at", { ascending: false })
    .limit(JANELA_NOVIDADES);
  if (error || !data) {
    registrarErro("novidades", error);
    return null;
  }

  const linhas = data as unknown as LinhaProduto[];
  return selecionarLancamentos(
    linhas.map((p) => ({
      p,
      id: p.id,
      nome: p.nome,
      ordem: p.ordem,
      ativo: p.ativo,
      created_at: p.created_at ?? null,
      colors: (p.colors ?? []).map((c) => ({ sizes: c.sizes ?? [] })),
    })),
    4
  ).map<Novidade>(({ p }) => ({
    id: p.id,
    nome: p.nome,
    preco: precoAtacado(p, p.categoria),
    foto: cores(p).find((c) => c.imagem)?.imagem ?? null,
  }));
}

export async function carregarDescontoMaximo(db: SupabaseClient): Promise<number | null> {
  if (DEMO) return 30;
  const { data, error } = await db
    .from("categorias")
    .select("desconto_atacado_percentual")
    .eq("ativo", true);
  if (error || !data) {
    registrarErro("categorias", error);
    return null;
  }
  return descontoMaximo(
    (data as { desconto_atacado_percentual: number | null }[]).map((c) => c.desconto_atacado_percentual)
  );
}
