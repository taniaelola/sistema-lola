import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MIN_PECAS_ATACADO } from "@/lib/pricing";
import HeroVideo from "@/components/lp/HeroVideo";

export default function HeroLP({
  titulo,
  subtitulo,
  botao,
  href,
  mostrarEntrar,
}: {
  titulo: string;
  subtitulo: string;
  botao: string;
  href: string;
  mostrarEntrar: boolean;
}) {
  return (
    <section className="lp-hero">
      <div className="lp-hero-midia">
        <HeroVideo src="/home/hero.mp4" />
      </div>
      <div className="lp-hero-texto">
        <span className="lp-etiqueta">Atacado para revendedoras</span>
        <h1 className="lp-hero-titulo">{titulo}</h1>
        <p className="lp-hero-sub">{subtitulo}</p>
        <div className="lp-hero-acoes">
          <Link href={href} className="home-cta home-cta--escuro">
            {botao} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {mostrarEntrar && (
            <Link href="/entrar" className="lp-link-suave">
              Já sou revendedora
            </Link>
          )}
        </div>
        <span className="lp-hero-nota">Mínimo de {MIN_PECAS_ATACADO} peças por compra · retirada na loja</span>
      </div>
    </section>
  );
}
