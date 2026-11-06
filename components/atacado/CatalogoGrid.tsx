"use client";

import { useMemo, useState, useTransition } from "react";
import { badgeEstoque, proximaQuantidade } from "@/lib/atacado";
import { formatarReais } from "@/lib/home";
import { addAoCarrinho } from "@/app/atacado/actions";

type Tamanho = { id: string; tamanho: string; estoque: number };
type Cor = { id: string; nome: string; hex: string | null; imagem: string | null; tamanhos: Tamanho[] };
export type ProdutoGrade = {
  id: string;
  nome: string;
  categoria: string;
  precoVarejo: number;
  preco: number;
  cores: Cor[];
};
type ItemCarrinhoGrade = { size_id: string; quantidade: number };

function estoqueDaCor(cor: Cor | undefined): number {
  return (cor?.tamanhos ?? []).reduce((s, t) => s + Math.max(0, t.estoque), 0);
}

function CartaoProduto({
  produto,
  quantidades,
}: {
  produto: ProdutoGrade;
  quantidades: Map<string, number>;
}) {
  const primeiraComEstoque = produto.cores.find((c) => estoqueDaCor(c) > 0) ?? produto.cores[0];
  const [corId, setCorId] = useState(primeiraComEstoque?.id ?? "");
  const [tamanhoId, setTamanhoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const cor = produto.cores.find((c) => c.id === corId) ?? primeiraComEstoque;
  const tamanho = cor?.tamanhos.find((t) => t.id === tamanhoId);
  const estoqueProduto = produto.cores.reduce((s, c) => s + estoqueDaCor(c), 0);
  const semEstoque = estoqueProduto <= 0;
  const noCarrinho = tamanho ? (quantidades.get(tamanho.id) ?? 0) : 0;
  const atingiuEstoque = tamanho ? proximaQuantidade(noCarrinho, tamanho.estoque) === null : false;
  const badge = badgeEstoque(tamanho ? tamanho.estoque : estoqueDaCor(cor));
  const foto = cor?.imagem ?? produto.cores.find((c) => c.imagem)?.imagem ?? null;

  function escolherCor(id: string) {
    setCorId(id);
    setTamanhoId("");
    setErro(null);
  }

  function adicionar() {
    if (!cor || !tamanho) return;
    setErro(null);
    iniciar(async () => {
      const res = await addAoCarrinho(produto.id, cor.id, tamanho.id);
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
    <article className="atc-prod">
      <div className="atc-prod-foto">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt={`${produto.nome}${cor ? ` — ${cor.nome}` : ""}`} loading="lazy" />
        ) : (
          <div className="atc-prod-semfoto">Sem foto ainda</div>
        )}
        {badge && <div className="atc-badge">{badge}</div>}
      </div>
      <div className="atc-prod-corpo">
        <h3 className="atc-prod-nome">{produto.nome}</h3>
        <div className="atc-prod-cat">{produto.categoria}</div>
        <div className="atc-preco">{formatarReais(produto.preco)}</div>
        <div className="atc-prod-cat">preço de atacado</div>

        {!semEstoque && (
          <>
            <div className="atc-opcoes-rotulo" id={`cor-${produto.id}`}>
              Cor: {cor?.nome}
            </div>
            <div className="atc-opcoes" role="group" aria-labelledby={`cor-${produto.id}`}>
              {produto.cores.map((c) => {
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
            <div className="atc-opcoes-rotulo" id={`tam-${produto.id}`}>
              Tamanho
            </div>
            <div className="atc-opcoes" role="group" aria-labelledby={`tam-${produto.id}`}>
              {(cor?.tamanhos ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="atc-tam"
                  aria-pressed={t.id === tamanhoId}
                  disabled={t.estoque <= 0}
                  aria-label={`Tamanho ${t.tamanho}${t.estoque <= 0 ? " (sem estoque)" : ""}`}
                  onClick={() => {
                    setTamanhoId(t.id);
                    setErro(null);
                  }}
                >
                  {t.tamanho}
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
      </div>
    </article>
  );
}

export default function CatalogoGrid({
  produtos,
  noCarrinho,
}: {
  produtos: ProdutoGrade[];
  noCarrinho: ItemCarrinhoGrade[];
}) {
  const quantidades = useMemo(
    () => new Map(noCarrinho.map((i) => [i.size_id, i.quantidade])),
    [noCarrinho]
  );

  return (
    <div className="atc-catalogo">
      {produtos.map((p) => (
        <CartaoProduto key={p.id} produto={p} quantidades={quantidades} />
      ))}
    </div>
  );
}
