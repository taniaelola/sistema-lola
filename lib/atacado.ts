import { economiaPercentual } from "@/lib/lp";
import { MIN_SKUS_ATACADO } from "@/lib/pricing";
import { avaliarCarrinhoAtacado, type ItemCarrinhoAtacado } from "@/lib/checkout";
import { formatarReais } from "@/lib/home";

const FUSO = "America/Sao_Paulo";
const ESTOQUE_BAIXO = 5;
const QUANTIDADE_MAXIMA = 999;
const TRACO = "—";

export type ItemCarrinho = ItemCarrinhoAtacado & { imagem: string | null };

export type CarrinhoAtacado = {
  itens: ItemCarrinho[];
  sku_distintos: number;
  total: number;
};

export type PedidoAtacado = {
  id: string;
  created_at: string;
  status: string;
  valor_total: number;
  skus: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function quantidadeValida(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= QUANTIDADE_MAXIMA;
}

function inteiroNaoNegativo(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Soma as quantidades válidas (finitas e positivas); lixo e negativos são ignorados. */
export function somarPecas(linhas: { quantidade: number }[]): number {
  return linhas.reduce((t, l) => (Number.isFinite(l.quantidade) && l.quantidade > 0 ? t + l.quantidade : t), 0);
}

/** Bônus de brinde: ganha uma vez ao chegar em `min` peças (não acumula). */
export function progressoBonus(pecas: number, min: number, ativo: boolean) {
  const ganhou = ativo && pecas >= min;
  return { ativo, ganhou, faltam: ativo ? Math.max(0, min - pecas) : 0, pecas, min };
}

export function progressoSkus(skus: number) {
  const atual = inteiroNaoNegativo(skus);
  return {
    atual,
    minimo: MIN_SKUS_ATACADO,
    pct: Math.min(100, Math.round((atual / MIN_SKUS_ATACADO) * 100)),
    label: `${atual}/${MIN_SKUS_ATACADO}`,
    completo: atual >= MIN_SKUS_ATACADO,
  };
}

export function textoFaltam(skus: number): string | null {
  const faltam = MIN_SKUS_ATACADO - inteiroNaoNegativo(skus);
  if (faltam <= 0) return null;
  return faltam === 1 ? "Falta 1 produto para finalizar" : `Faltam ${faltam} produtos para finalizar`;
}

export function alertaLinha(i: Pick<ItemCarrinho, "disponivel" | "estoque" | "quantidade">): string | null {
  if (!i.disponivel) return "Produto indisponível";
  if (i.estoque <= 0) return "Sem estoque";
  if (i.quantidade > i.estoque) return `Só restam ${i.estoque}`;
  return null;
}

export function decisaoFinalizar(itens: ItemCarrinho[]): { habilitado: boolean; texto: string } {
  const av = avaliarCarrinhoAtacado(itens);
  const faltam = textoFaltam(av.skus);
  if (faltam) return { habilitado: false, texto: faltam };
  if (av.problemas.length > 0) {
    return { habilitado: false, texto: "Ajuste os itens com alerta para finalizar" };
  }
  return { habilitado: true, texto: "Finalizar pedido" };
}

export function badgeEstoque(estoque: number): string | null {
  if (!(estoque > 0)) return "Sem estoque";
  if (estoque <= ESTOQUE_BAIXO) return `Só restam ${estoque}`;
  return null;
}

export function proximaQuantidade(atual: number, estoque: number): number | null {
  const proxima = atual + 1;
  if (proxima > estoque || proxima > QUANTIDADE_MAXIMA) return null;
  return proxima;
}

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  preparando: "Preparando",
  enviado: "Enviado",
  pronto_retirada: "Pronto para retirada",
  entregue: "Entregue",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export function rotuloStatusPedido(status: string): string {
  return ROTULO_STATUS[status] ?? "Pendente";
}

export function descontoMaximo(percentuais: (number | null | undefined)[]): number | null {
  const validos = percentuais.filter(
    (p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 100
  );
  if (validos.length === 0) return null;
  return Math.max(...validos);
}

function mesNoFuso(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}`;
}

function formatarPercentual(n: number): string {
  const arredondado = Math.round(n * 10) / 10;
  return `até ${arredondado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const STATUS_SEM_COMPRA = new Set(["pendente", "cancelado"]);

export function calcularKpis({
  pedidos,
  descontoMaximo: desconto,
  agora,
}: {
  pedidos: PedidoAtacado[] | null;
  descontoMaximo: number | null;
  agora: Date;
}) {
  let pedidosMes = TRACO;
  let totalComprado = TRACO;
  if (pedidos) {
    const mesAtual = mesNoFuso(agora);
    pedidosMes = String(
      pedidos.filter((p) => {
        const d = new Date(p.created_at);
        return p.status !== "cancelado" && !Number.isNaN(d.getTime()) && mesNoFuso(d) === mesAtual;
      }).length
    );
    const pagos = pedidos.filter((p) => !STATUS_SEM_COMPRA.has(p.status));
    if (pagos.length > 0) {
      totalComprado = formatarReais(pagos.reduce((s, p) => s + p.valor_total, 0));
    }
  }
  return {
    pedidosMes,
    totalComprado,
    descontoAtacado: desconto == null ? TRACO : formatarPercentual(desconto),
  };
}

const MENSAGEM_GENERICA = "Não foi possível atualizar o carrinho agora. Tente de novo.";

export function mensagemErroAtacado(erro: { message?: string } | null | undefined): string {
  const msg = erro?.message ?? "";
  if (msg.includes("revendedor não aprovado")) {
    return "Seu cadastro de revendedor não está aprovado ou sua sessão expirou. Entre novamente.";
  }
  if (msg.includes("sem permissão")) {
    return "Seu acesso ao catálogo não está liberado ou a sessão expirou. Entre novamente.";
  }
  if (msg.includes("carrinho cheio")) return "Seu carrinho está cheio. Remova algum item antes de adicionar outro.";
  if (msg.includes("produto indisponível")) return "Esse produto está indisponível no momento.";
  if (msg.includes("item inválido")) return "Item inválido. Atualize a página e tente de novo.";
  return MENSAGEM_GENERICA;
}

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function registro(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizarItem(v: unknown): ItemCarrinho | null {
  const r = registro(v);
  if (!r) return null;
  const id = texto(r.id);
  const product_id = texto(r.product_id);
  const color_id = texto(r.color_id);
  const size_id = texto(r.size_id);
  const quantidade = numero(r.quantidade);
  const preco_unit = numero(r.preco_unit);
  if (!id || !product_id || !color_id || !size_id || quantidade == null || preco_unit == null) return null;
  return {
    id,
    product_id,
    color_id,
    size_id,
    nome: texto(r.nome) ?? "Produto",
    cor: texto(r.cor),
    tamanho: texto(r.tamanho),
    imagem: texto(r.imagem),
    quantidade,
    preco_unit,
    estoque: numero(r.estoque) ?? 0,
    subtotal: numero(r.subtotal) ?? preco_unit * quantidade,
    disponivel: r.disponivel !== false,
  };
}

export function normalizarCarrinho(data: unknown): CarrinhoAtacado {
  const r = registro(data);
  if (!r) return { itens: [], sku_distintos: 0, total: 0 };
  const itens = (Array.isArray(r.itens) ? r.itens : []).flatMap((i) => {
    const n = normalizarItem(i);
    return n ? [n] : [];
  });
  return { itens, sku_distintos: numero(r.sku_distintos) ?? 0, total: numero(r.total) ?? 0 };
}

export function normalizarPedidos(data: unknown): PedidoAtacado[] | null {
  if (!Array.isArray(data)) return null;
  return data.flatMap((v) => {
    const r = registro(v);
    const id = r && texto(r.id);
    const created_at = r && texto(r.created_at);
    const status = r && texto(r.status);
    const valor = r && numero(r.valor_total);
    if (!r || !id || !created_at || !status || valor == null) return [];
    return [{ id, created_at, status, valor_total: valor, skus: numero(r.skus) ?? 0 }];
  });
}

export type DecisaoGate = "aprovado" | "entrar" | "fora" | "pendente" | "recusado" | "sem-cadastro";

export function decisaoGate(entrada: {
  papel: string | null;
  ativo: boolean;
  status: string | null;
}): DecisaoGate {
  if (entrada.papel === null || !entrada.ativo) return "entrar";
  if (entrada.papel !== "revendedor") return "fora";
  if (entrada.status === "aprovado") return "aprovado";
  if (entrada.status === "pendente") return "pendente";
  if (entrada.status === "recusado") return "recusado";
  return "sem-cadastro";
}

export function pedidoIdCurto(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function dataPtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return TRACO;
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO });
}

/**
 * Margem informativa da revenda: diferença entre o preço de referência (varejo) e o
 * preço do revendedor (atacado). Nunca é gravada. 0/0 quando algum preço é inválido
 * ou quando o atacado não é menor que o varejo.
 */
export function margemRevenda(
  precoVarejo: number,
  precoAtacado: number
): { valor: number; percentual: number } {
  const valido = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!valido(precoVarejo) || !valido(precoAtacado) || precoAtacado >= precoVarejo) {
    return { valor: 0, percentual: 0 };
  }
  const valor = Math.round((precoVarejo - precoAtacado) * 100) / 100;
  return { valor, percentual: Math.round((valor / precoVarejo) * 100) };
}

export type TamanhoRevendedor = { id: string; tamanho: string; estoque: number };
export type CorRevendedor = {
  id: string;
  nome: string;
  hex: string | null;
  imagem: string | null;
  imagens: string[];
  tamanhos: TamanhoRevendedor[];
};
/** Produto como o banco entrega ao revendedor (preços já calculados). */
export type ProdutoRevendedor = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  caracteristicas: string[];
  categoria: string;
  /** Preço de referência para revenda (varejo, já com o desconto de varejo). */
  precoVarejo: number;
  /** Preço do revendedor (atacado). */
  precoAtacado: number;
  cores: CorRevendedor[];
};

/** Converte um `Produto` de get_catalogo_revendedor/get_produto_revendedor; null se inválido. */
export function normalizarProdutoRevendedor(v: unknown): ProdutoRevendedor | null {
  const r = registro(v);
  if (!r) return null;
  const id = texto(r.id);
  const slug = texto(r.slug);
  const nome = texto(r.nome);
  const varejo = numero(r.preco_varejo);
  const atacado = numero(r.preco_atacado);
  if (!id || !slug || nome === null || varejo == null || atacado == null) return null;
  const cat = registro(r.categoria);
  const cores = (Array.isArray(r.cores) ? r.cores : []).flatMap<CorRevendedor>((cv) => {
    const c = registro(cv);
    const cid = c && texto(c.id);
    if (!c || !cid) return [];
    const imagens = (Array.isArray(c.imagens) ? c.imagens : []).filter(
      (i): i is string => typeof i === "string" && i !== ""
    );
    const tamanhos = (Array.isArray(c.tamanhos) ? c.tamanhos : []).flatMap<TamanhoRevendedor>((tv) => {
      const t = registro(tv);
      const tid = t && texto(t.id);
      if (!t || !tid) return [];
      return [{ id: tid, tamanho: texto(t.tamanho) ?? "", estoque: numero(t.estoque) ?? 0 }];
    });
    return [{ id: cid, nome: texto(c.nome) ?? "", hex: texto(c.hex), imagem: imagens[0] ?? null, imagens, tamanhos }];
  });
  return {
    id,
    slug,
    nome,
    descricao: texto(r.descricao) ?? "",
    caracteristicas: (Array.isArray(r.caracteristicas) ? r.caracteristicas : []).filter(
      (x): x is string => typeof x === "string" && x.trim() !== ""
    ),
    categoria: (cat && texto(cat.nome)) ?? "",
    precoVarejo: varejo,
    precoAtacado: atacado,
    cores,
  };
}

/** `{ categorias, produtos }` de get_catalogo_revendedor; null quando o formato não é o esperado. */
export function normalizarCatalogoRevendedor(data: unknown): ProdutoRevendedor[] | null {
  const r = registro(data);
  if (!r || !Array.isArray(r.produtos)) return null;
  return r.produtos.flatMap((p) => {
    const n = normalizarProdutoRevendedor(p);
    return n ? [n] : [];
  });
}

/** Maior economia percentual (varejo vs. atacado) entre os produtos; null sem produtos. */
export function descontoMaximoDosProdutos(
  produtos: Pick<ProdutoRevendedor, "precoVarejo" | "precoAtacado">[]
): number | null {
  if (produtos.length === 0) return null;
  return Math.max(...produtos.map((p) => economiaPercentual(p.precoVarejo, p.precoAtacado)));
}

export function produtoTemEstoque(p: Pick<ProdutoRevendedor, "cores">): boolean {
  return p.cores.some((c) => c.tamanhos.some((t) => t.estoque > 0));
}

/**
 * Mensagem do indicador de bonificação do carrinho. "" quando o bônus está desligado.
 * Os números vêm da configuração da loja (`min` e `pecas` já estão em `p`), nunca fixos aqui.
 */
export function textoBonus(
  p: ReturnType<typeof progressoBonus>,
  nomeBonus: string | null,
  qtd: number
): string {
  if (!p.ativo) return "";
  const nome = nomeBonus?.trim() || null;
  const unidades = Number.isInteger(qtd) && qtd > 1 ? `${qtd}× ` : "";
  if (p.ganhou) {
    return nome ? `Bonificação garantida: você ganha ${unidades}${nome}!` : "Bonificação garantida!";
  }
  const pecas = p.faltam === 1 ? "peça" : "peças";
  const alvo = nome ? `${unidades}${nome}` : "a bonificação";
  return `${p.pecas} de ${p.min} peças: faltam ${p.faltam} ${pecas} para ganhar ${alvo}`;
}

export type SecaoAtacado = "painel" | "catalogo" | "produto" | "carrinho" | "pedidos";

/** Seção da área do revendedor para o título do cabeçalho e o item ativo do menu. */
export function secaoAtacado(caminho: string): SecaoAtacado {
  const dentro = (base: string) => caminho === base || caminho.startsWith(`${base}/`);
  if (dentro("/atacado/produto")) return "produto";
  if (dentro("/atacado/catalogo")) return "catalogo";
  if (dentro("/atacado/carrinho")) return "carrinho";
  if (dentro("/atacado/pedidos")) return "pedidos";
  return "painel";
}

/** Item do pedido que é a bonificação: marcado pelo banco ou, sem a marca, gratuito (preço e subtotal 0). */
export function itemEhBonus(i: {
  bonus_aplicado?: boolean;
  quantidade: number;
  preco_unit: number | null;
  subtotal: number | null;
}): boolean {
  if (i.bonus_aplicado === true) return true;
  return i.quantidade > 0 && i.preco_unit === 0 && i.subtotal === 0;
}

/**
 * Linha de entrega do resumo do pedido. null = não mostrar (por exemplo, valores ocultos para o
 * supervisor: taxa null não pode virar "Grátis").
 */
export function linhaEntrega(
  tipo: string,
  taxa: number | null | undefined
): { rotulo: string; valor: number | "A combinar" | "Grátis" } | null {
  if (tipo === "entrega_fora") return { rotulo: "Frete", valor: "A combinar" };
  if (typeof taxa !== "number" || !Number.isFinite(taxa)) return null;
  if (taxa > 0) return { rotulo: "Taxa de entrega", valor: taxa };
  return tipo === "entrega" ? { rotulo: "Entrega", valor: "Grátis" } : null;
}
