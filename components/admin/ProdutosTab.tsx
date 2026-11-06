"use client";

import type { Product } from "@/lib/types";
import { capaImagem, totalEstoque } from "@/lib/types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Supervisor (sem permissão de preço) não vê preço, desconto nem Live: só o cadastro.
const COLS_COMPLETAS = "1.6fr 1fr 100px 100px 80px 70px 70px 60px 90px";
const COLS_SEM_PRECO = "1.6fr 1fr 80px 70px 70px";

export default function ProdutosTab({
  products,
  podeEditarPreco,
  busyId,
  descontoOpenId,
  descontoInput,
  onNovoProduto,
  onEditar,
  onToggleAtivo,
  onToggleDestaque,
  onToggleSurpresa,
  onDescontoToggle,
  onDescontoChange,
  onDescontoSalvar,
  onDescontoRemover,
  onExcluir,
  subTab,
  onSubTab,
}: {
  products: Product[];
  podeEditarPreco: boolean;
  busyId: string | null;
  descontoOpenId: string | null;
  descontoInput: string;
  onNovoProduto: () => void;
  onEditar: (id: string) => void;
  onToggleAtivo: (p: Product) => void;
  onToggleDestaque: (p: Product) => void;
  onToggleSurpresa: (p: Product) => void;
  onDescontoToggle: (p: Product) => void;
  onDescontoChange: (v: string) => void;
  onDescontoSalvar: (id: string) => void;
  onDescontoRemover: (id: string) => void;
  onExcluir: (p: Product) => void;
  subTab: "produtos" | "categorias";
  onSubTab: (t: "produtos" | "categorias") => void;
}) {
  const cols = podeEditarPreco ? COLS_COMPLETAS : COLS_SEM_PRECO;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 4 }}>
          <button onClick={() => onSubTab("produtos")} style={{ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: subTab === "produtos" ? "var(--peach)" : "transparent", color: subTab === "produtos" ? "var(--ink)" : "var(--adm-text-secondary)" }}>Produtos</button>
          <button onClick={() => onSubTab("categorias")} style={{ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: subTab === "categorias" ? "var(--peach)" : "transparent", color: subTab === "categorias" ? "var(--ink)" : "var(--adm-text-secondary)" }}>Categorias</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--adm-text-secondary)" }}>{products.length} produtos cadastrados</span>
          <button onClick={onNovoProduto} style={{ background: "var(--peach)", color: "var(--ink)", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Cadastrar produto</button>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: podeEditarPreco ? 980 : 560, padding: "14px 20px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)", letterSpacing: "0.04em", borderBottom: "1px solid var(--line)" }}>
          <div>PRODUTO</div><div>CATEGORIA</div>
          {podeEditarPreco && (<><div>VAREJO</div><div>ATACADO</div></>)}
          <div>ESTOQUE</div><div>VISÍVEL</div><div>DESTAQUE</div>
          {podeEditarPreco && (<><div>LIVE</div><div>DESCONTO</div></>)}
        </div>
        {products.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--adm-text-secondary)" }}>
            Nenhum produto cadastrado ainda. Clique em &quot;Cadastrar produto&quot; pra começar.
          </div>
        ) : (
          products.map((p) => {
            const estoque = totalEstoque(p);
            const capa = capaImagem(p);
            const busy = busyId === p.id;
            return (
              <div key={p.id}>
                <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: podeEditarPreco ? 980 : 560, padding: "14px 20px", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <button onClick={() => onEditar(p.id)} title="Editar produto" style={{ width: 44, height: 44, borderRadius: 10, flex: "none", overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: "var(--bg)" }}>
                      {capa && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={capa} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </button>
                    <button onClick={() => onEditar(p.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nome}
                    </button>
                    {p.somente_bonus && (
                      <span style={{ flex: "none", fontSize: 10.5, fontFamily: "var(--font-mono)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px", color: "var(--adm-text-secondary)" }}>BÔNUS</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--adm-text-secondary)" }}>{p.categoria?.nome ?? "—"}</div>
                  {podeEditarPreco && (
                    <>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{brl(p.preco)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--adm-purple-text)" }}>{brl(p.preco_atacado ?? Math.round(p.preco * 0.5))}</div>
                    </>
                  )}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: estoque <= 5 ? "var(--adm-pink-text)" : "var(--ink)" }}>{estoque}</div>
                  <div><input type="checkbox" className="swtoggle" checked={p.ativo} disabled={busy} onChange={() => onToggleAtivo(p)} /></div>
                  <div><input type="checkbox" className="swtoggle" checked={p.destaque} disabled={busy} onChange={() => onToggleDestaque(p)} /></div>
                  {podeEditarPreco && (
                    <>
                      <div><input type="checkbox" className="swtoggle" checked={p.surpresa_ativo} disabled={busy} onChange={() => onToggleSurpresa(p)} /></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => onDescontoToggle(p)} style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: p.desconto_percentual != null ? "var(--adm-orange-bg)" : "var(--bg)", color: p.desconto_percentual != null ? "var(--adm-orange-text)" : "var(--adm-text-secondary)", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                          {p.desconto_percentual != null ? `-${p.desconto_percentual}%` : "—"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {podeEditarPreco && descontoOpenId === p.id && (
                  <div style={{ padding: "0 20px 16px 76px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
                    <label style={{ fontSize: 12, color: "var(--adm-text-secondary)" }}>Desconto de varejo (%):</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={descontoInput}
                      onChange={(e) => onDescontoChange(e.target.value)}
                      placeholder="Ex: 30"
                      style={{ width: 80, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12.5 }}
                    />
                    <button onClick={() => onDescontoSalvar(p.id)} disabled={busy} style={{ background: "var(--peach)", color: "var(--ink)", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {busy ? "Salvando…" : "Salvar"}
                    </button>
                    {p.desconto_percentual != null && (
                      <button onClick={() => onDescontoRemover(p.id)} disabled={busy} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>
                        Remover
                      </button>
                    )}
                    <button onClick={() => onExcluir(p)} disabled={busy} style={{ marginLeft: "auto", background: "none", border: "1px solid var(--adm-pink-text)", color: "var(--adm-pink-text)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: busy ? "wait" : "pointer" }}>
                      Excluir produto
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
