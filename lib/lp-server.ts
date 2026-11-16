import "server-only";
import { supabase } from "@/lib/supabase";
import { DEMO, PRODUTOS_DEMO, precosDemo } from "@/lib/demo-catalogo";
import { selecionarAmostra, type AmostraLP } from "@/lib/lp";

// Vitrine pública da landing: só o RPC anônimo get_destaques_atacado (tabelas do catálogo fechadas).
// Qualquer falha => [] e a seção não renderiza. Em demo local (LOLA_DEMO=1, nunca em produção)
// usa os produtos fictícios, sem tocar no Supabase.
export async function getAmostraLP(): Promise<AmostraLP[]> {
  if (DEMO) {
    return selecionarAmostra(
      PRODUTOS_DEMO.slice(0, 8).map((p) => ({
        id: p.id,
        slug: p.slug ?? p.id,
        nome: p.nome,
        imagem: p.colors?.[0]?.imagens?.[0] ?? null,
        preco_varejo: p.preco,
        preco_atacado: precosDemo(p).precoAtacado,
      }))
    );
  }
  try {
    const { data, error } = await supabase().rpc("get_destaques_atacado");
    if (error) return [];
    return selecionarAmostra(data);
  } catch {
    return [];
  }
}
