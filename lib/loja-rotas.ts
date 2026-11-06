import type { LojaFlags } from "@/lib/loja-flags";

/** Regra única das rotas de varejo (produto, carrinho, surpresa, minha-conta, checkout de varejo). */
export function varejoDisponivel(flags: LojaFlags): boolean {
  return flags.varejoAtivo === true;
}
