import Link from "next/link";
import { corStatus } from "@/lib/admin-status";
import { formatarReais } from "@/lib/home";
import {
  calcularKpis,
  pedidoIdCurto,
  progressoPecas,
  rotuloStatusPedido,
} from "@/lib/atacado";
import SwingTag from "@/components/SwingTag";
import {
  agora,
  carregarCarrinho,
  carregarCatalogo,
  carregarPedidos,
  descontoMaximoDoCatalogo,
  novidadesDoCatalogo,
} from "./dados";
import { exigirRevendedorAprovado } from "./gate";

export default async function PainelAtacadoPage() {
  const g = await exigirRevendedorAprovado("/atacado");
  if (!g.ok) return g.gate;
  const { db } = g;
  const [carrinho, pedidos, catalogo] = await Promise.all([
    carregarCarrinho(db),
    carregarPedidos(db),
    carregarCatalogo(db),
  ]);
  const lancamentos = catalogo ? novidadesDoCatalogo(catalogo) : null;
  const desconto = catalogo ? descontoMaximoDoCatalogo(catalogo) : null;

  const progresso = progressoPecas(carrinho?.pecas ?? 0);
  const kpis = calcularKpis({ pedidos, descontoMaximo: desconto, agora: agora() });
  const ultimos = (pedidos ?? []).slice(0, 5);

  return (
    <div className="atc-pilha">
      <section className="atc-cartao atc-progresso" aria-label="Pedido mínimo">
        <div className="atc-progresso-texto">
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>
            Pedido mínimo: {progresso.minimo} peças
          </h2>
          <p className="atc-suave" style={{ fontSize: 13, margin: 0 }}>
            Adicione itens ao carrinho até completar o mínimo para finalizar o pedido.
          </p>
          <div
            className="atc-barra"
            role="progressbar"
            aria-label="peças no carrinho"
            aria-valuemin={0}
            aria-valuemax={progresso.minimo}
            aria-valuenow={Math.min(progresso.atual, progresso.minimo)}
          >
            <span style={{ width: `${progresso.pct}%` }} />
          </div>
        </div>
        <div className="atc-progresso-valor">
          <div className="atc-progresso-num">
            {progresso.atual} de {progresso.minimo} peças
          </div>
          <Link href="/atacado/carrinho" className="atc-btn" style={{ marginTop: 8 }}>
            Ver carrinho
          </Link>
        </div>
      </section>

      <section className="atc-kpis" aria-label="Indicadores">
        <div className="atc-cartao" style={{ padding: 20 }}>
          <div className="atc-kpi-rotulo">Pedidos no mês</div>
          <div className="atc-kpi-valor">{kpis.pedidosMes}</div>
        </div>
        <div className="atc-cartao" style={{ padding: 20 }}>
          <div className="atc-kpi-rotulo">Total comprado</div>
          <div className="atc-kpi-valor">{kpis.totalComprado}</div>
        </div>
        <div className="atc-cartao" style={{ padding: 20 }}>
          <div className="atc-kpi-rotulo">Desconto atacado</div>
          <div
            className="atc-kpi-valor"
            style={{ color: kpis.descontoAtacado === "—" ? undefined : "var(--adm-trend-positive)" }}
          >
            {kpis.descontoAtacado}
          </div>
        </div>
      </section>

      <div className="atc-duas">
        <section className="atc-cartao" aria-labelledby="atc-ultimos">
          <div className="atc-cartao-titulo">
            <h2 id="atc-ultimos">Últimos pedidos</h2>
            <Link href="/atacado/pedidos" className="atc-link">
              Ver todos
            </Link>
          </div>
          {pedidos === null ? (
            <p className="atc-vazio">Não foi possível carregar seus pedidos agora.</p>
          ) : ultimos.length === 0 ? (
            <p className="atc-vazio">Você ainda não fez nenhum pedido de atacado.</p>
          ) : (
            ultimos.map((p) => {
              const rotulo = rotuloStatusPedido(p.status);
              const cor = corStatus(rotulo);
              return (
                <div key={p.id} className="atc-linha-pedido">
                  <SwingTag color={cor.bg} textColor={cor.text} size="sm" rotate={0}>
                    {rotulo}
                  </SwingTag>
                  <div className="atc-id" style={{ flex: 1 }}>
                    {pedidoIdCurto(p.id)}
                  </div>
                  <div className="atc-suave" style={{ fontSize: 12 }}>
                    {p.skus} produtos
                  </div>
                  <div className="atc-mono" style={{ fontSize: 13 }}>
                    {formatarReais(p.valor_total)}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="atc-cartao" aria-labelledby="atc-destaques">
          <div className="atc-cartao-titulo">
            <h2 id="atc-destaques">Destaques do catálogo</h2>
            <Link href="/atacado/catalogo" className="atc-link">
              Ver todos
            </Link>
          </div>
          {lancamentos === null ? (
            <p className="atc-vazio">Não foi possível carregar o catálogo agora.</p>
          ) : lancamentos.length === 0 ? (
            <p className="atc-vazio">Nenhum produto com estoque no momento.</p>
          ) : (
            lancamentos.map((p) => {
              const foto = p.foto;
              return (
                <Link
                  key={p.id}
                  href={`/atacado/produto/${p.slug}`}
                  className="atc-novidade"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt={p.nome} className="atc-thumb" loading="lazy" />
                  ) : (
                    <span className="atc-thumb" role="img" aria-label={`${p.nome} sem foto`} />
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{p.nome}</span>
                    <span className="atc-mono atc-suave" style={{ fontSize: 12 }}>
                      {formatarReais(p.preco)}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
