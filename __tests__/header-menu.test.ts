import { describe, expect, it } from "vitest";
import { dadosPublicosHeader, destinoAjuda, itensMenu, itensMenuConta, linksCategorias, primeiroNome } from "@/lib/header-menu";

const WA = "https://wa.me/5581987307223";

describe("itensMenuConta", () => {
  it("cliente: Minha conta e Sair", () => {
    const r = itensMenuConta({ nome: "Ana", papel: "cliente" });
    expect(r.map((i) => i.rotulo)).toEqual(["Minha conta", "Sair"]);
    expect(r[1].tipo).toBe("sair");
  });
  it("equipe vê só Painel e Sair", () => {
    for (const papel of ["superadmin", "admin", "supervisor"] as const) {
      const r = itensMenuConta({ nome: "X", papel });
      expect(r.map((i) => i.rotulo)).toEqual(["Painel", "Sair"]);
      expect(r[0]).toEqual({ tipo: "link", rotulo: "Painel", href: "/admin" });
    }
  });
  it("revendedor vê só Painel de atacado e Sair", () => {
    const r = itensMenuConta({ nome: "R", papel: "revendedor" });
    expect(r.map((i) => i.rotulo)).toEqual(["Painel de atacado", "Sair"]);
    expect(r[0]).toEqual({ tipo: "link", rotulo: "Painel de atacado", href: "/atacado" });
  });
});

describe("itensMenu", () => {
  const cats = [{ slug: "tenis", nome: "Tênis" }];
  const rotulos = (r: { rotulo: string }[]) => r.map((i) => i.rotulo);
  const semVarejo = (r: { tipo: string }[]) =>
    r.every((i) => i.tipo !== "sacola" && i.tipo !== "categoria");

  it("varejo off, visitante: Entrar e Seja revendedora, sem sacola nem categorias", () => {
    const r = itensMenu({ varejoAtivo: false, logado: false, categorias: cats });
    expect(r).toEqual([
      { tipo: "link", rotulo: "Entrar", href: "/entrar" },
      { tipo: "link", rotulo: "Seja revendedora", href: "/entrar?modo=revendedor" },
    ]);
    expect(semVarejo(r)).toBe(true);
  });
  it("varejo off, revendedor: painel de atacado", () => {
    const r = itensMenu({ varejoAtivo: false, logado: true, papel: "revendedor", categorias: cats });
    expect(r).toEqual([{ tipo: "link", rotulo: "Painel de atacado", href: "/atacado" }]);
  });
  it("varejo off, equipe: painel em /admin", () => {
    for (const papel of ["superadmin", "admin", "supervisor"] as const) {
      const r = itensMenu({ varejoAtivo: false, logado: true, papel, categorias: cats });
      expect(r).toEqual([{ tipo: "link", rotulo: "Painel", href: "/admin" }]);
    }
  });
  it("varejo off, cliente logado: nada de varejo", () => {
    expect(itensMenu({ varejoAtivo: false, logado: true, papel: "cliente", categorias: cats })).toEqual([]);
    expect(itensMenu({ varejoAtivo: false, logado: true, papel: null, categorias: cats })).toEqual([]);
  });
  it("varejo off nunca devolve sacola nem categoria, em nenhuma combinação", () => {
    for (const logado of [false, true])
      for (const papel of [null, "cliente", "revendedor", "supervisor", "admin", "superadmin"] as const)
        expect(semVarejo(itensMenu({ varejoAtivo: false, logado, papel, categorias: cats }))).toBe(true);
  });
  it("varejo on, visitante: categorias, Lançamentos, sacola e entrada", () => {
    const r = itensMenu({ varejoAtivo: true, logado: false, categorias: cats });
    expect(rotulos(r)).toEqual(["Tênis", "Lançamentos", "Sacola", "Entrar", "Seja revendedora"]);
    expect(r.find((i) => i.tipo === "sacola")?.href).toBe("/carrinho");
  });
  it("varejo on, logado: sacola e destino do papel", () => {
    expect(rotulos(itensMenu({ varejoAtivo: true, logado: true, papel: "cliente" }))).toEqual([
      "Lançamentos", "Sacola", "Minha conta",
    ]);
    expect(rotulos(itensMenu({ varejoAtivo: true, logado: true, papel: "revendedor" }))).toEqual([
      "Lançamentos", "Sacola", "Painel de atacado",
    ]);
    expect(rotulos(itensMenu({ varejoAtivo: true, logado: true, papel: "admin" }))).toEqual([
      "Lançamentos", "Sacola", "Painel",
    ]);
  });
});

describe("linksCategorias", () => {
  it("categorias reais seguidas de Lançamentos", () => {
    expect(linksCategorias([{ slug: "tenis", nome: "Tênis" }])).toEqual([
      { href: "/#cat-tenis", rotulo: "Tênis" },
      { href: "/#lancamentos", rotulo: "Lançamentos" },
    ]);
  });
  it("sem categorias mantém só Lançamentos", () => {
    expect(linksCategorias([])).toEqual([{ href: "/#lancamentos", rotulo: "Lançamentos" }]);
  });
});

describe("destinoAjuda", () => {
  const ZAP = { href: WA, tipo: "nova-aba" };
  it("vazio ou nulo vai para o WhatsApp", () => {
    expect(destinoAjuda("", WA)).toEqual(ZAP);
    expect(destinoAjuda("  ", WA)).toEqual(ZAP);
    expect(destinoAjuda(undefined, WA)).toEqual(ZAP);
    expect(destinoAjuda(null, WA)).toEqual(ZAP);
  });
  it("esquemas perigosos e formatos suspeitos caem no WhatsApp", () => {
    for (const v of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<b>x</b>",
      "//evil.com",
      "/\\evil",
      " https://x",
      "https://x.com/a b",
      "/ok\nx",
      "ftp://x.com",
    ]) {
      expect(destinoAjuda(v, WA)).toEqual(ZAP);
    }
  });
  it("http(s) abre em nova aba", () => {
    expect(destinoAjuda("https://x.com", WA)).toEqual({ href: "https://x.com", tipo: "nova-aba" });
  });
  it("mailto e tel são links simples", () => {
    expect(destinoAjuda("mailto:a@b.co", WA)).toEqual({ href: "mailto:a@b.co", tipo: "simples" });
    expect(destinoAjuda("tel:+5511999999999", WA)).toEqual({
      href: "tel:+5511999999999",
      tipo: "simples",
    });
  });
  it("caminho interno e âncora", () => {
    expect(destinoAjuda("/ok", WA)).toEqual({ href: "/ok", tipo: "interno" });
    expect(destinoAjuda("#ancora", WA)).toEqual({ href: "#ancora", tipo: "simples" });
  });
});

describe("dadosPublicosHeader", () => {
  it("remove o perfil e mantém só dados públicos", () => {
    const r = dadosPublicosHeader({
      categorias: [{ slug: "a", nome: "A" }],
      varejoAtivo: false,
      perfil: { nome: "Ana", papel: "admin" },
      avisoTexto: "oi",
      avisoAtivo: "true",
    });
    expect(r).toEqual({
      categorias: [{ slug: "a", nome: "A" }],
      varejoAtivo: false,
      avisoTexto: "oi",
      avisoAtivo: "true",
    });
    expect("perfil" in r).toBe(false);
    expect(JSON.stringify(r)).not.toContain("Ana");
  });
});

describe("primeiroNome", () => {
  it("pega a primeira palavra", () => {
    expect(primeiroNome("  Maria da Silva ")).toBe("Maria");
    expect(primeiroNome("")).toBe("");
  });
});
