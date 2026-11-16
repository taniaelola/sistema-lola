import { MIN_SKUS_ATACADO, skusDistintos } from "@/lib/pricing";

export type EntregaTipoCheckout = "retirada" | "entrega" | "entrega_fora";

export type DadosEntrega = {
  nome: string;
  telefone: string;
  entregaTipo: EntregaTipoCheckout;
  rua?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  cep?: string;
  cidade?: string;
};

export const MSG_VAREJO_DESATIVADO = "A loja de varejo está desativada no momento.";

export function validarEntrega(dados: DadosEntrega): string | null {
  if (!dados.nome.trim()) return "Informe seu nome.";
  if (!dados.telefone.trim()) return "Informe seu telefone/WhatsApp.";
  if (
    (dados.entregaTipo === "entrega" || dados.entregaTipo === "entrega_fora") &&
    (!dados.rua?.trim() || !dados.numero?.trim() || !dados.bairro?.trim())
  ) {
    return "Preencha o endereço completo pra entrega (rua, número e bairro).";
  }
  if (dados.entregaTipo === "entrega_fora" && !dados.cidade?.trim()) {
    return "Informe a cidade pra combinarmos o frete.";
  }
  return null;
}

/**
 * Traduz a mensagem de `raise exception` de checkout_iniciar_pedido para o
 * cliente. `null` = erro desconhecido (quem chama loga e mostra o genérico).
 * Varejo só reconhece estoque, como antes.
 */
export function mensagemErroCheckout(
  msg: string | null | undefined,
  atacado: boolean
): string | null {
  const m = msg ?? "";
  // O banco recusa o checkout enquanto admin_config.varejo_ativo for false (vale para as duas vias).
  if (m.includes("varejo desativado")) return MSG_VAREJO_DESATIVADO;
  if (!atacado) {
    return m.includes("estoque insuficiente")
      ? "Um item do carrinho ficou sem estoque. Volte ao carrinho e ajuste as quantidades."
      : null;
  }

  const estoque = m.match(/estoque insuficiente: (.+) \(disponível: (-?\d+)\)/);
  if (estoque) {
    return `Sem estoque suficiente de ${estoque[1]} (disponível: ${estoque[2]}). Ajuste o carrinho de atacado e tente de novo.`;
  }
  if (m.includes("estoque insuficiente")) {
    return "Um item ficou sem estoque. Ajuste o carrinho de atacado e tente de novo.";
  }

  const minimo = m.match(/mínimo de (\d+) SKUs distintos \(carrinho tem (\d+)\)/);
  if (minimo) {
    return `O pedido de atacado precisa de pelo menos ${minimo[1]} produtos distintos. Seu carrinho tem ${minimo[2]}.`;
  }
  if (m.includes("mínimo de")) {
    return `O pedido de atacado precisa de pelo menos ${MIN_SKUS_ATACADO} produtos distintos.`;
  }

  if (m.includes("revendedor não aprovado")) {
    return "Seu cadastro de revendedor não está aprovado ou está inativo. Fale com a loja.";
  }

  const indisponivel = m.match(/(?:produto|cor|tamanho) indisponível(?:: (.+))?/);
  if (indisponivel) {
    return indisponivel[1]
      ? `${indisponivel[1]} não está mais disponível. Remova do carrinho de atacado e tente de novo.`
      : "Um item não está mais disponível. Ajuste o carrinho de atacado e tente de novo.";
  }

  if (m.includes("carrinho vazio")) return "Seu carrinho de atacado está vazio.";
  return null;
}

/** Linha de atacado_cart_get(). */
export type ItemCarrinhoAtacado = {
  id: string;
  product_id: string;
  color_id: string;
  size_id: string;
  nome: string;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
  preco_unit: number;
  subtotal: number;
  estoque: number;
  disponivel: boolean;
};

export function problemaLinhaAtacado(i: ItemCarrinhoAtacado): string | null {
  if (!i.disponivel) return "Produto indisponível — remova do carrinho.";
  if (i.estoque <= 0) return "Sem estoque — remova do carrinho.";
  if (i.estoque < i.quantidade) return `Só restam ${i.estoque} — ajuste a quantidade.`;
  return null;
}

export type AvaliacaoAtacado = {
  skus: number;
  problemas: { id: string; motivo: string }[];
  liberado: boolean;
  motivo: string | null;
};

export function avaliarCarrinhoAtacado(itens: ItemCarrinhoAtacado[]): AvaliacaoAtacado {
  const skus = skusDistintos(itens.filter((i) => i.disponivel));
  const problemas = itens.flatMap((i) => {
    const motivo = problemaLinhaAtacado(i);
    return motivo ? [{ id: i.id, motivo }] : [];
  });

  let motivo: string | null = null;
  if (itens.length === 0) motivo = "Seu carrinho de atacado está vazio.";
  else if (problemas.length > 0)
    motivo = "Há itens indisponíveis ou sem estoque suficiente. Ajuste o carrinho para continuar.";
  else if (skus < MIN_SKUS_ATACADO)
    motivo = `O pedido de atacado precisa de pelo menos ${MIN_SKUS_ATACADO} produtos distintos. Seu carrinho tem ${skus}.`;

  return { skus, problemas, liberado: motivo === null, motivo };
}
