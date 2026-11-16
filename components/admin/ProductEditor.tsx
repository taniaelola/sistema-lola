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

// Limite de tamanho por foto: base64 vai num campo text[], e a server action
// tem teto de 4 MB. ~1,5 MB por arquivo mantém a linha enxuta.
const MAX_IMG_BYTES = 1.5 * 1024 * 1024;
import { slugify } from "@/lib/types";
import {
  saveProduct,
  saveColor,
  deleteColor,
  saveSize,
  deleteSize,
  fetchProducts,
} from "@/app/admin/actions";

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
        className="btn"
        onClick={handleSaveProduct}
        disabled={saving}
        style={{ marginBottom: 34 }}
      >
        {saving ? "Salvando…" : id ? "Salvar alterações" : "Criar produto"}
      </button>

      {id ? (
        <ColorsManager
          productId={id}
          colors={colors}
          podeExcluir={podeExcluir}
          onChange={() => reloadColors(id)}
        />
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Crie o produto acima pra depois adicionar cores, fotos e tamanhos.
        </p>
      )}
      </div>
    </Drawer>
  );
}

function ColorsManager({
  productId,
  colors,
  podeExcluir,
  onChange,
}: {
  productId: string;
  colors: ProductColor[];
  podeExcluir: boolean;
  onChange: () => void;
}) {
  const [addingColor, setAddingColor] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 26 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Cores, fotos e tamanhos</h3>
        <button
          onClick={() => setAddingColor(true)}
          style={{
            fontSize: 12,
            border: "1px solid var(--line)",
            background: "none",
            padding: "7px 12px",
            cursor: "pointer",
          }}
        >
          + Adicionar cor
        </button>
      </div>

      {colors.length === 0 && !addingColor && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
          Nenhuma cor cadastrada. Mesmo um modelo &quot;cor única&quot; precisa de 1
          cor cadastrada, com foto e tamanhos.
        </p>
      )}

      {colors.map((c) => (
        <ColorRow key={c.id} color={c} podeExcluir={podeExcluir} onChange={onChange} />
      ))}

      {addingColor && (
        <ColorForm
          productId={productId}
          onDone={() => {
            setAddingColor(false);
            onChange();
          }}
          onCancel={() => setAddingColor(false)}
        />
      )}
    </div>
  );
}

function ColorRow({
  color,
  podeExcluir,
  onChange,
}: {
  color: ProductColor;
  podeExcluir: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingSize, setAddingSize] = useState(false);
  const [tamanho, setTamanho] = useState("");
  const [estoque, setEstoque] = useState("0");

  async function handleAddSize() {
    if (!tamanho.trim()) return;
    const { error } = await saveSize({
      id: null,
      color_id: color.id,
      tamanho: tamanho.trim(),
      estoque: parseInt(estoque, 10) || 0,
    });
    if (error) {
      alert(`Não deu pra adicionar o tamanho: ${error}`);
      return;
    }
    setTamanho("");
    setEstoque("0");
    setAddingSize(false);
    onChange();
  }

  async function updateEstoque(sizeId: string, tam: string, novoEstoque: number) {
    const { error } = await saveSize({
      id: sizeId,
      color_id: color.id,
      tamanho: tam,
      estoque: novoEstoque,
    });
    if (error) {
      alert(`Não deu pra atualizar o estoque: ${error}`);
      return;
    }
    onChange();
  }

  if (editing) {
    return (
      <ColorForm
        productId={color.product_id}
        existing={color}
        onDone={() => {
          setEditing(false);
          onChange();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div style={{ border: "1px solid var(--line)", padding: 16, marginBottom: 14 }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: color.hex || "#ccc",
            boxShadow: "0 0 0 1px var(--line)",
          }}
        />
        <strong style={{ fontSize: 14 }}>{color.nome}</strong>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {color.imagens?.length ?? 0} foto(s)
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11.5,
              border: "1px solid var(--line)",
              background: "none",
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            Editar cor/fotos
          </button>
          {podeExcluir && (
          <button
            onClick={async () => {
              if (confirm(`Excluir a cor "${color.nome}"?`)) {
                const { error } = await deleteColor(color.id);
                if (error) {
                  alert(`Não deu pra excluir a cor: ${error}`);
                  return;
                }
                onChange();
              }
            }}
            style={{
              fontSize: 11.5,
              border: "1px solid var(--line)",
              background: "none",
              padding: "5px 10px",
              cursor: "pointer",
              color: "#b23b3b",
            }}
          >
            Excluir
          </button>
          )}
        </div>
      </div>

      {color.imagens?.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {color.imagens.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img}
              alt=""
              style={{
                width: 50,
                height: 50,
                objectFit: "cover",
                border: "1px solid var(--line)",
              }}
            />
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
        Tamanhos e estoque
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}
      >
        {(color.sizes ?? []).map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--line)",
              padding: "4px 4px 4px 10px",
            }}
          >
            <span style={{ fontSize: 12.5 }}>{s.tamanho}</span>
            <input
              type="number"
              min={0}
              defaultValue={s.estoque}
              onBlur={(e) =>
                updateEstoque(s.id, s.tamanho, parseInt(e.target.value, 10) || 0)
              }
              style={{
                width: 52,
                padding: "4px 6px",
                border: "1px solid var(--line)",
                fontSize: 12,
              }}
            />
            {podeExcluir && (
            <button
              onClick={async () => {
                const { error } = await deleteSize(s.id);
                if (error) {
                  alert(`Não deu pra remover o tamanho: ${error}`);
                  return;
                }
                onChange();
              }}
              style={{
                background: "none",
                border: "none",
                color: "#b23b3b",
                cursor: "pointer",
                fontSize: 13,
                padding: "0 4px",
              }}
              title="Remover tamanho"
            >
              ×
            </button>
            )}
          </div>
        ))}
      </div>

      {addingSize ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Tam. (ex: 37)"
            value={tamanho}
            onChange={(e) => setTamanho(e.target.value)}
            style={{
              width: 90,
              padding: "6px 8px",
              border: "1px solid var(--line)",
              fontSize: 12.5,
            }}
          />
          <input
            placeholder="Estoque"
            type="number"
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
            style={{
              width: 70,
              padding: "6px 8px",
              border: "1px solid var(--line)",
              fontSize: 12.5,
            }}
          />
          <button
            onClick={handleAddSize}
            style={{
              fontSize: 12,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#fff",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Adicionar
          </button>
          <button
            onClick={() => setAddingSize(false)}
            style={{
              fontSize: 12,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
            }}
          >
            cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingSize(true)}
          style={{
            fontSize: 12,
            border: "1px dashed var(--line)",
            background: "none",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          + tamanho
        </button>
      )}
    </div>
  );
}

// Lê o arquivo escolhido como data: URL (base64) para guardar direto no
// registro da cor — sem upload de storage nesta fase.
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function ColorForm({
  productId,
  existing,
  onDone,
  onCancel,
}: {
  productId: string;
  existing?: ProductColor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState(existing?.nome ?? "");
  const [hex, setHex] = useState(existing?.hex ?? "#B08D55");
  const [imagens, setImagens] = useState<string[]>(existing?.imagens ?? []);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    setProcessing(true);
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMG_BYTES) {
        alert("Imagem muito grande (máx ~1,5 MB). Comprima antes de subir.");
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        setImagens((prev) => [...prev, dataUrl]);
      } catch {
        setError(
          "Não foi possível processar uma das fotos. Tente novamente ou use outra foto."
        );
      }
    }
    setProcessing(false);
  }

  async function handleSave() {
    if (!nome.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await saveColor({
        id: existing?.id ?? null,
        product_id: productId,
        nome: nome.trim(),
        hex,
        imagens,
        ordem: existing?.ordem ?? 0,
      });
      if (error) {
        setError(`Não foi possível salvar a cor: ${error}`);
        return;
      }
      onDone();
    } catch {
      setError(
        "Não foi possível salvar a cor. Verifique sua internet e tente de novo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--ink-soft)", padding: 16, marginBottom: 14 }}>
      <div
        style={{ display: "flex", gap: 14, marginBottom: 12, alignItems: "center" }}
      >
        <input
          placeholder="Nome da cor (ex: Creme)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          style={{
            flex: 1,
            padding: "9px 11px",
            border: "1px solid var(--line)",
            fontSize: 13,
          }}
        />
        <input
          type="color"
          value={hex ?? "#B08D55"}
          onChange={(e) => setHex(e.target.value)}
          style={{
            width: 40,
            height: 36,
            border: "1px solid var(--line)",
            padding: 2,
          }}
        />
      </div>

      <label
        style={{
          fontSize: 11.5,
          color: "var(--muted)",
          display: "block",
          marginBottom: 8,
        }}
      >
        Fotos dessa cor
      </label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        disabled={processing}
        style={{ fontSize: 12.5, marginBottom: 12 }}
      />
      {processing && (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Processando foto…
        </p>
      )}
      {error && (
        <p style={{ fontSize: 12, color: "#b23b3b", marginBottom: 12 }}>{error}</p>
      )}

      {imagens.length > 0 && (
        <div
          style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
        >
          {imagens.map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt=""
                style={{
                  width: 60,
                  height: 60,
                  objectFit: "cover",
                  border: "1px solid var(--line)",
                }}
              />
              <button
                onClick={() =>
                  setImagens((prev) => prev.filter((_, idx) => idx !== i))
                }
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  background: "#b23b3b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  fontSize: 11,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn"
          onClick={handleSave}
          disabled={saving || processing}
          style={{ padding: "10px 22px", fontSize: 12 }}
        >
          {saving ? "Salvando…" : "Salvar cor"}
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: "var(--muted)",
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          cancelar
        </button>
      </div>
    </div>
  );
}
