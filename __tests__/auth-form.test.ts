import { describe, expect, it } from "vitest";
import {
  CAMPOS,
  abasLogin,
  aplicarMascara,
  diagnosticarFormulario,
  diagnosticarNovaSenha,
  normalizarModo,
  validarFormulario,
  validarNovaSenha,
} from "@/components/auth/form";
import { lerHashRecuperacao } from "@/components/auth/recuperacao";

const CNPJ_OK = "11.222.333/0001-81";

describe("normalizarModo", () => {
  it("aceita os quatro modos", () => {
    for (const m of ["entrar", "cadastro", "revendedor", "esqueci"]) expect(normalizarModo(m)).toBe(m);
  });
  it("cai em entrar para valores desconhecidos ou ausentes", () => {
    expect(normalizarModo(undefined)).toBe("entrar");
    expect(normalizarModo("admin")).toBe("entrar");
    expect(normalizarModo(["cadastro", "x"])).toBe("entrar");
  });
});

describe("normalizarModo sem varejo", () => {
  it("cadastro de cliente cai em revendedor quando o varejo está desligado", () => {
    expect(normalizarModo("cadastro", false)).toBe("revendedor");
    expect(normalizarModo("cadastro", true)).toBe("cadastro");
    expect(normalizarModo("cadastro")).toBe("cadastro");
  });
  it("os demais modos não mudam", () => {
    for (const m of ["entrar", "revendedor", "esqueci"]) expect(normalizarModo(m, false)).toBe(m);
    expect(normalizarModo(undefined, false)).toBe("entrar");
  });
});

describe("abasLogin", () => {
  it("varejo ligado: Entrar e Criar conta", () => {
    expect(abasLogin(true).map((a) => a.modo)).toEqual(["entrar", "cadastro"]);
  });
  it("varejo desligado: sem cadastro de cliente, com Seja revendedora", () => {
    const abas = abasLogin(false);
    expect(abas.map((a) => a.modo)).toEqual(["entrar", "revendedor"]);
    expect(abas.some((a) => a.modo === "cadastro")).toBe(false);
  });
});

describe("CAMPOS", () => {
  it("usa os nomes do contrato das actions", () => {
    expect(CAMPOS.revendedor.map((c) => c.nome)).toEqual(["razao_social", "cnpj", "nome", "email", "whatsapp", "senha"]);
    expect(CAMPOS.entrar.map((c) => c.nome)).toEqual(["email", "senha"]);
    expect(CAMPOS.cadastro.map((c) => c.nome)).toEqual(["nome", "email", "senha"]);
    expect(CAMPOS.esqueci.map((c) => c.nome)).toEqual(["email"]);
  });
});

describe("aplicarMascara", () => {
  it("mascara CNPJ e WhatsApp e deixa os demais intactos", () => {
    expect(aplicarMascara("cnpj", "11222333000181")).toBe(CNPJ_OK);
    expect(aplicarMascara("whatsapp", "11987654321")).toBe("(11) 98765-4321");
    expect(aplicarMascara("email", "a@b.com")).toBe("a@b.com");
  });
});

describe("validarFormulario", () => {
  it("exige todos os campos", () => {
    expect(validarFormulario("entrar", { email: "a@b.com", senha: "" })).toBe("Preencha todos os campos.");
    expect(validarFormulario("entrar", {})).toBe("Preencha todos os campos.");
    expect(validarFormulario("entrar", { email: "  ", senha: "x" })).toBe("Preencha todos os campos.");
  });
  it("confere o e-mail", () => {
    expect(validarFormulario("entrar", { email: "abc", senha: "x" })).toBe("Confira o e-mail.");
    expect(validarFormulario("esqueci", { email: "abc" })).toBe("Confira o e-mail.");
  });
  it("login e esqueci válidos", () => {
    expect(validarFormulario("entrar", { email: "a@b.com", senha: "x" })).toBeNull();
    expect(validarFormulario("esqueci", { email: "a@b.com" })).toBeNull();
  });
  it("cadastro exige senha com 8 caracteres", () => {
    const base = { nome: "Ana", email: "a@b.com" };
    expect(validarFormulario("cadastro", { ...base, senha: "1234567" })).toBe(
      "A senha precisa ter ao menos 8 caracteres."
    );
    expect(validarFormulario("cadastro", { ...base, senha: "12345678" })).toBeNull();
  });
  it("login não aplica o mínimo de senha", () => {
    expect(validarFormulario("entrar", { email: "a@b.com", senha: "1" })).toBeNull();
  });
  it("revendedor valida CNPJ, WhatsApp e senha", () => {
    const ok = {
      razao_social: "Bela Vitrine",
      cnpj: CNPJ_OK,
      nome: "Ana",
      email: "a@b.com",
      whatsapp: "(11) 98765-4321",
      senha: "12345678",
    };
    expect(validarFormulario("revendedor", ok)).toBeNull();
    expect(validarFormulario("revendedor", { ...ok, cnpj: "11.222.333/0001-82" })).toBe("Confira o CNPJ.");
    expect(validarFormulario("revendedor", { ...ok, cnpj: "11.222" })).toBe("Confira o CNPJ.");
    expect(validarFormulario("revendedor", { ...ok, whatsapp: "(11) 9876" })).toBe(
      "WhatsApp inválido. Use DDD + número."
    );
    expect(validarFormulario("revendedor", { ...ok, senha: "123" })).toBe("A senha precisa ter ao menos 8 caracteres.");
  });
});

describe("validarNovaSenha", () => {
  it("valida tamanho e igualdade", () => {
    expect(validarNovaSenha("", "")).toBe("Preencha todos os campos.");
    expect(validarNovaSenha("1234567", "1234567")).toBe("A senha precisa ter ao menos 8 caracteres.");
    expect(validarNovaSenha("12345678", "12345679")).toBe("As senhas não conferem.");
    expect(validarNovaSenha("12345678", "12345678")).toBeNull();
  });
});

describe("diagnósticos por campo", () => {
  it("aponta o campo responsável pela mensagem", () => {
    expect(diagnosticarFormulario("entrar", { email: "a@b.com", senha: "" })?.campo).toBe("senha");
    expect(diagnosticarFormulario("entrar", { email: "abc", senha: "x" })?.campo).toBe("email");
    expect(diagnosticarFormulario("cadastro", { nome: "A", email: "a@b.com", senha: "1" })?.campo).toBe("senha");
    expect(diagnosticarFormulario("entrar", { email: "a@b.com", senha: "x" })).toBeNull();
  });
  it("aponta senha curta e confirmação diferente", () => {
    expect(diagnosticarNovaSenha("123", "123")?.campo).toBe("senha");
    expect(diagnosticarNovaSenha("12345678", "1")?.campo).toBe("confirmar");
    expect(diagnosticarNovaSenha("12345678", "12345678")).toBeNull();
  });
});

describe("lerHashRecuperacao", () => {
  it("extrai o token de um fragmento de recuperação", () => {
    expect(lerHashRecuperacao("#access_token=abc.def.ghi&expires_in=3600&type=recovery")).toBe("abc.def.ghi");
    expect(lerHashRecuperacao("access_token=abc&type=recovery")).toBe("abc");
  });
  it("rejeita fragmento sem token, de outro tipo ou com erro", () => {
    expect(lerHashRecuperacao("")).toBeNull();
    expect(lerHashRecuperacao("#")).toBeNull();
    expect(lerHashRecuperacao("#access_token=abc&type=signup")).toBeNull();
    expect(lerHashRecuperacao("#access_token=&type=recovery")).toBeNull();
    expect(lerHashRecuperacao("#type=recovery")).toBeNull();
    expect(lerHashRecuperacao("#error=access_denied&error_code=otp_expired&type=recovery")).toBeNull();
  });
});
