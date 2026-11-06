"use client";

import { useState } from "react";
import Link from "next/link";
import { precisaNumeracao, type Product } from "@/lib/types";
import { precoVarejoEfetivo } from "@/lib/pricing";
import { corDaCategoria } from "@/lib/brand.config";
import SwingTag from "@/components/SwingTag";

export default function ProductCard({
  product,
}: {
  product: Product;
}) {
  const colors = product.colors ?? [];
  const [activeColorIdx, setActiveColorIdx] = useState(0);
  const activeColor = colors[activeColorIdx];
  const img = activeColor?.imagens?.[0] ?? null;
  const temTamanhos = colors.some((c) => c.sizes.length > 0);
  const href = product.slug ? `/produto/${product.slug}` : "#";
  const varejo = precoVarejoEfetivo({
    preco: product.preco,
    desconto_efetivo: product.desconto_efetivo ?? product.desconto_percentual,
  });
  const temDesconto = varejo.pct != null;
  const precoFinal = varejo.final;
  const cor = corDaCategoria(product.categoria);

  return (
    <div className="prod-card">
      <Link href={href} className="imgwrap" style={{ display: "block" }}>
        {product.destaque && (
          <span className="badge" style={{ background: cor.base }}>
            Destaque
          </span>
        )}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.nome} />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Sem foto ainda
          </div>
        )}
      </Link>
      <div className="prod-info">
        <div className="coll">{product.categoria?.nome ?? ""}</div>
        <Link href={href}>
          <h3>{product.nome}</h3>
        </Link>
        <div className="price-row">
          {temDesconto && (
            <span className="price-old">
              {product.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          )}
          <SwingTag color={cor.base} size="sm" rotate={-3}>
            {precoFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </SwingTag>
        </div>
        {precisaNumeracao(product.categoria?.grupo) && (
          <div className="sizes">
            {temTamanhos ? "Confira os tamanhos disponíveis" : "Tamanhos a cadastrar"}
          </div>
        )}
        {colors.length > 1 ? (
          <div className="swatches">
            {colors.map((c, i) => (
              <button
                key={c.id}
                className={i === activeColorIdx ? "active" : ""}
                style={{ background: c.hex || "#ccc" }}
                title={c.nome}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColorIdx(i);
                }}
              />
            ))}
          </div>
        ) : colors.length === 1 ? (
          <div className="unica">Cor única</div>
        ) : null}
      </div>
    </div>
  );
}
