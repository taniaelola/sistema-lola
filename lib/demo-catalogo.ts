// Catálogo fictício só para pré-visualizar a vitrine localmente, sem tocar no banco.
// Liga com LOLA_DEMO=1 no .env.local. Nunca definir essa variável no Worker da Cloudflare.
import type { Categoria, Product } from "@/lib/types";
import { ilustracaoDemo, type Tipo } from "@/lib/demo-ilustracoes";

export const DEMO = process.env.LOLA_DEMO === "1" && process.env.NODE_ENV !== "production";


const CAT = (
  n: number,
  grupo: Categoria["grupo"],
  nome: string,
  slug: string
): Categoria => ({
  id: `demo-cat-${n}`,
  grupo,
  nome,
  slug,
  ordem: n,
  ativo: true,
  desconto_atacado_percentual: 30,
  imagem: null,
});

const C_TENIS = CAT(1, "calcados", "Tênis", "tenis");
const C_SANDALIA = CAT(2, "calcados", "Sandálias", "sandalias");
const C_SAPATILHA = CAT(3, "calcados", "Sapatilhas", "sapatilhas");
const C_BOLSA = CAT(4, "acessorios", "Bolsas", "bolsas");
const C_ACESS = CAT(5, "acessorios", "Acessórios", "acessorios");

export const CATEGORIAS_DEMO: Categoria[] = [C_TENIS, C_SANDALIA, C_SAPATILHA, C_BOLSA, C_ACESS];

type Cor = { nome: string; hex: string; fundo: string };

const ROSA: Cor = { nome: "Rosa", hex: "#F2678F", fundo: "#FFE4EC" };
const MENTA: Cor = { nome: "Menta", hex: "#5FCBA9", fundo: "#DDF7EE" };
const LILAS: Cor = { nome: "Lilás", hex: "#A87EF0", fundo: "#EEE5FF" };
const PESSEGO: Cor = { nome: "Pêssego", hex: "#E8823A", fundo: "#FFEBDA" };
const OFFWHITE: Cor = { nome: "Off-white", hex: "#E9DCCB", fundo: "#F5ECE2" };

function produto(
  n: number,
  nome: string,
  categoria: Categoria,
  tipo: Tipo,
  preco: number,
  cores: Cor[],
  opts: { tamanhos?: string[]; desconto?: number; destaque?: boolean; descricao: string } = { descricao: "" }
): Product {
  const tamanhos = opts.tamanhos ?? ["34", "35", "36", "37", "38", "39"];
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return {
    id: `demo-prod-${n}`,
    slug,
    nome,
    categoria_id: categoria.id,
    categoria,
    colecao: "Verão 26",
    preco,
    desconto_percentual: opts.desconto ?? null,
    preco_atacado: null,
    descricao: opts.descricao,
    caracteristicas: ["Peça de demonstração", "Material sintético macio", "Fabricação nacional"],
    ativo: true,
    destaque: opts.destaque ?? false,
    ordem: n,
    surpresa_ativo: false,
    colors: cores.map((c, ci) => ({
      id: `demo-cor-${n}-${ci}`,
      product_id: `demo-prod-${n}`,
      nome: c.nome,
      hex: c.hex,
      imagens: [ilustracaoDemo(tipo, c.hex, c.fundo)],
      ordem: ci,
      sizes: tamanhos.map((t, ti) => ({
        id: `demo-tam-${n}-${ci}-${ti}`,
        color_id: `demo-cor-${n}-${ci}`,
        tamanho: t,
        estoque: 3 + ((n + ci + ti) % 5),
      })),
    })),
  };
}

export const PRODUTOS_DEMO: Product[] = [
  produto(1, "Tênis Nuvem", C_TENIS, "tenis", 189.9, [ROSA, MENTA, OFFWHITE], {
    destaque: true,
    descricao: "Tênis leve para o dia todo, com solado macio e cara de verão.",
  }),
  produto(2, "Tênis Pulse", C_TENIS, "tenis", 219.9, [LILAS, PESSEGO], {
    desconto: 15,
    descricao: "Visual esportivo com entressola alta e cadarço colorido.",
  }),
  produto(3, "Tênis Brisa", C_TENIS, "tenis", 169.9, [MENTA, ROSA], {
    descricao: "Confortável e fácil de combinar com qualquer look.",
  }),
  produto(4, "Sandália Maré", C_SANDALIA, "sandalia", 129.9, [PESSEGO, ROSA, MENTA], {
    destaque: true,
    descricao: "Tiras macias e palmilha anatômica para andar sem pressa.",
  }),
  produto(5, "Sandália Aurora", C_SANDALIA, "sandalia", 149.9, [LILAS, OFFWHITE], {
    descricao: "Sandália de tiras finas, perfeita para os dias de sol.",
  }),
  produto(6, "Sandália Coral", C_SANDALIA, "sandalia", 119.9, [ROSA, PESSEGO], {
    desconto: 10,
    descricao: "Rasteira com tiras duplas e fecho ajustável.",
  }),
  produto(7, "Sapatilha Laço", C_SAPATILHA, "sapatilha", 99.9, [ROSA, LILAS, OFFWHITE], {
    descricao: "Sapatilha clássica com laço delicado.",
  }),
  produto(8, "Sapatilha Doce", C_SAPATILHA, "sapatilha", 109.9, [MENTA, PESSEGO], {
    descricao: "Bico arredondado e palmilha acolchoada.",
  }),
  produto(9, "Bolsa Pop", C_BOLSA, "bolsa", 159.9, [ROSA, LILAS, MENTA], {
    tamanhos: ["Único"],
    destaque: true,
    descricao: "Bolsa estruturada com alça de mão e fecho magnético.",
  }),
  produto(10, "Bolsa Sol", C_BOLSA, "bolsa", 139.9, [PESSEGO, OFFWHITE], {
    tamanhos: ["Único"],
    desconto: 20,
    descricao: "Espaçosa, leve e com alça reforçada.",
  }),
  produto(11, "Scrunchie Cetim", C_ACESS, "scrunchie", 19.9, [ROSA, LILAS, MENTA, PESSEGO], {
    tamanhos: ["Único"],
    descricao: "Xuxinha de cetim que não marca o cabelo.",
  }),
  produto(12, "Scrunchie Maxi", C_ACESS, "scrunchie", 24.9, [OFFWHITE, ROSA], {
    tamanhos: ["Único"],
    descricao: "Versão maxi para dar volume ao penteado.",
  }),
];
