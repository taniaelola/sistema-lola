import { describe, it, expect } from "vitest";
import { itemEhBonus, linhaEntrega, progressoBonus, secaoAtacado, somarPecas, textoBonus } from "@/lib/atacado";

describe("progressoBonus", () => {
  it("14 peças não ganha e faltam 1", () => {
    expect(progressoBonus(14, 15, true)).toEqual({ ativo: true, ganhou: false, faltam: 1, pecas: 14, min: 15, pct: 93 });
  });
  it("15 ganha; 30 também (uma vez, não acumula)", () => {
    expect(progressoBonus(15, 15, true).ganhou).toBe(true);
    expect(progressoBonus(30, 15, true)).toMatchObject({ ganhou: true, faltam: 0 });
  });
  it("bônus desativado nunca ganha", () => {
    expect(progressoBonus(99, 15, false)).toMatchObject({ ativo: false, ganhou: false });
  });
});
describe("progressoBonus com mínimo inválido", () => {
  it("min 0, negativo ou NaN vira 1: sem NaN e sem ganhar com 0 peças", () => {
    for (const min of [0, -3, Number.NaN]) {
      const p = progressoBonus(0, min, true);
      expect(p).toMatchObject({ min: 1, ganhou: false, faltam: 1, pct: 0 });
      expect(Number.isFinite(p.pct)).toBe(true);
    }
    expect(progressoBonus(2, 0, true)).toMatchObject({ ganhou: true, faltam: 0, pct: 100 });
  });
  it("peças inválidas contam como 0", () => {
    expect(progressoBonus(Number.NaN, 15, true)).toMatchObject({ pecas: 0, faltam: 15, pct: 0 });
  });
});

describe("somarPecas", () => {
  it("soma e ignora lixo", () => {
    expect(somarPecas([{ quantidade: 3 }, { quantidade: 12 }])).toBe(15);
    expect(somarPecas([{ quantidade: -2 }, { quantidade: Number.NaN }, { quantidade: 4 }])).toBe(4);
  });
});

describe("textoBonus", () => {
  it("desativado devolve vazio", () => {
    expect(textoBonus(progressoBonus(20, 15, false), "Chinelo", 1)).toBe("");
  });
  it("faltam peças, no singular e no plural", () => {
    expect(textoBonus(progressoBonus(14, 15, true), "Chinelo", 1)).toBe("14 de 15 peças: faltam 1 peça para ganhar Chinelo");
    expect(textoBonus(progressoBonus(10, 15, true), "Chinelo", 2)).toBe("10 de 15 peças: faltam 5 peças para ganhar 2× Chinelo");
  });
  it("sem nome do brinde usa texto genérico", () => {
    expect(textoBonus(progressoBonus(3, 15, true), null, 1)).toContain("para ganhar a bonificação");
  });
  it("garantida", () => {
    expect(textoBonus(progressoBonus(15, 15, true), "Chinelo", 1)).toBe(
      "Você atingiu 15 peças: a bonificação (Chinelo) entra no pedido (sujeita a estoque)"
    );
    expect(textoBonus(progressoBonus(16, 15, true), "Chinelo", 2)).toContain("(2× Chinelo)");
    expect(textoBonus(progressoBonus(15, 15, true), null, 1)).toBe(
      "Você atingiu 15 peças: a bonificação entra no pedido (sujeita a estoque)"
    );
    expect(textoBonus(progressoBonus(15, 15, true), "Chinelo", 1)).not.toMatch(/garantida/i);
  });
});

describe("secaoAtacado", () => {
  it("mapeia o caminho para a seção (produto não vira Painel)", () => {
    expect(secaoAtacado("/atacado")).toBe("painel");
    expect(secaoAtacado("/atacado/produto/sandalia-x")).toBe("produto");
    expect(secaoAtacado("/atacado/catalogo")).toBe("catalogo");
    expect(secaoAtacado("/atacado/carrinho")).toBe("carrinho");
    expect(secaoAtacado("/atacado/pedidos")).toBe("pedidos");
  });
});

describe("itemEhBonus", () => {
  it("reconhece a marca do banco e o item gratuito", () => {
    expect(itemEhBonus({ bonus: true, quantidade: 1, preco_unit: null, subtotal: null })).toBe(true);
    expect(itemEhBonus({ quantidade: 1, preco_unit: 0, subtotal: 0 })).toBe(true);
  });
  it("a marca do banco manda: bonus false vence o preço 0", () => {
    expect(itemEhBonus({ bonus: false, quantidade: 1, preco_unit: 0, subtotal: 0 })).toBe(false);
  });
  it("supervisor (dinheiro null, bonus true) mostra Bônus", () => {
    expect(itemEhBonus({ bonus: true, quantidade: 1, preco_unit: null, subtotal: null })).toBe(true);
    expect(itemEhBonus({ bonus: false, quantidade: 1, preco_unit: null, subtotal: null })).toBe(false);
  });
  it("item normal ou com valores ocultos não é bônus", () => {
    expect(itemEhBonus({ quantidade: 2, preco_unit: 50, subtotal: 100 })).toBe(false);
    expect(itemEhBonus({ quantidade: 2, preco_unit: null, subtotal: null })).toBe(false);
  });
});

describe("linhaEntrega", () => {
  it("taxa null (supervisor) não vira Grátis", () => {
    expect(linhaEntrega("entrega", null)).toBeNull();
  });
  it("grátis só com taxa 0 em entrega; taxa positiva mostra valor; fora = a combinar", () => {
    expect(linhaEntrega("entrega", 0)).toEqual({ rotulo: "Entrega", valor: "Grátis" });
    expect(linhaEntrega("entrega", 12)).toEqual({ rotulo: "Taxa de entrega", valor: 12 });
    expect(linhaEntrega("entrega_fora", null)).toEqual({ rotulo: "Frete", valor: "A combinar" });
    expect(linhaEntrega("retirada", 0)).toBeNull();
  });
});
