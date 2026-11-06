import { carregarDadosRodape } from "@/lib/header-dados";
import RodapeView from "@/components/RodapeView";

export default async function SiteFooterServer() {
  const { textos, categorias, varejoAtivo } = await carregarDadosRodape();
  return <RodapeView textos={textos} categorias={categorias} varejoAtivo={varejoAtivo} />;
}
