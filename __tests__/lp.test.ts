import { describe, expect, it } from "vitest";
import { economiaPercentual, selecionarAmostra } from "@/lib/lp";

const item = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  slug: `produto-${n}`,
  nome: `Produto ${n}`,
  imagem: n % 2 ? `/api/img/${n}` : null,
  preco_varejo: 100,
  preco_atacado: 60,
  ...extra,
});

describe("selecionarAmostra", () => {
  it("0 itens: vazio (a seção some)", () => {
    expect(selecionarAmostra([])).toEqual([]);
  });
  it("3 itens: converte para camelCase", () => {
    const r = selecionarAmostra([item(1), item(2), item(3)]);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({
      id: "id-1",
      slug: "produto-1",
      nome: "Produto 1",
      imagem: "/api/img/1",
      precoVarejo: 100,
      precoAtacado: 60,
    });
    expect(r[1].imagem).toBeNull();
  });
  it("9 itens: limita a 8 mantendo a ordem", () => {
    const r = selecionarAmostra(Array.from({ length: 9 }, (_, i) => item(i + 1)));
    expect(r).toHaveLength(8);
    expect(r[7].id).toBe("id-8");
  });
  it("descarta itens inválidos e não conta para o limite", () => {
    const invalidos = [
      null,
      "x",
      42,
      [],
      item(1, { id: 5 }),
      item(2, { slug: undefined }),
      item(3, { nome: null }),
      item(4, { imagem: 7 }),
      item(5, { preco_varejo: -1 }),
      item(6, { preco_atacado: "60" }),
      item(7, { preco_atacado: Number.NaN }),
      item(8, { preco_varejo: Number.POSITIVE_INFINITY }),
    ];
    const validos = Array.from({ length: 9 }, (_, i) => item(i + 20));
    expect(selecionarAmostra(invalidos)).toEqual([]);
    const r = selecionarAmostra([...invalidos, ...validos]);
    expect(r).toHaveLength(8);
    expect(r.map((a) => a.id)).toEqual(validos.slice(0, 8).map((v) => v.id));
  });
  it("campos extras do RPC não vazam", () => {
    const r = selecionarAmostra([
      item(1, { estoque: 5, percentual: 40, desconto_atacado_percentual: 40, preco_atacado_bruto: 1 }),
    ]);
    expect(r[0]).toEqual({
      id: "id-1",
      slug: "produto-1",
      nome: "Produto 1",
      imagem: "/api/img/1",
      precoVarejo: 100,
      precoAtacado: 60,
    });
  });
  it("strings vazias em id, slug ou nome descartam o item", () => {
    expect(selecionarAmostra([item(1, { id: "" }), item(2, { slug: "  " }), item(3, { nome: "" })])).toEqual([]);
  });
  it("imagem ausente (undefined) vira null", () => {
    const r = selecionarAmostra([item(1, { imagem: undefined })]);
    expect(r).toHaveLength(1);
    expect(r[0].imagem).toBeNull();
  });
  it("não-array devolve vazio", () => {
    for (const v of [null, undefined, {}, "lista", 5, { 0: item(1) }]) {
      expect(selecionarAmostra(v)).toEqual([]);
    }
  });
});

describe("economiaPercentual", () => {
  it("percentual inteiro arredondado", () => {
    expect(economiaPercentual(100, 60)).toBe(40);
    expect(economiaPercentual(30, 20)).toBe(33);
  });
  it("0 quando inválido ou sem desconto", () => {
    expect(economiaPercentual(0, 10)).toBe(0);
    expect(economiaPercentual(60, 100)).toBe(0);
    expect(economiaPercentual(100, 100)).toBe(0);
    expect(economiaPercentual(Number.NaN, 10)).toBe(0);
    expect(economiaPercentual(100, Number.NaN)).toBe(0);
    expect(economiaPercentual(-5, 1)).toBe(0);
  });
});
