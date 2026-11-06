import { describe, expect, it } from "vitest";
import { FLAGS_SEGURAS, parseLojaFlags } from "@/lib/loja-flags";
import { varejoDisponivel } from "@/lib/loja-rotas";

describe("varejoDisponivel", () => {
  it("falso nas flags seguras (fail-safe)", () => {
    expect(varejoDisponivel(FLAGS_SEGURAS)).toBe(false);
  });
  it("falso quando o RPC devolve lixo", () => {
    expect(varejoDisponivel(parseLojaFlags(null))).toBe(false);
    expect(varejoDisponivel(parseLojaFlags({ varejo_ativo: "true" }))).toBe(false);
  });
  it("verdadeiro só com varejo_ativo true", () => {
    expect(varejoDisponivel(parseLojaFlags({ varejo_ativo: true }))).toBe(true);
    expect(varejoDisponivel({ ...FLAGS_SEGURAS, varejoAtivo: true })).toBe(true);
    expect(varejoDisponivel({ ...FLAGS_SEGURAS, varejoAtivo: false })).toBe(false);
  });
});
