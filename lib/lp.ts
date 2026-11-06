// Núcleo puro da landing de revendedores (sem server-only, sem supabase).
export type AmostraLP = {
  id: string;
  slug: string;
  nome: string;
  imagem: string | null;
  precoVarejo: number;
  precoAtacado: number;
};

const LIMITE_AMOSTRA = 8;

function precoValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

// Recebe o JSON de get_destaques_atacado(): valida cada item, descarta os inválidos,
// no máximo 8. Qualquer coisa que não seja array devolve [] (a seção não renderiza).
export function selecionarAmostra(raw: unknown): AmostraLP[] {
  if (!Array.isArray(raw)) return [];
  const saida: AmostraLP[] = [];
  for (const item of raw) {
    if (saida.length >= LIMITE_AMOSTRA) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.slug !== "string" || typeof o.nome !== "string") continue;
    if (!precoValido(o.preco_varejo) || !precoValido(o.preco_atacado)) continue;
    if (o.imagem !== null && typeof o.imagem !== "string") continue;
    saida.push({
      id: o.id,
      slug: o.slug,
      nome: o.nome,
      imagem: o.imagem,
      precoVarejo: o.preco_varejo,
      precoAtacado: o.preco_atacado,
    });
  }
  return saida;
}

export function economiaPercentual(precoVarejo: number, precoAtacado: number): number {
  if (!precoValido(precoVarejo) || !precoValido(precoAtacado)) return 0;
  if (precoVarejo <= 0 || precoAtacado >= precoVarejo) return 0;
  return Math.round(((precoVarejo - precoAtacado) / precoVarejo) * 100);
}
