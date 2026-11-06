"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import {
  alertaLinha,
  decisaoFinalizar,
  progressoBonus,
  progressoSkus,
  somarPecas,
  textoBonus,
  type ItemCarrinho,
} from "@/lib/atacado";
import { formatarReais } from "@/lib/home";
import { alterarQuantidade, removerItem } from "@/app/atacado/actions";

export default function CarrinhoView({
  itens,
  skus,
  total,
  bonus,
}: {
  itens: ItemCarrinho[];
  skus: number;
  total: number;
  bonus: { ativo: boolean; minPecas: number; quantidade: number; produtoNome: string | null };
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const progresso = progressoSkus(skus);
  const decisao = decisaoFinalizar(itens);
  const pecas = somarPecas(itens.filter((i) => i.disponivel));
  const progressoPecas = progressoBonus(pecas, bonus.minPecas, bonus.ativo);
  const mensagemBonus = textoBonus(progressoPecas, bonus.produtoNome, bonus.quantidade);
  const pctBonus = Math.min(100, Math.round((pecas / bonus.minPecas) * 100));

  function executar(acao: () => Promise<{ error: string | null }>) {
    setErro(null);
    iniciar(async () => {
      const res = await acao();
      if (res.error) setErro(res.error);
    });
  }

  if (itens.length === 0) {
    return (
      <div className="atc-cartao" style={{ textAlign: "center", padding: 40 }}>
        <ShoppingBag size={28} aria-hidden="true" style={{ color: "var(--adm-text-secondary)" }} />
        <p style={{ fontSize: 15, fontWeight: 600, margin: "10px 0 4px" }}>Seu carrinho está vazio</p>
        <p className="atc-suave" style={{ fontSize: 13, margin: "0 0 16px" }}>
          Escolha produtos no catálogo até completar {progresso.minimo} produtos distintos.
        </p>
        <Link href="/atacado/catalogo" className="atc-btn">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="atc-carrinho">
      <div className="atc-itens">
        {itens.map((it) => {
          const alerta = alertaLinha(it);
          const maximo = it.estoque <= 0 || it.quantidade >= it.estoque;
          const detalhe = [it.cor, it.tamanho ? `Tam. ${it.tamanho}` : null].filter(Boolean).join(" · ");
          return (
            <div key={it.id} className="atc-item">
              {it.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imagem} alt={it.nome} className="atc-item-foto" loading="lazy" />
              ) : (
                <span className="atc-item-foto" role="img" aria-label={`${it.nome} sem foto`} />
              )}
              <div className="atc-item-info">
                <div className="atc-item-nome">{it.nome}</div>
                <div className="atc-item-meta">
                  {detalhe && `${detalhe} · `}
                  {formatarReais(it.preco_unit)} / un.
                </div>
                {alerta && (
                  <div className="atc-item-alerta" role="status">
                    {alerta}
                  </div>
                )}
              </div>
              <div className="atc-qtd">
                <button
                  type="button"
                  aria-label={`Diminuir quantidade de ${it.nome}`}
                  disabled={pendente}
                  onClick={() => executar(() => alterarQuantidade(it.id, it.quantidade - 1))}
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <span className="atc-qtd-num" aria-label={`Quantidade: ${it.quantidade}`}>
                  {it.quantidade}
                </span>
                <button
                  type="button"
                  aria-label={`Aumentar quantidade de ${it.nome}`}
                  disabled={pendente || maximo || !it.disponivel}
                  onClick={() => executar(() => alterarQuantidade(it.id, it.quantidade + 1))}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="atc-item-subtotal">{formatarReais(it.subtotal)}</div>
              <button
                type="button"
                className="atc-remover"
                aria-label={`Remover ${it.nome} do carrinho`}
                disabled={pendente}
                onClick={() => executar(() => removerItem(it.id))}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <p className="atc-erro" role="alert" aria-live="polite">
          {erro}
        </p>
      </div>

      <aside className="atc-resumo" aria-label="Resumo do pedido">
        <h2>Resumo do pedido</h2>
        <div>
          <div className="atc-suave" style={{ fontSize: 13 }}>
            produtos distintos no carrinho
          </div>
          <div
            className="atc-barra"
            style={{ marginTop: 6 }}
            role="progressbar"
            aria-label="produtos distintos no carrinho"
            aria-valuemin={0}
            aria-valuemax={progresso.minimo}
            aria-valuenow={Math.min(progresso.atual, progresso.minimo)}
          >
            <span style={{ width: `${progresso.pct}%` }} />
          </div>
          <div className="atc-mono" style={{ fontSize: 13, marginTop: 6 }}>
            {progresso.atual} de {progresso.minimo} produtos
          </div>
        </div>
        {bonus.ativo && (
          <div>
            <div
              className="atc-barra"
              role="progressbar"
              aria-label="peças para a bonificação"
              aria-valuemin={0}
              aria-valuemax={progressoPecas.min}
              aria-valuenow={Math.min(pecas, progressoPecas.min)}
            >
              <span style={{ width: `${pctBonus}%` }} />
            </div>
            <p className="atc-mono" style={{ fontSize: 13, marginTop: 6 }} role="status" aria-live="polite">
              {mensagemBonus}
            </p>
          </div>
        )}
        <div className="atc-resumo-linha" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
          <span>Peças totais</span>
          <span className="atc-mono" style={{ color: "var(--ink)" }}>
            {pecas}
          </span>
        </div>
        <div className="atc-resumo-total">
          <span>Total</span>
          <span className="atc-mono">{formatarReais(total)}</span>
        </div>
        {decisao.habilitado ? (
          <Link href="/checkout?modo=atacado" className="atc-btn atc-btn-bloco">
            {decisao.texto}
          </Link>
        ) : (
          <button type="button" className="atc-btn atc-btn-bloco" disabled>
            {decisao.texto}
          </button>
        )}
      </aside>
    </div>
  );
}
