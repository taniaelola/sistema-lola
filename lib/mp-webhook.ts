// Helper puro do webhook Mercado Pago. Sem `import "server-only"` de propósito:
// sem I/O nem segredos, testável em ambiente node (Vitest) e importado por
// `app/api/webhook/mercadopago/route.ts` (que puxa `lib/mercadopago`, este sim
// `server-only`).

/**
 * Extração pura do payment id — sem `req` nem I/O.
 * Regras (do reference): `data.id`/`id` da query quando não há `type`/`topic`
 * ou quando ele é `"payment"`; senão `body.type === "payment" && body.data.id`;
 * senão `null`.
 */
export function parsePaymentId(url: URL, body: unknown): string | null {
  const queryId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const topic = url.searchParams.get("type") ?? url.searchParams.get("topic");

  if (queryId && (!topic || topic === "payment")) {
    return queryId;
  }

  const b = body as { type?: string; data?: { id?: unknown } } | null;
  if (b?.type === "payment" && b?.data?.id) {
    return String(b.data.id);
  }

  return null;
}

/**
 * Valor pago consultado no Mercado Pago, pronto para `p_transaction_amount` (obrigatório no RPC).
 * Só número finito e positivo vale; qualquer outra coisa vira `null` e o webhook não chama o RPC.
 */
export function valorPagoValido(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;
}
