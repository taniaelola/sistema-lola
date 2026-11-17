"use client";

import { useState } from "react";
import Link from "next/link";
import { avaliarCarrinhoAtacado, type ItemCarrinhoAtacado } from "@/lib/checkout";
import { criarPedidoAtacado } from "./actions";
import Header from "@/components/Header";
import { SiteFooter } from "@/components/PaymentsFooter";
import { CamposEntrega, DADOS_VAZIOS, OPCOES_ATACADO, type DadosForm } from "./CamposEntrega";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CheckoutAtacado({
  itens,
  total,
  minimo,
}: {
  itens: ItemCarrinhoAtacado[];
  total: number;
  /** Peças exigidas no pedido (12; 0 para a revendedora premium). */
  minimo: number;
}) {
  const [dados, setDados] = useState<DadosForm>(DADOS_VAZIOS);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const avaliacao = avaliarCarrinhoAtacado(itens, minimo);
  const problemaPorId = new Map(avaliacao.problemas.map((p) => [p.id, p.motivo]));

  function set<K extends keyof DadosForm>(campo: K, valor: DadosForm[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !avaliacao.liberado) return;
    setErro(null);
    setEnviando(true);

    // Só dados de entrega: itens, preços e revendedor são definidos no servidor.
    const res = await criarPedidoAtacado({
      nome: dados.nome,
      telefone: dados.telefone,
      entregaTipo: dados.entregaTipo,
      rua: dados.rua,
      numero: dados.numero,
      bairro: dados.bairro,
      complemento: dados.complemento,
      cep: dados.cep,
      cidade: dados.cidade,
    });

    if (res.error) {
      setErro(res.error);
      setEnviando(false);
      return;
    }
    if (res.url) {
      // Sem pagamento no site: o pedido já foi criado e o carrinho esvaziado no banco.
      window.location.href = res.url;
    }
  }

  return (
    <>
      <Header />
      <section className="section">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-0.01em",
              marginBottom: 8,
            }}
          >
            Finalizar pedido de atacado
          </h1>

          <Link href="/atacado/carrinho" style={{ fontSize: 12.5, color: "var(--muted)" }}>
            ← Voltar pro carrinho de atacado
          </Link>

          <div
            style={{
              marginTop: 22,
              borderTop: "1px solid var(--line)",
              paddingTop: 18,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--muted)",
                margin: 0,
              }}
            >
              {minimo > 0 ? `${avaliacao.pecas} de ${minimo} peças` : `${avaliacao.pecas} peças`}
            </p>
            {itens.map((i) => {
              const problema = problemaPorId.get(i.id);
              return (
                <div key={i.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12.5,
                      color: "var(--muted)",
                    }}
                  >
                    <span>
                      {[i.nome, i.cor, i.tamanho].filter(Boolean).join(" · ")} × {i.quantidade}
                    </span>
                    <span>{brl(i.subtotal)}</span>
                  </div>
                  {problema && (
                    <span role="alert" style={{ fontSize: 11.5, color: "#b23b3b" }}>
                      {problema}
                    </span>
                  )}
                </div>
              );
            })}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--ink)",
                marginTop: 4,
              }}
            >
              <span>Total dos produtos</span>
              <span>{brl(total)}</span>
            </div>
          </div>

          {!avaliacao.liberado ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <p style={{ color: "#b23b3b", fontSize: 13.5, marginBottom: 18 }}>
                {avaliacao.motivo}
              </p>
              <Link href="/atacado/carrinho" className="btn">
                Ajustar carrinho de atacado
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 22 }}
            >
              <CamposEntrega dados={dados} set={set} opcoes={OPCOES_ATACADO} />

              {erro && (
                <p style={{ fontSize: 12.5, color: "#b23b3b", textAlign: "center" }}>{erro}</p>
              )}

              <button
                className="btn"
                type="submit"
                disabled={enviando}
                style={{ justifyContent: "center", opacity: enviando ? 0.6 : 1 }}
              >
                {enviando ? "Enviando pedido…" : "Enviar pedido →"}
              </button>
              <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", margin: 0 }}>
                Você não paga agora. A loja separa o seu pedido e avisa pelo WhatsApp, com o link de
                pagamento. Os preços são de atacado e conferidos no servidor.
              </p>
            </form>
          )}
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
