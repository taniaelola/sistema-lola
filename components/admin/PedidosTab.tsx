"use client";

import { useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABEL, brlOuTraco, entregaTipoLabel } from "@/lib/types";
import { updateOrderStatus, settleOrder } from "@/app/admin/actions";
import SwingTag from "@/components/SwingTag";
import { corStatus } from "@/lib/admin-status";
import { opcoesStatusPedido } from "@/lib/admin-acesso";

type Filtro = "todos" | "varejo" | "atacado";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "varejo", label: "Varejo" },
  { key: "atacado", label: "Atacado" },
];

// Label curto por status, reconhecido por `corStatus` (ver lib/admin-status.ts).
// Diferente de ORDER_STATUS_LABEL (usado no <select>, com texto mais longo/descritivo).
const STATUS_TAG_LABEL: Record<OrderStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  preparando: "Preparando",
  enviado: "Enviado",
  pronto_retirada: "Pronto para retirada",
  entregue: "Entregue",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

const COLS = "110px 1.5fr 90px 70px 110px 170px 100px 280px";

const brl = brlOuTraco;

export default function PedidosTab({
  orders,
  filtro,
  onFiltro,
  onChange,
  podeLiquidar,
}: {
  orders: Order[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  onChange: () => void;
  podeLiquidar: boolean;
}) {
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleStatus(id: string, status: OrderStatus) {
    setSalvandoId(id);
    const { error } = await updateOrderStatus(id, status);
    setSalvandoId(null);
    if (error) alert(`Não deu pra mudar o status: ${error}`);
    else onChange();
  }

  async function handleSettle(id: string) {
    if (
      !confirm(
        "Confirmar recebimento deste pedido? Isso baixa o estoque e registra a venda."
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
        <div style={{ display: "grid", gridTemplateColumns: COLS, minWidth: 1100, padding: "14px 20px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)", letterSpacing: "0.04em", borderBottom: "1px solid var(--line)" }}>
          <div>PEDIDO</div>
          <div>CLIENTE / REVENDEDOR</div>
          <div>TIPO</div>
          <div>ITENS</div>
          <div>VALOR</div>
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
            const opcoes = opcoesStatusPedido(o.entrega_tipo, o.status);
            const aberto = expandedId === o.id;
            const cor = corStatus(STATUS_TAG_LABEL[o.status]);
            return (
              <div key={o.id}>
                <div
                  onClick={() => setExpandedId(aberto ? null : o.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: COLS,
                    minWidth: 1100,
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
                    {o.cliente_nome}
                  </div>
                  <div style={{ fontSize: 12.5, color: o.is_atacado ? "var(--adm-purple-text)" : "var(--adm-text-secondary)", fontWeight: o.is_atacado ? 600 : 400 }}>
                    {o.is_atacado ? "Atacado" : "Varejo"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>{o.items.length}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{brl(o.valor_total)}</div>
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
                    {podeLiquidar && o.status === "pendente" && (
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
                        Marcar como pago
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
                          </div>
                        ))}
                      </div>
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
