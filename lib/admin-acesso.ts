import type { EntregaTipo, OrderStatus } from "@/lib/types";
import { podeAcessar, type Papel, type Tela } from "@/lib/roles";

export type AdminScreen =
  | "visao-geral"
  | "pedidos"
  | "vendas"
  | "produtos"
  | "financeiro"
  | "promocoes"
  | "revendedores"
  | "usuarios"
  | "banner"
  | "textos";

export const ADMIN_SCREENS: AdminScreen[] = [
  "visao-geral",
  "pedidos",
  "vendas",
  "produtos",
  "financeiro",
  "promocoes",
  "revendedores",
  "usuarios",
  "banner",
  "textos",
];

export const TELA_DA_SCREEN: Record<AdminScreen, Tela> = {
  "visao-geral": "visao-geral",
  pedidos: "pedidos",
  vendas: "vendas",
  produtos: "produtos",
  financeiro: "financeiro",
  promocoes: "promocoes",
  revendedores: "revendedores",
  usuarios: "usuarios",
  banner: "banner",
  textos: "textos",
};

export function screensVisiveis(papel: Papel): AdminScreen[] {
  return ADMIN_SCREENS.filter((s) => podeAcessar(papel, TELA_DA_SCREEN[s]));
}

export function screenPermitida(papel: Papel, atual: AdminScreen): AdminScreen | null {
  const visiveis = screensVisiveis(papel);
  if (visiveis.includes(atual)) return atual;
  return visiveis[0] ?? null;
}

/**
 * Matriz da spec §4.4 por operação de servidor. A decisão final é do banco
 * (assert_papel em cada RPC); isto evita chamadas inúteis e dá mensagem clara.
 */
export type AcaoAdmin =
  | "cadastro"
  | "preco"
  | "exclusao"
  | "vendas-escrita"
  | "liquidar"
  | "pedidos"
  | "vendas-leitura"
  | "estoque-baixo"
  | "config"
  | "revendedores"
  | "revendedores-status"
  | "textos"
  | "banner"
  | "promocoes"
  | "usuarios";

const ADMINS: Papel[] = ["superadmin", "admin"];
const EQUIPE_TODA: Papel[] = ["superadmin", "admin", "supervisor"];

const PAPEIS_DA_ACAO: Record<AcaoAdmin, Papel[]> = {
  // Cadastro de produto/cor/tamanho/categoria; preço e exclusão ficam só com admin.
  cadastro: EQUIPE_TODA,
  preco: ADMINS,
  exclusao: ADMINS,
  "vendas-escrita": ADMINS,
  // Registrar pagamento de pedido (baixa estoque e lança a venda): equipe toda, inclusive a supervisora.
  liquidar: EQUIPE_TODA,
  pedidos: EQUIPE_TODA,
  "vendas-leitura": EQUIPE_TODA,
  "estoque-baixo": EQUIPE_TODA,
  config: ["superadmin"],
  revendedores: EQUIPE_TODA,
  "revendedores-status": ADMINS,
  textos: ADMINS,
  banner: ADMINS,
  promocoes: ADMINS,
  usuarios: ADMINS,
};

export function podeExecutar(papel: Papel, acao: AcaoAdmin): boolean {
  return PAPEIS_DA_ACAO[acao].includes(papel);
}

/** Campos de preço (preco, preco_atacado, desconto_percentual, desconto da categoria) só para superadmin/admin. */
export function camposPrecoEditaveis(papel: Papel): boolean {
  return podeExecutar(papel, "preco");
}

export const MSG_SEM_PERMISSAO = "Sem permissão.";
export const MSG_CONTA_DESATIVADA = "Conta desativada.";
export const MSG_PERFIL_INDISPONIVEL = "Não foi possível confirmar sua conta agora. Tente de novo.";

export type DecisaoAcesso =
  | { ok: true }
  | { ok: false; error: string; encerrarSessao: boolean };

/** `perfil` nulo = get_my_profile falhou ou não devolveu perfil (pode ser transitório). */
export function decidirAcesso(
  perfil: { papel: Papel; ativo: boolean } | null,
  acao: AcaoAdmin
): DecisaoAcesso {
  if (!perfil) return { ok: false, error: MSG_PERFIL_INDISPONIVEL, encerrarSessao: false };
  if (!perfil.ativo) return { ok: false, error: MSG_CONTA_DESATIVADA, encerrarSessao: true };
  if (!podeExecutar(perfil.papel, acao)) return { ok: false, error: MSG_SEM_PERMISSAO, encerrarSessao: false };
  return { ok: true };
}

export const DICA_REVOGAR_ATACADO =
  "Para revogar o atacado desta pessoa, recuse o cadastro em Revendedores: mudar o papel aqui não corta o acesso ao atacado.";

/** Papel original do usuário: o atacado vem do cadastro de revendedor, não do papel. */
export function dicaRevogarAtacado(papelOriginal: Papel): string | null {
  return papelOriginal === "revendedor" ? DICA_REVOGAR_ATACADO : null;
}

const ROTULO_PAPEL: Record<Papel, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  supervisor: "Supervisor",
  revendedor: "Revendedor",
  cliente: "Cliente",
};

export function rotuloPapel(papel: Papel): string {
  return ROTULO_PAPEL[papel];
}

export type CargasAdmin = {
  produtos: boolean;
  categorias: boolean;
  pedidos: boolean;
  vendas: boolean;
  config: boolean;
  estoqueBaixo: boolean;
};

export function cargasIniciais(papel: Papel): CargasAdmin {
  const cadastro = podeExecutar(papel, "cadastro");
  return {
    produtos: cadastro,
    categorias: cadastro,
    pedidos: podeExecutar(papel, "pedidos"),
    vendas: podeExecutar(papel, "vendas-leitura"),
    config: podeExecutar(papel, "config"),
    // Quem edita preço calcula o KPI a partir dos produtos; o supervisor usa o RPC dedicado.
    estoqueBaixo: !camposPrecoEditaveis(papel) && podeExecutar(papel, "estoque-baixo"),
  };
}

const OPCOES_ENTREGA: OrderStatus[] = ["preparando", "enviado", "entregue", "cancelado"];
const OPCOES_RETIRADA: OrderStatus[] = ["preparando", "pronto_retirada", "retirado", "cancelado"];

export type OpcaoStatus = { status: OrderStatus; disabled: boolean };

/**
 * 'pago' só por liquidação (settleOrder) e nada volta a 'pendente': o banco
 * recusa as duas transições em admin_update_order_status. Pendente só pode
 * ser cancelado; para seguir, liquida-se o pedido.
 */
export function opcoesStatusPedido(
  entrega: EntregaTipo,
  atual: OrderStatus,
  /** Pedido "Em separação" ainda sem pagamento: só avança para Aguardando pagamento ou cancela. */
  semPagamento = false
): OpcaoStatus[] {
  const base: OrderStatus[] =
    atual === "pendente"
      ? ["cancelado"]
      : atual === "preparando" && semPagamento
        ? ["preparando", "pendente", "cancelado"]
        : entrega === "retirada"
          ? OPCOES_RETIRADA
          : OPCOES_ENTREGA;
  const opcoes = base.map((status) => ({ status, disabled: false }));
  return base.includes(atual) ? opcoes : [{ status: atual, disabled: true }, ...opcoes];
}
