"use client";

import { useState, useTransition } from "react";
import { proximaQuantidade } from "@/lib/atacado";
import { addAoCarrinho } from "@/app/atacado/actions";

type Tamanho = { id: string; tamanho: string; estoque: number };
export type CorSeletor = { id: string; nome: string; hex: string | null; tamanhos: Tamanho[] };

export function estoqueDaCor(cor: Pick<CorSeletor, "tamanhos"> | undefined): number {
  return (cor?.tamanhos ?? []).reduce((s, t) => s + Math.max(0, t.estoque), 0);
}

/**
 * Escolha de cor e tamanho + "Adicionar ao carrinho", compartilhada entre o cartão do
 * catálogo e a página do produto. A cor escolhida sobe para o pai (corId/onCorChange)
 * para ele trocar a foto.
 */
export default function SeletorItem({
  idBase,
  slug,
  cores,
  corId,
  onCorChange,
  quantidades,
  mostrarEstoque = false,
}: {
  idBase: string;
  slug: string;
  cores: CorSeletor[];
  corId: string;
  onCorChange: (id: string) => void;
  quantidades: Map<string, number>;
  /** Na página do produto, cada tamanho mostra o estoque disponível. */
  mostrarEstoque?: boolean;
}) {
  const [tamanhoId, setTamanhoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const cor = cores.find((c) => c.id === corId) ?? cores[0];
  const tamanho = cor?.tamanhos.find((t) => t.id === tamanhoId);
  const semEstoque = cores.reduce((s, c) => s + estoqueDaCor(c), 0) <= 0;
  const noCarrinho = tamanho ? (quantidades.get(tamanho.id) ?? 0) : 0;
  const atingiuEstoque = tamanho ? proximaQuantidade(noCarrinho, tamanho.estoque) === null : false;

  function escolherCor(id: string) {
    onCorChange(id);
    setTamanhoId("");
    setErro(null);
  }

  function adicionar() {
    if (!cor || !tamanho) return;
    setErro(null);
    iniciar(async () => {
      const res = await addAoCarrinho(slug, cor.id, tamanho.id);
      if (res.error) setErro(res.error);
    });
  }

  let rotulo = "Adicionar";
  let desabilitado = pendente;
  let classe = "atc-btn atc-btn-bloco";
  if (semEstoque) {
    rotulo = "Sem estoque";
    desabilitado = true;
  } else if (!tamanho) {
    rotulo = "Escolha o tamanho";
    desabilitado = true;
  } else if (noCarrinho > 0) {
    rotulo = `No carrinho (${noCarrinho})`;
    classe += " atc-btn-menta";
    desabilitado = pendente || atingiuEstoque;
  }

  return (
    <>
      {!semEstoque && (
        <>
          <div className="atc-opcoes-rotulo" id={`cor-${idBase}`}>
            Cor: {cor?.nome}
          </div>
          <div className="atc-opcoes" role="group" aria-labelledby={`cor-${idBase}`}>
            {cores.map((c) => {
              const esgotada = estoqueDaCor(c) <= 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={c.hex ? "atc-cor" : "atc-cor atc-cor-texto"}
                  style={c.hex ? { background: c.hex } : undefined}
                  aria-pressed={c.id === cor?.id}
                  aria-label={`${c.nome}${esgotada ? " (sem estoque)" : ""}`}
                  title={c.nome}
                  onClick={() => escolherCor(c.id)}
                >
                  {c.hex ? null : c.nome}
                </button>
              );
            })}
          </div>
          <div className="atc-opcoes-rotulo" id={`tam-${idBase}`}>
            Tamanho
          </div>
          <div className="atc-opcoes" role="group" aria-labelledby={`tam-${idBase}`}>
            {(cor?.tamanhos ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                className="atc-tam"
                aria-pressed={t.id === tamanhoId}
                disabled={t.estoque <= 0}
                aria-label={`Tamanho ${t.tamanho}${
                  t.estoque <= 0 ? " (sem estoque)" : mostrarEstoque ? `, ${t.estoque} em estoque` : ""
                }`}
                onClick={() => {
                  setTamanhoId(t.id);
                  setErro(null);
                }}
              >
                {t.tamanho}
                {mostrarEstoque && (
                  <span className="atc-tam-estoque">{t.estoque > 0 ? `${t.estoque} un.` : "esgotado"}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: "auto", paddingTop: 8 }}>
        <button type="button" className={classe} disabled={desabilitado} onClick={adicionar}>
          {rotulo}
        </button>
        {tamanho && atingiuEstoque && noCarrinho > 0 && (
          <p className="atc-prod-cat" style={{ margin: "6px 0 0" }}>
            Você já tem todo o estoque desse tamanho no carrinho.
          </p>
        )}
        <p className="atc-erro" role="alert" aria-live="polite" style={{ marginTop: erro ? 6 : 0 }}>
          {erro}
        </p>
      </div>
    </>
  );
}
