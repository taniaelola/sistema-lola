import { MIN_PECAS_ATACADO } from "@/lib/pricing";

const PASSOS = [
  { titulo: "Faça seu cadastro", texto: "Leva poucos minutos. Conte quem você é e onde você vende." },
  { titulo: "A loja aprova", texto: "Nossa equipe analisa cada cadastro e libera o seu acesso." },
  {
    titulo: "Compre no catálogo",
    texto: `Preço de atacado em todos os produtos. Mínimo de ${MIN_PECAS_ATACADO} peças por compra, com retirada na loja.`,
  },
];

export default function PassosLP() {
  return (
    <section id="como-funciona" className="lp-secao lp-passos-secao" aria-labelledby="lp-passos-titulo">
      <h2 id="lp-passos-titulo" className="lp-titulo">Como funciona</h2>
      <ol className="lp-passos">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="lp-passo">
            <span className="lp-passo-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="lp-passo-titulo">{p.titulo}</span>
            <span className="lp-passo-texto">{p.texto}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
