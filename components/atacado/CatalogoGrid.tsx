"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { badgeEstoque } from "@/lib/atacado";
import PrecosProduto from "./PrecosProduto";
import SeletorItem, { estoqueDaCor } from "./SeletorItem";

type Tamanho = { id: string; tamanho: string; estoque: number };
type Cor = { id: string; nome: string; hex: string | null; imagem: string | null; tamanhos: Tamanho[] };
export type ProdutoGrade = {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  /** Preço de referência para revenda (varejo), calculado pelo banco. */
  precoVarejo: number;
  /** Preço do revendedor (atacado), calculado pelo banco. */
  precoAtacado: number;
  cores: Cor[];
};
type ItemCarrinhoGrade = { size_id: string; quantidade: number };

function CartaoProduto({
  produto,
  quantidades,
}: {
  produto: ProdutoGrade;
  quantidades: Map<string, number>;
}) {
  const primeiraComEstoque = produto.cores.find((c) => estoqueDaCor(c) > 0) ?? produto.cores[0];
  const [corId, setCorId] = useState(primeiraComEstoque?.id ?? "");

  const cor = produto.cores.find((c) => c.id === corId) ?? primeiraComEstoque;
  const badge = badgeEstoque(estoqueDaCor(cor));
  const foto = cor?.imagem ?? produto.cores.find((c) => c.imagem)?.imagem ?? null;
  const href = `/atacado/produto/${produto.slug}`;

  return (
    <article className="atc-prod">
      <div className="atc-prod-foto">
        <Link href={href} className="atc-prod-foto-link" aria-label={`Ver detalhes de ${produto.nome}`} tabIndex={-1}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt={`${produto.nome}${cor ? ` — ${cor.nome}` : ""}`} loading="lazy" />
          ) : (
            <div className="atc-prod-semfoto">Sem foto ainda</div>
          )}
        </Link>
        {badge && <div className="atc-badge">{badge}</div>}
      </div>
      <div className="atc-prod-corpo">
        <h3 className="atc-prod-nome">
          <Link href={href} className="atc-prod-link">
            {produto.nome}
          </Link>
        </h3>
        <div className="atc-prod-cat">{produto.categoria}</div>
        <PrecosProduto precoVarejo={produto.precoVarejo} precoAtacado={produto.precoAtacado} />
        <SeletorItem
          idBase={produto.id}
          slug={produto.slug}
          cores={produto.cores}
          corId={cor?.id ?? ""}
          onCorChange={setCorId}
          quantidades={quantidades}
        />
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
