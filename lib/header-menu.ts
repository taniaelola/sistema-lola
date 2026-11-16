import { ehEquipe, type Papel } from "@/lib/roles";

export type CategoriaNav = { slug: string; nome: string };
export type PerfilNav = { nome: string; papel: Papel };
export type ItemMenuConta =
  | { tipo: "link"; rotulo: string; href: string }
  | { tipo: "sair"; rotulo: string };

export function itensMenuConta(perfil: PerfilNav, varejoAtivo: boolean = true): ItemMenuConta[] {
  // Cada perfil vê só o seu destino: equipe no painel, revendedor no atacado, cliente em Minha conta.
  const destino: ItemMenuConta = ehEquipe(perfil.papel)
    ? { tipo: "link", rotulo: "Painel", href: "/admin" }
    : perfil.papel === "revendedor"
      ? { tipo: "link", rotulo: "Painel de atacado", href: "/atacado" }
      : { tipo: "link", rotulo: "Minha conta", href: "/minha-conta" };
  // Sem varejo /minha-conta redireciona para a Home: cliente logado só vê Sair.
  const semDestino = perfil.papel === "cliente" && !varejoAtivo;
  return semDestino ? [{ tipo: "sair", rotulo: "Sair" }] : [destino, { tipo: "sair", rotulo: "Sair" }];
}

export function linksCategorias(categorias: CategoriaNav[]): { href: string; rotulo: string }[] {
  return [
    ...categorias.map((c) => ({ href: `/#cat-${c.slug}`, rotulo: c.nome })),
    { href: "/#lancamentos", rotulo: "Lançamentos" },
  ];
}

export type DestinoAjuda = { href: string; tipo: "nova-aba" | "simples" | "interno" };

export function destinoAjuda(link: string | null | undefined, whatsappUrl: string): DestinoAjuda {
  const padrao: DestinoAjuda = { href: whatsappUrl, tipo: "nova-aba" };
  if (typeof link !== "string" || link === "") return padrao;
  if (/[\s\u0000-\u001f\u007f\\]/.test(link)) return padrao;
  if (/^https?:\/\/[^/]/i.test(link)) return { href: link, tipo: "nova-aba" };
  if (/^(mailto|tel):\S+/i.test(link)) return { href: link, tipo: "simples" };
  if (/^\/(?!\/)/.test(link)) return { href: link, tipo: "interno" };
  if (/^#\S+/.test(link)) return { href: link, tipo: "simples" };
  return padrao;
}

export type DadosPublicosHeader = {
  categorias: CategoriaNav[];
  varejoAtivo: boolean;
  avisoTexto: string;
  avisoAtivo: string;
};

export function dadosPublicosHeader(
  d: DadosPublicosHeader & { perfil?: unknown }
): DadosPublicosHeader {
  return {
    categorias: d.categorias,
    varejoAtivo: d.varejoAtivo,
    avisoTexto: d.avisoTexto,
    avisoAtivo: d.avisoAtivo,
  };
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export type ItemMenu = {
  tipo: "link" | "categoria" | "sacola";
  rotulo: string;
  href: string;
};

export type EntradaMenu = {
  varejoAtivo: boolean;
  logado: boolean;
  papel?: Papel | null;
  categorias?: CategoriaNav[];
};

// Itens da navegação do header. Com o varejo desligado nunca há sacola nem categorias:
// só o caminho de entrada (visitante) ou o painel do papel. Com o varejo ligado, soma
// categorias, sacola e, para o cliente logado, "Minha conta".
export function itensMenu({ varejoAtivo, logado, papel, categorias = [] }: EntradaMenu): ItemMenu[] {
  const conta: ItemMenu[] = [];
  if (!logado) {
    conta.push(
      { tipo: "link", rotulo: "Entrar", href: "/entrar" },
      { tipo: "link", rotulo: "Seja revendedora", href: "/entrar?modo=revendedor" }
    );
  } else if (papel && ehEquipe(papel)) {
    conta.push({ tipo: "link", rotulo: "Painel", href: "/admin" });
  } else if (papel === "revendedor") {
    conta.push({ tipo: "link", rotulo: "Painel de atacado", href: "/atacado" });
  } else if (varejoAtivo) {
    conta.push({ tipo: "link", rotulo: "Minha conta", href: "/minha-conta" });
  }
  if (!varejoAtivo) return conta;
  return [
    ...linksCategorias(categorias).map((l): ItemMenu => ({ tipo: "categoria", ...l })),
    { tipo: "sacola", rotulo: "Sacola", href: "/carrinho" },
    ...conta,
  ];
}
