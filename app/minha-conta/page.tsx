import Link from "next/link";
import { authedSupabase, exigirPapel } from "@/lib/auth";
import { ORDER_STATUS_LABEL, brlOuTraco, entregaTipoLabel, type Order } from "@/lib/types";
import { exigirVarejo } from "@/lib/loja-rotas-server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";

export const dynamic = "force-dynamic";

const brl = brlOuTraco;

async function carregarPedidos(): Promise<Order[] | null> {
  const db = await authedSupabase();
  const { data, error } = await db.rpc("meus_pedidos");
  if (error) return null;
  return Array.isArray(data) ? (data as Order[]) : [];
}

export default async function MinhaContaPage() {
  await exigirVarejo();
  const perfil = await exigirPapel(["cliente", "revendedor", "supervisor", "admin", "superadmin"], "/minha-conta");
  const pedidos = await carregarPedidos();

  return (
    <>
      <SiteHeader />
      <section className="section">
        <div className="wrap" style={{ maxWidth: 640 }}>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-0.01em",
              marginBottom: 10,
            }}
          >
            Meus pedidos
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 24 }}>
            Pedidos feitos com a conta {perfil.email}.
          </p>

          {pedidos === null ? (
            <p style={{ fontSize: 13.5, color: "var(--muted)" }}>
              Não foi possível carregar seus pedidos agora. Tente de novo em instantes.
            </p>
          ) : pedidos.length === 0 ? (
            <p style={{ fontSize: 13.5, color: "var(--muted)", textAlign: "center" }}>
              Você ainda não tem pedidos nesta conta.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--line)" }}>
              {pedidos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: "var(--surface)",
                    padding: "16px 18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      Pedido #{p.id.slice(0, 8)} · {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      {ORDER_STATUS_LABEL[p.status]} · {entregaTipoLabel(p.entrega_tipo)} · {brl(p.valor_total)}
                    </div>
                  </div>
                  <Link
                    href={`/pedido/${p.id}`}
                    style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}
                  >
                    Ver pedido →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <SiteFooterServer />
    </>
  );
}
