// Regras puras da tela Config (varejo e bonificação). Sem I/O, para testar em ambiente node.
// O banco (admin_set_loja_config) repete as mesmas validações; aqui só damos a mensagem clara.
import type { Product } from "@/lib/types";

export type ConfigEntrega = {
  taxa_entrega_local: number;
  whatsapp: string;
  cidade_taxa: string;
};

export type LojaConfig = {
  varejo_ativo: boolean;
  bonus_ativo: boolean;
  bonus_min_pecas: number;
  bonus_produto_id: string | null;
  bonus_quantidade: number;
};

/** O que admin_get_config devolve. */
export type ConfigAdmin = ConfigEntrega & Partial<LojaConfig>;

export const LOJA_CONFIG_PADRAO: LojaConfig = {
  varejo_ativo: false,
  bonus_ativo: false,
  bonus_min_pecas: 15,
  bonus_produto_id: null,
  bonus_quantidade: 1,
};

export const AVISO_VAREJO =
  "O checkout de varejo para visitante foi fechado na migração 0010. Ligar aqui só muda o interruptor: para a venda no varejo funcionar de novo é preciso uma migração que reabra o checkout.";

/** Completa o que veio do banco com os padrões seguros (varejo desligado, bônus desligado). */
export function lojaConfigDe(config: ConfigAdmin | null | undefined): LojaConfig {
  return {
    varejo_ativo: config?.varejo_ativo === true,
    bonus_ativo: config?.bonus_ativo === true,
    bonus_min_pecas: inteiroPositivoOu(config?.bonus_min_pecas, LOJA_CONFIG_PADRAO.bonus_min_pecas),
    bonus_produto_id: config?.bonus_produto_id ?? null,
    bonus_quantidade: inteiroPositivoOu(config?.bonus_quantidade, LOJA_CONFIG_PADRAO.bonus_quantidade),
  };
}

function inteiroPositivoOu(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : padrao;
}

function inteiroTexto(v: string): number | null {
  const s = v.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export type EntradaLojaConfig = {
  varejoAtivo: boolean;
  bonusAtivo: boolean;
  minPecas: string;
  quantidade: string;
  produtoId: string;
};

export type ResultadoLojaConfig = { ok: true; valor: LojaConfig } | { ok: false; erro: string };

export function validarLojaConfig(e: EntradaLojaConfig): ResultadoLojaConfig {
  const min = inteiroTexto(e.minPecas);
  if (min === null || min < 1) return { ok: false, erro: "Informe as peças mínimas como número inteiro a partir de 1." };
  const qtd = inteiroTexto(e.quantidade);
  if (qtd === null || qtd < 1) return { ok: false, erro: "Informe a quantidade do brinde como número inteiro a partir de 1." };
  const produto = e.produtoId.trim() || null;
  if (e.bonusAtivo && !produto) {
    return { ok: false, erro: "Escolha o produto do brinde para ligar a bonificação." };
  }
  return {
    ok: true,
    valor: {
      varejo_ativo: e.varejoAtivo,
      bonus_ativo: e.bonusAtivo,
      bonus_min_pecas: min,
      bonus_produto_id: produto,
      bonus_quantidade: qtd,
    },
  };
}

/** Validação do payload recebido pela server action (não confia no cliente). */
export function lojaConfigValida(v: unknown): v is LojaConfig {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const idOk = r.bonus_produto_id === null || (typeof r.bonus_produto_id === "string" && r.bonus_produto_id.length > 0);
  return (
    typeof r.varejo_ativo === "boolean" &&
    typeof r.bonus_ativo === "boolean" &&
    Number.isInteger(r.bonus_min_pecas) && (r.bonus_min_pecas as number) >= 1 &&
    Number.isInteger(r.bonus_quantidade) && (r.bonus_quantidade as number) >= 1 &&
    idOk &&
    (!r.bonus_ativo || r.bonus_produto_id !== null)
  );
}

/** Produtos marcados "Somente bônus": os únicos que podem ser o brinde. */
export function produtosBrinde(products: Product[]): Product[] {
  return products
    .filter((p) => p.somente_bonus === true)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function traduzirErroLojaConfig(msg: string): string {
  if (/valores do bônus inválidos/i.test(msg)) return "Peças mínimas e quantidade do brinde precisam ser 1 ou mais.";
  if (/produto do bônus obrigatório/i.test(msg)) return "Escolha um produto de brinde válido para ligar a bonificação.";
  return msg;
}
