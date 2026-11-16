import { describe, it, expect } from "vitest";
import {
  avaliarCarrinhoAtacado,
  mensagemErroCheckout,
  problemaLinhaAtacado,
  validarEntrega,
  type ItemCarrinhoAtacado,
} from "@/lib/checkout";

const ESTOQUE_VAREJO =
  "Um item do carrinho ficou sem estoque. Volte ao carrinho e ajuste as quantidades.";

describe("mensagemErroCheckout — varejo", () => {
  it("estoque insuficiente mantém a mensagem de sempre", () => {
    expect(mensagemErroCheckout("estoque insuficiente", false)).toBe(ESTOQUE_VAREJO);
  });

  it("qualquer outro erro do banco é desconhecido (null)", () => {
    expect(mensagemErroCheckout("produto indisponível", false)).toBeNull();
    expect(mensagemErroCheckout("revendedor não aprovado", false)).toBeNull();
    expect(mensagemErroCheckout("", false)).toBeNull();
    expect(mensagemErroCheckout(undefined, false)).toBeNull();
  });
});

describe("mensagemErroCheckout — varejo desativado", () => {
  const MSG = "A loja de varejo está desativada no momento.";

  it("traduz 'varejo desativado' no varejo e no atacado", () => {
    expect(mensagemErroCheckout("varejo desativado", false)).toBe(MSG);
    expect(mensagemErroCheckout("varejo desativado", true)).toBe(MSG);
  });

  it("reconhece a frase dentro de uma mensagem maior", () => {
    expect(mensagemErroCheckout("P0001: varejo desativado", false)).toBe(MSG);
  });
});

describe("mensagemErroCheckout — atacado", () => {
  it("estoque insuficiente com o nome da linha", () => {
    const m = mensagemErroCheckout(
      "estoque insuficiente: Sandália Lua - Rosa - 36 (disponível: 2)",
      true
    );
    expect(m).toContain("Sandália Lua - Rosa - 36");
    expect(m).toContain("2");
    expect(m).toMatch(/carrinho de atacado/i);
  });

  it("estoque insuficiente sem detalhe ainda vira mensagem amigável", () => {
    expect(mensagemErroCheckout("estoque insuficiente", true)).toMatch(/estoque/i);
  });

  it("mínimo de 12 SKUs com a contagem atual", () => {
    const m = mensagemErroCheckout("mínimo de 12 SKUs distintos (carrinho tem 7)", true);
    expect(m).toContain("12");
    expect(m).toContain("7");
  });

  it("revendedor não aprovado", () => {
    expect(mensagemErroCheckout("revendedor não aprovado", true)).toMatch(/aprovad/i);
  });

  it("produto, cor ou tamanho indisponível com o nome", () => {
    expect(mensagemErroCheckout("produto indisponível: Bolsa Sol", true)).toContain("Bolsa Sol");
    expect(mensagemErroCheckout("tamanho indisponível: Bolsa Sol", true)).toContain("Bolsa Sol");
    expect(mensagemErroCheckout("cor indisponível: Bolsa Sol", true)).toContain("Bolsa Sol");
  });

  it("carrinho vazio", () => {
    expect(mensagemErroCheckout("carrinho vazio", true)).toMatch(/vazio/i);
  });

  it("erro desconhecido é null", () => {
    expect(mensagemErroCheckout("deadlock detected", true)).toBeNull();
  });
});

describe("validarEntrega", () => {
  const base = { nome: "Ana", telefone: "85999990000", entregaTipo: "retirada" as const };

  it("retirada só exige nome e telefone", () => {
    expect(validarEntrega(base)).toBeNull();
    expect(validarEntrega({ ...base, nome: "  " })).toBe("Informe seu nome.");
    expect(validarEntrega({ ...base, telefone: "" })).toBe("Informe seu telefone/WhatsApp.");
  });

  it("entrega exige rua, número e bairro", () => {
    expect(validarEntrega({ ...base, entregaTipo: "entrega", rua: "A", numero: "1" })).toBe(
      "Preencha o endereço completo pra entrega (rua, número e bairro)."
    );
    expect(
      validarEntrega({ ...base, entregaTipo: "entrega", rua: "A", numero: "1", bairro: "B" })
    ).toBeNull();
  });

  it("entrega_fora exige também a cidade", () => {
    const end = { rua: "A", numero: "1", bairro: "B" };
    expect(validarEntrega({ ...base, entregaTipo: "entrega_fora", ...end })).toBe(
      "Informe a cidade pra combinarmos o frete."
    );
    expect(
      validarEntrega({ ...base, entregaTipo: "entrega_fora", ...end, cidade: "Sobral" })
    ).toBeNull();
  });
});

function item(over: Partial<ItemCarrinhoAtacado> = {}): ItemCarrinhoAtacado {
  return {
    id: "l1",
    product_id: "p1",
    color_id: "c1",
    size_id: "s1",
    nome: "Sandália",
    cor: "Rosa",
    tamanho: "36",
    quantidade: 2,
    preco_unit: 50,
    subtotal: 100,
    estoque: 10,
    disponivel: true,
    ...over,
  };
}

describe("problemaLinhaAtacado", () => {
  it("linha ok", () => expect(problemaLinhaAtacado(item())).toBeNull());
  it("produto inativo", () =>
    expect(problemaLinhaAtacado(item({ disponivel: false }))).toMatch(/indisponível/i));
  it("sem estoque", () =>
    expect(problemaLinhaAtacado(item({ estoque: 0 }))).toMatch(/sem estoque/i));
  it("estoque abaixo da quantidade", () =>
    expect(problemaLinhaAtacado(item({ estoque: 1, quantidade: 3 }))).toBe(
      "Só restam 1 — ajuste a quantidade."
    ));
});

function nItens(n: number): ItemCarrinhoAtacado[] {
  return Array.from({ length: n }, (_, i) =>
    item({ id: `l${i}`, product_id: `p${i}`, size_id: `s${i}` })
  );
}

describe("avaliarCarrinhoAtacado", () => {
  it("12 SKUs ok libera", () => {
    const r = avaliarCarrinhoAtacado(nItens(12));
    expect(r.liberado).toBe(true);
    expect(r.skus).toBe(12);
    expect(r.motivo).toBeNull();
  });

  it("menos de 12 bloqueia com a contagem", () => {
    const r = avaliarCarrinhoAtacado(nItens(11));
    expect(r.liberado).toBe(false);
    expect(r.motivo).toContain("11");
    expect(r.motivo).toContain("12");
  });

  it("vazio bloqueia", () => {
    const r = avaliarCarrinhoAtacado([]);
    expect(r.liberado).toBe(false);
    expect(r.motivo).toMatch(/vazio/i);
  });

  it("linha com problema bloqueia mesmo com 12 SKUs", () => {
    const itens = nItens(13);
    itens[0] = { ...itens[0], estoque: 0 };
    const r = avaliarCarrinhoAtacado(itens);
    expect(r.liberado).toBe(false);
    expect(r.problemas).toEqual([{ id: "l0", motivo: "Sem estoque — remova do carrinho." }]);
  });

  it("produto inativo não conta como SKU", () => {
    const itens = nItens(12);
    itens[0] = { ...itens[0], disponivel: false };
    expect(avaliarCarrinhoAtacado(itens).skus).toBe(11);
  });

  it("quantidade não altera a contagem de SKUs", () => {
    const itens = [item({ quantidade: 30 }), item({ id: "l2", quantidade: 1 })];
    expect(avaliarCarrinhoAtacado(itens).skus).toBe(1);
  });
});

describe("atacado só com retirada", () => {
  const base = { nome: "Ana", telefone: "81999999999", rua: "R", numero: "1", bairro: "B", cidade: "Recife" };

  it("aceita retirada", async () => {
    const { validarEntregaAtacado } = await import("@/lib/checkout");
    expect(validarEntregaAtacado({ ...base, entregaTipo: "retirada" })).toBeNull();
  });

  it("recusa entrega e entrega_fora mesmo com endereço completo", async () => {
    const { validarEntregaAtacado, MSG_SO_RETIRADA } = await import("@/lib/checkout");
    expect(validarEntregaAtacado({ ...base, entregaTipo: "entrega" })).toBe(MSG_SO_RETIRADA);
    expect(validarEntregaAtacado({ ...base, entregaTipo: "entrega_fora" })).toBe(MSG_SO_RETIRADA);
  });

  it("mantém as validações de nome e telefone", async () => {
    const { validarEntregaAtacado } = await import("@/lib/checkout");
    expect(validarEntregaAtacado({ ...base, nome: " ", entregaTipo: "retirada" })).toBe("Informe seu nome.");
  });
});
