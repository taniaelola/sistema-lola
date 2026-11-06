"use client";

import { useMemo, useState } from "react";
import type { ProdutoRevendedor } from "@/lib/atacado";
import PrecosProduto from "./PrecosProduto";
import SeletorItem, { estoqueDaCor } from "./SeletorItem";

export default function ProdutoDetalhe({
  produto,
  noCarrinho,
}: {
  produto: ProdutoRevendedor;
  noCarrinho: { size_id: string; quantidade: number }[];
}) {
  const primeiraComEstoque = produto.cores.find((c) => estoqueDaCor(c) > 0) ?? produto.cores[0];
  const [corId, setCorId] = useState(primeiraComEstoque?.id ?? "");
  const [fotoIdx, setFotoIdx] = useState(0);
  const quantidades = useMemo(
    () => new Map(noCarrinho.map((i) => [i.size_id, i.quantidade])),
    [noCarrinho]
  );

  const cor = produto.cores.find((c) => c.id === corId) ?? primeiraComEstoque;
  const imagens = cor?.imagens ?? [];
  const foto = imagens[fotoIdx] ?? imagens[0] ?? null;

  return (
    <div className="atc-produto">
      <div className="atc-produto-fotos">
        <div className="atc-produto-foto">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt={`${produto.nome}${cor ? ` — ${cor.nome}` : ""}`} />
          ) : (
            <div className="atc-prod-semfoto">Sem foto ainda</div>
          )}
        </div>
        {imagens.length > 1 && (
          <div className="atc-produto-miniaturas" role="group" aria-label="Fotos do produto">
            {imagens.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-pressed={src === foto}
                aria-label={`Foto ${i + 1} de ${imagens.length}`}
                onClick={() => setFotoIdx(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="atc-produto-info">
        <div className="atc-prod-cat">{produto.categoria}</div>
        <h2 className="atc-produto-titulo">{produto.nome}</h2>
        <PrecosProduto precoVarejo={produto.precoVarejo} precoAtacado={produto.precoAtacado} />
        {produto.descricao && <p style={{ margin: 0, fontSize: 14 }}>{produto.descricao}</p>}
        {produto.caracteristicas.length > 0 && (
          <ul className="atc-produto-lista" aria-label="Características">
            {produto.caracteristicas.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        <SeletorItem
          idBase={produto.id}
          slug={produto.slug}
          cores={produto.cores}
          corId={cor?.id ?? ""}
          onCorChange={(id) => {
            setCorId(id);
            setFotoIdx(0);
          }}
          quantidades={quantidades}
          mostrarEstoque
        />
      </div>
    </div>
  );
}
