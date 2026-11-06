// Núcleo puro da landing de revendedores (sem server-only, sem supabase).
import type { LojaFlags } from "@/lib/loja-flags";
import { EQUIPE, type Papel } from "@/lib/roles";

export type AmostraLP = {
  id: string;
  slug: string;
  nome: string;
  imagem: string | null;
  precoVarejo: number;
  precoAtacado: number;
};

const LIMITE_AMOSTRA = 8;

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

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
    if (!textoNaoVazio(o.id) || !textoNaoVazio(o.slug) || !textoNaoVazio(o.nome)) continue;
    if (!precoValido(o.preco_varejo) || !precoValido(o.preco_atacado)) continue;
    const imagem = o.imagem === undefined ? null : o.imagem;
    if (imagem !== null && typeof imagem !== "string") continue;
    saida.push({
      id: o.id,
      slug: o.slug,
      nome: o.nome,
      imagem,
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

// Frase da regra do bônus, composta a partir das flags (o texto salvo não leva número).
export function textoRegraBonus(flags: LojaFlags, texto: string): string | null {
  if (!flags.bonusAtivo) return null;
  const base = texto.trim();
  const min = flags.bonusMinPecas;
  const nome = flags.bonusProdutoNome?.trim() ?? "";
  const qtd = flags.bonusQuantidade;
  const brinde = nome ? `, você leva ${qtd > 1 ? `${qtd} unidades de ` : ""}${nome}` : "";
  const frase = `A partir de ${min} ${min === 1 ? "peça" : "peças"}${brinde}.`;
  if (!base) return frase;
  const comPonto = /[.!?…]$/.test(base) ? base : `${base}.`;
  return `${comPonto} ${frase}`;
}

export type CtaLP = { href: string; rotulo: string | null };

// Destino do botão principal da landing. rotulo null = usar o texto salvo (lp_hero_botao / lp_final_botao).
export function ctaLP({ logado, papel }: { logado: boolean; papel: Papel | null }): CtaLP {
  if (logado && papel && EQUIPE.includes(papel)) return { href: "/admin", rotulo: "Ir para o admin" };
  if (logado && papel === "revendedor") return { href: "/atacado", rotulo: "Ir para o painel" };
  return { href: "/entrar?modo=revendedor", rotulo: null };
}
