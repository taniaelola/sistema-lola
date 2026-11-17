import { MIN_PECAS_ATACADO } from "@/lib/pricing";

// Faixa fixa no topo da home (texto não editável).
export default function FaixaAvisoLP() {
  return (
    <div className="aviso-fixo">
      <span className="so-desktop">
        Venda no atacado · mínimo de {MIN_PECAS_ATACADO} peças por compra · retirada na loja
      </span>
      <span className="so-mobile">Mínimo {MIN_PECAS_ATACADO} peças · retirada na loja</span>
    </div>
  );
}
