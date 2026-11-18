// Cor de badge (swing tag) por status, usada nas telas do admin
// (Pedidos, Financeiro, Revendedores). Ver spec
// docs/superpowers/specs/2026-09-21-loja-lola-admin-dashboard-design.md.
export function corStatus(status: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    "Entregue": { bg: "var(--adm-success-bg)", text: "var(--adm-success-text)" },
    "Aprovado": { bg: "var(--adm-success-bg)", text: "var(--adm-success-text)" },
    "Pago": { bg: "var(--adm-success-bg)", text: "var(--adm-success-text)" },
    "Retirado": { bg: "var(--adm-success-bg)", text: "var(--adm-success-text)" },
    "Enviado": { bg: "var(--adm-purple-bg)", text: "var(--adm-purple-text)" },
    "Pronto para retirada": { bg: "var(--adm-purple-bg)", text: "var(--adm-purple-text)" },
    "Em preparação": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Preparando": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Em separação": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Pendente": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Cadastro pendente": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Aguardando pagamento": { bg: "var(--adm-orange-bg)", text: "var(--adm-orange-text)" },
    "Cancelado": { bg: "var(--adm-pink-bg)", text: "var(--adm-pink-text)" },
    "Recusado": { bg: "var(--adm-pink-bg)", text: "var(--adm-pink-text)" },
  };
  return map[status] ?? map["Pendente"];
}
