export type Categoria = {
  id: string;
  grupo: "calcados" | "acessorios";
  nome: string;
  slug: string;
  ordem: number;
  ativo: boolean;
  desconto_atacado_percentual: number | null;
  imagem?: string | null;
};

export type ProductSize = {
  id: string;
  color_id: string;
  tamanho: string;
  estoque: number;
};

export type ProductColor = {
  id: string;
  product_id: string;
  nome: string;
  hex: string | null;
  imagens: string[];
  ordem: number;
  sizes: ProductSize[];
};

export type Product = {
  id: string;
  slug: string | null;
  nome: string;
  categoria_id: string;
  categoria?: Categoria | null;
  colecao: string | null;
  // Em runtime vem null para o supervisor (admin_list_products mascara preços); só o admin os usa.
  preco: number;
  desconto_percentual: number | null;
  desconto_efetivo?: number | null;
  preco_atacado: number | null;
  descricao: string | null;
  caracteristicas: string[];
  ativo: boolean;
  destaque: boolean;
  ordem: number;
  surpresa_ativo: boolean;
  somente_bonus?: boolean;
  colors: ProductColor[];
};

export type OrderStatus =
  | "pendente"
  | "pago"
  | "preparando"
  | "enviado"
  | "pronto_retirada"
  | "entregue"
  | "retirado"
  | "cancelado";

export type OrderItem = {
  id: string;
  order_id: string;
  produto_id: string | null;
  produto_nome: string;
  produto_cor: string | null;
  produto_tamanho: string | null;
  color_id: string | null;
  size_id: string | null;
  quantidade: number;
  // null quando o RPC oculta valores (supervisor).
  preco_unit: number | null;
  subtotal: number | null;
  /** Brinde da bonificação (calculado por _order_json: pedido com bônus e item a preço 0). */
  bonus?: boolean;
};

export type EntregaTipo = "retirada" | "entrega" | "entrega_fora";

export type Order = {
  id: string;
  created_at: string;
  status: OrderStatus;
  cliente_nome: string;
  cliente_telefone: string | null;
  entrega_tipo: EntregaTipo;
  entrega_taxa: number | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_bairro: string | null;
  endereco_complemento: string | null;
  endereco_cep: string | null;
  endereco_cidade: string | null;
  valor_produtos: number | null;
  valor_total: number | null;
  bonus_aplicado?: boolean | null;
  /** Só em admin_list_orders (nunca em public_get_order). */
  bonus_aviso?: string | null;
  mp_payment_id: string | null;
  forma_pagamento: string | null;
  is_atacado: boolean;
  customer_id: string | null;
  revendedor_id: string | null;
  items: OrderItem[];
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pagamento aprovado",
  preparando: "Pedido em separação",
  enviado: "Saiu para entrega",
  pronto_retirada: "Pronto para retirada",
  entregue: "Entregue",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export function entregaTipoLabel(tipo: EntregaTipo): string {
  if (tipo === "retirada") return "Retirada na loja";
  if (tipo === "entrega_fora") return "Entrega (fora da cidade)";
  return "Entrega";
}

export type Sale = {
  id: string;
  data: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unit: number;
  valor_total: number;
  forma_pagamento: string | null;
  cliente: string | null;
  origem: string;
  produto_cor: string | null;
  produto_tamanho: string | null;
  mp_payment_id: string | null;
  status: string;
  is_atacado: boolean;
  created_at: string;
  order_id: string | null;
};

export type RevendedorStatus = "pendente" | "aprovado" | "recusado";

export type Revendedor = {
  id: string;
  razao_social: string;
  cnpj: string | null;
  responsavel: string;
  email: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  status: RevendedorStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  tem_conta: boolean;
};

export type EstoqueBaixoItem = { id: string; nome: string; estoque: number };

// Preço já com o desconto interno de varejo aplicado (o que de fato é
// cobrado do cliente no varejo). Sem desconto ativo, é igual ao preço de
// tabela.
export function precoVarejo(p: Pick<Product, "preco" | "desconto_percentual">): number {
  if (!p.desconto_percentual) return p.preco;
  // Math em centavos inteiros para bater exatamente com `round(numeric, 2)`
  // half-up do Postgres (`_preco_varejo`). Float direto diverge em ~1 centavo
  // numa faixa grande de preço×desconto.
  const cents = Math.round(p.preco * 100) * (100 - p.desconto_percentual);
  return Math.round(cents / 100) / 100;
}

const TRACO = "—";

/** Reais em pt-BR; "—" quando o valor é ocultado (null/undefined) ou inválido. */
export function brlOuTraco(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return TRACO;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function precisaNumeracao(grupo: Categoria["grupo"] | undefined): boolean {
  return grupo === "calcados";
}

export function contarSkusDistintos(
  items: { produtoId: string; colorId: string; sizeId: string | null }[]
): number {
  return new Set(items.map((i) => `${i.produtoId}::${i.colorId}::${i.sizeId ?? ""}`)).size;
}

export function totalEstoque(p: Pick<Product, "colors">): number {
  return p.colors.reduce(
    (sum, c) => sum + c.sizes.reduce((s, sz) => s + sz.estoque, 0),
    0
  );
}

export function capaImagem(p: Pick<Product, "colors">): string | null {
  for (const c of p.colors) {
    if (c.imagens && c.imagens.length > 0) return c.imagens[0];
  }
  return null;
}

export function slugify(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
