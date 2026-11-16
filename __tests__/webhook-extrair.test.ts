import { describe, it, expect } from "vitest";
import { parsePaymentId, valorPagoValido, classificarPagamentoJaRegistrado } from "@/lib/mp-webhook";

describe("parsePaymentId", () => {
  it("lê data.id da query", () => {
    expect(parsePaymentId(new URL("https://x/y?data.id=123&type=payment"), null)).toBe("123");
  });
  it("lê id da query quando não há topic", () => {
    expect(parsePaymentId(new URL("https://x/y?id=456"), null)).toBe("456");
  });
  it("lê do body JSON tipo payment", () => {
    expect(parsePaymentId(new URL("https://x/y"), { type: "payment", data: { id: 789 } })).toBe("789");
  });
  it("retorna null sem pistas", () => {
    expect(parsePaymentId(new URL("https://x/y"), null)).toBeNull();
  });
});

describe("valorPagoValido", () => {
  it("aceita número positivo", () => {
    expect(valorPagoValido(19.9)).toBe(19.9);
  });
  it.each([undefined, null, 0, -1, NaN, Infinity, "19.90", {}])("rejeita %s", (v) => {
    expect(valorPagoValido(v)).toBeNull();
  });
});

describe("classificarPagamentoJaRegistrado", () => {
  const ja = (extra: object) => ({ ok: true, already: true, ...extra });
  it("retentativa do mesmo pagamento não alerta", () => {
    expect(classificarPagamentoJaRegistrado(ja({ status_atual: "pago", mp_payment_id_registrado: "10" }), "10")).toBeNull();
  });
  it("segundo pagamento em pedido pago alerta", () => {
    expect(classificarPagamentoJaRegistrado(ja({ status_atual: "pago", mp_payment_id_registrado: "10" }), "11")).toBe(
      "pagamento_duplicado"
    );
  });
  it("pedido cancelado alerta, mesmo sem pagamento registrado", () => {
    expect(classificarPagamentoJaRegistrado(ja({ status_atual: "cancelado", mp_payment_id_registrado: null }), "12")).toBe(
      "pedido_cancelado"
    );
  });
  it("sem 'already' ou sem as chaves novas não alerta", () => {
    expect(classificarPagamentoJaRegistrado({ ok: true }, "1")).toBeNull();
    expect(classificarPagamentoJaRegistrado(ja({}), "1")).toBeNull();
    expect(classificarPagamentoJaRegistrado(null, "1")).toBeNull();
  });
});
