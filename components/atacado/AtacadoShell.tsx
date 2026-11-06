"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingBag,
  ShoppingCart,
  Receipt,
  X,
} from "lucide-react";
import { BRAND } from "@/lib/brand.config";
import { progressoSkus, secaoAtacado } from "@/lib/atacado";
import { sairAction } from "@/app/entrar/actions";

type Item = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  titulo: string;
  subtitulo: string;
  contador?: boolean;
};

const ITENS: Item[] = [
  {
    href: "/atacado",
    label: "Painel",
    Icon: LayoutDashboard,
    titulo: "Painel",
    subtitulo: "Resumo da sua conta de atacado",
  },
  {
    href: "/atacado/catalogo",
    label: "Catálogo",
    Icon: ShoppingBag,
    titulo: "Catálogo",
    subtitulo: "Preços de atacado para o seu cadastro",
  },
  {
    href: "/atacado/carrinho",
    label: "Carrinho",
    Icon: ShoppingCart,
    titulo: "Carrinho",
    subtitulo: "Mínimo de 12 produtos distintos por pedido",
    contador: true,
  },
  {
    href: "/atacado/pedidos",
    label: "Meus pedidos",
    Icon: Receipt,
    titulo: "Meus pedidos",
    subtitulo: "Histórico dos seus pedidos de atacado",
  },
];

const HREF_SECAO = {
  painel: "/atacado",
  catalogo: "/atacado/catalogo",
  produto: "/atacado/catalogo",
  carrinho: "/atacado/carrinho",
  pedidos: "/atacado/pedidos",
} as const;

const TITULO_PRODUTO = { titulo: "Produto", subtitulo: "Cores, tamanhos e preços de revenda" };

function ativo(href: string, caminho: string): boolean {
  return HREF_SECAO[secaoAtacado(caminho)] === href;
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/lola-logo.png" alt={BRAND.nome} />
  );
}

export default function AtacadoShell({
  nome,
  skus,
  children,
}: {
  nome: string;
  skus: number;
  children: ReactNode;
}) {
  const caminho = usePathname();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const [saindo, iniciarSaida] = useTransition();
  const progresso = progressoSkus(skus);
  const atual =
    secaoAtacado(caminho) === "produto" ? TITULO_PRODUTO : (ITENS.find((i) => ativo(i.href, caminho)) ?? ITENS[0]);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAberto(false);
    };
    document.addEventListener("keydown", fechar);
    return () => document.removeEventListener("keydown", fechar);
  }, [menuAberto]);

  function sair() {
    iniciarSaida(async () => {
      await sairAction();
      router.replace("/");
      router.refresh();
    });
  }

  const navegacao = (
    <nav aria-label="Área do revendedor" className="atc-nav">
      {ITENS.map(({ href, label, Icon, contador }) => (
        <Link
          key={href}
          href={href}
          className="atc-nav-item"
          aria-current={ativo(href, caminho) ? "page" : undefined}
          onClick={() => setMenuAberto(false)}
        >
          <Icon size={18} aria-hidden="true" style={{ flex: "none" }} />
          <span>{label}</span>
          {contador && (
            <span className="atc-nav-badge" aria-label={`${progresso.atual} de ${progresso.minimo} produtos`}>
              {progresso.label}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  const usuario = (
    <div className="atc-user">
      <div className="atc-avatar" aria-hidden="true" />
      <div className="atc-user-info">
        <div className="atc-user-nome">{nome}</div>
        <div className="atc-user-papel">Revendedor</div>
      </div>
      <button type="button" className="atc-sair" onClick={sair} disabled={saindo} aria-label="Sair" title="Sair">
        <LogOut size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="atc-app">
      <aside className="atc-side">
        <div className="atc-marca">
          <Link href="/" aria-label={`${BRAND.nome} — voltar para a loja`}>
            <Logo />
          </Link>
          <span className="atc-marca-rotulo">atacado</span>
        </div>
        {navegacao}
        {usuario}
      </aside>

      <main className="atc-main">
        <div className="atc-topo-movel">
          <Link href="/" aria-label={`${BRAND.nome} — voltar para a loja`}>
            <Logo />
          </Link>
          <div className="atc-topo-acoes">
            <Link href="/atacado/carrinho" className="atc-pill" aria-label={`Carrinho: ${progresso.atual} de ${progresso.minimo} produtos`}>
              <ShoppingCart size={16} aria-hidden="true" />
              {progresso.label}
            </Link>
            <button
              type="button"
              className="atc-menu-btn"
              aria-expanded={menuAberto}
              aria-controls="atc-menu-movel"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMenuAberto((v) => !v)}
            >
              {menuAberto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuAberto && (
          <div id="atc-menu-movel" className="atc-menu-movel">
            {navegacao}
            {usuario}
          </div>
        )}

        <header className="atc-head">
          <div>
            <h1 className="atc-titulo">{atual.titulo}</h1>
            <p className="atc-subtitulo">{atual.subtitulo}</p>
          </div>
          <Link href="/atacado/carrinho" className="atc-pill" aria-label={`Carrinho: ${progresso.atual} de ${progresso.minimo} produtos`}>
            <ShoppingCart size={16} aria-hidden="true" />
            {progresso.label}
          </Link>
        </header>

        <div className="atc-conteudo">{children}</div>
      </main>
    </div>
  );
}
