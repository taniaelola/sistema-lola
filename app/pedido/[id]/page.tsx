import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/types";
import { ORDER_STATUS_LABEL, brlOuTraco, entregaTipoLabel } from "@/lib/types";
import { BRAND } from "@/lib/brand.config";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";

export const revalidate = 0;

type PagamentoStatus = "sucesso" | "falha" | "pendente";

const BANNERS: Record<
  PagamentoStatus,
  { texto: string; fundo: string; borda: string; cor: string }
> = {
  sucesso: {
    texto: "Pagamento aprovado! Já estamos preparando seu pedido.",
    fundo: "#e9f6ec",
    borda: "#bfe3c6",
    cor: "#1e6b34",
  },
  falha: {
    texto: "O pagamento não foi concluído. Você pode tentar de novo.",
    fundo: "#fbeaea",
    borda: "#efc4c4",
    cor: "#b23b3b",
  },
  pendente: {
    texto: "Pagamento em processamento. Assim que confirmar, seu pedido anda.",
    fundo: "#fdf3e3",
    borda: "#f0dcb4",
    cor: "#8a5a12",
  },
};

async function getOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase().rpc("public_get_order", { p_id: id });
  if (error || !data) return null;
  return data as unknown as Order;
}

export async function generateMetadata() {
  return { title: `Acompanhar pedido — ${BRAND.nome}` };
}

const brl = brlOuTraco;

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  padding: 22,
  marginBottom: 24,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 14,
};

const linhaResumoStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12.5,
  color: "var(--muted)",
};

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagamento?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const order = await getOrder(id);
  if (!order) notFound();

  const banner =
    sp.pagamento === "sucesso" || sp.pagamento === "falha" || sp.pagamento === "pendente"
      ? BANNERS[sp.pagamento]
      : null;

  const mostrarEndereco = order.entrega_tipo !== "retirada";

  return (
    <>
      <SiteHeader />
      <section className="section">
        <div className="wrap" style={{ maxWidth: 640 }}>
          {banner && (
            <div
              style={{
                background: banner.fundo,
                border: `1px solid ${banner.borda}`,
                color: banner.cor,
                padding: "14px 16px",
                fontSize: 13.5,
                marginBottom: 24,
              }}
            >
              {banner.texto}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Pedido #{id.slice(0, 8)}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-0.01em",
              marginBottom: 6,
            }}
          >
            Obrigada pela compra, {order.cliente_nome.split(" ")[0]}!
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 24 }}>
            Status: <strong style={{ color: "var(--ink-soft)" }}>{ORDER_STATUS_LABEL[order.status]}</strong>
          </p>

          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Itens</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {order.items.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}
                >
                  <span>
                    {item.quantidade}× {item.produto_nome}
                    {item.produto_cor ? ` — ${item.produto_cor}` : ""}
                    {item.produto_tamanho ? ` / ${item.produto_tamanho}` : ""}
                  </span>
                  <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {brl(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1px solid var(--line)",
                paddingTop: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={linhaResumoStyle}>
                <span>Produtos</span>
                <span>{brl(order.valor_produtos)}</span>
              </div>
              {order.entrega_tipo === "entrega_fora" ? (
                <div style={linhaResumoStyle}>
                  <span>Frete</span>
                  <span>A combinar</span>
                </div>
              ) : (order.entrega_taxa ?? 0) > 0 ? (
                <div style={linhaResumoStyle}>
                  <span>Taxa de entrega</span>
                  <span>{brl(order.entrega_taxa)}</span>
                </div>
              ) : order.entrega_tipo === "entrega" ? (
                <div style={linhaResumoStyle}>
                  <span>Entrega</span>
                  <span>Grátis</span>
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink)",
                }}
              >
                <span>Total</span>
                <span>{brl(order.valor_total)}</span>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ ...cardTitleStyle, marginBottom: 10 }}>
              {entregaTipoLabel(order.entrega_tipo)}
            </h3>
            {mostrarEndereco && (
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
                {order.endereco_rua}
                {order.endereco_numero ? `, ${order.endereco_numero}` : ""}
                {order.endereco_complemento ? ` — ${order.endereco_complemento}` : ""}
                {(order.endereco_bairro || order.endereco_cidade) && <br />}
                {[order.endereco_bairro, order.endereco_cidade].filter(Boolean).join(" — ")}
                {order.endereco_cep ? ` · CEP ${order.endereco_cep}` : ""}
              </p>
            )}
            {order.entrega_tipo === "retirada" && (
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
                Retire na loja quando o pedido estiver pronto.
              </p>
            )}
            {order.entrega_tipo === "entrega_fora" && (
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>
                Frete a combinar pelo{" "}
                <a href={BRAND.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
                .
              </p>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <a
              href={BRAND.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12.5, color: "var(--muted)" }}
            >
              Dúvidas? Fale no WhatsApp →
            </a>
          </div>
        </div>
      </section>
      <SiteFooterServer />
    </>
  );
}
