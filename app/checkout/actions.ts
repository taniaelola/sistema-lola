"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { varejoDisponivel } from "@/lib/loja-rotas";
import { urlEntrar } from "@/lib/roles";
import { supabaseComToken } from "@/lib/supabase";
import { criarPreferencia, montarItensMP, resolverOrigem } from "@/lib/mercadopago";
import {
  MSG_VAREJO_DESATIVADO,
  mensagemErroCheckout,
  validarEntrega,
  validarEntregaAtacado,
  type DadosEntrega,
} from "@/lib/checkout";

export type { DadosEntrega } from "@/lib/checkout";

export type ItemCarrinhoInput = {
  produtoId: string;
  colorId: string;
  sizeId: string | null;
  nome: string;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  precoUnit: number;
};

// Login obrigatório: abre a aba Entrar (quem já tem conta); o cadastro fica nos links "Seja revendedora".
const LOGIN_ATACADO = urlEntrar("/atacado");

type Resultado = { url?: string; error?: string };

export async function criarPedido(
  itens: ItemCarrinhoInput[],
  dados: DadosEntrega
): Promise<Resultado> {
  // O banco também recusa, mas nem chamamos o RPC com o varejo desligado.
  if (!varejoDisponivel(await getLojaFlags())) return { error: MSG_VAREJO_DESATIVADO };
  if (!itens.length) return { error: "Carrinho vazio." };
  const invalido = validarEntrega(dados);
  if (invalido) return { error: invalido };

  return iniciarPedido(
    dados,
    itens.map((i) => ({
      produto_id: i.produtoId,
      color_id: i.colorId,
      size_id: i.sizeId,
      quantidade: i.quantidade,
    })),
    false
  );
}

/** Atacado: os itens vêm do carrinho do revendedor no servidor, nunca do cliente. */
export async function criarPedidoAtacado(dados: DadosEntrega): Promise<Resultado> {
  const invalido = validarEntregaAtacado(dados);
  if (invalido) return { error: invalido };
  return iniciarPedido(dados, [], true);
}

async function iniciarPedido(
  dados: DadosEntrega,
  pItems: { produto_id: string; color_id: string; size_id: string | null; quantidade: number }[],
  atacado: boolean
): Promise<Resultado> {
  // O banco só aceita checkout de usuário autenticado (deriva customer_id/revendedor_id
  // de auth.uid()); sem sessão não há convidado: volta para o login de revendedora.
  const sessao = await getSessao({ renovar: true });
  if (!sessao) redirect(LOGIN_ATACADO);
  const db = supabaseComToken(sessao.accessToken);
  const args = {
    p_cliente_nome: dados.nome.trim(),
    p_cliente_telefone: dados.telefone.trim(),
    p_entrega_tipo: dados.entregaTipo,
    p_endereco_rua: dados.rua ?? null,
    p_endereco_numero: dados.numero ?? null,
    p_endereco_bairro: dados.bairro ?? null,
    p_endereco_complemento: dados.complemento ?? null,
    p_endereco_cep: dados.cep ?? null,
    p_endereco_cidade:
      dados.entregaTipo === "entrega_fora" ? dados.cidade?.trim() ?? null : null,
    p_items: pItems,
    p_is_atacado: atacado,
  };
  const resposta = await db.rpc("checkout_iniciar_pedido", args);
  const { data, error } = resposta;

  if (error || !data) {
    const amigavel = mensagemErroCheckout(error?.message, atacado);
    if (amigavel) return { error: amigavel };
    console.error("checkout_iniciar_pedido falhou:", error);
    return { error: "Não consegui criar o pedido agora. Tenta de novo em instantes." };
  }

  // A RPC retorna jsonb { id, entrega_taxa, itens } — `itens` são as linhas
  // precificadas no servidor (fonte da verdade do valor cobrado).
  const orderId = (data as { id: string }).id;
  const entregaTaxa = Number((data as { entrega_taxa?: number }).entrega_taxa ?? 0);
  const rpcItens =
    (data as { itens?: { titulo: string; quantidade: number; preco_unit: number }[] }).itens ?? [];

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = resolverOrigem(process.env.NEXT_PUBLIC_SITE_URL, host, proto);

  // Taxa de entrega entra como linha própria quando > 0 ("entrega_fora" = 0,
  // frete combinado pelo WhatsApp).
  const mpItens = montarItensMP(rpcItens, entregaTaxa);

  try {
    const pref = await criarPreferencia({
      itens: mpItens,
      externalReference: JSON.stringify({ order_id: orderId }),
      origin,
      successPath: `/pedido/${orderId}`,
    });
    return { url: pref.init_point };
  } catch (e) {
    console.error("criarPreferencia falhou:", e);
    return { error: "Não consegui gerar o pagamento agora. Tenta de novo em instantes." };
  }
}
