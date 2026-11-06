import { describe, it, expect } from "vitest";
import { progressoBonus, somarPecas } from "@/lib/atacado";

describe("progressoBonus", () => {
  it("14 peças não ganha e faltam 1", () => {
    expect(progressoBonus(14, 15, true)).toEqual({ ativo: true, ganhou: false, faltam: 1, pecas: 14, min: 15 });
  });
  it("15 ganha; 30 também (uma vez, não acumula)", () => {
    expect(progressoBonus(15, 15, true).ganhou).toBe(true);
    expect(progressoBonus(30, 15, true)).toMatchObject({ ganhou: true, faltam: 0 });
  });
  it("bônus desativado nunca ganha", () => {
    expect(progressoBonus(99, 15, false)).toMatchObject({ ativo: false, ganhou: false });
  });
});
describe("somarPecas", () => {
  it("soma e ignora lixo", () => {
    expect(somarPecas([{ quantidade: 3 }, { quantidade: 12 }])).toBe(15);
    expect(somarPecas([{ quantidade: -2 }, { quantidade: Number.NaN }, { quantidade: 4 }])).toBe(4);
  });
});
