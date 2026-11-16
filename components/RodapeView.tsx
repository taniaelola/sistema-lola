import Link from "next/link";
import { Lock, MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand.config";
import { MIN_PECAS_ATACADO } from "@/lib/pricing";
import type { CategoriaNav } from "@/lib/header-menu";

export default function RodapeView({
  categorias,
  varejoAtivo = false,
}: {
  textos?: Record<string, string>;
  categorias: CategoriaNav[];
  varejoAtivo?: boolean;
}) {
  return (
    <footer className="site-footer" id="sobre">
      <div className={varejoAtivo ? "site-footer-grid site-footer-grid--5" : "site-footer-grid"}>
        <div className="site-footer-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lola-logo.png" alt={BRAND.nome} className="site-footer-logo" />
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
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/#como-funciona">Mínimo de {MIN_PECAS_ATACADO} peças</Link>
          <Link href="/#como-funciona">Retirada na loja</Link>
        </div>

        <div className="site-footer-col">
          <span className="site-footer-rotulo">CONTA</span>
          <Link href="/entrar">Entrar</Link>
          <Link href="/entrar?modo=revendedor">Seja revendedora</Link>
          <Link href="/atacado/catalogo">Catálogo</Link>
        </div>

        <div className="site-footer-col">
          <span className="site-footer-rotulo">ATENDIMENTO</span>
          <a href={BRAND.whatsappUrl} target="_blank" rel="noopener noreferrer" className="site-footer-wpp">
            <MessageCircle size={20} aria-hidden="true" /> Falar no WhatsApp
          </a>
        </div>
      </div>
      <div className="site-footer-copy">
        <span>{`© ${new Date().getFullYear()} ${BRAND.nome} · Venda exclusiva para revendedoras`}</span>
        <span>
          <Lock size={16} aria-hidden="true" /> Pagamento seguro
        </span>
      </div>
    </footer>
  );
}
