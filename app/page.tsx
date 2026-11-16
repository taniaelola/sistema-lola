import type { Metadata } from "next";
import { BRAND } from "@/lib/brand.config";
import { getTextos } from "@/lib/textos";
import { getPerfil } from "@/lib/auth";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { ctaLP, seloBonus, textoRegraBonus } from "@/lib/lp";
import { getAmostraLP } from "@/lib/lp-server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";
import HeroLP from "@/components/lp/HeroLP";
import RegrasLP from "@/components/lp/RegrasLP";
import PassosLP from "@/components/lp/PassosLP";
import AmostraLP from "@/components/lp/AmostraLP";
import CtaFinalLP from "@/components/lp/CtaFinalLP";
import MarcaLP from "@/components/lp/MarcaLP";

export const revalidate = 0;

// O layout raiz usa title string (sem template), então o título aqui é o completo.
export const metadata: Metadata = {
  title: `${BRAND.nome} Atacado — calçados para revender`,
  description: `Seja revendedora ${BRAND.nome}: preço de atacado, bônus na compra e cadastro com aprovação. Veja o catálogo e comece a revender.`,
};

async function perfilSeguro() {
  try {
    const perfil = await getPerfil();
    return perfil && perfil.ativo ? perfil : null;
  } catch {
    return null;
  }
}

// Landing de revendedoras. Textos editáveis no admin; vitrine pelo RPC público get_destaques_atacado.
export default async function Home() {
  const [textos, flags, amostra, perfil] = await Promise.all([
    getTextos(),
    getLojaFlags(),
    getAmostraLP(),
    perfilSeguro(),
  ]);
  const cta = ctaLP({ logado: !!perfil, papel: perfil?.papel ?? null });
  return (
    <>
      <SiteHeader />
      <main>
        <HeroLP
          titulo={textos.lp_hero_titulo}
          subtitulo={textos.lp_hero_subtitulo}
          botao={cta.rotulo ?? textos.lp_hero_botao}
          href={cta.href}
        />
        <RegrasLP
          titulo={textos.lp_regras_titulo}
          skus={textos.lp_regra_skus}
          bonus={textoRegraBonus(flags, textos.lp_regra_bonus)}
          seloBonus={seloBonus(flags)}
          preco={textos.lp_regra_preco}
        />
        <AmostraLP titulo={textos.lp_amostra_titulo} aviso={textos.lp_amostra_aviso} itens={amostra} />
        <MarcaLP />
        <PassosLP titulo={textos.lp_passos_titulo} passos={[textos.lp_passo_1, textos.lp_passo_2, textos.lp_passo_3]} />
        <CtaFinalLP titulo={textos.lp_final_titulo} botao={cta.rotulo ?? textos.lp_final_botao} href={cta.href} />
      </main>
      <SiteFooterServer />
    </>
  );
}
