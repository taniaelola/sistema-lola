import { nextSeguro } from "@/lib/validators";

export type Papel = "superadmin" | "admin" | "supervisor" | "revendedor" | "cliente";

export const PAPEIS: Papel[] = ["superadmin", "admin", "supervisor", "revendedor", "cliente"];
export const EQUIPE: Papel[] = ["superadmin", "admin", "supervisor"];

export type Tela =
  | "visao-geral"
  | "pedidos"
  | "vendas"
  | "financeiro"
  | "produtos"
  | "promocoes"
  | "banner"
  | "textos"
  | "revendedores"
  | "usuarios"
  | "config";

const MENU: Tela[] = [
  "visao-geral",
  "pedidos",
  "vendas",
  "financeiro",
  "produtos",
  "promocoes",
  "banner",
  "textos",
  "revendedores",
  "usuarios",
  "config",
];

// "vendas" é a lista de vendas só leitura (sem valores) do supervisor; superadmin
// e admin já a veem dentro de Financeiro.
const ACESSO: Record<Papel, Tela[]> = {
  superadmin: MENU.filter((t) => t !== "vendas"),
  admin: MENU.filter((t) => t !== "config" && t !== "vendas"),
  supervisor: ["visao-geral", "pedidos", "vendas", "produtos", "revendedores"],
  revendedor: [],
  cliente: [],
};

export function podeAcessar(papel: Papel, tela: Tela): boolean {
  return ACESSO[papel].includes(tela);
}

export function telasVisiveis(papel: Papel): Tela[] {
  return MENU.filter((t) => podeAcessar(papel, t));
}

export function ehEquipe(papel: Papel): boolean {
  return EQUIPE.includes(papel);
}

export function podeAprovarRevendedor(papel: Papel): boolean {
  return papel === "superadmin" || papel === "admin";
}

export function podeEditarRevendedor(papel: Papel): boolean {
  return ehEquipe(papel);
}

export function podeGerirPapel(ator: Papel, alvo: Papel): boolean {
  if (ator === "superadmin") return true;
  if (ator === "admin") return alvo !== "superadmin";
  return false;
}

export function destinoPosLogin(papel: Papel, next?: string | null): string {
  if (ehEquipe(papel)) return "/admin";
  if (papel === "revendedor") return "/atacado";
  return nextSeguro(next);
}

/**
 * URL do login para quem precisa estar logado para abrir `caminho`: abre a aba ENTRAR.
 * O cadastro de revendedora é outra intenção e vive em `/entrar?modo=revendedor` (links "Seja revendedora").
 */
export function urlEntrar(caminho: string): string {
  return `/entrar?next=${encodeURIComponent(nextSeguro(caminho))}`;
}
