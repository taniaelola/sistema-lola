import Link from "next/link";
import { notFound } from "next/navigation";
import ProdutoDetalhe from "@/components/atacado/ProdutoDetalhe";
import { carregarCarrinho, carregarProduto } from "../../dados";
import { exigirRevendedorAprovado } from "../../gate";

// No Next 16 `params` é uma Promise.
export default async function ProdutoAtacadoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await exigirRevendedorAprovado(`/atacado/produto/${encodeURIComponent(slug)}`);
  if (!g.ok) return g.gate;

  const [produto, carrinho] = await Promise.all([carregarProduto(g.db, slug), carregarCarrinho(g.db)]);
  if (produto === "inexistente") notFound();
  if (produto === "erro") {
    return <p className="atc-vazio">Não foi possível carregar este produto agora. Tente de novo em instantes.</p>;
  }

  const noCarrinho = (carrinho?.itens ?? []).map((i) => ({ size_id: i.size_id, quantidade: i.quantidade }));

  return (
    <div className="atc-pilha">
      <Link href="/atacado/catalogo" className="atc-link">
        ← Voltar ao catálogo
      </Link>
      <ProdutoDetalhe produto={produto} noCarrinho={noCarrinho} />
    </div>
  );
}
