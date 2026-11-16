"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessao } from "@/lib/auth";
import { supabaseComToken } from "@/lib/supabase";
import {
  ehUuid,
  mensagemErroAtacado,
  normalizarCarrinho,
  normalizarProdutoRevendedor,
  proximaQuantidade,
  quantidadeValida,
} from "@/lib/atacado";
import { cadastroAprovado, registrarErro } from "./dados";

export type ResultadoAcao = { error: string | null };

const ERRO_ENTRADA = "Item inválido. Atualize a página e tente de novo.";
const ERRO_ESTOQUE = "Não há mais estoque disponível para esse item.";
const ERRO_ITEM_NAO_ENCONTRADO = "Esse item não está mais no seu carrinho.";
const ERRO_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const ERRO_NAO_APROVADO = "Seu cadastro de revendedor não está aprovado.";

function ok(): ResultadoAcao {
  revalidatePath("/atacado", "layout");
  return { error: null };
}

function falha(mensagem: string): ResultadoAcao {
  return { error: mensagem };
}

async function preparar(): Promise<{ db: SupabaseClient; erro: null } | { db: null; erro: string }> {
  const sessao = await getSessao({ renovar: true });
  if (!sessao) return { db: null, erro: ERRO_SESSAO };
  const db = supabaseComToken(sessao.accessToken);
  if (!(await cadastroAprovado(db))) return { db: null, erro: ERRO_NAO_APROVADO };
  return { db, erro: null };
}

function falhaRpc(contexto: string, erro: { code?: string; message?: string }): ResultadoAcao {
  registrarErro(contexto, erro);
  return falha(mensagemErroAtacado(erro));
}

function falhaInesperada(contexto: string, e: unknown): ResultadoAcao {
  registrarErro(contexto, { message: e instanceof Error ? e.message : String(e) });
  return falha(mensagemErroAtacado(null));
}

// O banco (atacado_cart_set_item) valida revendedor aprovado, produto ativo e a ligação
// produto/cor/tamanho, mas NÃO valida estoque. Por isso o estoque é lido aqui, no servidor,
// por get_produto_revendedor(slug); nada que o navegador mande sobre estoque é confiável.
// O slug vai como parâmetro ligado do RPC (sem concatenação de SQL): aqui só barramos entrada
// vazia, enorme ou com espaço/caractere de controle; a existência é decidida pelo banco.
const SLUG = /^[^\s\x00-\x1f\x7f]{1,200}$/;

export async function addAoCarrinho(
  slug: string,
  colorId: string,
  sizeId: string
): Promise<ResultadoAcao> {
  try {
    if (typeof slug !== "string" || !SLUG.test(slug) || !ehUuid(colorId) || !ehUuid(sizeId)) {
      return falha(ERRO_ENTRADA);
    }
    const { db, erro } = await preparar();
    if (!db) return falha(erro);

    const produto = await db.rpc("get_produto_revendedor", { p_slug: slug });
    if (produto.error) return falhaRpc("addAoCarrinho/produto", produto.error);
    const p = normalizarProdutoRevendedor(produto.data);
    const tamanho = p?.cores.find((c) => c.id === colorId)?.tamanhos.find((t) => t.id === sizeId);
    if (!p || !tamanho) return falha(ERRO_ENTRADA);

    const lido = await db.rpc("atacado_cart_get");
    if (lido.error) return falhaRpc("addAoCarrinho/cart_get", lido.error);
    const linha = normalizarCarrinho(lido.data).itens.find(
      (i) => i.product_id === p.id && i.color_id === colorId && i.size_id === sizeId
    );

    const quantidade = proximaQuantidade(linha?.quantidade ?? 0, tamanho.estoque);
    if (quantidade === null) return falha(ERRO_ESTOQUE);

    const { error } = await db.rpc("atacado_cart_set_item", {
      p_product_id: p.id,
      p_color_id: colorId,
      p_size_id: sizeId,
      p_quantidade: quantidade,
    });
    if (error) return falhaRpc("addAoCarrinho/set_item", error);
    return ok();
  } catch (e) {
    return falhaInesperada("addAoCarrinho", e);
  }
}

export async function alterarQuantidade(
  itemId: string,
  quantidade: number
): Promise<ResultadoAcao> {
  try {
    if (!ehUuid(itemId) || !quantidadeValida(quantidade)) return falha(ERRO_ENTRADA);
    const { db, erro } = await preparar();
    if (!db) return falha(erro);

    const lido = await db.rpc("atacado_cart_get");
    if (lido.error) return falhaRpc("alterarQuantidade/cart_get", lido.error);
    const linha = normalizarCarrinho(lido.data).itens.find((i) => i.id === itemId);
    if (!linha) return falha(ERRO_ITEM_NAO_ENCONTRADO);
    if (quantidade > linha.quantidade && quantidade > linha.estoque) return falha(ERRO_ESTOQUE);

    const { error } = await db.rpc("atacado_cart_set_item", {
      p_product_id: linha.product_id,
      p_color_id: linha.color_id,
      p_size_id: linha.size_id,
      p_quantidade: quantidade,
    });
    if (error) return falhaRpc("alterarQuantidade/set_item", error);
    return ok();
  } catch (e) {
    return falhaInesperada("alterarQuantidade", e);
  }
}

export async function removerItem(itemId: string): Promise<ResultadoAcao> {
  try {
    if (!ehUuid(itemId)) return falha(ERRO_ENTRADA);
    const { db, erro } = await preparar();
    if (!db) return falha(erro);
    const { error } = await db.rpc("atacado_cart_remove_item", { p_id: itemId });
    if (error) return falhaRpc("removerItem", error);
    return ok();
  } catch (e) {
    return falhaInesperada("removerItem", e);
  }
}
