import { describe, it, expect } from "vitest";
import {
  LOJA_CONFIG_PADRAO,
  lojaConfigDe,
  lojaConfigValida,
  produtosBrinde,
  traduzirErroLojaConfig,
  validarLojaConfig,
} from "@/lib/admin-config";
import type { Product } from "@/lib/types";

const entrada = { varejoAtivo: false, bonusAtivo: false, minPecas: "15", quantidade: "1", produtoId: "" };

function prod(p: Partial<Product>): Product {
  return {
    id: "p1", slug: "p1", nome: "Produto", categoria_id: "c1", colecao: null, preco: 10,
    desconto_percentual: null, preco_atacado: null, descricao: null, caracteristicas: [],
    ativo: true, destaque: false, ordem: 0, surpresa_ativo: false, colors: [], ...p,
  };
}

describe("lojaConfigDe", () => {
  it("sem dados cai nos padrões seguros (varejo e bônus desligados)", () => {
    expect(lojaConfigDe(null)).toEqual(LOJA_CONFIG_PADRAO);
    expect(LOJA_CONFIG_PADRAO.varejo_ativo).toBe(false);
    expect(LOJA_CONFIG_PADRAO.bonus_ativo).toBe(false);
  });

  it("lê os campos do admin_get_config", () => {
    const c = lojaConfigDe({
      taxa_entrega_local: 0, whatsapp: "", cidade_taxa: "",
      varejo_ativo: true, bonus_ativo: true, bonus_min_pecas: 20, bonus_produto_id: "x", bonus_quantidade: 2,
    });
    expect(c).toEqual({ varejo_ativo: true, bonus_ativo: true, bonus_min_pecas: 20, bonus_produto_id: "x", bonus_quantidade: 2 });
  });

  it("número inválido volta ao padrão", () => {
    const c = lojaConfigDe({ taxa_entrega_local: 0, whatsapp: "", cidade_taxa: "", bonus_min_pecas: 0, bonus_quantidade: -3 });
    expect(c.bonus_min_pecas).toBe(LOJA_CONFIG_PADRAO.bonus_min_pecas);
    expect(c.bonus_quantidade).toBe(LOJA_CONFIG_PADRAO.bonus_quantidade);
  });
});

describe("validarLojaConfig", () => {
  it("aceita bônus desligado sem produto", () => {
    const r = validarLojaConfig(entrada);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor).toEqual({
        varejo_ativo: false, bonus_ativo: false, bonus_min_pecas: 15, bonus_produto_id: null, bonus_quantidade: 1,
      });
    }
  });

  it("exige produto para ligar a bonificação", () => {
    const r = validarLojaConfig({ ...entrada, bonusAtivo: true });
    expect(r).toEqual({ ok: false, erro: "Escolha o produto do brinde para ligar a bonificação." });
  });

  it("aceita bônus ligado com produto", () => {
    const r = validarLojaConfig({ ...entrada, bonusAtivo: true, produtoId: "abc", minPecas: " 12 ", quantidade: "2" });
    expect(r.ok && r.valor.bonus_min_pecas).toBe(12);
    expect(r.ok && r.valor.bonus_quantidade).toBe(2);
  });

  it.each(["", "0", "-1", "1,5", "abc", "1e3"])("recusa peças mínimas %j", (v) => {
    expect(validarLojaConfig({ ...entrada, minPecas: v }).ok).toBe(false);
  });

  it.each(["", "0", "2.5", "x"])("recusa quantidade %j", (v) => {
    expect(validarLojaConfig({ ...entrada, quantidade: v }).ok).toBe(false);
  });

  it("repassa o interruptor do varejo", () => {
    const r = validarLojaConfig({ ...entrada, varejoAtivo: true });
    expect(r.ok && r.valor.varejo_ativo).toBe(true);
  });
});

describe("lojaConfigValida (servidor)", () => {
  const ok = { varejo_ativo: false, bonus_ativo: false, bonus_min_pecas: 15, bonus_produto_id: null, bonus_quantidade: 1 };

  it("aceita o payload bem formado", () => {
    expect(lojaConfigValida(ok)).toBe(true);
    expect(lojaConfigValida({ ...ok, bonus_ativo: true, bonus_produto_id: "id" })).toBe(true);
  });

  it.each([
    null,
    undefined,
    "x",
    [],
    { ...ok, varejo_ativo: "sim" },
    { ...ok, bonus_min_pecas: 0 },
    { ...ok, bonus_min_pecas: 1.5 },
    { ...ok, bonus_quantidade: -1 },
    { ...ok, bonus_produto_id: "" },
    { ...ok, bonus_produto_id: 7 },
    { ...ok, bonus_ativo: true, bonus_produto_id: null },
  ])("recusa %j", (v) => {
    expect(lojaConfigValida(v)).toBe(false);
  });
});

describe("produtosBrinde", () => {
  it("lista só produtos somente_bonus, por nome", () => {
    const lista = produtosBrinde([
      prod({ id: "1", nome: "Zebra", somente_bonus: true }),
      prod({ id: "2", nome: "Normal" }),
      prod({ id: "3", nome: "Abacate", somente_bonus: true, ativo: false }),
      prod({ id: "4", nome: "Outro", somente_bonus: false }),
    ]);
    expect(lista.map((p) => p.id)).toEqual(["3", "1"]);
  });
});

describe("traduzirErroLojaConfig", () => {
  it("traduz os erros do banco e mantém os demais", () => {
    expect(traduzirErroLojaConfig("valores do bônus inválidos")).toMatch(/1 ou mais/);
    expect(traduzirErroLojaConfig("produto do bônus obrigatório para ligar a bonificação")).toMatch(/brinde/);
    expect(traduzirErroLojaConfig("sem permissão")).toBe("sem permissão");
  });
});
