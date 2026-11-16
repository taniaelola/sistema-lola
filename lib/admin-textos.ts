import { TEXTOS_PADRAO } from "@/lib/textos";

export const LIMITE_TEXTO = 500;

export type TipoCampo = "linha" | "area" | "toggle" | "link";

export type CampoTexto = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  dica?: string;
};

export type GrupoTextos = {
  id: string;
  titulo: string;
  campos: CampoTexto[];
};

export const DICA_LINK = "vazio = WhatsApp da loja; aceita /caminho, https://, mailto:, tel: ou #âncora";

export const GRUPOS_TEXTOS: GrupoTextos[] = [
  {
    id: "aviso",
    titulo: "Barra de aviso",
    campos: [
      { chave: "aviso.texto", rotulo: "Texto do aviso", tipo: "area" },
      { chave: "aviso.ativo", rotulo: "Mostrar a barra de aviso", tipo: "toggle" },
    ],
  },
  {
    id: "rodape",
    titulo: "Rodapé",
    campos: [
      { chave: "rodape.descricao", rotulo: "Descrição da loja", tipo: "area" },
      { chave: "rodape.ajuda1_texto", rotulo: "Ajuda 1: texto", tipo: "linha" },
      { chave: "rodape.ajuda1_link", rotulo: "Ajuda 1: link", tipo: "link", dica: DICA_LINK },
      { chave: "rodape.ajuda2_texto", rotulo: "Ajuda 2: texto", tipo: "linha" },
      { chave: "rodape.ajuda2_link", rotulo: "Ajuda 2: link", tipo: "link", dica: DICA_LINK },
      { chave: "rodape.ajuda3_texto", rotulo: "Ajuda 3: texto", tipo: "linha" },
      { chave: "rodape.ajuda3_link", rotulo: "Ajuda 3: link", tipo: "link", dica: DICA_LINK },
    ],
  },
  {
    id: "revendedora",
    titulo: "Banner revendedora",
    campos: [
      { chave: "revendedora.etiqueta", rotulo: "Etiqueta", tipo: "linha" },
      { chave: "revendedora.titulo", rotulo: "Título", tipo: "linha" },
      { chave: "revendedora.texto", rotulo: "Texto", tipo: "area" },
      { chave: "revendedora.botao", rotulo: "Texto do botão", tipo: "linha" },
    ],
  },
  {
    id: "home",
    titulo: "Home",
    campos: [
      { chave: "home.categorias_etiqueta", rotulo: "Categorias: etiqueta", tipo: "linha" },
      { chave: "home.categorias_titulo", rotulo: "Categorias: título", tipo: "linha" },
      { chave: "home.lancamentos_etiqueta", rotulo: "Lançamentos: etiqueta", tipo: "linha" },
      { chave: "home.lancamentos_titulo", rotulo: "Lançamentos: título", tipo: "linha" },
    ],
  },
  {
    id: "login",
    titulo: "Login",
    campos: [
      { chave: "login.etiqueta", rotulo: "Etiqueta", tipo: "linha" },
      { chave: "login.titulo", rotulo: "Título", tipo: "linha" },
    ],
  },
  {
    id: "lp",
    titulo: "Landing de revendedores",
    campos: [
      { chave: "lp_hero_titulo", rotulo: "Topo: título", tipo: "linha" },
      { chave: "lp_hero_subtitulo", rotulo: "Topo: subtítulo", tipo: "area" },
      { chave: "lp_hero_botao", rotulo: "Topo: texto do botão", tipo: "linha" },
      { chave: "lp_regras_titulo", rotulo: "Regras: título", tipo: "linha" },
      { chave: "lp_regra_skus", rotulo: "Regra: peças por pedido", tipo: "linha" },
      { chave: "lp_regra_bonus", rotulo: "Regra: bonificação", tipo: "linha", dica: "o mínimo de peças e o produto da bonificação vêm da configuração do varejo/bônus; não escreva números aqui" },
      { chave: "lp_regra_preco", rotulo: "Regra: preço", tipo: "linha" },
      { chave: "lp_passos_titulo", rotulo: "Passos: título", tipo: "linha" },
      { chave: "lp_passo_1", rotulo: "Passo 1", tipo: "linha" },
      { chave: "lp_passo_2", rotulo: "Passo 2", tipo: "linha" },
      { chave: "lp_passo_3", rotulo: "Passo 3", tipo: "linha" },
      { chave: "lp_amostra_titulo", rotulo: "Amostra: título", tipo: "linha" },
      { chave: "lp_amostra_aviso", rotulo: "Amostra: aviso", tipo: "area" },
      { chave: "lp_final_titulo", rotulo: "Chamada final: título", tipo: "linha" },
      { chave: "lp_final_botao", rotulo: "Chamada final: texto do botão", tipo: "linha" },
    ],
  },
];

export function chavesDosGrupos(): string[] {
  return GRUPOS_TEXTOS.flatMap((g) => g.campos.map((c) => c.chave));
}

export function chavesAlteradas(
  atual: Record<string, string>,
  base: Record<string, string>
): string[] {
  return Object.keys(TEXTOS_PADRAO).filter((k) => (atual[k] ?? "") !== (base[k] ?? ""));
}

export function apenasAlteradas(
  atual: Record<string, string>,
  base: Record<string, string>
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const k of chavesAlteradas(atual, base)) saida[k] = atual[k] ?? "";
  return saida;
}

export function validarValoresServidor(valores: unknown): string | null {
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) return "Textos inválidos.";
  for (const [chave, valor] of Object.entries(valores as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(TEXTOS_PADRAO, chave)) return "Texto desconhecido.";
    if (typeof valor !== "string") return "Textos inválidos.";
    if (valor.length > LIMITE_TEXTO) return `Texto muito longo (máximo ${LIMITE_TEXTO} caracteres).`;
    if (chave === "aviso.ativo" && valor !== "true" && valor !== "false") return "Valor inválido para a barra de aviso.";
    if (chave.endsWith("_link")) {
      const erro = validarLinkTexto(valor);
      if (erro) return erro;
    }
  }
  return null;
}

export const MSG_LINK_TEXTO =
  "O link deve começar com /, #, https://, mailto: ou tel:, sem espaços.";

export function validarLinkTexto(valor: string): string | null {
  const v = valor.trim();
  if (v === "") return null;
  const inicioOk =
    (v.startsWith("/") && !v.startsWith("//")) ||
    v.startsWith("#") ||
    v.startsWith("https://") ||
    v.startsWith("mailto:") ||
    v.startsWith("tel:");
  if (!inicioOk || /[\s\\\u0000-\u001f\u007f]/.test(v)) return MSG_LINK_TEXTO;
  return null;
}
