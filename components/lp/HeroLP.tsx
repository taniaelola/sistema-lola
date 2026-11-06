import Link from "next/link";

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
      <div className="lp-hero-miolo">
        <span className="lp-etiqueta">ATACADO LOLA</span>
        <h1 className="lp-hero-titulo">{titulo}</h1>
        <p className="lp-hero-sub">{subtitulo}</p>
        <div>
          <Link href={href} className="home-cta home-cta--escuro">
            {botao}
          </Link>
        </div>
      </div>
    </section>
  );
}
