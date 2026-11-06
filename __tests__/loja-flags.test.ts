import { describe, it, expect } from "vitest";
import { parseLojaFlags, FLAGS_SEGURAS } from "@/lib/loja-flags";

describe("parseLojaFlags", () => {
  it("converte o JSON do banco", () => {
    expect(parseLojaFlags({ varejo_ativo: true, bonus_ativo: true, bonus_min_pecas: 20, bonus_quantidade: 2, bonus_produto_nome: "Chaveiro" }))
      .toEqual({ varejoAtivo: true, bonusAtivo: true, bonusMinPecas: 20, bonusQuantidade: 2, bonusProdutoNome: "Chaveiro" });
  });
  it("falha segura: null, lixo ou tipos errados => varejo desligado", () => {
    expect(parseLojaFlags(null)).toEqual(FLAGS_SEGURAS);
    expect(parseLojaFlags("x")).toEqual(FLAGS_SEGURAS);
    expect(parseLojaFlags({ varejo_ativo: "true" }).varejoAtivo).toBe(false);
  });
  it("mínimo de peças inválido volta ao padrão 15", () => {
    expect(parseLojaFlags({ bonus_min_pecas: 0 }).bonusMinPecas).toBe(15);
    expect(parseLojaFlags({ bonus_min_pecas: "abc" }).bonusMinPecas).toBe(15);
  });
  it("FLAGS_SEGURAS tem varejo e bônus desligados", () => {
    expect(FLAGS_SEGURAS).toMatchObject({ varejoAtivo: false, bonusAtivo: false, bonusMinPecas: 15 });
  });
  it("array e quantidade inválida caem no padrão", () => {
    expect(parseLojaFlags([])).toEqual(FLAGS_SEGURAS);
    expect(parseLojaFlags({ bonus_quantidade: 1.5 }).bonusQuantidade).toBe(1);
    expect(parseLojaFlags({ bonus_produto_nome: 7 }).bonusProdutoNome).toBeNull();
  });
});
