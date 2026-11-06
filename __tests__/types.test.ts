import { describe, it, expect } from "vitest";
import {
  precoVarejo,
  precoAtacado,
  totalEstoque,
  capaImagem,
  slugify,
  precisaNumeracao,
  contarSkusDistintos,
  entregaTipoLabel,
  brlOuTraco,
} from "@/lib/types";
import { montarItensMP } from "@/lib/mercadopago-utils";

describe("precoVarejo", () => {
  it("sem desconto retorna o preço de tabela", () => {
    expect(precoVarejo({ preco: 199.9, desconto_percentual: null })).toBe(199.9);
  });
  it("aplica desconto percentual e arredonda a 2 casas", () => {
    expect(precoVarejo({ preco: 100, desconto_percentual: 15 })).toBe(85);
    expect(precoVarejo({ preco: 99.9, desconto_percentual: 10 })).toBe(89.91);
  });
  it("desconto 0 é tratado como sem desconto", () => {
    expect(precoVarejo({ preco: 50, desconto_percentual: 0 })).toBe(50);
  });

  // Math em centavos inteiros: o resultado TS agora bate exatamente com o
  // `round(numeric, 2)` half-up do Postgres (`_preco_varejo`).
  it.each([
    { preco: 59.9, desc: 5, esperado: 56.91 },
    { preco: 49.9, desc: 5, esperado: 47.41 },
    { preco: 49.9, desc: 25, esperado: 37.43 },
    { preco: 299.9, desc: 15, esperado: 254.92 },
    { preco: 199.9, desc: null, esperado: 199.9 },
    { preco: 80, desc: 0, esperado: 80 },
  ])("preço $preco desconto $desc → $esperado", ({ preco, desc, esperado }) => {
    expect(precoVarejo({ preco, desconto_percentual: desc })).toBe(esperado);
  });
});

describe("montarItensMP", () => {
  it("mapeia as linhas da RPC e acrescenta a taxa de entrega quando > 0", () => {
    expect(
      montarItensMP([{ titulo: "X", quantidade: 2, preco_unit: 56.91 }], 7)
    ).toEqual([
      { titulo: "X", quantidade: 2, precoUnitario: 56.91 },
      { titulo: "Taxa de entrega", quantidade: 1, precoUnitario: 7 },
    ]);
  });
  it("omite a linha de taxa quando entregaTaxa é 0", () => {
    expect(
      montarItensMP([{ titulo: "X", quantidade: 2, preco_unit: 56.91 }], 0)
    ).toEqual([{ titulo: "X", quantidade: 2, precoUnitario: 56.91 }]);
  });
});

describe("precoAtacado", () => {
  it("1: usa o override do produto quando preenchido", () => {
    expect(
      precoAtacado({ preco: 100, preco_atacado: 62 }, { desconto_atacado_percentual: 30 })
    ).toBe(62);
  });
  it("2: deriva do % da subcategoria quando não há override", () => {
    expect(
      precoAtacado({ preco: 100, preco_atacado: null }, { desconto_atacado_percentual: 30 })
    ).toBe(70);
  });
  it("3: sem override e sem % da subcategoria, cai no preço de tabela", () => {
    expect(
      precoAtacado({ preco: 100, preco_atacado: null }, { desconto_atacado_percentual: null })
    ).toBe(100);
    expect(precoAtacado({ preco: 100, preco_atacado: null }, null)).toBe(100);
  });
  it("nunca aplica a promo de varejo", () => {
    // precoAtacado não recebe desconto_percentual — garante isolamento por assinatura
    expect(
      precoAtacado({ preco: 200, preco_atacado: null }, { desconto_atacado_percentual: 25 })
    ).toBe(150);
  });
});

describe("totalEstoque / capaImagem", () => {
  const p = {
    colors: [
      { imagens: [], sizes: [{ estoque: 2 }, { estoque: 0 }] },
      { imagens: ["data:img/a"], sizes: [{ estoque: 3 }] },
    ],
  } as any;
  it("soma o estoque de todas as variações", () => {
    expect(totalEstoque(p)).toBe(5);
  });
  it("pega a primeira imagem disponível", () => {
    expect(capaImagem(p)).toBe("data:img/a");
    expect(capaImagem({ colors: [] } as any)).toBeNull();
  });
});

describe("slugify", () => {
  it("normaliza acento, espaço e símbolo", () => {
    expect(slugify("Sandália Coração 2027!")).toBe("sandalia-coracao-2027");
  });
  it("remove hífens de borda", () => {
    expect(slugify("  --Tênis--  ")).toBe("tenis");
  });
});

describe("precisaNumeracao", () => {
  it("true só para calçados", () => {
    expect(precisaNumeracao("calcados")).toBe(true);
    expect(precisaNumeracao("acessorios")).toBe(false);
    expect(precisaNumeracao(undefined)).toBe(false);
  });
});

describe("contarSkusDistintos", () => {
  it("conta combinações produto+cor+tamanho únicas", () => {
    const items = [
      { produtoId: "A", colorId: "az", sizeId: "36" },
      { produtoId: "A", colorId: "az", sizeId: "37" },
      { produtoId: "A", colorId: "az", sizeId: "36" }, // repetida
      { produtoId: "B", colorId: "pr", sizeId: null },
    ];
    expect(contarSkusDistintos(items)).toBe(3);
  });
});

describe("entregaTipoLabel", () => {
  it("rotula os três tipos", () => {
    expect(entregaTipoLabel("retirada")).toMatch(/retirada/i);
    expect(entregaTipoLabel("entrega")).toMatch(/entrega/i);
    expect(entregaTipoLabel("entrega_fora")).toMatch(/fora/i);
  });
});

describe("brlOuTraco", () => {
  it("formata número em reais", () => {
    expect(brlOuTraco(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(brlOuTraco(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
  it("devolve travessão para null e undefined", () => {
    expect(brlOuTraco(null)).toBe("—");
    expect(brlOuTraco(undefined)).toBe("—");
  });
  it("devolve travessão para número não finito", () => {
    expect(brlOuTraco(Number.NaN)).toBe("—");
  });
});
