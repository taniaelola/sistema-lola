import "server-only";
import { redirect } from "next/navigation";
import { getLojaFlags } from "@/lib/loja-flags-server";
import { varejoDisponivel } from "@/lib/loja-rotas";

/** Guarda das rotas de varejo: com o varejo desligado (ou flags indisponíveis) manda para a Home. */
export async function exigirVarejo(): Promise<void> {
  if (!varejoDisponivel(await getLojaFlags())) redirect("/");
}
