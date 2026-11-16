import { describe, it, expect } from "vitest";
import {
  MIN_PECAS_ATACADO,
  comDescontoEfetivo,
  descontoEfetivo,
  precoVarejoEfetivo,
  totalPecas,
} from "@/lib/pricing";

const CAT_A = "cat-a";
const CAT_B = "cat-b";

describe("MIN_PECAS_ATACADO", () => {
  it("é 12", () => expect(MIN_PECAS_ATACADO).toBe(12));
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

describe("totalPecas", () => {
  it("soma as quantidades, inclusive do mesmo SKU repetido", () => {
    expect(totalPecas([{ quantidade: 5, disponivel: true }, { quantidade: 3, disponivel: true }])).toBe(8);
  });
  it("itens indisponíveis não contam", () => {
    expect(totalPecas([{ quantidade: 5, disponivel: true }, { quantidade: 9, disponivel: false }])).toBe(5);
  });
  it("ignora quantidade inválida e lista vazia é 0", () => {
    expect(totalPecas([{ quantidade: -2, disponivel: true }, { quantidade: 0, disponivel: true }])).toBe(0);
    expect(totalPecas([])).toBe(0);
  });
});
