"use client";

import { useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABEL, brlOuTraco, entregaTipoLabel } from "@/lib/types";
import { updateOrderStatus, settleOrder } from "@/app/admin/actions";
import SwingTag from "@/components/SwingTag";
import { corStatus } from "@/lib/admin-status";
import { opcoesStatusPedido } from "@/lib/admin-acesso";
import { itemEhBonus } from "@/lib/atacado";
import { linkPedidoProntoWhatsApp } from "@/lib/aviso-revendedor";

type Filtro = "todos" | "varejo" | "atacado";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "varejo", label: "Varejo" },
  { key: "atacado", label: "Atacado" },
];

// Label curto por status, reconhecido por `corStatus` (ver lib/admin-status.ts).
// Diferente de ORDER_STATUS_LABEL (usado no <select>, com texto mais longo/descritivo).
const STATUS_TAG_LABEL: Record<OrderStatus, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  preparando: "Em separação",
  enviado: "Enviado",
  pronto_retirada: "Pronto para retirada",
  entregue: "Entregue",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

const COLS = "110px 1.5fr 90px 70px 110px 170px 100px 280px";
// Supervisor recebe os valores como null: a coluna VALOR some em vez de mostrar traços.
const COLS_SEM_VALORES = "110px 1.5fr 90px 70px 170px 100px 280px";

const brl = brlOuTraco;

export default function PedidosTab({
  orders,
  filtro,
  onFiltro,
  onChange,
  podeLiquidar,
  semValores = false,
}: {
  orders: Order[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onChange: () => void;
  podeLiquidar: boolean;
  /** true para o supervisor: valores e preços chegam null do banco. */
  semValores?: boolean;
}) {
  const cols = semValores ? COLS_SEM_VALORES : COLS;
  const minLargura = semValores ? 990 : 1100;
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleStatus(id: string, status: OrderStatus) {
    setSalvandoId(id);
    const { error } = await updateOrderStatus(id, status);
    setSalvandoId(null);
    if (error) alert(`Não deu pra mudar o status: ${error}`);
    else onChange();
  }

  // Pedido separado: abre o WhatsApp com a mensagem pronta (a vendedora cola o link de pagamento)
  // e move o pedido para "Aguardando pagamento". O WhatsApp abre primeiro para o navegador não bloquear a aba.
  async function handleAvisar(o: Order) {
    const link = linkPedidoProntoWhatsApp({
      telefone: o.cliente_telefone,
      nome: o.cliente_nome,
      pedidoId: o.id,
      total: o.valor_total,
    });
    if (!link) {
      alert("Este pedido não tem um WhatsApp válido. Confira o telefone do cliente.");
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
    if (o.status === "pendente") return;
    setSalvandoId(o.id);
    const { error } = await updateOrderStatus(o.id, "pendente");
    setSalvandoId(null);
    if (error) alert(`Não deu pra marcar como aguardando pagamento: ${error}`);
    else onChange();
  }

  async function handleSettle(id: string) {
    if (
      !confirm(
        "Confirmar o pagamento deste pedido? Isso baixa o estoque e registra a venda."
      )
    )
      return;
    setSalvandoId(id);
    const { error } = await settleOrder(id);
    setSalvandoId(null);
    if (error) alert(`Não deu pra marcar como pago: ${error}`);
    else onChange();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          Pedidos ({orders.length})
        </h2>
        <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 4 }}>
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => onFiltro(f.key)}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: filtro === f.key ? "var(--peach)" : "transparent",
                color: filtro === f.key ? "var(--ink)" : "var(--adm-text-secondary)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: minLargura, padding: "14px 20px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)", letterSpacing: "0.04em", borderBottom: "1px solid var(--line)" }}>
          <div>PEDIDO</div>
          <div>CLIENTE / REVENDEDOR</div>
          <div>TIPO</div>
          <div>ITENS</div>
          {!semValores && <div>VALOR</div>}
          <div>ENTREGA</div>
          <div>DATA</div>
          <div>AÇÕES</div>
        </div>

        {orders.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--adm-text-secondary)" }}>
            Nenhum pedido neste filtro.
          </div>
        ) : (
          orders.map((o) => {
            const semPagamento = !o.mp_payment_id;
            const opcoes = opcoesStatusPedido(o.entrega_tipo, o.status, semPagamento);
            const aguardaPagar = o.status === "pendente" || (o.status === "preparando" && semPagamento);
            const aberto = expandedId === o.id;
            const cor = corStatus(STATUS_TAG_LABEL[o.status]);
            return (
              <div key={o.id}>
                <div
                  onClick={() => setExpandedId(aberto ? null : o.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    minWidth: minLargura,
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>
                    #{o.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.estoque_aviso ? (
                      <span title={o.estoque_aviso} aria-label="Estoque insuficiente" style={{ color: "#b23b3b", marginRight: 6 }}>
                        ⚠
                      </span>
                    ) : null}
                    {o.cliente_nome}
                  </div>
                  <div style={{ fontSize: 12.5, color: o.is_atacado ? "var(--adm-purple-text)" : "var(--adm-text-secondary)", fontWeight: o.is_atacado ? 600 : 400 }}>
                    {o.is_atacado ? "Atacado" : "Varejo"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>{o.items.length}</div>
                  {!semValores && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{brl(o.valor_total)}</div>
                  )}
                  <div>
                    <SwingTag color={cor.bg} textColor={cor.text} size="sm">
                      {STATUS_TAG_LABEL[o.status]}
                    </SwingTag>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>
                    {new Date(o.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                  >
                    {o.is_atacado && aguardaPagar && (
                      <button
                        onClick={() => handleAvisar(o)}
                        disabled={salvandoId === o.id}
                        style={{
                          background: "var(--adm-success-bg)",
                          color: "var(--adm-success-text)",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {o.status === "pendente" ? "Reenviar no WhatsApp" : "Pronto: avisar no WhatsApp"}
                      </button>
                    )}
                    {podeLiquidar && aguardaPagar && (
                      <button
                        onClick={() => handleSettle(o.id)}
                        disabled={salvandoId === o.id}
                        style={{
                          background: "var(--peach)",
                          color: "var(--ink)",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Registrar pagamento
                      </button>
                    )}

                    <select
                      value={o.status}
                      disabled={salvandoId === o.id}
                      onChange={(e) => handleStatus(o.id, e.target.value as OrderStatus)}
                      style={{ padding: "7px 8px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
                    >
                      {opcoes.map((op) => (
                        <option key={op.status} value={op.status} disabled={op.disabled}>
                          {ORDER_STATUS_LABEL[op.status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {aberto && (
                  <div style={{ padding: "16px 20px", display: "flex", gap: 32, flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
                    <div>
                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--adm-text-secondary)", marginBottom: 8 }}>
                        Itens
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {o.items.map((item) => (
                          <div key={item.id} style={{ fontSize: 12.5 }}>
                            {item.quantidade}× {item.produto_nome}
                            {item.produto_cor ? ` — ${item.produto_cor}` : ""}
                            {item.produto_tamanho ? ` / ${item.produto_tamanho}` : ""}
                            {itemEhBonus(item) ? " (bônus)" : ""}
                          </div>
                        ))}
                      </div>
                      {o.bonus_aplicado === true && (
                        <p style={{ fontSize: 12, color: "var(--adm-text-secondary)", margin: "8px 0 0" }}>
                          Bônus aplicado neste pedido.
                        </p>
                      )}
                      {o.estoque_aviso && (
                        <p
                          role="alert"
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "#8a2a2a",
                            background: "#fdecec",
                            border: "1px solid #e8b4b4",
                            borderRadius: 8,
                            padding: "8px 10px",
                            margin: "8px 0 0",
                          }}
                        >
                          Estoque insuficiente (pagamento já recebido): {o.estoque_aviso}
                        </p>
                      )}
                      {o.bonus_aviso && (
                        <p role="note" style={{ fontSize: 12, color: "#b23b3b", margin: "8px 0 0" }}>
                          Aviso do bônus: {o.bonus_aviso}
                        </p>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--adm-text-secondary)", marginBottom: 8 }}>
                        {o.entrega_tipo !== "retirada" ? "Endereço de entrega" : "Retirada"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--adm-text-secondary)", marginBottom: 6 }}>
                        {entregaTipoLabel(o.entrega_tipo)}
                        {o.entrega_tipo === "entrega_fora" ? " · frete a combinar" : ""}
                      </div>
                      {o.entrega_tipo !== "retirada" ? (
                        <p style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6, margin: 0 }}>
                          {o.endereco_rua}, {o.endereco_numero}
                          {o.endereco_complemento ? ` — ${o.endereco_complemento}` : ""}
                          <br />
                          {o.endereco_bairro}
                          {o.endereco_cidade ? ` — ${o.endereco_cidade}` : ""}
                          {o.endereco_cep ? ` · CEP ${o.endereco_cep}` : ""}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12.5, color: "var(--adm-text-secondary)", margin: 0 }}>Cliente retira na loja.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
