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
