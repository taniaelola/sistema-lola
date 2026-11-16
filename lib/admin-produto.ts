// Regras puras do editor de produto: preço só para quem pode editar preço (admin/superadmin).
// O banco é a barreira real (admin_upsert_product preserva o preço do supervisor); aqui evitamos
// pedir ao supervisor o que ele não pode preencher e reenviamos sempre `somente_bonus`.
import type { Product } from "@/lib/types";

export const AVISO_SEM_PRECO =
  "Preço, preço de atacado e desconto são definidos por um admin. Produto novo fica inativo e com preço zero até lá.";
export const DICA_SOMENTE_BONUS =
  "Produto de bônus não aparece na vitrine; só entra no pedido como brinde. Precisa de preço nominal maior que zero para poder ser ativado.";

/** Produto novo do supervisor nasce inativo; os demais casos seguem o produto (ou ativo, se novo). */
export function ativoInicialProduto(product: Product | null, podeEditarPreco: boolean): boolean {
  if (product) return product.ativo;
  return podeEditarPreco;
}

/** O valor de somente_bonus nunca vira `false` por omissão: sem dado, devolve null e o banco mantém. */
export function somenteBonusParaEnvio(product: Product | null, marcado: boolean): boolean | null {
  if (product && product.somente_bonus === undefined && marcado === false) return null;
  return marcado;
}

export type EntradaProduto = {
  nome: string;
  categoriaId: string;
  preco: string;
  ativo: boolean;
  podeEditarPreco: boolean;
  /**
   * Preço já gravado (para o supervisor, que não preenche preço). null = desconhecido: admin_list_products
   * mascara o preço do supervisor; a trava "defina o preço antes de ativar" fica com o banco.
   */
  precoAtual: number | null;
  /**
   * Override de preço de atacado digitado (texto do campo). Só vale para quem edita preço. Vazio = sem override.
   * O banco também barra desconto de categoria de 100%, que o cliente não enxerga aqui.
   */
  precoAtacado?: string;
  /** Brinde (somente_bonus) mantém só a regra do preço nominal. */
  somenteBonus?: boolean;
};

export type ResultadoProduto = { ok: true; preco: number } | { ok: false; erro: string };

export function validarProdutoBasico(e: EntradaProduto): ResultadoProduto {
  if (!e.nome.trim() || !e.categoriaId) {
    return { ok: false, erro: e.podeEditarPreco ? "Preencha ao menos nome, categoria e preço." : "Preencha ao menos nome e categoria." };
  }
  let preco = e.precoAtual ?? 0;
  if (e.podeEditarPreco) {
    if (!e.preco.trim()) return { ok: false, erro: "Preencha ao menos nome, categoria e preço." };
    preco = parseFloat(e.preco.replace(",", "."));
    if (!Number.isFinite(preco) || preco < 0) return { ok: false, erro: "O preço deve ser um número válido." };
  }
  if (e.ativo && e.precoAtual !== null && preco === 0) return { ok: false, erro: "Defina o preço antes de ativar o produto." };
  if (e.ativo && e.podeEditarPreco && !e.somenteBonus && e.precoAtacado?.trim()) {
    const pa = parseFloat(e.precoAtacado.replace(",", "."));
    if (Number.isFinite(pa) && pa === 0) {
      return { ok: false, erro: "Defina um preço de atacado maior que zero antes de ativar o produto." };
    }
  }
  return { ok: true, preco };
}

/**
 * Preço de atacado efetivo exibido no admin. Espelha _preco_atacado (SQL):
 * preço próprio do produto > desconto da categoria > preço de varejo.
 */
export function precoAtacadoEfetivo(
  preco: number,
  precoAtacado: number | null | undefined,
  descontoCategoriaPct: number | null | undefined
): number {
  if (precoAtacado != null) return precoAtacado;
  if (descontoCategoriaPct != null) return Math.round(preco * (100 - descontoCategoriaPct)) / 100;
  return preco;
}
