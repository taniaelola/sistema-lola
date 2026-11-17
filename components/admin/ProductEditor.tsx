"use client";

import { useState } from "react";
import type { Product, ProductColor, Categoria } from "@/lib/types";
import Drawer from "./Drawer";
import { confirmarDescarte, temAlteracoes } from "@/lib/admin-rascunho";
import {
  AVISO_SEM_PRECO,
  DICA_SOMENTE_BONUS,
  ativoInicialProduto,
  somenteBonusParaEnvio,
  validarProdutoBasico,
} from "@/lib/admin-produto";

import { slugify } from "@/lib/types";
import { saveProduct, fetchProducts } from "@/app/admin/actions";
import ProdutoCores from "./ProdutoCores";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  fontSize: 13.5,
  marginBottom: 6,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  letterSpacing: "0.04em",
  color: "var(--muted)",
  display: "block",
  marginBottom: 6,
};
const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  marginBottom: 14,
};

export default function ProductEditor({
  product,
  categorias,
  podeEditarPreco,
  podeExcluir,
  onChange,
  onDone,
}: {
  product: Product | null;
  categorias: Categoria[];
  /** false para o supervisor: preço, atacado e desconto ficam só leitura. */
  podeEditarPreco: boolean;
  /** false para o supervisor: não exclui cor nem tamanho. */
  podeExcluir: boolean;
  onChange: (list?: Product[]) => void;
  onDone: () => void;
}) {
  const [id, setId] = useState<string | null>(product?.id ?? null);
  const [nome, setNome] = useState(product?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(
    product?.categoria_id ?? categorias[0]?.id ?? ""
  );
  const [preco, setPreco] = useState(product?.preco?.toString() ?? "");
  const [precoAtacado, setPrecoAtacado] = useState(
    product?.preco_atacado != null ? String(product.preco_atacado) : ""
  );
  const [descricao, setDescricao] = useState(product?.descricao ?? "");
  const [caracteristicas, setCaracteristicas] = useState(
    (product?.caracteristicas ?? []).join("\n")
  );
  const [desconto, setDesconto] = useState(
    product?.desconto_percentual != null ? String(product.desconto_percentual) : ""
  );
  const [ativo, setAtivo] = useState(ativoInicialProduto(product, podeEditarPreco));
  const [destaque, setDestaque] = useState(product?.destaque ?? false);
  const [somenteBonus, setSomenteBonus] = useState(product?.somente_bonus ?? false);
  const [colors, setColors] = useState<ProductColor[]>(product?.colors ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atual = { nome, categoriaId, preco, precoAtacado, descricao, caracteristicas, desconto, ativo, destaque, somenteBonus };
  const [base, setBase] = useState(atual);

  const pctCategoria = categorias.find((c) => c.id === categoriaId)?.desconto_atacado_percentual ?? null;
  const calcados = categorias.filter((c) => c.grupo === "calcados");
  const acessorios = categorias.filter((c) => c.grupo === "acessorios");

  async function reloadColors(productId: string) {
    // Um único fetch: atualiza as cores locais e repassa a lista pro pai,
    // que reaproveita em vez de re-buscar.
    const all = await fetchProducts();
    const found = all.find((p) => p.id === productId);
    setColors(found?.colors ?? []);
    onChange(all);
  }

  async function handleSaveProduct() {
    const basico = validarProdutoBasico({
      nome,
      categoriaId,
      preco,
      ativo,
      podeEditarPreco,
      // Produto existente do supervisor chega com preco null (mascarado no banco): o banco valida a ativação.
      precoAtual: product ? (product.preco ?? null) : 0,
      precoAtacado,
      somenteBonus,
    });
    if (!basico.ok) {
      setError(basico.erro);
      return;
    }
    const precoNum = basico.preco;
    // Supervisor não edita preço: reenviamos o que já está gravado (o banco o preserva de qualquer forma).
    let descontoPercentual: number | null = podeEditarPreco ? null : product?.desconto_percentual ?? null;
    if (podeEditarPreco && desconto.trim()) {
      descontoPercentual = parseInt(desconto.trim(), 10);
      if (
        isNaN(descontoPercentual) ||
        descontoPercentual < 1 ||
        descontoPercentual > 99
      ) {
        setError("O desconto deve ser um número entre 1 e 99.");
        return;
      }
    }
    let precoAtacadoNum: number | null = podeEditarPreco ? null : product?.preco_atacado ?? null;
    if (podeEditarPreco && precoAtacado.trim()) {
      precoAtacadoNum = parseFloat(precoAtacado.replace(",", "."));
      if (isNaN(precoAtacadoNum) || precoAtacadoNum < 0) {
        setError("O preço de atacado deve ser um número válido.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveProduct({
        id,
        nome: nome.trim(),
        categoria_id: categoriaId,
        colecao: product?.colecao ?? "",
        preco: precoNum,
        descricao,
        caracteristicas: caracteristicas
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        ativo,
        destaque,
        ordem: product?.ordem ?? 0,
        slug: product?.slug || slugify(nome),
        desconto_percentual: descontoPercentual,
        preco_atacado: precoAtacadoNum,
        // Sempre reenviado: salvar uma edição nunca zera "Somente bônus".
        somente_bonus: somenteBonusParaEnvio(product, somenteBonus),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.id && !id) {
        setId(res.id);
      }
      setBase(atual);
      onChange();
    } catch {
      setError("Não foi possível salvar. Verifique sua internet e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      aberto
      largo
      kicker={id ? "EDITAR PRODUTO" : "NOVO PRODUTO"}
      titulo={id ? nome || product?.nome || "Produto" : "Cadastrar produto"}
      onFechar={onDone}
      confirmarFechar={() => confirmarDescarte(temAlteracoes(base, atual))}
    >
      <div>
      <div className="pe-passo-num">Passo 1</div>
      <h3 className="pe-passo-titulo">Dados do produto</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
          gap: 20,
          marginBottom: 6,
        }}
      >
        <div>
          <label style={labelStyle}>Nome do modelo</label>
          <input
            style={inputStyle}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Sandália Nula"
          />
        </div>
        <div>
          <label style={labelStyle}>Categoria</label>
          <select
            style={inputStyle}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {calcados.length > 0 && (
              <optgroup label="Calçados">
                {calcados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            )}
            {acessorios.length > 0 && (
              <optgroup label="Acessórios">
                {acessorios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 20 }}>
        {!podeEditarPreco && (
          <p role="note" style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)", margin: 0 }}>
            {AVISO_SEM_PRECO}
          </p>
        )}
        <div>
          <label style={labelStyle}>Preço (R$)</label>
          <input
            style={inputStyle}
            value={podeEditarPreco ? preco : ""}
            readOnly={!podeEditarPreco}
            disabled={!podeEditarPreco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder={podeEditarPreco ? "Ex: 249,90" : "Definido por um admin"}
          />
          <div style={hintStyle}>Preço de tabela (varejo).</div>
        </div>
        <div>
          <label style={labelStyle}>Preço de atacado (R$, opcional)</label>
          <input
            style={inputStyle}
            value={podeEditarPreco ? precoAtacado : ""}
            readOnly={!podeEditarPreco}
            disabled={!podeEditarPreco}
            onChange={(e) => setPrecoAtacado(e.target.value)}
            placeholder={podeEditarPreco ? "Ex: 179,90" : "Definido por um admin"}
          />
          <div style={hintStyle}>
            deixe vazio para usar o desconto de atacado da categoria{pctCategoria != null ? ` (hoje ${pctCategoria}%)` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 20 }}>
        <div>
          <label style={labelStyle}>Desconto de varejo (%, opcional)</label>
          <input
            style={inputStyle}
            value={podeEditarPreco ? desconto : ""}
            readOnly={!podeEditarPreco}
            disabled={!podeEditarPreco}
            onChange={(e) => setDesconto(e.target.value)}
            placeholder={podeEditarPreco ? "Ex: 30 (deixe em branco pra não aplicar)" : "Definido por um admin"}
          />
          <div style={hintStyle}>Aplica na vitrine sobre o preço de tabela.</div>
        </div>
        {podeEditarPreco &&
          desconto.trim() &&
          preco &&
          !isNaN(parseFloat(desconto.replace(",", "."))) &&
          !isNaN(parseFloat(preco.replace(",", "."))) && (
            <div>
              <label style={labelStyle}>Prévia na vitrine</label>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                De{" "}
                <span
                  style={{ textDecoration: "line-through", color: "var(--muted)" }}
                >
                  {parseFloat(preco.replace(",", ".")).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>{" "}
                por{" "}
                <strong>
                  {(
                    parseFloat(preco.replace(",", ".")) *
                    (1 - parseFloat(desconto.replace(",", ".")) / 100)
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </strong>
              </p>
            </div>
          )}
      </div>

      <label style={labelStyle}>Descrição</label>
      <textarea
        style={{ ...inputStyle, minHeight: 70, marginBottom: 14 }}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
      />

      <label style={labelStyle}>Características (uma por linha)</label>
      <textarea
        style={{ ...inputStyle, minHeight: 70, marginBottom: 14 }}
        value={caracteristicas}
        onChange={(e) => setCaracteristicas(e.target.value)}
        placeholder={"Ex: Couro legítimo\nSola em borracha antiderrapante"}
      />

      <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
        <label
          style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            checked={ativo}
            disabled={!podeEditarPreco && !id}
            onChange={(e) => setAtivo(e.target.checked)}
          />{" "}
          Ativo no site
        </label>
        <label
          style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            checked={destaque}
            onChange={(e) => setDestaque(e.target.checked)}
          />{" "}
          Marcar como destaque
        </label>
        <label
          style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}
        >
          <input
            type="checkbox"
            checked={somenteBonus}
            onChange={(e) => setSomenteBonus(e.target.checked)}
          />{" "}
          Somente bônus
        </label>
      </div>
      {somenteBonus && <p style={{ ...hintStyle, marginTop: -8 }}>{DICA_SOMENTE_BONUS}</p>}

      {error && (
        <p style={{ color: "#b23b3b", fontSize: 12.5, marginBottom: 14 }}>{error}</p>
      )}

      <button
        className="adm-btn adm-btn-primario"
        onClick={handleSaveProduct}
        disabled={saving}
        style={{ marginBottom: 28 }}
      >
        {saving ? "Salvando…" : id ? "Salvar alterações" : "Salvar e continuar para as cores →"}
      </button>

      <section className="pe-passo" aria-labelledby="pe-passo-2">
        <div className="pe-passo-num" id="pe-passo-2">
          Passo 2
        </div>
        {id ? (
          <ProdutoCores
            key={id}
            productId={id}
            colors={colors}
            podeExcluir={podeExcluir}
            onChange={() => reloadColors(id)}
          />
        ) : (
          <>
            <h3 className="pe-passo-titulo">Cores, fotos e estoque</h3>
            <p className="adm-dica" style={{ margin: 0 }}>
              Salve os dados do produto acima. Em seguida você escolhe a cor, sobe a foto e preenche o estoque
              dos tamanhos 36 a 40.
            </p>
          </>
        )}
      </section>
      </div>
    </Drawer>
  );
}
