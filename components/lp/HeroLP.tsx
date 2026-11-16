import Link from "next/link";
import FotoHome from "@/components/lp/FotoHome";

export default function HeroLP({
  titulo,
  subtitulo,
  botao,
  href,
}: {
  titulo: string;
  subtitulo: string;
  botao: string;
  href: string;
}) {
  return (
    <section className="lp-hero">
      <div className="lp-hero-texto">
        <span className="lp-etiqueta">Atacado LOLA</span>
        <h1 className="lp-hero-titulo">{titulo}</h1>
        <p className="lp-hero-sub">{subtitulo}</p>
        <div className="lp-hero-acoes">
          <Link href={href} className="home-cta home-cta--escuro">
            {botao}
          </Link>
          <Link href="#como-funciona" className="lp-link-sutil">
            Como funciona
          </Link>
        </div>
      </div>
      <FotoHome src="/home/hero.jpg" alt="Coleção LOLA" rotulo="Foto da coleção" className="lp-hero-foto" />
    </section>
  );
}
