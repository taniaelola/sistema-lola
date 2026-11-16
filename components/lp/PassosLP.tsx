export default function PassosLP({ titulo, passos }: { titulo: string; passos: string[] }) {
  return (
    <section id="como-funciona" className="lp-secao" aria-labelledby="lp-passos-titulo">
      <h2 id="lp-passos-titulo" className="lp-titulo">{titulo}</h2>
      <ol className="lp-passos">
        {passos.map((p, i) => (
          <li key={i} className="lp-passo">
            <span className="lp-passo-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <p>{p}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
