"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Drawer({
  aberto,
  kicker,
  titulo,
  onFechar,
  confirmarFechar,
  rodape,
  largo,
  centralizado,
  children,
}: {
  aberto: boolean;
  kicker: string;
  titulo: string;
  onFechar: () => void;
  confirmarFechar?: () => boolean;
  rodape?: ReactNode;
  largo?: boolean;
  /** Janela centralizada na tela (em vez do painel lateral): melhor para formulários longos. */
  centralizado?: boolean;
  children: ReactNode;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const tentarFechar = () => {
    if (!confirmarFechar || confirmarFechar()) onFechar();
  };
  const fecharRef = useRef(tentarFechar);
  const tituloId = useId();

  useEffect(() => {
    fecharRef.current = tentarFechar;
  });

  useEffect(() => {
    if (!aberto) return;
    const origem = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const painel = painelRef.current;
    const focaveis = () =>
      painel ? Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS)) : [];
    const primeiroCampo = painel?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    );
    (primeiroCampo ?? focaveis()[0] ?? painel)?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        fecharRef.current();
        return;
      }
      if (e.key !== "Tab" || !painel) return;
      const lista = focaveis();
      if (lista.length === 0) {
        e.preventDefault();
        painel.focus();
        return;
      }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || ativo === painel)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (!painel.contains(ativo)) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      if (origem && document.contains(origem)) origem.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div
      className={centralizado ? "adm-drawer-overlay adm-drawer-overlay--centro" : "adm-drawer-overlay"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) tentarFechar();
      }}
    >
      <div
        ref={painelRef}
        className={centralizado ? "adm-drawer adm-drawer--centro" : largo ? "adm-drawer adm-drawer--largo" : "adm-drawer"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "var(--adm-text-secondary)",
                textTransform: "uppercase",
              }}
            >
              {kicker}
            </div>
            <h2 id={tituloId} style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 0" }}>
              {titulo}
            </h2>
          </div>
          <button
            type="button"
            className="adm-btn"
            onClick={tentarFechar}
            aria-label="Fechar"
            style={{ padding: 8, display: "flex", flex: "none" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="adm-drawer-corpo">{children}</div>
        {rodape && <div className="adm-drawer-rodape">{rodape}</div>}
      </div>
    </div>
  );
}
