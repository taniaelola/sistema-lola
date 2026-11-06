import Link from "next/link";
import { authedSupabase, exigirPapel } from "@/lib/auth";
import type { ItemCarrinhoAtacado } from "@/lib/checkout";
import SiteHeader from "@/components/SiteHeader";
import SiteFooterServer from "@/components/SiteFooterServer";
import { exigirVarejo } from "@/lib/loja-rotas-server";
import CheckoutVarejo from "./CheckoutVarejo";
import CheckoutAtacado from "./CheckoutAtacado";

const CAMINHO_ATACADO = "/checkout?modo=atacado";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { modo } = await searchParams;
  // Ramo de varejo só existe com o varejo ligado; o de atacado segue para revendedoras aprovadas.
  if (modo !== "atacado") {
    await exigirVarejo();
    return <CheckoutVarejo />;
  }

  await exigirPapel(["revendedor"], CAMINHO_ATACADO);
  const db = await authedSupabase();
  const { data, error } = await db.rpc("atacado_cart_get");

  if (error || !data) {
    const naoAprovado = (error?.message ?? "").includes("revendedor não aprovado");
    if (!naoAprovado) console.error("atacado_cart_get falhou:", error);
    return (
      <>
        <SiteHeader />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 760, textAlign: "center", padding: "40px 0" }}>
            <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 22 }}>
              {naoAprovado
                ? "Seu cadastro de revendedor ainda não está aprovado ou está inativo. Assim que for aprovado, o checkout de atacado fica disponível."
                : "Não consegui carregar seu carrinho de atacado agora. Tenta de novo em instantes."}
            </p>
            <Link href="/atacado" className="btn">
              Voltar para o atacado
            </Link>
          </div>
        </section>
        <SiteFooterServer />
      </>
    );
  }

  const resumo = data as { itens?: ItemCarrinhoAtacado[]; total?: number };
  const itens = (resumo.itens ?? []).map((i) => ({
    ...i,
    quantidade: Number(i.quantidade),
    preco_unit: Number(i.preco_unit),
    subtotal: Number(i.subtotal),
    estoque: Number(i.estoque),
  }));

  return <CheckoutAtacado itens={itens} total={Number(resumo.total ?? 0)} />;
}
