import { describe, it, expect } from "vitest";
import {
  ADMIN_SCREENS,
  MSG_CONTA_DESATIVADA,
  MSG_PERFIL_INDISPONIVEL,
  MSG_SEM_PERMISSAO,
  TELA_DA_SCREEN,
  camposPrecoEditaveis,
  precoProdutoEditavel,
  cargasIniciais,
  dicaRevogarAtacado,
  decidirAcesso,
  opcoesStatusPedido,
  podeExecutar,
  rotuloPapel,
  screenPermitida,
  screensVisiveis,
  type AcaoAdmin,
  type AdminScreen,
} from "@/lib/admin-acesso";
import type { Papel } from "@/lib/roles";

const ACOES: AcaoAdmin[] = [
  "cadastro",
  "preco",
  "preco-produto",
  "exclusao",
  "vendas-escrita",
  "liquidar",
  "pedidos",
  "vendas-leitura",
  "estoque-baixo",
  "config",
  "revendedores",
  "revendedores-status",
  "textos",
  "banner",
  "promocoes",
  "usuarios",
];

function permitidas(papel: Papel): AcaoAdmin[] {
  return ACOES.filter((a) => podeExecutar(papel, a));
}

describe("podeExecutar", () => {
  it("superadmin pode tudo", () => {
    expect(permitidas("superadmin")).toEqual(ACOES);
  });

  it("admin pode tudo menos config", () => {
    expect(permitidas("admin")).toEqual(ACOES.filter((a) => a !== "config"));
  });

  it("supervisor só cadastro e preço cheio de produto, registrar pagamento, pedidos, leitura de vendas, estoque baixo e cadastro de revendedores", () => {
    expect(permitidas("supervisor")).toEqual([
      "cadastro",
      "preco-produto",
      "liquidar",
      "pedidos",
      "vendas-leitura",
      "estoque-baixo",
      "revendedores",
    ]);
  });

  it("supervisor edita o preço cheio do produto, mas não atacado próprio, desconto nem Live", () => {
    expect(podeExecutar("supervisor", "preco-produto")).toBe(true);
    expect(podeExecutar("supervisor", "preco")).toBe(false);
    expect(camposPrecoEditaveis("supervisor")).toBe(false);
    expect(precoProdutoEditavel("supervisor")).toBe(true);
    expect(precoProdutoEditavel("cliente")).toBe(false);
  });

  it("supervisor registra pagamento, mas não aprova revendedor", () => {
    expect(podeExecutar("supervisor", "liquidar")).toBe(true);
    expect(podeExecutar("supervisor", "revendedores-status")).toBe(false);
  });

  it("revendedor e cliente não executam nada do admin", () => {
    expect(permitidas("revendedor")).toEqual([]);
    expect(permitidas("cliente")).toEqual([]);
  });
});

describe("rotuloPapel", () => {
  it("rótulos em PT-BR", () => {
    expect(rotuloPapel("superadmin")).toBe("Superadmin");
    expect(rotuloPapel("admin")).toBe("Admin");
    expect(rotuloPapel("supervisor")).toBe("Supervisor");
    expect(rotuloPapel("revendedor")).toBe("Revendedor");
    expect(rotuloPapel("cliente")).toBe("Cliente");
  });
});

describe("screens do admin", () => {
  it("toda screen mapeia para uma tela de lib/roles com o mesmo nome", () => {
    for (const s of ADMIN_SCREENS) expect(TELA_DA_SCREEN[s]).toBe(s);
  });

  it("superadmin e admin veem todas as screens existentes, na ordem", () => {
    const todas: AdminScreen[] = [
      "visao-geral",
      "pedidos",
      "produtos",
      "financeiro",
      "promocoes",
      "revendedores",
      "usuarios",
      "banner",
      "textos",
    ];
    expect(screensVisiveis("superadmin")).toEqual(todas);
    expect(screensVisiveis("admin")).toEqual(todas);
  });

  it("supervisor vê visão geral, pedidos, vendas (só leitura), produtos e revendedores, sem financeiro", () => {
    expect(screensVisiveis("supervisor")).toEqual(["visao-geral", "pedidos", "vendas", "produtos", "revendedores"]);
    expect(screensVisiveis("supervisor")).not.toContain("financeiro");
    expect(screensVisiveis("superadmin")).not.toContain("vendas");
    expect(screensVisiveis("admin")).not.toContain("vendas");
    expect(podeExecutar("supervisor", "vendas-leitura")).toBe(true);
    expect(podeExecutar("supervisor", "vendas-escrita")).toBe(false);
  });

  it("supervisor não vê Aparência e não executa textos nem banner", () => {
    expect(screensVisiveis("supervisor")).not.toContain("banner");
    expect(screensVisiveis("supervisor")).not.toContain("textos");
    expect(podeExecutar("supervisor", "textos")).toBe(false);
    expect(podeExecutar("supervisor", "banner")).toBe(false);
    expect(decidirAcesso({ papel: "supervisor", ativo: true }, "banner")).toEqual({
      ok: false,
      error: MSG_SEM_PERMISSAO,
      encerrarSessao: false,
    });
  });

  it("supervisor não vê promoções nem usuários e não executa as ações", () => {
    expect(screensVisiveis("supervisor")).not.toContain("promocoes");
    expect(screensVisiveis("supervisor")).not.toContain("usuarios");
    expect(podeExecutar("supervisor", "promocoes")).toBe(false);
    expect(podeExecutar("supervisor", "usuarios")).toBe(false);
  });

  it("supervisor cadastra produto mas não mexe em preço nem exclui", () => {
    expect(podeExecutar("supervisor", "cadastro")).toBe(true);
    expect(podeExecutar("supervisor", "preco")).toBe(false);
    expect(podeExecutar("supervisor", "exclusao")).toBe(false);
    for (const p of ["superadmin", "admin"] as const) {
      expect(podeExecutar(p, "cadastro")).toBe(true);
      expect(podeExecutar(p, "preco")).toBe(true);
      expect(podeExecutar(p, "exclusao")).toBe(true);
    }
  });

  it("camposPrecoEditaveis: só superadmin e admin", () => {
    const todos: Papel[] = ["superadmin", "admin", "supervisor", "revendedor", "cliente"];
    expect(todos.filter(camposPrecoEditaveis)).toEqual(["superadmin", "admin"]);
  });

  it("admin e superadmin executam promoções e usuários", () => {
    for (const p of ["superadmin", "admin"] as const) {
      expect(podeExecutar(p, "promocoes")).toBe(true);
      expect(podeExecutar(p, "usuarios")).toBe(true);
    }
  });

  it("papéis fora da equipe não veem nada", () => {
    expect(screensVisiveis("cliente")).toEqual([]);
    expect(screensVisiveis("revendedor")).toEqual([]);
  });

  it("screenPermitida mantém a atual quando permitida", () => {
    expect(screenPermitida("supervisor", "pedidos")).toBe("pedidos");
    expect(screenPermitida("admin", "financeiro")).toBe("financeiro");
  });

  it("screenPermitida cai na primeira visível quando a atual não é permitida", () => {
    expect(screenPermitida("supervisor", "financeiro")).toBe("visao-geral");
    expect(screenPermitida("supervisor", "usuarios")).toBe("visao-geral");
  });

  it("screenPermitida devolve null sem nenhuma screen visível", () => {
    expect(screenPermitida("cliente", "visao-geral")).toBeNull();
  });
});

describe("cargasIniciais", () => {
  it("superadmin carrega tudo menos estoque baixo (calculado dos produtos)", () => {
    expect(cargasIniciais("superadmin")).toEqual({
      produtos: true,
      categorias: true,
      pedidos: true,
      vendas: true,
      config: true,
      estoqueBaixo: false,
    });
  });

  it("admin não carrega config", () => {
    expect(cargasIniciais("admin")).toEqual({
      produtos: true,
      categorias: true,
      pedidos: true,
      vendas: true,
      config: false,
      estoqueBaixo: false,
    });
  });

  it("supervisor carrega produtos e categorias (cadastro), não config; mantém estoque baixo do banco", () => {
    expect(cargasIniciais("supervisor")).toEqual({
      produtos: true,
      categorias: true,
      pedidos: true,
      vendas: true,
      config: false,
      estoqueBaixo: true,
    });
  });

  it("fora da equipe não carrega nada", () => {
    expect(cargasIniciais("cliente")).toEqual({
      produtos: false,
      categorias: false,
      pedidos: false,
      vendas: false,
      config: false,
      estoqueBaixo: false,
    });
  });
});

describe("opcoesStatusPedido", () => {
  const valores = (o: { status: string }[]) => o.map((x) => x.status);

  it("entrega: nunca oferece pago nem pendente como escolha", () => {
    const op = opcoesStatusPedido("entrega", "preparando");
    expect(valores(op)).toEqual(["preparando", "enviado", "entregue", "cancelado"]);
    expect(op.every((o) => !o.disabled)).toBe(true);
  });

  it("entrega_fora usa as opções de entrega", () => {
    expect(valores(opcoesStatusPedido("entrega_fora", "enviado"))).toEqual([
      "preparando",
      "enviado",
      "entregue",
      "cancelado",
    ]);
  });

  it("retirada: opções de retirada", () => {
    expect(valores(opcoesStatusPedido("retirada", "preparando"))).toEqual([
      "preparando",
      "pronto_retirada",
      "retirado",
      "cancelado",
    ]);
  });

  it("status atual pago aparece só como opção desabilitada no topo", () => {
    const pago = opcoesStatusPedido("entrega", "pago");
    expect(pago[0]).toEqual({ status: "pago", disabled: true });
    expect(pago.slice(1).every((o) => !o.disabled)).toBe(true);
  });

  it("pedido pendente só pode ser cancelado (seguir é pela liquidação)", () => {
    for (const entrega of ["entrega", "entrega_fora", "retirada"] as const) {
      expect(opcoesStatusPedido(entrega, "pendente")).toEqual([
        { status: "pendente", disabled: true },
        { status: "cancelado", disabled: false },
      ]);
    }
  });

  it("status atual fora da lista do tipo de entrega aparece desabilitado", () => {
    const op = opcoesStatusPedido("retirada", "enviado");
    expect(op[0]).toEqual({ status: "enviado", disabled: true });
  });
});

describe("decidirAcesso", () => {
  const perfil = (papel: Papel, ativo = true) => ({ papel, ativo });

  it("perfil ativo com papel permitido libera", () => {
    expect(decidirAcesso(perfil("admin"), "preco")).toEqual({ ok: true });
    expect(decidirAcesso(perfil("supervisor"), "pedidos")).toEqual({ ok: true });
  });

  it("perfil ativo sem o papel devolve Sem permissão, sem encerrar sessão", () => {
    expect(decidirAcesso(perfil("supervisor"), "preco")).toEqual({
      ok: false,
      error: MSG_SEM_PERMISSAO,
      encerrarSessao: false,
    });
    expect(MSG_SEM_PERMISSAO).toBe("Sem permissão.");
  });

  it("conta desativada encerra a sessão, mesmo com papel de equipe", () => {
    expect(decidirAcesso(perfil("superadmin", false), "config")).toEqual({
      ok: false,
      error: MSG_CONTA_DESATIVADA,
      encerrarSessao: true,
    });
    expect(MSG_CONTA_DESATIVADA).toBe("Conta desativada.");
  });

  it("perfil indisponível é erro temporário e não encerra a sessão", () => {
    expect(decidirAcesso(null, "pedidos")).toEqual({
      ok: false,
      error: MSG_PERFIL_INDISPONIVEL,
      encerrarSessao: false,
    });
    expect(MSG_PERFIL_INDISPONIVEL).toMatch(/Tente de novo/);
  });
});

describe("dicaRevogarAtacado", () => {
  it("aparece para quem é revendedor, qualquer que seja o papel escolhido", () => {
    expect(dicaRevogarAtacado("revendedor")).toBe(
      "Para revogar o atacado desta pessoa, recuse o cadastro em Revendedores: mudar o papel aqui não corta o acesso ao atacado."
    );
  });
  it("não aparece para os demais papéis", () => {
    for (const p of ["superadmin", "admin", "supervisor", "cliente"] as const) {
      expect(dicaRevogarAtacado(p)).toBeNull();
    }
  });
});

describe("ação de config (salvarLojaConfig)", () => {
  it("só o superadmin liga/desliga o varejo e configura o bônus", () => {
    const todos: Papel[] = ["superadmin", "admin", "supervisor", "revendedor", "cliente"];
    expect(todos.filter((p) => podeExecutar(p, "config"))).toEqual(["superadmin"]);
  });

  it("admin é barrado com mensagem clara", () => {
    expect(decidirAcesso({ papel: "admin", ativo: true }, "config")).toEqual({
      ok: false,
      error: MSG_SEM_PERMISSAO,
      encerrarSessao: false,
    });
  });

  it("supervisor carrega produtos e estoque baixo ao mesmo tempo", () => {
    const c = cargasIniciais("supervisor");
    expect(c.produtos && c.estoqueBaixo).toBe(true);
  });
});

describe("opcoesStatusPedido — pedido em separação sem pagamento", () => {
  const valores = (o: { status: string }[]) => o.map((x) => x.status);

  it("só avança para aguardando pagamento ou cancela (nada de retirada sem pagar)", () => {
    expect(valores(opcoesStatusPedido("retirada", "preparando", true))).toEqual(["preparando", "pendente", "cancelado"]);
  });

  it("depois de pago, preparando segue o fluxo normal da retirada", () => {
    expect(valores(opcoesStatusPedido("retirada", "preparando", false))).toContain("pronto_retirada");
  });
});
