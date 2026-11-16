export default function RegrasLP({
  titulo,
  skus,
  bonus,
  seloBonus = "+1",
  preco,
}: {
  titulo: string;
  skus: string;
  bonus: string | null;
  seloBonus?: string;
  preco: string;
}) {
  const cartoes = [
    { chave: "skus", destaque: "12", rotulo: "modelos", texto: skus },
    ...(bonus ? [{ chave: "bonus", destaque: seloBonus, rotulo: "bônus", texto: bonus }] : []),
    { chave: "preco", destaque: "R$", rotulo: "atacado", texto: preco },
  ];
  return (
    <section className="lp-secao" aria-labelledby="lp-regras-titulo">
      <h2 id="lp-regras-titulo" className="lp-titulo">{titulo}</h2>
      <ul className="lp-regras">
        {cartoes.map((c) => (
          <li key={c.chave} className="lp-regra">
            <span className="lp-regra-marca" aria-hidden="true">
              <strong>{c.destaque}</strong>
              <small>{c.rotulo}</small>
            </span>
            <p>{c.texto}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
