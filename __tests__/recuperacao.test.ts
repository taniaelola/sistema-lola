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
