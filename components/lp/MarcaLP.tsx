import Link from "next/link";
import FotoHome from "@/components/lp/FotoHome";

// Bloco editorial da marca. Texto fixo (não editável no admin).
export default function MarcaLP() {
  return (
    <section className="lp-marca" aria-labelledby="lp-marca-titulo">
      <FotoHome
        src="/home/marca.jpg"
        alt="Detalhe de um calçado LOLA"
        className="lp-marca-foto"
      />
      <div className="lp-marca-texto">
        <span className="lp-etiqueta">A marca</span>
        <h2 id="lp-marca-titulo" className="lp-marca-titulo">Charme que sai da vitrine.</h2>
        <p>
          Moda feminina brasileira, elegante no detalhe e fácil de usar no dia a dia. Peças que a sua cliente reconhece
          de longe.
        </p>
        <Link href="#destaque" className="lp-link" style={{ alignSelf: "flex-start" }}>
          Conheça a coleção
        </Link>
      </div>
    </section>
  );
}
