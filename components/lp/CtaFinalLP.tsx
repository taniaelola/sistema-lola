import Link from "next/link";

export default function CtaFinalLP({ titulo, botao, href }: { titulo: string; botao: string; href: string }) {
  return (
    <section className="lp-final" aria-labelledby="lp-final-titulo">
      <div className="lp-final-miolo">
        <h2 id="lp-final-titulo" className="lp-titulo">{titulo}</h2>
        <Link href={href} className="home-cta home-cta--claro">
          {botao}
        </Link>
      </div>
    </section>
  );
}
