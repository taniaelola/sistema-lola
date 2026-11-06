import type { AmostraLP as Item } from "@/lib/lp";
import { economiaPercentual } from "@/lib/lp";
import { formatarReais } from "@/lib/home";

export default function AmostraLP({ titulo, aviso, itens }: { titulo: string; aviso: string; itens: Item[] }) {
  if (itens.length === 0) return null;
  return (
    <section className="lp-secao" aria-labelledby="lp-amostra-titulo">
      <h2 id="lp-amostra-titulo" className="lp-titulo">{titulo}</h2>
      <ul className="lp-amostra">
        {itens.map((p) => {
          const economia = economiaPercentual(p.precoVarejo, p.precoAtacado);
          return (
            <li key={p.id} className="lp-prod">
              <div className="lp-prod-foto">
                {p.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagem} alt={p.nome} width={600} height={600} loading="lazy" decoding="async" />
                ) : (
                  <span className="lp-prod-inicial" aria-hidden="true">{p.nome.trim().charAt(0).toUpperCase()}</span>
                )}
                {economia > 0 && <span className="lp-prod-selo">economia de {economia}%</span>}
              </div>
              <h3 className="lp-prod-nome">{p.nome}</h3>
              <p className="lp-prod-venda">
                <span>preço de venda sugerido</span> <s>{formatarReais(p.precoVarejo)}</s>
              </p>
              <p className="lp-prod-seu">
                <span>seu preço</span> <strong>{formatarReais(p.precoAtacado)}</strong>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="lp-aviso">{aviso}</p>
    </section>
  );
}
