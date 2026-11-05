import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buscarPagamento, mapFormaPagamento } from "@/lib/mercadopago";
import { BRAND } from "@/lib/brand.config";
import { parsePaymentId } from "@/lib/mp-webhook";

export const dynamic = "force-dynamic";

// Espelha `getAccessToken()` de `lib/mercadopago.ts`: falha alto e claro se a
// env var não estiver configurada, em vez de mandar `undefined` pra RPC.
function getWebhookSecret(): string {
  const secret = process.env.ADMIN_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_WEBHOOK_SECRET não configurado. Adicione essa variável de ambiente nas variáveis do Worker na Cloudflare (Settings → Variables and secrets)."
    );
  }
  return secret;
}

type OrderItemNotificacao = {
  produto_nome: string;
  produto_cor: string | null;
  produto_tamanho: string | null;
  quantidade: number;
};

async function extrairPaymentId(req: NextRequest): Promise<string | null> {
  const url = new URL(req.url);
  const body = await req.json().catch(() => null);
  return parsePaymentId(url, body);
}

async function notificarVenda(orderId: string, origin: string) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.warn("NTFY_TOPIC não configurado — pulei a notificação de venda.");
    return;
  }
  try {
    const { data, error } = await supabase().rpc("public_get_order", { p_id: orderId });
    if (error || !data) {
      console.error("notificarVenda: public_get_order falhou", error);
      return;
    }

    const pedido = data as {
      cliente_nome: string;
      valor_total: number;
      entrega_tipo: string;
      items: OrderItemNotificacao[];
    };

    const entregaLabel =
      pedido.entrega_tipo === "retirada"
        ? "Retirada na loja"
        : pedido.entrega_tipo === "entrega_fora"
        ? "Entrega fora da cidade"
        : "Entrega na cidade";

    const itensTexto = (pedido.items ?? [])
      .map((i) => {
        const detalhe = [i.produto_cor, i.produto_tamanho].filter(Boolean).join(" ");
        return `• ${i.quantidade}x ${i.produto_nome}${detalhe ? ` (${detalhe})` : ""}`;
      })
      .join("\n");

    const valorFormatado = Number(pedido.valor_total).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const corpo = `${pedido.cliente_nome} — ${valorFormatado}\n${itensTexto}\n${entregaLabel}`;

    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: `Nova venda — ${BRAND.nome}`,
        Tags: "moneybag",
        Priority: "high",
        Click: `${origin}/admin`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: corpo,
    });
  } catch (e) {
    // Notificação é best-effort — nunca deve derrubar o registro da venda.
    console.error("notificarVenda (ntfy) falhou:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const origin = new URL(req.url).origin;
    const paymentId = await extrairPaymentId(req);
    if (!paymentId) {
      return NextResponse.json({ ok: true, skipped: "sem payment id" });
    }

    const pagamento = await buscarPagamento(paymentId);

    if (pagamento.status !== "approved") {
      return NextResponse.json({ ok: true, status: pagamento.status });
    }

    let ref: { order_id?: string } = {};
    try {
      ref = JSON.parse(pagamento.external_reference ?? "{}");
    } catch {
      // referência mal formada, segue sem dados extras
    }

    if (!ref.order_id) {
      return NextResponse.json({ ok: true, skipped: "sem order_id" });
    }

    const { data: rpcData, error } = await supabase().rpc("mp_register_order_payment", {
      p_secret: getWebhookSecret(),
      p_order_id: ref.order_id,
      p_mp_payment_id: String(pagamento.id),
      p_forma_pagamento: mapFormaPagamento(pagamento.payment_method_id, pagamento.payment_type_id),
      p_transaction_amount: pagamento.transaction_amount,
    });

    if (error) {
      console.error("mp_register_order_payment falhou:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const resultado = rpcData as { ok?: boolean; reason?: string } | null;
    if (resultado && resultado.ok === false) {
      // Underpayment (C1) ou outra recusa legítima: 200 pra o MP parar de
      // retentar; o warning no Postgres + o pedido seguir `pendente` é o sinal.
      console.error(
        "mp_register_order_payment recusou o pagamento:",
        resultado.reason,
        "— pedido",
        ref.order_id
      );
      return NextResponse.json({ ok: false, reason: resultado.reason }, { status: 200 });
    }

    await notificarVenda(ref.order_id, origin);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Mercado Pago falhou:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
