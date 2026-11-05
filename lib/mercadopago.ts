import "server-only";

// Access Token de PRODUÇÃO da conta Mercado Pago da Loja LOLA.
// Vem de uma variável de ambiente (configurada nas variáveis do Worker na Cloudflare),
// nunca fica escrito no código-fonte. Este arquivo tem "server-only" e
// só é importado por Server Actions / Route Handlers, então esse valor
// nunca é enviado pro navegador do visitante.
function getAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "MP_ACCESS_TOKEN não configurado. Adicione essa variável de ambiente nas variáveis do Worker na Cloudflare (Settings → Variables and secrets)."
    );
  }
  return token;
}

const MP_API = "https://api.mercadopago.com";

// Helpers puros vivem num módulo sem `server-only` para serem testáveis em
// ambiente node; reexportados aqui para que consumidores possam importar de
// qualquer um dos dois arquivos.
export { montarBackUrls, mapFormaPagamento, montarItensMP, resolverOrigem } from "./mercadopago-utils";
export type { ItemPreferencia } from "./mercadopago-utils";
import { montarBackUrls, type ItemPreferencia } from "./mercadopago-utils";

export type CriarPreferenciaInput = {
  itens: ItemPreferencia[];
  externalReference: string;
  origin: string; // ex: https://lolaonline.com.br
  successPath?: string; // ex: /pedido/<id> — pra onde o cliente volta depois de pagar
};

export async function criarPreferencia(input: CriarPreferenciaInput) {
  const backUrls = montarBackUrls(input.origin, input.successPath ?? "/");
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: input.itens.map((item) => ({
        title: item.titulo,
        quantity: item.quantidade,
        unit_price: item.precoUnitario,
        currency_id: "BRL",
      })),
      external_reference: input.externalReference,
      payment_methods: {
        // A loja decidiu oferecer só Pix e cartão de crédito no checkout —
        // excluímos o resto (boleto, débito, cartão pré-pago, caixa
        // eletrônico, outras carteiras digitais). Pix não tem um "id"
        // próprio pra excluir: no Brasil ele é do tipo payment_type_id
        // "bank_transfer", que não entra nesta lista.
        // OBS: "account_money" (saldo em conta Mercado Pago) não pode ser
        // excluído — o Mercado Pago recusa a criação da preferência inteira
        // se ele aparecer aqui. Por isso não incluímos esse id na lista,
        // mesmo que o ideal fosse também escondê-lo.
        excluded_payment_types: [
          { id: "ticket" }, // boleto
          { id: "atm" }, // pagamento em caixa eletrônico
          { id: "debit_card" }, // cartão de débito
          { id: "prepaid_card" }, // cartão pré-pago
          { id: "digital_wallet" }, // outras carteiras digitais
        ],
      },
      back_urls: backUrls,
      // "all" (não só "approved") garante que o cliente volta pra loja
      // automaticamente também quando o pagamento fica pendente ou é
      // recusado — sempre cai em /pedido/<id>, que mostra o status certo.
      auto_return: "all",
      notification_url: `${input.origin}/api/webhook/mercadopago`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago recusou a criação da preferência: ${text}`);
  }

  const data = await res.json();
  return data as { id: string; init_point: string; sandbox_init_point: string };
}

export async function buscarPagamento(paymentId: string) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao buscar pagamento ${paymentId} no Mercado Pago: ${text}`);
  }
  return res.json() as Promise<{
    id: number;
    status: string;
    external_reference: string | null;
    transaction_amount: number;
    payment_method_id: string | null;
    payment_type_id: string | null;
  }>;
}
