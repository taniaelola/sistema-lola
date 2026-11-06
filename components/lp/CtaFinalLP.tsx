import Link from "next/link";

export default function CtaFinalLP({ titulo, botao, href }: { titulo: string; botao: string; href: string }) {
  return (
    <section className="lp-secao lp-final" aria-labelledby="lp-final-titulo">
      <h2 id="lp-final-titulo" className="lp-titulo">{titulo}</h2>
      <div>
        <Link href={href} className="home-cta home-cta--escuro">
          {botao}
        </Link>
      </div>
    </section>
  );
}
