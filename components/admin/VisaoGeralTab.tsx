"use client";

import { useMemo, useState } from "react";
import type { Product, Order, Sale, EstoqueBaixoItem } from "@/lib/types";
import { brlOuTraco, totalEstoque } from "@/lib/types";
import SwingTag from "@/components/SwingTag";
import { corStatus } from "@/lib/admin-status";

type Filtro = "todos" | "varejo" | "atacado";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "varejo", label: "Varejo" },
  { key: "atacado", label: "Atacado" },
];

const brl = brlOuTraco;

export default function VisaoGeralTab({
  products,
  orders,
  sales,
  semReceita = false,
  estoqueBaixoServidor,
  revendedoresPendentes,
  onAprovar,
  onRecusar,
  onGoPedidos,
  onGoProdutos,
  onGoRevendedores,
}: {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  semReceita?: boolean;
  estoqueBaixoServidor?: EstoqueBaixoItem[];
  revendedoresPendentes: { id: string; nome: string; cidade: string }[];
  onAprovar?: (id: string) => void;
  onRecusar?: (id: string) => void;
  onGoPedidos: () => void;
  onGoProdutos?: () => void;
  onGoRevendedores: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const salesFiltradas = useMemo(
    () => sales.filter((s) => filtro === "todos" || (filtro === "atacado") === s.is_atacado),
    [sales, filtro]
  );
  const totalGeral = salesFiltradas.reduce((sum, s) => sum + Number(s.valor_total), 0);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const totalMes = salesFiltradas
    .filter((s) => s.data?.slice(0, 7) === mesAtual)
    .reduce((sum, s) => sum + Number(s.valor_total), 0);

  // Série de 12 meses (mês atual + 11 anteriores) a partir de `sales` (todas, não só o filtro,
  // pra não achatar o gráfico quando o filtro é Varejo/Atacado — mesma leitura do canvas,
  // onde o corte de KPI é textual, "Recorte: X", e o gráfico reage ao filtro via essa base).
  const meses = useMemo(() => {
    const hoje = new Date();
    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const arr: { label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const total = salesFiltradas
        .filter((s) => s.data?.slice(0, 7) === key)
        .reduce((sum, s) => sum + Number(s.valor_total), 0);
      arr.push({ label: labels[d.getMonth()], total });
    }
    return arr;
  }, [salesFiltradas]);

  const max = Math.max(...meses.map((m) => m.total), 1) * 1.1;
  const toPath = (w: number, h: number) =>
    meses.map((m, i) => `${i === 0 ? "M" : "L"} ${(i / (meses.length - 1)) * w} ${h - (m.total / max) * h}`).join(" ");
  const chartPath = toPath(720, 190);
  const chartAreaPath = `${chartPath} L 720 200 L 0 200 Z`;

  const aguardando = orders.filter((o) => o.status === "preparando");
  const pedidosAguardando = aguardando.slice(0, 4);
  const estoqueBaixoTodos = estoqueBaixoServidor
    ? estoqueBaixoServidor.map((e) => ({ ...e, categoria: "" }))
    : products
        .filter((p) => totalEstoque(p) <= 5)
        .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria?.nome ?? "", estoque: totalEstoque(p) }));
  const estoqueBaixo = estoqueBaixoTodos.slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
        {semReceita ? (
          <>
            <KpiCard label="PEDIDOS AGUARDANDO" value={String(aguardando.length)} trend="em preparação" trendColor="var(--adm-text-secondary)" />
            <KpiCard label="ESTOQUE BAIXO" value={String(estoqueBaixoTodos.length)} trend="produtos com até 5 un." trendColor="var(--adm-text-secondary)" />
          </>
        ) : (
          <>
            <KpiCard label="VENDAS TOTAIS" value={brl(totalGeral)} />
            <KpiCard label="VENDAS DO MÊS" value={brl(totalMes)} />
          </>
        )}
        <KpiCard label="Nº DE VENDAS" value={String(salesFiltradas.length)} trend={`Recorte: ${FILTROS.find((f) => f.key === filtro)!.label}`} trendColor="var(--adm-text-secondary)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16 }}>
        {!semReceita && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Vendas no tempo</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)" }}>últimos 12 meses</div>
          </div>
          <svg width="100%" height="200" viewBox="0 0 720 200" preserveAspectRatio="none">
            <path d={chartAreaPath} fill="url(#gradFillAdmin)" />
            <path d={chartPath} fill="none" stroke="var(--pink)" strokeWidth={3} />
            <defs>
              <linearGradient id="gradFillAdmin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pink)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--pink)" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12,minmax(0,1fr))", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--adm-text-secondary)", textAlign: "center" }}>
            {meses.map((m, i) => <span key={i}>{m.label}</span>)}
          </div>
        </div>
        )}

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Revendedores pendentes</div>
          {revendedoresPendentes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>Nenhum cadastro pendente.</p>
          ) : (
            revendedoresPendentes.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</div>
                  <div style={{ fontSize: 11, color: "var(--adm-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.cidade}</div>
                </div>
                {onAprovar && (
                  <button onClick={() => onAprovar(r.id)} aria-label="Aprovar" style={{ flex: "none", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--mint)", background: "var(--adm-success-bg)", cursor: "pointer" }}>✓</button>
                )}
                {onRecusar && (
                  <button onClick={() => onRecusar(r.id)} aria-label="Recusar" style={{ flex: "none", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--pink)", background: "var(--adm-pink-bg)", cursor: "pointer" }}>✕</button>
                )}
              </div>
            ))
          )}
          <button onClick={onGoRevendedores} style={{ marginTop: "auto", background: "none", border: "none", color: "var(--peach-deep)", fontSize: 12, fontWeight: 600, textAlign: "left", cursor: "pointer", padding: 0 }}>
            Ver todos →
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Pedidos aguardando ação</div>
            <button onClick={onGoPedidos} style={{ background: "none", border: "none", color: "var(--peach-deep)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Ver todos →</button>
          </div>
          {pedidosAguardando.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>Nenhum pedido aguardando ação.</p>
          ) : (
            pedidosAguardando.map((o) => {
              const cor = corStatus("Em preparação");
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <SwingTag color={cor.bg} textColor={cor.text} size="sm">Em preparação</SwingTag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>#{o.id.slice(0, 8)} · {o.cliente_nome}</div>
                    <div style={{ fontSize: 11, color: "var(--adm-text-secondary)" }}>{o.is_atacado ? "Atacado" : "Varejo"}</div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{brl(o.valor_total)}</div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Estoque baixo</div>
            {onGoProdutos && (
              <button onClick={onGoProdutos} style={{ background: "none", border: "none", color: "var(--peach-deep)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Ver todos →</button>
            )}
          </div>
          {estoqueBaixo.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--adm-text-secondary)" }}>Nenhum produto com estoque baixo.</p>
          ) : (
            estoqueBaixo.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.nome}</div>
                  <div style={{ fontSize: 11, color: "var(--adm-text-secondary)" }}>{e.categoria}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--pink)" }}>{e.estoque} un.</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, trend, trendColor = "var(--adm-trend-positive)" }: { label: string; value: string; trend?: string; trendColor?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 20 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(20px,2.2vw,28px)", fontWeight: 600, marginTop: 8 }}>{value}</div>
      {trend && <div style={{ fontSize: 12, color: trendColor, marginTop: 6 }}>{trend}</div>}
    </div>
  );
}
