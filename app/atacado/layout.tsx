import type { Metadata } from "next";
import type { ReactNode } from "react";
import { authedSupabase, exigirPapel } from "@/lib/auth";
import { BRAND } from "@/lib/brand.config";
import { DEMO } from "@/lib/demo-catalogo";
import AtacadoShell from "@/components/atacado/AtacadoShell";
import GateStatus from "@/components/atacado/GateStatus";
import { carregarCadastro, carregarCarrinho } from "./dados";

export const metadata: Metadata = {
  title: `Atacado — ${BRAND.nome}`,
  robots: { index: false, follow: false },
};

export default async function AtacadoLayout({ children }: { children: ReactNode }) {
  if (DEMO) return <AtacadoShell nome="Revendedora Demo" pecas={0}>{children}</AtacadoShell>;
  const perfil = await exigirPapel(["revendedor"], "/atacado");
  const db = await authedSupabase();
  const cadastro = await carregarCadastro(db);

  if (!cadastro) return <GateStatus estado="sem-cadastro" />;
  if (cadastro.status === "pendente") return <GateStatus estado="pendente" />;
  if (cadastro.status === "recusado") return <GateStatus estado="recusado" />;

  const carrinho = await carregarCarrinho(db);
  return (
    <AtacadoShell nome={perfil.nome || cadastro.razao_social} pecas={carrinho?.pecas ?? 0}>
      {children}
    </AtacadoShell>
  );
}
