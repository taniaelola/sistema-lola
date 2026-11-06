import { getTextos } from "@/lib/textos";
import { getPerfil } from "@/lib/auth";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { ctaLP, textoRegraBonus } from "@/lib/lp";
import { getAmostraLP } from "@/lib/lp-server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";
import HeroLP from "@/components/lp/HeroLP";
import RegrasLP from "@/components/lp/RegrasLP";
import PassosLP from "@/components/lp/PassosLP";
import AmostraLP from "@/components/lp/AmostraLP";
import CtaFinalLP from "@/components/lp/CtaFinalLP";

export const revalidate = 0;

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
          preco={textos.lp_regra_preco}
        />
        <PassosLP titulo={textos.lp_passos_titulo} passos={[textos.lp_passo_1, textos.lp_passo_2, textos.lp_passo_3]} />
        <AmostraLP titulo={textos.lp_amostra_titulo} aviso={textos.lp_amostra_aviso} itens={amostra} />
        <CtaFinalLP titulo={textos.lp_final_titulo} botao={cta.rotulo ?? textos.lp_final_botao} href={cta.href} />
      </main>
      <SiteFooterServer />
    </>
  );
}
