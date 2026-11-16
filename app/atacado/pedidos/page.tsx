import { corStatus } from "@/lib/admin-status";
import { formatarReais } from "@/lib/home";
import { dataPtBr, pedidoIdCurto, rotuloStatusPedido } from "@/lib/atacado";
import SwingTag from "@/components/SwingTag";
import { carregarPedidos } from "../dados";
import { exigirRevendedorAprovado } from "../gate";

export default async function PedidosAtacadoPage() {
  const g = await exigirRevendedorAprovado("/atacado/pedidos");
  if (!g.ok) return g.gate;
  const pedidos = await carregarPedidos(g.db);

  if (pedidos === null) {
    return <p className="atc-vazio">Não foi possível carregar seus pedidos agora. Tente de novo em instantes.</p>;
  }
  if (pedidos.length === 0) {
    return <p className="atc-vazio">Você ainda não fez nenhum pedido de atacado.</p>;
  }

  return (
    <div className="atc-tabela" role="table" aria-label="Meus pedidos">
      <div className="atc-tabela-linha atc-tabela-cab" role="row">
        <div role="columnheader">PEDIDO</div>
        <div role="columnheader">PRODUTOS</div>
        <div role="columnheader">DATA</div>
        <div role="columnheader">VALOR</div>
        <div role="columnheader">STATUS</div>
      </div>
      {pedidos.map((p) => {
        const rotulo = rotuloStatusPedido(p.status);
        const cor = corStatus(rotulo);
        return (
          <div key={p.id} className="atc-tabela-linha" role="row">
            <div className="atc-id" role="cell">
              {pedidoIdCurto(p.id)}
            </div>
            <div role="cell">
              <span className="atc-pedido-rotulo">Produtos</span>
              {p.skus}
              {p.bonus_aplicado && <span className="atc-suave"> + bônus</span>}
            </div>
            <div className="atc-suave" role="cell">
              {dataPtBr(p.created_at)}
            </div>
            <div className="atc-mono" role="cell">
              {formatarReais(p.valor_total)}
            </div>
            <div role="cell">
              <SwingTag color={cor.bg} textColor={cor.text} size="sm" rotate={0}>
                {rotulo}
              </SwingTag>
            </div>
          </div>
        );
      })}
    </div>
  );
}
