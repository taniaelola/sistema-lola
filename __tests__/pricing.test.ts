import { describe, it, expect } from "vitest";
import {
  MIN_SKUS_ATACADO,
  comDescontoEfetivo,
  descontoEfetivo,
  precoVarejoEfetivo,
  skusDistintos,
} from "@/lib/pricing";

const CAT_A = "cat-a";
const CAT_B = "cat-b";

describe("MIN_SKUS_ATACADO", () => {
  it("é 12", () => expect(MIN_SKUS_ATACADO).toBe(12));
});

describe("descontoEfetivo", () => {
  it("é null sem desconto do produto e sem promoções", () => {
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: CAT_A }, [])).toBeNull();
  });

  it("usa o desconto do produto quando não há promoção", () => {
    expect(descontoEfetivo({ desconto_percentual: 15, categoria_id: CAT_A }, [])).toBe(15);
  });

  it("promoção da loja inteira aplica a qualquer produto", () => {
    const promos = [{ desconto_percentual: 10, aplica_a_categoria_id: null }];
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: CAT_A }, promos)).toBe(10);
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: null }, promos)).toBe(10);
  });

  it("promoção de categoria só aplica à categoria", () => {
    const promos = [{ desconto_percentual: 20, aplica_a_categoria_id: CAT_A }];
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: CAT_A }, promos)).toBe(20);
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: CAT_B }, promos)).toBeNull();
    expect(descontoEfetivo({ desconto_percentual: null, categoria_id: null }, promos)).toBeNull();
  });

  it("o maior desconto vence", () => {
    const promos = [
      { desconto_percentual: 10, aplica_a_categoria_id: null },
      { desconto_percentual: 25, aplica_a_categoria_id: CAT_A },
    ];
    expect(descontoEfetivo({ desconto_percentual: 15, categoria_id: CAT_A }, promos)).toBe(25);
    expect(descontoEfetivo({ desconto_percentual: 30, categoria_id: CAT_A }, promos)).toBe(30);
    expect(descontoEfetivo({ desconto_percentual: 15, categoria_id: CAT_B }, promos)).toBe(15);
  });

  it("trata desconto 0 do produto como ausente", () => {
    expect(descontoEfetivo({ desconto_percentual: 0, categoria_id: CAT_A }, [])).toBeNull();
  });
});

describe("comDescontoEfetivo", () => {
  it("anexa desconto_efetivo usando categoria_id ou categoria.id", () => {
    const promos = [{ desconto_percentual: 20, aplica_a_categoria_id: CAT_A }];
    const r = comDescontoEfetivo(
      [
        { id: "1", desconto_percentual: null, categoria_id: CAT_A },
        { id: "2", desconto_percentual: null, categoria: { id: CAT_A } },
        { id: "3", desconto_percentual: 5, categoria_id: CAT_B },
      ],
      promos
    );
    expect(r.map((p) => p.desconto_efetivo)).toEqual([20, 20, 5]);
  });

  it("sem promoções e sem desconto do produto é null", () => {
    const r = comDescontoEfetivo([{ desconto_percentual: null }], []);
    expect(r[0].desconto_efetivo).toBeNull();
  });
});

describe("precoVarejoEfetivo", () => {
  it("sem desconto devolve o preço de tabela", () => {
    expect(precoVarejoEfetivo({ preco: 100 })).toEqual({ final: 100, original: 100, pct: null });
    expect(precoVarejoEfetivo({ preco: 100, desconto_efetivo: null })).toEqual({
      final: 100,
      original: 100,
      pct: null,
    });
    expect(precoVarejoEfetivo({ preco: 100, desconto_efetivo: 0 }).pct).toBeNull();
  });

  it("aplica o desconto efetivo", () => {
    expect(precoVarejoEfetivo({ preco: 200, desconto_efetivo: 25 })).toEqual({
      final: 150,
      original: 200,
      pct: 25,
    });
  });

  it("arredonda a 2 casas como o servidor", () => {
    expect(precoVarejoEfetivo({ preco: 99.99, desconto_efetivo: 15 }).final).toBe(84.99);
    expect(precoVarejoEfetivo({ preco: 10.05, desconto_efetivo: 10 }).final).toBe(9.05);
    expect(precoVarejoEfetivo({ preco: 33.33, desconto_efetivo: 33 }).final).toBe(22.33);
  });
});

describe("skusDistintos", () => {
  it("conta combinações produto+cor+tamanho ignorando quantidade e duplicatas", () => {
    const itens = [
      { product_id: "p1", color_id: "c1", size_id: "s1", quantidade: 5 },
      { product_id: "p1", color_id: "c1", size_id: "s1", quantidade: 1 },
      { product_id: "p1", color_id: "c1", size_id: "s2" },
      { product_id: "p1", color_id: "c2", size_id: "s1" },
      { product_id: "p2", color_id: "c1", size_id: "s1" },
    ];
    expect(skusDistintos(itens)).toBe(4);
  });

  it("lista vazia é 0", () => expect(skusDistintos([])).toBe(0));
});
