import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEXTOS_PADRAO } from "@/lib/textos";

const CHAVES_LP = [
  "lp_hero_titulo", "lp_hero_subtitulo", "lp_hero_botao", "lp_regras_titulo", "lp_regra_skus",
  "lp_regra_bonus", "lp_regra_preco", "lp_passos_titulo", "lp_passo_1", "lp_passo_2", "lp_passo_3",
  "lp_amostra_titulo", "lp_amostra_aviso", "lp_final_titulo", "lp_final_botao",
];

function secaoF(): string {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0010_site_so_atacado.sql"), "utf8");
  const i = sql.indexOf("F. TEXTOS DA LP");
  expect(i).toBeGreaterThan(-1);
  return sql.slice(i);
}

describe("seed SQL dos textos da LP", () => {
  it("as 15 chaves da seção F são idênticas a TEXTOS_PADRAO", () => {
    const pares = new Map<string, string>();
    for (const m of secaoF().matchAll(/\(\s*'(lp_[a-z0-9_]+)'\s*,\s*'((?:[^']|'')*)'\s*\)/g)) {
      pares.set(m[1], m[2].replace(/''/g, "'"));
    }
    expect([...pares.keys()].sort()).toEqual([...CHAVES_LP].sort());
    for (const [chave, valor] of pares) expect(valor, chave).toBe(TEXTOS_PADRAO[chave]);
  });
  it("não sobrescreve linhas existentes", () => {
    expect(secaoF()).toMatch(/on conflict \(chave\) do nothing/);
  });
});
