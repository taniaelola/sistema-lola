import { margemRevenda } from "@/lib/atacado";
import { formatarReais } from "@/lib/home";

/** Os dois preços do revendedor e a margem informativa (nunca gravada). */
export default function PrecosProduto({
  precoVarejo,
  precoAtacado,
}: {
  precoVarejo: number;
  precoAtacado: number;
}) {
  const margem = margemRevenda(precoVarejo, precoAtacado);
  return (
    <div className="atc-precos">
      <div className="atc-preco-linha">
        <span className="atc-preco-rotulo">Preço de referência para revenda</span>
        <s className="atc-preco-ref">{formatarReais(precoVarejo)}</s>
      </div>
      <div className="atc-preco-linha">
        <span className="atc-preco-rotulo">Seu preço</span>
        <strong className="atc-preco atc-preco-forte">{formatarReais(precoAtacado)}</strong>
      </div>
      {margem.valor > 0 && (
        <p className="atc-margem">
          margem de {formatarReais(margem.valor)} ({margem.percentual}%)
        </p>
      )}
    </div>
  );
}
