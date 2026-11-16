import { describe, it, expect } from "vitest";
import {
  telefoneParaWhatsApp,
  primeiroNome,
  siteUrlSeguro,
  mensagemAprovacao,
  linkAvisoWhatsApp,
} from "@/lib/aviso-revendedor";

describe("telefoneParaWhatsApp", () => {
  it.each([
    ["(81) 99999-0000", "5581999990000"],
    ["81999990000", "5581999990000"],
    ["+55 81 99999-0000", "5581999990000"],
    ["081 9999-0000", "558199990000"],
    ["5581999990000", "5581999990000"],
  ])("normaliza %s", (entrada, esperado) => {
    expect(telefoneParaWhatsApp(entrada)).toBe(esperado);
  });
  it.each(["", "abc", "12345", "123456789012345", null, undefined])("rejeita %s", (v) => {
    expect(telefoneParaWhatsApp(v)).toBeNull();
  });
});

describe("primeiroNome e mensagem", () => {
  it("extrai o primeiro nome", () => {
    expect(primeiroNome("  Maria  da Silva ")).toBe("Maria");
    expect(primeiroNome(null)).toBe("");
  });
  it("usa o nome na saudação e cai em 'Olá!' sem nome", () => {
    expect(mensagemAprovacao({ nome: "Maria da Silva", urlAcesso: "https://x.com/a" })).toMatch(/^Olá, Maria! Seu cadastro/);
    expect(mensagemAprovacao({ nome: "  ", urlAcesso: "https://x.com/a" })).toMatch(/^Olá! Seu cadastro/);
    expect(mensagemAprovacao({ urlAcesso: "https://x.com/a" })).toContain("https://x.com/a");
  });
});

describe("siteUrlSeguro", () => {
  it("remove a barra final e usa o domínio de produção como fallback", () => {
    expect(siteUrlSeguro("https://loja.com.br/")).toBe("https://loja.com.br");
    expect(siteUrlSeguro(undefined)).toBe("https://lolaonline.com.br");
    expect(siteUrlSeguro("javascript:alert(1)")).toBe("https://lolaonline.com.br");
  });
});

describe("linkAvisoWhatsApp", () => {
  it("monta o link wa.me com o texto codificado e o link de acesso", () => {
    const link = linkAvisoWhatsApp({ telefone: "(81) 99999-0000", nome: "Ana", siteUrl: "https://lolaonline.com.br/" })!;
    expect(link.startsWith("https://wa.me/5581999990000?text=")).toBe(true);
    const texto = decodeURIComponent(link.split("?text=")[1]);
    expect(texto).toContain("Olá, Ana!");
    expect(texto).toContain("https://lolaonline.com.br/entrar?next=%2Fatacado");
  });
  it("codifica acentos, emoji, & e aspas sem quebrar a query", () => {
    const link = linkAvisoWhatsApp({ telefone: "81999990000", nome: `João & "Zé" 😀`, siteUrl: "https://a.com" })!;
    const query = link.split("?text=")[1];
    expect(query).not.toMatch(/[ "&]/);
    expect(decodeURIComponent(query)).toContain("Olá, João!");
    expect(link.split("?").length).toBe(2);
  });
  it("devolve null com telefone inválido", () => {
    expect(linkAvisoWhatsApp({ telefone: "lixo", nome: "Ana" })).toBeNull();
  });
});
