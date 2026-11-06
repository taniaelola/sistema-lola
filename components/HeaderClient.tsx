"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, ShoppingBag, User, X } from "lucide-react";
import { BRAND } from "@/lib/brand.config";
import { useCart } from "@/lib/cart";
import {
  itensMenu,
  itensMenuConta,
  primeiroNome,
  type CategoriaNav,
  type PerfilNav,
} from "@/lib/header-menu";
import { sairAction } from "@/app/entrar/actions";

export default function HeaderClient({
  categorias,
  perfil: perfilProp,
  varejoAtivo = false,
}: {
  categorias: CategoriaNav[];
  perfil: PerfilNav | null;
  varejoAtivo?: boolean;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [saiu, setSaiu] = useState(false);
  const perfil = saiu ? null : perfilProp;
  const [saindo, iniciarSaida] = useTransition();
  const router = useRouter();
  const contaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const { totalItens } = useCart();
  // Com o varejo desligado itensMenu nunca devolve sacola nem categorias; visitante vê Entrar / Seja revendedora.
  const itens = itensMenu({ varejoAtivo, logado: !!perfil, papel: perfil?.papel, categorias });
  const links = itens.filter((i) => i.tipo === "categoria" || (i.tipo === "link" && !perfil));
  const temSacola = itens.some((i) => i.tipo === "sacola");

  useEffect(() => {
    if (!contaAberta) return;
    function fora(e: MouseEvent) {
      if (contaRef.current && !contaRef.current.contains(e.target as Node)) setContaAberta(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setContaAberta(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [contaAberta]);

  useEffect(() => {
    if (!menuAberto) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuAberto(false);
    }
    function fora(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", fora);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", fora);
    };
  }, [menuAberto]);

  function sair() {
    iniciarSaida(async () => {
      await sairAction();
      setSaiu(true);
      setContaAberta(false);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header-bar">
        <button
          type="button"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
          aria-controls="mobileNav"
          onClick={() => setMenuAberto((v) => !v)}
          className="hd-icon-btn hd-menu-btn"
        >
          {menuAberto ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>

        <Link href="/" className="site-logo" aria-label={BRAND.nome}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lola-logo.png" alt={BRAND.nome} />
        </Link>

        <nav className="nav-main" aria-label="Navegação">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.href === "/#lancamentos" ? "nav-link nav-link-destaque" : "nav-link"}
            >
              {l.rotulo}
            </Link>
          ))}
        </nav>

        <div className="site-header-actions">
          {perfil ? (
            <div className="conta-menu" ref={contaRef}>
              <button
                type="button"
                className="hd-icon-btn"
                aria-label={`Conta de ${primeiroNome(perfil.nome) || "usuário"}`}
                aria-haspopup="true"
                aria-expanded={contaAberta}
                aria-controls="contaMenuLista"
                onClick={() => setContaAberta((v) => !v)}
              >
                <User size={20} aria-hidden="true" />
              </button>
              {contaAberta && (
                <div id="contaMenuLista" className="conta-menu-lista">
                  <span className="conta-menu-nome">{perfil.nome || "Minha conta"}</span>
                  {itensMenuConta(perfil).map((item) =>
                    item.tipo === "link" ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="conta-menu-item"
                        onClick={() => setContaAberta(false)}
                      >
                        {item.rotulo}
                      </Link>
                    ) : (
                      <button
                        key="sair"
                        type="button"
                        className="conta-menu-item"
                        onClick={sair}
                        disabled={saindo}
                      >
                        {saindo ? "Saindo..." : item.rotulo}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            <Link href="/entrar" className="hd-icon-btn" aria-label="Entrar">
              <User size={20} aria-hidden="true" />
            </Link>
          )}

          {temSacola && (
            <Link href="/carrinho" className="hd-icon-btn cart-link" aria-label="Carrinho">
              <ShoppingBag size={20} aria-hidden="true" />
              {totalItens > 0 && <span className="cart-badge">{totalItens}</span>}
            </Link>
          )}
        </div>
      </div>

      <nav
        id="mobileNav"
        className="mobile-nav"
        aria-label="Menu"
        style={{ display: menuAberto ? "flex" : "none" }}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setMenuAberto(false)}
            className="mobile-nav-link"
          >
            {l.rotulo}
          </Link>
        ))}
      </nav>
    </header>
  );
}
