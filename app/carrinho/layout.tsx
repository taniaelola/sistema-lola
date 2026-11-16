import { exigirVarejo } from "@/lib/loja-rotas-server";

export const dynamic = "force-dynamic"; // a flag vem do banco: nunca prerenderizar

// /carrinho é um Client Component: o redirecionamento do varejo desligado fica neste layout de servidor.
export default async function CarrinhoLayout({ children }: { children: React.ReactNode }) {
  await exigirVarejo();
  return <>{children}</>;
}
