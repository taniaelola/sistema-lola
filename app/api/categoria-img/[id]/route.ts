import { supabase } from "@/lib/supabase";
import { idCategoriaValido, respostaImagem } from "@/lib/imagem";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!idCategoriaValido(id)) return new Response(null, { status: 404 });
  try {
    // A tabela categorias está fechada para anon: a imagem sai pela RPC (null = inativa ou inexistente).
    const { data, error } = await supabase().rpc("get_categoria_imagem", { p_id: id });
    if (error || typeof data !== "string" || !data) return new Response(null, { status: 404 });
    return respostaImagem(data, request.headers.get("if-none-match"));
  } catch {
    return new Response(null, { status: 404 });
  }
}
