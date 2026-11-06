import { describe, it, expect } from "vitest";
import { parsePaymentId, valorPagoValido } from "@/lib/mp-webhook";

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
