// Lógica pura do cadastro de cores e tamanhos no admin (sem React): grade padrão, estoque com +/- e paleta.

export const TAMANHOS_PADRAO = ["36", "37", "38", "39", "40"] as const;

export const ESTOQUE_MAXIMO = 9999;

export type LinhaTamanho = { tamanho: string; estoque: number };

/** Grade inicial de uma cor nova: 36 a 40, estoque zerado. */
export function gradePadrao(): LinhaTamanho[] {
  return TAMANHOS_PADRAO.map((tamanho) => ({ tamanho, estoque: 0 }));
}

/** Estoque depois de apertar + ou −: nunca abaixo de 0 nem acima do teto. */
export function ajustarEstoque(atual: number, delta: number): number {
  const base = Number.isFinite(atual) ? Math.trunc(atual) : 0;
  return Math.min(ESTOQUE_MAXIMO, Math.max(0, base + delta));
}

/** Texto digitado no campo de estoque → inteiro entre 0 e o teto (vazio ou inválido vira 0). */
export function lerEstoque(texto: string): number {
  const n = parseInt(texto.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? Math.min(ESTOQUE_MAXIMO, Math.max(0, n)) : 0;
}

export function normalizarTamanho(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").slice(0, 10);
}

/** Acrescenta um tamanho à grade (ex.: 41, 35, P). Recusa vazio e repetido, sem diferenciar maiúsculas. */
export function adicionarTamanho(
  linhas: LinhaTamanho[],
  texto: string
): { linhas: LinhaTamanho[]; erro: string | null } {
  const tamanho = normalizarTamanho(texto);
  if (!tamanho) return { linhas, erro: "Digite o tamanho." };
  if (linhas.some((l) => l.tamanho.toLowerCase() === tamanho.toLowerCase())) {
    return { linhas, erro: `O tamanho ${tamanho} já está na lista.` };
  }
  const nova = [...linhas, { tamanho, estoque: 0 }];
  // Numéricos em ordem crescente; tamanhos com letras ficam no fim, na ordem em que entraram.
  const numero = (l: LinhaTamanho) => (/^\d+$/.test(l.tamanho) ? parseInt(l.tamanho, 10) : Infinity);
  const ordenada = nova
    .map((l, i) => ({ l, i }))
    .sort((a, b) => numero(a.l) - numero(b.l) || a.i - b.i)
    .map((x) => x.l);
  return { linhas: ordenada, erro: null };
}

/** Cores de calçado mais comuns: um clique preenche o nome e a cor da bolinha. */
export const PALETA_CORES: { nome: string; hex: string }[] = [
  { nome: "Preto", hex: "#1E1B18" },
  { nome: "Branco", hex: "#F5F1EA" },
  { nome: "Nude", hex: "#D9B9A0" },
  { nome: "Bege", hex: "#CDB89A" },
  { nome: "Caramelo", hex: "#A8692F" },
  { nome: "Marrom", hex: "#6B4A33" },
  { nome: "Dourado", hex: "#C2A24B" },
  { nome: "Prata", hex: "#B8BCC2" },
  { nome: "Rosa", hex: "#E2A3B4" },
  { nome: "Vermelho", hex: "#B4332F" },
  { nome: "Azul", hex: "#3E5C8A" },
  { nome: "Verde", hex: "#5B7A4F" },
];

export function totalEstoque(linhas: LinhaTamanho[]): number {
  return linhas.reduce((soma, l) => soma + l.estoque, 0);
}
