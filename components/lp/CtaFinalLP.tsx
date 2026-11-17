import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CtaFinalLP({ botao, href }: { botao: string; href: string }) {
  return (
    <section className="lp-final" aria-labelledby="lp-final-titulo">
      <div className="lp-final-titulos">
        <span className="lp-etiqueta">Cadastro de revendedora</span>
        <h2 id="lp-final-titulo" className="lp-final-titulo">Sua vitrine com LOLA.</h2>
      </div>
      <div className="lp-final-lado">
        <p className="lp-final-texto">
          Cadastro com aprovação da nossa equipe. Aprovada, você acessa o catálogo com preço de atacado.
        </p>
        <Link href={href} className="home-cta home-cta--claro">
          {botao} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
