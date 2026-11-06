import { describe, it, expect } from "vitest";
import {
  descontoMaximoDosProdutos,
  margemRevenda,
  normalizarCatalogoRevendedor,
  normalizarProdutoRevendedor,
  produtoTemEstoque,
} from "@/lib/atacado";

describe("margemRevenda", () => {
  it("atacado menor que varejo: valor e percentual arredondado", () => {
    expect(margemRevenda(100, 60)).toEqual({ valor: 40, percentual: 40 });
    expect(margemRevenda(189.9, 132.93)).toEqual({ valor: 56.97, percentual: 30 });
  });
  it("atacado maior ou igual ao varejo: zeros", () => {
    expect(margemRevenda(60, 100)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(80, 80)).toEqual({ valor: 0, percentual: 0 });
  });
  it("preço zero, negativo ou inválido: zeros, nunca NaN", () => {
    expect(margemRevenda(0, 10)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(10, 0)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(Number.NaN, 5)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(100, Number.NaN)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(Number.POSITIVE_INFINITY, 5)).toEqual({ valor: 0, percentual: 0 });
    expect(margemRevenda(-10, -20)).toEqual({ valor: 0, percentual: 0 });
  });
});

const PRODUTO = {
  id: "p1",
  slug: "tenis-nuvem",
  nome: "Tênis Nuvem",
  descricao: "Leve",
  caracteristicas: ["Macio", "", 3],
  destaque: true,
  categoria: { id: "c1", nome: "Tênis", slug: "tenis", grupo: "calcados" },
  preco_varejo: 100,
  preco_atacado: 60,
  cores: [
    {
      id: "k1",
      nome: "Rosa",
      hex: "#F2678F",
      imagens: ["a.jpg", "b.jpg"],
      tamanhos: [
        { id: "s1", tamanho: "34", estoque: 0 },
        { id: "s2", tamanho: "35", estoque: 4 },
      ],
    },
  ],
};

describe("normalizarProdutoRevendedor", () => {
  it("mapeia snake_case para camelCase com os preços do banco", () => {
    const p = normalizarProdutoRevendedor(PRODUTO);
    expect(p).toMatchObject({
      id: "p1",
      slug: "tenis-nuvem",
      categoria: "Tênis",
      precoVarejo: 100,
      precoAtacado: 60,
      caracteristicas: ["Macio"],
    });
    expect(p?.cores[0]).toMatchObject({ imagem: "a.jpg", imagens: ["a.jpg", "b.jpg"] });
    expect(p?.cores[0].tamanhos).toHaveLength(2);
    expect(produtoTemEstoque(p!)).toBe(true);
  });
  it("descarta lixo e produtos sem preço", () => {
    expect(normalizarProdutoRevendedor(null)).toBeNull();
    expect(normalizarProdutoRevendedor({ ...PRODUTO, preco_atacado: null })).toBeNull();
    expect(normalizarProdutoRevendedor({ ...PRODUTO, slug: undefined })).toBeNull();
  });
});

describe("normalizarCatalogoRevendedor / descontoMaximoDosProdutos", () => {
  it("lê produtos de { categorias, produtos } e ignora os inválidos", () => {
    const lista = normalizarCatalogoRevendedor({ categorias: [], produtos: [PRODUTO, { x: 1 }] });
    expect(lista).toHaveLength(1);
  });
  it("formato inesperado vira null (a página mostra o aviso)", () => {
    expect(normalizarCatalogoRevendedor(null)).toBeNull();
    expect(normalizarCatalogoRevendedor({ produtos: "x" })).toBeNull();
  });
  it("maior diferença percentual; null sem produtos", () => {
    expect(descontoMaximoDosProdutos([])).toBeNull();
    expect(
      descontoMaximoDosProdutos([
        { precoVarejo: 100, precoAtacado: 70 },
        { precoVarejo: 200, precoAtacado: 100 },
        { precoVarejo: 50, precoAtacado: 60 },
      ])
    ).toBe(50);
  });
});
