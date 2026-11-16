import FotoHome from "@/components/lp/FotoHome";

// Bloco editorial da marca. Texto fixo (não editável no admin).
export default function MarcaLP() {
  return (
    <section className="lp-marca" aria-labelledby="lp-marca-titulo">
      <FotoHome src="/home/marca.jpg" alt="Sandálias LOLA" rotulo="Foto da marca" className="lp-marca-foto" />
      <div className="lp-marca-texto">
        <span className="lp-etiqueta">A marca</span>
        <h2 id="lp-marca-titulo" className="lp-titulo">
          Calçados para <em>encantar</em> quem compra e render para quem vende.
        </h2>
        <p>
          Modelos pensados para girar rápido na sua loja ou nas suas vendas, com preço de atacado que deixa uma margem
          de verdade para você.
        </p>
      </div>
    </section>
  );
}
