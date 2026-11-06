import "server-only";
import { supabase } from "@/lib/supabase";
import { FLAGS_SEGURAS, parseLojaFlags, type LojaFlags } from "@/lib/loja-flags";

/** Server-only: chama o RPC get_loja_flags com o cliente anônimo; qualquer falha => FLAGS_SEGURAS. */
export async function getLojaFlags(): Promise<LojaFlags> {
  try {
    const { data, error } = await supabase().rpc("get_loja_flags");
    if (error) return FLAGS_SEGURAS;
    return parseLojaFlags(data);
  } catch {
    return FLAGS_SEGURAS;
  }
}
