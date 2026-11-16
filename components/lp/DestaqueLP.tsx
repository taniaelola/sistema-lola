import Link from "next/link";
import { Lock } from "lucide-react";
import type { AmostraLP as Item } from "@/lib/lp";

// Vitrine sem preço: o valor de atacado só aparece no catálogo, depois da aprovação.
export default function DestaqueLP({ itens, href }: { itens: Item[]; href: string }) {
  const lista = itens.slice(0, 4);
  if (lista.length === 0) return null;
  return (
    <section id="destaque" className="lp-secao" aria-labelledby="lp-destaque-titulo">
      <div className="lp-secao-topo">
        <div className="lp-secao-titulos">
          <h2 id="lp-destaque-titulo" className="lp-titulo">Em destaque</h2>
          <p className="lp-lede">
            Uma seleção da coleção. Os preços de atacado ficam no catálogo, liberado após a aprovação.
          </p>
        </div>
        <Link href={href} className="lp-link">Ver catálogo completo</Link>
      </div>
      <ul className="lp-destaques">
        {lista.map((p) => (
          <li key={p.id} className="lp-prod">
            <div className="lp-prod-foto">
              {p.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagem} alt={p.nome} width={600} height={750} loading="lazy" decoding="async" />
              ) : (
                <span className="lp-prod-vazio" aria-hidden="true" />
              )}
            </div>
            <div className="lp-prod-info">
              <h3 className="lp-prod-nome">{p.nome}</h3>
              <span className="lp-prod-aviso">
                <Lock size={14} aria-hidden="true" /> Preço de atacado no catálogo
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link href={href} className="lp-destaques-fim">Ver catálogo completo</Link>
    </section>
  );
}
