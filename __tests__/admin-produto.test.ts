import { describe, it, expect } from "vitest";
import { ativoInicialProduto, somenteBonusParaEnvio, validarProdutoBasico } from "@/lib/admin-produto";
import type { Product } from "@/lib/types";

function prod(p: Partial<Product> = {}): Product {
  return {
    id: "p1", slug: "p1", nome: "Produto", categoria_id: "c1", colecao: null, preco: 50,
    desconto_percentual: null, preco_atacado: null, descricao: null, caracteristicas: [],
    ativo: true, destaque: false, ordem: 0, surpresa_ativo: false, colors: [], ...p,
  };
}

const base = { nome: "Sandália", categoriaId: "c1", preco: "99,90", ativo: false, podeEditarPreco: true, precoAtual: 0 };

describe("ativoInicialProduto", () => {
  it("produto novo: admin nasce ativo, supervisor inativo", () => {
    expect(ativoInicialProduto(null, true)).toBe(true);
    expect(ativoInicialProduto(null, false)).toBe(false);
  });
  it("produto existente mantém o estado", () => {
    expect(ativoInicialProduto(prod({ ativo: false }), true)).toBe(false);
    expect(ativoInicialProduto(prod({ ativo: true }), false)).toBe(true);
  });
});

describe("somenteBonusParaEnvio", () => {
  it("reenvia sempre o valor atual da caixa", () => {
    expect(somenteBonusParaEnvio(prod({ somente_bonus: true }), true)).toBe(true);
    expect(somenteBonusParaEnvio(prod({ somente_bonus: false }), false)).toBe(false);
    expect(somenteBonusParaEnvio(null, false)).toBe(false);
  });
  it("produto sem o dado (undefined) e caixa desmarcada: null, o banco mantém o que tem", () => {
    expect(somenteBonusParaEnvio(prod(), false)).toBeNull();
  });
  it("produto sem o dado e caixa marcada: true", () => {
    expect(somenteBonusParaEnvio(prod(), true)).toBe(true);
  });
});

describe("validarProdutoBasico", () => {
  it("admin: preço obrigatório", () => {
    expect(validarProdutoBasico({ ...base, preco: "" })).toEqual({ ok: false, erro: "Preencha ao menos nome, categoria e preço." });
  });
  it("admin: preço com vírgula vira número", () => {
    expect(validarProdutoBasico(base)).toEqual({ ok: true, preco: 99.9 });
  });
  it("admin: preço inválido ou negativo", () => {
    expect(validarProdutoBasico({ ...base, preco: "abc" }).ok).toBe(false);
    expect(validarProdutoBasico({ ...base, preco: "-1" }).ok).toBe(false);
  });
  it("não ativa produto de venda com override de atacado 0 (brinde e inativo passam)", () => {
    expect(validarProdutoBasico({ ...base, preco: "99", precoAtacado: "0", ativo: true })).toEqual({
      ok: false,
      erro: "Defina um preço de atacado maior que zero antes de ativar o produto.",
    });
    expect(validarProdutoBasico({ ...base, preco: "99", precoAtacado: "0", ativo: true, somenteBonus: true })).toEqual({ ok: true, preco: 99 });
    expect(validarProdutoBasico({ ...base, preco: "99", precoAtacado: "0", ativo: false })).toEqual({ ok: true, preco: 99 });
    expect(validarProdutoBasico({ ...base, preco: "99", precoAtacado: "49,9", ativo: true })).toEqual({ ok: true, preco: 99 });
  });
  it("supervisor (sem edição de preço) ignora o override digitado", () => {
    expect(validarProdutoBasico({ ...base, preco: "", podeEditarPreco: false, precoAtual: null, precoAtacado: "0", ativo: true }).ok).toBe(true);
  });
  it("não ativa produto com preço zero", () => {
    expect(validarProdutoBasico({ ...base, preco: "0", ativo: true })).toEqual({
      ok: false,
      erro: "Defina o preço antes de ativar o produto.",
    });
    expect(validarProdutoBasico({ ...base, preco: "0", ativo: false })).toEqual({ ok: true, preco: 0 });
  });
  it("supervisor não precisa preencher preço e usa o gravado", () => {
    expect(validarProdutoBasico({ ...base, preco: "", podeEditarPreco: false, precoAtual: 0 })).toEqual({ ok: true, preco: 0 });
    expect(validarProdutoBasico({ ...base, preco: "", podeEditarPreco: false, precoAtual: 50, ativo: true })).toEqual({
      ok: true,
      preco: 50,
    });
  });
  it("supervisor não ativa produto com preço gravado zero", () => {
    expect(validarProdutoBasico({ ...base, preco: "", podeEditarPreco: false, precoAtual: 0, ativo: true }).ok).toBe(false);
  });
  it("supervisor ignora o que estiver no campo de preço", () => {
    expect(validarProdutoBasico({ ...base, preco: "999", podeEditarPreco: false, precoAtual: 10 })).toEqual({ ok: true, preco: 10 });
  });
  it("supervisor com preço mascarado (null) pode ativar: a trava fica com o banco", () => {
    expect(validarProdutoBasico({ ...base, preco: "", podeEditarPreco: false, precoAtual: null, ativo: true })).toEqual({
      ok: true,
      preco: 0,
    });
  });
  it("nome e categoria obrigatórios", () => {
    expect(validarProdutoBasico({ ...base, nome: "  " }).ok).toBe(false);
    expect(validarProdutoBasico({ ...base, categoriaId: "", podeEditarPreco: false })).toEqual({
      ok: false,
      erro: "Preencha ao menos nome e categoria.",
    });
  });
});

describe("precoAtacadoEfetivo (espelha _preco_atacado)", () => {
  it("preço próprio vence tudo", async () => {
    const { precoAtacadoEfetivo } = await import("@/lib/admin-produto");
    expect(precoAtacadoEfetivo(100, 50, 30)).toBe(50);
  });
  it("sem preço próprio usa o % da categoria", async () => {
    const { precoAtacadoEfetivo } = await import("@/lib/admin-produto");
    expect(precoAtacadoEfetivo(100, null, 30)).toBe(70);
    expect(precoAtacadoEfetivo(189.9, null, 30)).toBe(132.93);
  });
  it("sem nada, igual ao varejo (nunca metade)", async () => {
    const { precoAtacadoEfetivo } = await import("@/lib/admin-produto");
    expect(precoAtacadoEfetivo(100, null, null)).toBe(100);
  });
});
