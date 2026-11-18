import { describe, it, expect } from "vitest";
import {
  ESTOQUE_MAXIMO,
  adicionarTamanho,
  ajustarEstoque,
  gradePadrao,
  lerEstoque,
  totalEstoque,
} from "@/lib/admin-tamanhos";

describe("gradePadrao", () => {
  it("vem de 34 a 40 com estoque zerado", () => {
    expect(gradePadrao()).toEqual([
      { tamanho: "34", estoque: 0 },
      { tamanho: "35", estoque: 0 },
      { tamanho: "36", estoque: 0 },
      { tamanho: "37", estoque: 0 },
      { tamanho: "38", estoque: 0 },
      { tamanho: "39", estoque: 0 },
      { tamanho: "40", estoque: 0 },
    ]);
  });

  it("devolve uma grade nova a cada chamada (sem compartilhar objetos)", () => {
    expect(gradePadrao()[0]).not.toBe(gradePadrao()[0]);
  });
});

describe("ajustarEstoque (+ e −)", () => {
  it("soma e subtrai", () => {
    expect(ajustarEstoque(3, 1)).toBe(4);
    expect(ajustarEstoque(3, -1)).toBe(2);
  });
  it("não passa de 0 para baixo nem do teto para cima", () => {
    expect(ajustarEstoque(0, -1)).toBe(0);
    expect(ajustarEstoque(ESTOQUE_MAXIMO, 1)).toBe(ESTOQUE_MAXIMO);
  });
  it("valor inválido conta como 0", () => {
    expect(ajustarEstoque(Number.NaN, 1)).toBe(1);
  });
});

describe("lerEstoque", () => {
  it("lê inteiros e ignora o resto", () => {
    expect(lerEstoque("12")).toBe(12);
    expect(lerEstoque("1a2")).toBe(12);
    expect(lerEstoque("")).toBe(0);
    expect(lerEstoque("abc")).toBe(0);
    expect(lerEstoque("-5")).toBe(5);
  });
  it("respeita o teto", () => {
    expect(lerEstoque("999999")).toBe(ESTOQUE_MAXIMO);
  });
});

describe("adicionarTamanho", () => {
  it("coloca tamanho numérico na ordem certa", () => {
    const r = adicionarTamanho(gradePadrao(), "41");
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.tamanho)).toEqual(["34", "35", "36", "37", "38", "39", "40", "41"]);
    const s = adicionarTamanho(gradePadrao(), "33");
    expect(s.linhas[0].tamanho).toBe("33");
  });
  it("recusa vazio e repetido", () => {
    expect(adicionarTamanho(gradePadrao(), "  ").erro).toBe("Digite o tamanho.");
    expect(adicionarTamanho(gradePadrao(), "38").erro).toContain("já está");
  });
  it("tamanho com letras vai para o fim", () => {
    const r = adicionarTamanho(gradePadrao(), "P");
    expect(r.linhas[r.linhas.length - 1].tamanho).toBe("P");
  });
});

describe("totalEstoque", () => {
  it("soma o estoque da grade", () => {
    expect(totalEstoque([{ tamanho: "36", estoque: 2 }, { tamanho: "37", estoque: 5 }])).toBe(7);
  });
});
