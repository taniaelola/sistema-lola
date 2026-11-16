import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessao: vi.fn(async () => ({ accessToken: "t", userId: "u" })) }));
vi.mock("@/lib/supabase", () => ({ supabaseComToken: () => ({ rpc }) }));
vi.mock("@/app/atacado/dados", () => ({
  cadastroAprovado: vi.fn(async () => true),
  registrarErro: vi.fn(),
}));

import { addAoCarrinho } from "@/app/atacado/actions";

const PID = "11111111-1111-4111-8111-111111111111";
const COR = "22222222-2222-4222-8222-222222222222";
const TAM = "33333333-3333-4333-8333-333333333333";
const OUTRA_COR = "44444444-4444-4444-8444-444444444444";
const OUTRO_TAM = "55555555-5555-4555-8555-555555555555";

function produto(estoque: number) {
  return {
    id: PID,
    slug: "tenis-lola",
    nome: "Tênis",
    preco_varejo: 100,
    preco_atacado: 60,
    cores: [{ id: COR, nome: "Rosa", tamanhos: [{ id: TAM, tamanho: "36", estoque }] }],
  };
}

function carrinho(quantidade: number | null) {
  return {
    itens:
      quantidade === null
        ? []
        : [
            {
              id: "i1",
              product_id: PID,
              color_id: COR,
              size_id: TAM,
              quantidade,
              preco_unit: 60,
            },
          ],
  };
}

function configurar(estoque: number, noCarrinho: number | null) {
  rpc.mockImplementation(async (nome: string) => {
    if (nome === "get_produto_revendedor") return { data: produto(estoque), error: null };
    if (nome === "atacado_cart_get") return { data: carrinho(noCarrinho), error: null };
    if (nome === "atacado_cart_set_item") return { data: null, error: null };
    return { data: null, error: { message: `rpc inesperado ${nome}` } };
  });
}

function chamadasSetItem() {
  return rpc.mock.calls.filter(([nome]) => nome === "atacado_cart_set_item");
}

describe("addAoCarrinho", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("rejeita cor que não pertence ao produto do slug, sem gravar", async () => {
    configurar(5, null);
    const r = await addAoCarrinho("tenis-lola", OUTRA_COR, TAM);
    expect(r.error).not.toBeNull();
    expect(chamadasSetItem()).toHaveLength(0);
  });

  it("rejeita tamanho que não pertence à cor, sem gravar", async () => {
    configurar(5, null);
    const r = await addAoCarrinho("tenis-lola", COR, OUTRO_TAM);
    expect(r.error).not.toBeNull();
    expect(chamadasSetItem()).toHaveLength(0);
  });

  it("rejeita ids que não são UUID e slug inválido antes de consultar o banco", async () => {
    configurar(5, null);
    expect((await addAoCarrinho("tenis-lola", "x", TAM)).error).not.toBeNull();
    expect((await addAoCarrinho("tenis lola", COR, TAM)).error).not.toBeNull();
    expect((await addAoCarrinho("", COR, TAM)).error).not.toBeNull();
    expect((await addAoCarrinho("a".repeat(201), COR, TAM)).error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("aceita slug com acento e maiúsculas (a existência é do banco)", async () => {
    configurar(5, null);
    expect((await addAoCarrinho("Sandália_01", COR, TAM)).error).toBeNull();
  });

  it("usa o estoque do get_produto_revendedor e grava 1 no carrinho vazio", async () => {
    configurar(3, null);
    const r = await addAoCarrinho("tenis-lola", COR, TAM);
    expect(r.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("get_produto_revendedor", { p_slug: "tenis-lola" });
    expect(chamadasSetItem()).toEqual([
      ["atacado_cart_set_item", { p_product_id: PID, p_color_id: COR, p_size_id: TAM, p_quantidade: 1 }],
    ]);
  });

  it("soma 1 à linha existente enquanto houver estoque", async () => {
    configurar(3, 2);
    const r = await addAoCarrinho("tenis-lola", COR, TAM);
    expect(r.error).toBeNull();
    expect(chamadasSetItem()[0][1]).toMatchObject({ p_quantidade: 3 });
  });

  it("limita a quantidade ao estoque: já no limite, recusa e não grava", async () => {
    configurar(3, 3);
    const r = await addAoCarrinho("tenis-lola", COR, TAM);
    expect(r.error).toMatch(/estoque/i);
    expect(chamadasSetItem()).toHaveLength(0);
  });

  it("estoque zero recusa o primeiro item", async () => {
    configurar(0, null);
    const r = await addAoCarrinho("tenis-lola", COR, TAM);
    expect(r.error).toMatch(/estoque/i);
    expect(chamadasSetItem()).toHaveLength(0);
  });
});
