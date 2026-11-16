import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  descontoMaximoDosProdutos,
  normalizarCarrinho,
  normalizarCatalogoRevendedor,
  normalizarPedidos,
  normalizarProdutoRevendedor,
  produtoTemEstoque,
  type CarrinhoAtacado,
  type CorRevendedor,
  type PedidoAtacado,
  type ProdutoRevendedor,
} from "@/lib/atacado";
import { DEMO, produtosRevendedorDemo } from "@/lib/demo-catalogo";

export type CadastroRevendedor = {
  status: "pendente" | "aprovado" | "recusado";
  razao_social: string;
} | null;

export type CorCatalogo = CorRevendedor;

/** Produto da vitrine do revendedor; os preços vêm prontos do banco (nada é calculado aqui). */
export type ProdutoCatalogo = ProdutoRevendedor;

export type Novidade = { id: string; slug: string; nome: string; preco: number; foto: string | null };

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
  if (DEMO) return { itens: [], sku_distintos: 0, pecas: 0, total: 0 };
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

/**
 * Catálogo do revendedor: uma única chamada à RPC get_catalogo_revendedor com a sessão
 * dele (as tabelas do catálogo estão fechadas). null = erro (a página mostra o aviso).
 */
export async function carregarCatalogo(db: SupabaseClient): Promise<ProdutoCatalogo[] | null> {
  if (DEMO) return produtosRevendedorDemo();
  const { data, error } = await db.rpc("get_catalogo_revendedor");
  if (error) {
    registrarErro("get_catalogo_revendedor", error);
    return null;
  }
  const produtos = normalizarCatalogoRevendedor(data);
  if (!produtos) registrarErro("get_catalogo_revendedor", { message: "formato inesperado" });
  return produtos;
}

/** Um produto pelo slug (get_produto_revendedor). Resultado: produto, "inexistente" ou "erro". */
export async function carregarProduto(
  db: SupabaseClient,
  slug: string
): Promise<ProdutoCatalogo | "inexistente" | "erro"> {
  if (DEMO) return produtosRevendedorDemo().find((p) => p.slug === slug) ?? "inexistente";
  const { data, error } = await db.rpc("get_produto_revendedor", { p_slug: slug });
  if (error) {
    registrarErro("get_produto_revendedor", error);
    return "erro";
  }
  if (data === null || data === undefined) return "inexistente";
  return normalizarProdutoRevendedor(data) ?? "erro";
}

const QTD_NOVIDADES = 4;

/** Os primeiros produtos com estoque, na ordem em que o banco entrega o catálogo. */
export function novidadesDoCatalogo(produtos: ProdutoCatalogo[]): Novidade[] {
  return produtos
    .filter(produtoTemEstoque)
    .slice(0, QTD_NOVIDADES)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      nome: p.nome,
      preco: p.precoAtacado,
      foto: p.cores.find((c) => c.imagem)?.imagem ?? null,
    }));
}

/** Maior economia percentual entre varejo e atacado no catálogo (KPI "Desconto atacado"). */
export function descontoMaximoDoCatalogo(produtos: ProdutoCatalogo[]): number | null {
  return descontoMaximoDosProdutos(produtos);
}
