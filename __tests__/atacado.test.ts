import { describe, it, expect } from "vitest";
import {
  alertaLinha,
  badgeEstoque,
  calcularKpis,
  dataPtBr,
  decisaoGate,
  decisaoFinalizar,
  descontoMaximo,
  ehUuid,
  mensagemErroAtacado,
  normalizarCarrinho,
  normalizarPedidos,
  pedidoIdCurto,
  progressoPecas,
  proximaQuantidade,
  quantidadeValida,
  rotuloStatusPedido,
  textoFaltam,
  type ItemCarrinho,
  type PedidoAtacado,
} from "@/lib/atacado";

function item(extra: Partial<ItemCarrinho> = {}): ItemCarrinho {
  return {
    id: "i1",
    product_id: "p1",
    color_id: "c1",
    size_id: "s1",
    nome: "Tênis",
    cor: "Rosa",
    tamanho: "38",
    imagem: null,
    quantidade: 2,
    preco_unit: 50,
    estoque: 10,
    subtotal: 100,
    disponivel: true,
    ...extra,
  };
}

function itens(n: number, extra: Partial<ItemCarrinho> = {}): ItemCarrinho[] {
  return Array.from({ length: n }, (_, k) =>
    item({ id: `i${k}`, product_id: `p${k}`, color_id: `c${k}`, size_id: `s${k}`, ...extra })
  );
}

function pedido(extra: Partial<PedidoAtacado> = {}): PedidoAtacado {
  return {
    id: "abcdef12-0000-0000-0000-000000000000",
    created_at: "2026-10-15T15:00:00Z",
    status: "pago",
    valor_total: 1000,
    skus: 12,
    ...extra,
  };
}

describe("progressoPecas", () => {
  it("calcula atual, percentual e rótulo", () => {
    expect(progressoPecas(3)).toEqual({ atual: 3, minimo: 12, pct: 25, label: "3/12", completo: false });
  });
  it("limita em 100% e marca completo", () => {
    expect(progressoPecas(15)).toMatchObject({ pct: 100, completo: true });
    expect(progressoPecas(12).completo).toBe(true);
  });
  it("trata valores inválidos como zero", () => {
    expect(progressoPecas(-2).atual).toBe(0);
    expect(progressoPecas(Number.NaN).pct).toBe(0);
  });
});

describe("textoFaltam", () => {
  it("plural", () => expect(textoFaltam(9)).toBe("Faltam 3 peças para finalizar"));
  it("singular", () => expect(textoFaltam(11)).toBe("Falta 1 peça para finalizar"));
  it("nulo quando completo", () => expect(textoFaltam(12)).toBeNull());
  it("zero peças", () => expect(textoFaltam(0)).toBe("Faltam 12 peças para finalizar"));
});

describe("decisaoFinalizar", () => {
  it("habilita com 12 peças sem alerta", () => {
    expect(decisaoFinalizar(itens(12, { quantidade: 1 }))).toEqual({ habilitado: true, texto: "Finalizar pedido" });
  });
  it("habilita com UM modelo e 12 peças", () => {
    expect(decisaoFinalizar([item({ quantidade: 12, estoque: 50 })])).toEqual({ habilitado: true, texto: "Finalizar pedido" });
  });
  it("habilita com 12 peças em 3 modelos", () => {
    const l = [item({ id: "a", quantidade: 5, estoque: 50 }), item({ id: "b", product_id: "p2", quantidade: 4, estoque: 50 }), item({ id: "c", product_id: "p3", quantidade: 3, estoque: 50 })];
    expect(decisaoFinalizar(l).habilitado).toBe(true);
  });
  it("bloqueia com menos de 12 peças", () => {
    expect(decisaoFinalizar(itens(10, { quantidade: 1 }))).toEqual({
      habilitado: false,
      texto: "Faltam 2 peças para finalizar",
    });
  });
  it("3 modelos com 10 peças no total: faltam 2", () => {
    const l = [item({ id: "a", quantidade: 4 }), item({ id: "b", product_id: "p2", quantidade: 3 }), item({ id: "c", product_id: "p3", quantidade: 3 })];
    expect(decisaoFinalizar(l)).toEqual({ habilitado: false, texto: "Faltam 2 peças para finalizar" });
  });
  it("bloqueia com alerta de estoque mesmo com 12 peças", () => {
    const l = itens(12, { quantidade: 1 });
    l[3] = { ...l[3], quantidade: 11, estoque: 4 };
    expect(decisaoFinalizar(l)).toEqual({
      habilitado: false,
      texto: "Ajuste os itens com alerta para finalizar",
    });
  });
  it("bloqueia com item indisponível", () => {
    const l = itens(12, { quantidade: 1 });
    l[0] = { ...l[0], disponivel: false };
    expect(decisaoFinalizar(l).habilitado).toBe(false);
  });
  it("carrinho vazio", () => {
    expect(decisaoFinalizar([])).toEqual({
      habilitado: false,
      texto: "Faltam 12 peças para finalizar",
    });
  });
  it("itens indisponíveis não contam como peça", () => {
    const l = itens(12, { quantidade: 1 });
    l[0] = { ...l[0], disponivel: false };
    expect(decisaoFinalizar(l).texto).toBe("Falta 1 peça para finalizar");
  });
});

describe("alertaLinha", () => {
  it("sem alerta quando há estoque suficiente", () => {
    expect(alertaLinha({ disponivel: true, estoque: 5, quantidade: 5 })).toBeNull();
  });
  it("só restam N quando a quantidade passa do estoque", () => {
    expect(alertaLinha({ disponivel: true, estoque: 3, quantidade: 4 })).toBe("Só restam 3");
  });
  it("sem estoque", () => {
    expect(alertaLinha({ disponivel: true, estoque: 0, quantidade: 1 })).toBe("Sem estoque");
  });
  it("produto indisponível tem prioridade", () => {
    expect(alertaLinha({ disponivel: false, estoque: 10, quantidade: 1 })).toBe("Produto indisponível");
  });
});

describe("badgeEstoque", () => {
  it("sem estoque", () => expect(badgeEstoque(0)).toBe("Sem estoque"));
  it("estoque baixo", () => {
    expect(badgeEstoque(5)).toBe("Só restam 5");
    expect(badgeEstoque(1)).toBe("Só restam 1");
  });
  it("sem badge acima de 5", () => expect(badgeEstoque(6)).toBeNull());
  it("negativo vira sem estoque", () => expect(badgeEstoque(-3)).toBe("Sem estoque"));
});

describe("proximaQuantidade", () => {
  it("soma um respeitando o estoque", () => {
    expect(proximaQuantidade(0, 5)).toBe(1);
    expect(proximaQuantidade(4, 5)).toBe(5);
  });
  it("nulo ao atingir o estoque", () => {
    expect(proximaQuantidade(5, 5)).toBeNull();
    expect(proximaQuantidade(0, 0)).toBeNull();
  });
  it("nulo acima do teto de 999", () => {
    expect(proximaQuantidade(999, 5000)).toBeNull();
  });
});

describe("validação de entrada", () => {
  it("uuid", () => {
    expect(ehUuid("3f8a1c52-9b1e-4d2a-8c3f-0a1b2c3d4e5f")).toBe(true);
    expect(ehUuid("abc")).toBe(false);
    expect(ehUuid(undefined)).toBe(false);
    expect(ehUuid("3f8a1c52-9b1e-4d2a-8c3f-0a1b2c3d4e5f; drop")).toBe(false);
  });
  it("quantidade inteira 0..999", () => {
    expect(quantidadeValida(0)).toBe(true);
    expect(quantidadeValida(999)).toBe(true);
    expect(quantidadeValida(1000)).toBe(false);
    expect(quantidadeValida(-1)).toBe(false);
    expect(quantidadeValida(1.5)).toBe(false);
    expect(quantidadeValida("3")).toBe(false);
    expect(quantidadeValida(Number.NaN)).toBe(false);
  });
});

describe("rotuloStatusPedido", () => {
  it("mapeia os status do banco para rótulos conhecidos de corStatus", () => {
    expect(rotuloStatusPedido("pendente")).toBe("Aguardando pagamento");
    expect(rotuloStatusPedido("pago")).toBe("Pago");
    expect(rotuloStatusPedido("preparando")).toBe("Em separação");
    expect(rotuloStatusPedido("enviado")).toBe("Enviado");
    expect(rotuloStatusPedido("pronto_retirada")).toBe("Pronto para retirada");
    expect(rotuloStatusPedido("entregue")).toBe("Entregue");
    expect(rotuloStatusPedido("retirado")).toBe("Retirado");
    expect(rotuloStatusPedido("cancelado")).toBe("Cancelado");
  });
  it("status desconhecido cai em Pendente", () => {
    expect(rotuloStatusPedido("xyz")).toBe("Pendente");
  });
});

describe("descontoMaximo", () => {
  it("maior percentual informado", () => {
    expect(descontoMaximo([30, 40, null, undefined])).toBe(40);
  });
  it("nulo sem dados", () => {
    expect(descontoMaximo([])).toBeNull();
    expect(descontoMaximo([null])).toBeNull();
  });
  it("ignora valores fora de 0..100", () => {
    expect(descontoMaximo([-5, 120, 20])).toBe(20);
  });
});

describe("calcularKpis", () => {
  const agora = new Date("2026-10-20T12:00:00Z");
  it("conta pedidos do mês e soma só pedidos pagos em diante", () => {
    const k = calcularKpis({
      pedidos: [
        pedido({ valor_total: 1000 }),
        pedido({ status: "pendente", valor_total: 500 }),
        pedido({ status: "cancelado", valor_total: 700 }),
        pedido({ status: "entregue", created_at: "2026-09-10T12:00:00Z", valor_total: 200 }),
      ],
      descontoMaximo: 35,
      agora,
    });
    expect(k.pedidosMes).toBe("2");
    expect(k.totalComprado).toBe(
      (1200).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    );
    expect(k.descontoAtacado).toBe("até 35%");
  });
  it("usa fuso de São Paulo na virada do mês", () => {
    const k = calcularKpis({
      pedidos: [pedido({ created_at: "2026-11-01T01:00:00Z" })],
      descontoMaximo: null,
      agora,
    });
    expect(k.pedidosMes).toBe("1");
  });
  it("mostra traço quando não há dado confiável", () => {
    const k = calcularKpis({ pedidos: null, descontoMaximo: null, agora });
    expect(k).toEqual({ pedidosMes: "—", totalComprado: "—", descontoAtacado: "—" });
  });
  it("sem pedidos: zero pedidos no mês e traço no total", () => {
    const k = calcularKpis({ pedidos: [], descontoMaximo: 12.5, agora });
    expect(k.pedidosMes).toBe("0");
    expect(k.totalComprado).toBe("—");
    expect(k.descontoAtacado).toBe("até 12,5%");
  });
});

describe("mensagemErroAtacado", () => {
  it("traduz erros conhecidos sem vazar detalhe", () => {
    expect(mensagemErroAtacado({ message: "revendedor não aprovado" })).toMatch(/cadastro/i);
    expect(mensagemErroAtacado({ message: "carrinho cheio" })).toMatch(/cheio/i);
    expect(mensagemErroAtacado({ message: "produto indisponível" })).toMatch(/indisponível/i);
  });
  it("erro desconhecido vira mensagem genérica", () => {
    const m = mensagemErroAtacado({ message: "relation carrinho_atacado violates foo at 10.0.0.1" });
    expect(m).not.toMatch(/carrinho_atacado|10\.0/);
    expect(m.length).toBeGreaterThan(10);
  });
  it("aceita nulo", () => expect(mensagemErroAtacado(null).length).toBeGreaterThan(10));
});

describe("normalização de dados do banco", () => {
  it("carrinho com números como texto e campos faltando", () => {
    const c = normalizarCarrinho({
      itens: [{ ...item(), quantidade: "3", preco_unit: "49.9", estoque: "7", subtotal: "149.7" }, null, 5],
      sku_distintos: "1",
      total: "149.7",
    });
    expect(c.itens).toHaveLength(1);
    expect(c.itens[0]).toMatchObject({ quantidade: 3, preco_unit: 49.9, estoque: 7, subtotal: 149.7 });
    expect(c.sku_distintos).toBe(1);
    expect(c.pecas).toBe(3);
    expect(c.total).toBe(149.7);
  });
  it("carrinho inválido vira vazio", () => {
    expect(normalizarCarrinho(null)).toEqual({ itens: [], sku_distintos: 0, pecas: 0, total: 0 });
    expect(normalizarCarrinho("x")).toEqual({ itens: [], sku_distintos: 0, pecas: 0, total: 0 });
  });
  it("pedidos inválidos são descartados", () => {
    const p = normalizarPedidos([pedido(), { id: 1 }, null]);
    expect(p).toHaveLength(1);
    expect(normalizarPedidos("x")).toBeNull();
  });
});

describe("decisaoGate", () => {
  it("sem sessão ou conta inativa pede login", () => {
    expect(decisaoGate({ papel: null, ativo: false, status: null })).toBe("entrar");
    expect(decisaoGate({ papel: "revendedor", ativo: false, status: "aprovado" })).toBe("entrar");
  });
  it("outros papéis ficam fora", () => {
    expect(decisaoGate({ papel: "admin", ativo: true, status: "aprovado" })).toBe("fora");
    expect(decisaoGate({ papel: "cliente", ativo: true, status: null })).toBe("fora");
  });
  it("revendedor segue o status do cadastro", () => {
    expect(decisaoGate({ papel: "revendedor", ativo: true, status: "aprovado" })).toBe("aprovado");
    expect(decisaoGate({ papel: "revendedor", ativo: true, status: "pendente" })).toBe("pendente");
    expect(decisaoGate({ papel: "revendedor", ativo: true, status: "recusado" })).toBe("recusado");
    expect(decisaoGate({ papel: "revendedor", ativo: true, status: null })).toBe("sem-cadastro");
    expect(decisaoGate({ papel: "revendedor", ativo: true, status: "xyz" })).toBe("sem-cadastro");
  });
});

describe("formatação", () => {
  it("id curto em maiúsculas", () => expect(pedidoIdCurto("abcdef12-0000")).toBe("#ABCDEF12"));
  it("data pt-BR no fuso de São Paulo", () => {
    expect(dataPtBr("2026-10-15T15:00:00Z")).toBe("15/10/2026");
    expect(dataPtBr("2026-11-01T01:00:00Z")).toBe("31/10/2026");
    expect(dataPtBr("lixo")).toBe("—");
  });
});
