import { carregarDadosHeader } from "@/lib/header-dados";
import AvisoBar from "@/components/home/AvisoBar";
import HeaderClient from "@/components/HeaderClient";

export default async function SiteHeader() {
  const dados = await carregarDadosHeader();
  return (
    <>
      <AvisoBar texto={dados.avisoTexto} ativo={dados.avisoAtivo} />
      <HeaderClient categorias={dados.categorias} perfil={dados.perfil} varejoAtivo={dados.varejoAtivo} />
    </>
  );
}
