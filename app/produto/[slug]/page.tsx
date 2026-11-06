import { redirect } from "next/navigation";

// Site só atacado: a ficha de varejo saiu do ar. A leitura direta de products também
// (a tabela está fechada para anon). Religar o varejo exige uma nova migração e uma
// nova página de produto; até lá toda visita volta para a Home.
export default function ProdutoPage() {
  redirect("/");
}
