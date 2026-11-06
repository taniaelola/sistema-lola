import Link from "next/link";
import { BRAND } from "@/lib/brand.config";
import { destinoAjuda, type CategoriaNav } from "@/lib/header-menu";
import { TEXTOS_PADRAO } from "@/lib/textos";

export default function RodapeView({
  textos,
  categorias,
  varejoAtivo = false,
}: {
  textos: Record<string, string>;
  categorias: CategoriaNav[];
  varejoAtivo?: boolean;
}) {
  const t = (chave: string) => textos[chave] ?? TEXTOS_PADRAO[chave] ?? "";
  const ajuda = [1, 2, 3].map((n) => ({
    n,
    texto: t(`rodape.ajuda${n}_texto`),
    destino: destinoAjuda(textos[`rodape.ajuda${n}_link`], BRAND.whatsappUrl),
  }));

  return (
    <footer className="site-footer" id="sobre">
      <div className="site-footer-grid">
        <div className="site-footer-col" style={{ gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lola-logo.png" alt={BRAND.nome} className="site-footer-logo" />
          <p className="site-footer-desc">{t("rodape.descricao")}</p>
          <div className="site-footer-selo">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink-soft)"
              strokeWidth={1.4}
              width={16}
              height={16}
              style={{ flex: "none" }}
              aria-hidden="true"
            >
              <path d="M12 3l7 3.5v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-5L12 3z" />
            </svg>
            <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.3 }}>
              Compra segura
              <br />
              Parceria oficial{" "}
              <span style={{ fontWeight: 800, color: "#009ee3" }}>
                mercado<span style={{ color: "#2d3277" }}>pago</span>
              </span>
            </span>
          </div>
        </div>

        {varejoAtivo && (
          <div className="site-footer-col">
            <span className="site-footer-rotulo">LOJA</span>
            {categorias.map((c) => (
              <Link key={c.slug} href={`/#cat-${c.slug}`}>
                {c.nome}
              </Link>
            ))}
            <Link href="/#lancamentos">Lançamentos</Link>
          </div>
        )}

        <div className="site-footer-col">
          <span className="site-footer-rotulo">AJUDA</span>
          {ajuda.map((a) =>
            a.destino.tipo === "nova-aba" ? (
              <a key={a.n} href={a.destino.href} target="_blank" rel="noopener noreferrer">
                {a.texto}
              </a>
            ) : a.destino.tipo === "simples" ? (
              <a key={a.n} href={a.destino.href}>
                {a.texto}
              </a>
            ) : (
              <Link key={a.n} href={a.destino.href}>
                {a.texto}
              </Link>
            )
          )}
        </div>

        <div className="site-footer-col">
          <span className="site-footer-rotulo">CONTA</span>
          <Link href="/entrar">Entrar</Link>
          <Link href="/entrar?modo=revendedor">Seja revendedora</Link>
        </div>
      </div>
      <div className="site-footer-copy">{`© ${new Date().getFullYear()} ${BRAND.nome}`}</div>
    </footer>
  );
}
