export type LojaFlags = {
  varejoAtivo: boolean;
  bonusAtivo: boolean;
  bonusMinPecas: number;
  bonusQuantidade: number;
  bonusProdutoNome: string | null;
};

export const FLAGS_SEGURAS: LojaFlags = {
  varejoAtivo: false,
  bonusAtivo: false,
  bonusMinPecas: 15,
  bonusQuantidade: 1,
  bonusProdutoNome: null,
};

function inteiroPositivo(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : padrao;
}

/** Converte o JSON de get_loja_flags(); qualquer coisa inválida cai em FLAGS_SEGURAS (varejo desligado). */
export function parseLojaFlags(raw: unknown): LojaFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return FLAGS_SEGURAS;
  const r = raw as Record<string, unknown>;
  return {
    varejoAtivo: r.varejo_ativo === true,
    bonusAtivo: r.bonus_ativo === true,
    bonusMinPecas: inteiroPositivo(r.bonus_min_pecas, FLAGS_SEGURAS.bonusMinPecas),
    bonusQuantidade: inteiroPositivo(r.bonus_quantidade, FLAGS_SEGURAS.bonusQuantidade),
    bonusProdutoNome: typeof r.bonus_produto_nome === "string" ? r.bonus_produto_nome : null,
  };
}
