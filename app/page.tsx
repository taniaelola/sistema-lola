import type { Metadata } from "next";
import { BRAND } from "@/lib/brand.config";
import { getTextos } from "@/lib/textos";
import { getPerfil } from "@/lib/auth";
import { ctaLP } from "@/lib/lp";
import { getAmostraLP } from "@/lib/lp-server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";
import FaixaAvisoLP from "@/components/lp/FaixaAvisoLP";
import HeroLP from "@/components/lp/HeroLP";
import DestaqueLP from "@/components/lp/DestaqueLP";
import MarcaLP from "@/components/lp/MarcaLP";
import PassosLP from "@/components/lp/PassosLP";
import CtaFinalLP from "@/components/lp/CtaFinalLP";

export const revalidate = 0;

// O layout raiz usa title string (sem template), então o título aqui é o completo.
export const metadata: Metadata = {
  title: `${BRAND.nome} Atacado — calçados para revender`,
  description: `Seja revendedora ${BRAND.nome}: preço de atacado, cadastro com aprovação e catálogo exclusivo. Cadastre-se e comece a revender.`,
};

async function perfilSeguro() {
  try {
    const perfil = await getPerfil();
    return perfil && perfil.ativo ? perfil : null;
  } catch {
    return null;
  }
}

// Landing de revendedoras. Título, subtítulo e botões editáveis no admin; vitrine pelo RPC público get_destaques_atacado.
export default async function Home() {
  const [textos, amostra, perfil] = await Promise.all([getTextos(), getAmostraLP(), perfilSeguro()]);
  const cta = ctaLP({ logado: !!perfil, papel: perfil?.papel ?? null });
  const hrefCatalogo = perfil ? "/atacado/catalogo" : "/entrar?modo=revendedor";
  return (
    <>
      <FaixaAvisoLP />
      <SiteHeader />
      <main>
        <HeroLP
          titulo={textos.lp_hero_titulo}
          subtitulo={textos.lp_hero_subtitulo}
          botao={cta.rotulo ?? textos.lp_hero_botao}
          href={cta.href}
          mostrarEntrar={!perfil}
        />
        <DestaqueLP itens={amostra} href={hrefCatalogo} />
        <MarcaLP />
        <PassosLP />
        <CtaFinalLP botao={cta.rotulo ?? textos.lp_final_botao} href={cta.href} />
      </main>
      <SiteFooterServer />
    </>
  );
}
