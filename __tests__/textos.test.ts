import { describe, it, expect } from "vitest";
import { TEXTOS_PADRAO, mesclarTextos } from "@/lib/textos";

describe("TEXTOS_PADRAO", () => {
  it("contém as chaves do seed", () => {
    expect(Object.keys(TEXTOS_PADRAO)).toHaveLength(34);
    expect(TEXTOS_PADRAO["home.categorias_etiqueta"]).toBe("");
    expect(TEXTOS_PADRAO["login.titulo"]).toBe("Pisa confiante.");
    expect(TEXTOS_PADRAO["aviso.ativo"]).toBe("true");
  });
});

describe("textos da Landing de revendedores", () => {
  const CHAVES_LP = [
    "lp_hero_titulo", "lp_hero_subtitulo", "lp_hero_botao", "lp_regras_titulo", "lp_regra_skus",
    "lp_regra_bonus", "lp_regra_preco", "lp_passos_titulo", "lp_passo_1", "lp_passo_2", "lp_passo_3",
    "lp_amostra_titulo", "lp_amostra_aviso", "lp_final_titulo", "lp_final_botao",
  ];
  it("as 15 chaves existem com texto não vazio", () => {
    for (const k of CHAVES_LP) {
      expect(typeof TEXTOS_PADRAO[k], k).toBe("string");
      expect(TEXTOS_PADRAO[k].trim(), k).not.toBe("");
    }
    expect(TEXTOS_PADRAO["lp_regra_skus"]).toContain("12 modelos diferentes por pedido");
    expect(TEXTOS_PADRAO["lp_regra_bonus"]).not.toMatch(/\d/);
  });
  it("padrões sem preço", () => {
    for (const k of CHAVES_LP) expect(TEXTOS_PADRAO[k], k).not.toMatch(/R\$/);
  });
});

describe("mesclarTextos", () => {
  it("valor do banco prevalece", () => {
    expect(mesclarTextos({ "login.titulo": "Outro" })["login.titulo"]).toBe("Outro");
  });

  it("chave ausente cai no padrão", () => {
    expect(mesclarTextos({})).toEqual(TEXTOS_PADRAO);
  });

  it("vazio ou whitespace cai no padrão", () => {
    const r = mesclarTextos({ "login.titulo": "", "login.etiqueta": "   \n" });
    expect(r["login.titulo"]).toBe(TEXTOS_PADRAO["login.titulo"]);
    expect(r["login.etiqueta"]).toBe(TEXTOS_PADRAO["login.etiqueta"]);
  });

  it("não-string cai no padrão", () => {
    const r = mesclarTextos({ "login.titulo": 42, "aviso.ativo": true, "aviso.texto": null });
    expect(r["login.titulo"]).toBe(TEXTOS_PADRAO["login.titulo"]);
    expect(r["aviso.ativo"]).toBe("true");
    expect(r["aviso.texto"]).toBe(TEXTOS_PADRAO["aviso.texto"]);
  });

  it("chaves extras são ignoradas", () => {
    expect(mesclarTextos({ "x.y": "z" })).not.toHaveProperty("x.y");
  });

  it("entrada null, undefined, array ou primitivo devolve o padrão", () => {
    for (const entrada of [null, undefined, [], ["login.titulo"], "texto", 5]) {
      expect(mesclarTextos(entrada)).toEqual(TEXTOS_PADRAO);
    }
  });

  it("não muta TEXTOS_PADRAO", () => {
    const r = mesclarTextos({ "login.titulo": "Outro" });
    r["login.etiqueta"] = "mudou";
    expect(TEXTOS_PADRAO["login.etiqueta"]).toBe("COLEÇÃO VERÃO 26");
  });
});
