import { describe, it, expect } from "vitest";
import { lerHashAcesso, lerHashRecuperacao } from "@/components/auth/recuperacao";

describe("lerHashAcesso", () => {
  it("recovery vira recuperação de senha", () => {
    expect(lerHashAcesso("#access_token=abc&type=recovery")).toEqual({ token: "abc", tipo: "recuperacao" });
  });
  it("signup, invite e magiclink viram convite de equipe", () => {
    for (const type of ["signup", "invite", "magiclink"]) {
      expect(lerHashAcesso(`#access_token=abc&type=${type}`)).toEqual({ token: "abc", tipo: "convite" });
    }
  });
  it("erro no hash, tipo desconhecido ou sem token = inválido", () => {
    expect(lerHashAcesso("#error=access_denied&error_code=otp_expired")).toBeNull();
    expect(lerHashAcesso("#access_token=abc&type=outro")).toBeNull();
    expect(lerHashAcesso("#type=signup")).toBeNull();
    expect(lerHashAcesso("")).toBeNull();
  });
  it("lerHashRecuperacao continua só aceitando recovery", () => {
    expect(lerHashRecuperacao("#access_token=abc&type=signup")).toBeNull();
    expect(lerHashRecuperacao("#access_token=abc&type=recovery")).toBe("abc");
  });
});

describe("lerHashAcesso — revendedora que se cadastrou sozinha", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (meta: object) => `${b64({ alg: "HS256" })}.${b64({ sub: "u1", exp: 9999999999, user_metadata: meta })}.assinatura`;

  it("link de confirmação de revendedora NÃO é convite de equipe", () => {
    expect(lerHashAcesso(`#access_token=${jwt({ tipo: "revendedor", nome: "Ana" })}&type=signup`)).toBeNull();
  });

  it("link de confirmação sem tipo revendedor continua sendo convite de equipe", () => {
    const token = jwt({});
    expect(lerHashAcesso(`#access_token=${token}&type=signup`)).toEqual({ token, tipo: "convite" });
  });

  it("recuperação de senha de revendedora continua redefinindo senha", () => {
    const token = jwt({ tipo: "revendedor" });
    expect(lerHashAcesso(`#access_token=${token}&type=recovery`)).toEqual({ token, tipo: "recuperacao" });
  });
});
