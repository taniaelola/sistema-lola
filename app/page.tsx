import { getTextos } from "@/lib/textos";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";
import HeroRevendedora from "@/components/home/HeroRevendedora";
import BannerRevendedora from "@/components/home/BannerRevendedora";

export const revalidate = 0;

// Provisória: a landing de revendedores (Task 8c) substitui esta página. Enquanto isso a Home
// não consulta produtos nem categorias (tabelas fechadas para anon) e só mostra o convite à revenda.
export default async function Home() {
  const textos = await getTextos();
  return (
    <>
      <SiteHeader />
      <HeroRevendedora textos={textos} />
      <BannerRevendedora textos={textos} />
      <SiteFooterServer />
    </>
  );
}
