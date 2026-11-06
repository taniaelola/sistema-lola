import { precoVarejo } from "@/lib/types";

export const MIN_SKUS_ATACADO = 12;

export type PromocaoAtiva = {
  desconto_percentual: number;
  aplica_a_categoria_id: string | null;
};

export function descontoEfetivo(
  p: { desconto_percentual: number | null; categoria_id: string | null },
  promos: PromocaoAtiva[]
): number | null {
  let maior = p.desconto_percentual && p.desconto_percentual > 0 ? p.desconto_percentual : 0;
  for (const promo of promos) {
    const aplica =
      promo.aplica_a_categoria_id == null || promo.aplica_a_categoria_id === p.categoria_id;
    if (aplica && promo.desconto_percentual > maior) maior = promo.desconto_percentual;
  }
  return maior > 0 ? maior : null;
}

export function comDescontoEfetivo<
  T extends {
    desconto_percentual: number | null;
    categoria_id?: string | null;
    categoria?: { id: string } | null;
  },
>(produtos: T[], promos: PromocaoAtiva[]): (T & { desconto_efetivo: number | null })[] {
  return produtos.map((p) => ({
    ...p,
    desconto_efetivo: descontoEfetivo(
      {
        desconto_percentual: p.desconto_percentual,
        categoria_id: p.categoria_id ?? p.categoria?.id ?? null,
      },
      promos
    ),
  }));
}

export function precoVarejoEfetivo(p: { preco: number; desconto_efetivo?: number | null }): {
  final: number;
  original: number;
  pct: number | null;
} {
  const pct = p.desconto_efetivo && p.desconto_efetivo > 0 ? p.desconto_efetivo : null;
  return {
    final: precoVarejo({ preco: p.preco, desconto_percentual: pct }),
    original: p.preco,
    pct,
  };
}

export function skusDistintos(
  itens: { product_id: string; color_id: string; size_id: string }[]
): number {
  return new Set(itens.map((i) => `${i.product_id}::${i.color_id}::${i.size_id}`)).size;
}
