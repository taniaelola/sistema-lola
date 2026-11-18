import CarrinhoView from "@/components/atacado/CarrinhoView";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { MIN_PECAS_ATACADO } from "@/lib/pricing";
import { carregarCadastro, carregarCarrinho } from "../dados";
import { exigirRevendedorAprovado } from "../gate";

export default async function CarrinhoAtacadoPage() {
  const g = await exigirRevendedorAprovado("/atacado/carrinho");
  if (!g.ok) return g.gate;
  const [carrinho, flags, cadastro] = await Promise.all([
    carregarCarrinho(g.db),
    getLojaFlags(),
    carregarCadastro(g.db),
  ]);

  if (!carrinho) {
    return <p className="atc-vazio">Não foi possível carregar seu carrinho agora. Tente de novo em instantes.</p>;
  }
  return (
    <CarrinhoView
      itens={carrinho.itens}
      total={carrinho.total}
      minimo={cadastro?.premium ? 0 : MIN_PECAS_ATACADO}
      bonus={{
        ativo: flags.bonusAtivo,
        minPecas: flags.bonusMinPecas,
        quantidade: flags.bonusQuantidade,
        produtoNome: flags.bonusProdutoNome,
      }}
    />
  );
}
