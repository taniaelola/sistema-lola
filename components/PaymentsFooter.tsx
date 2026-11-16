"use client";

import RodapeView from "@/components/RodapeView";
import { buscarDadosRodape } from "@/components/loja-actions";
import { criarCache, useDadosCacheados } from "@/components/loja-cache";
import { TEXTOS_PADRAO } from "@/lib/textos";
import type { DadosRodape } from "@/lib/header-dados";

export function PaymentsStrip() {
  return (
    <div className="payments">
      <div className="wrap">
        <span className="item">Pix</span>
        <span className="item">Cartão de crédito</span>
        <span className="item">Checkout Mercado Pago</span>
      </div>
    </div>
  );
}

const cacheRodape = criarCache<DadosRodape>();

export function SiteFooter() {
  const dados = useDadosCacheados(cacheRodape, buscarDadosRodape);
  return (
    <RodapeView
      textos={dados?.textos ?? TEXTOS_PADRAO}
      categorias={dados?.categorias ?? []}
      varejoAtivo={dados?.varejoAtivo ?? false}
    />
  );
}
