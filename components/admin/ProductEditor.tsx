"use client";

import { useRef, useState } from "react";
import type { Product, ProductColor, Categoria } from "@/lib/types";
import Drawer from "./Drawer";
import { confirmarDescarte, temAlteracoes } from "@/lib/admin-rascunho";
import {
  AVISO_SEM_PRECO,
  DICA_SOMENTE_BONUS,
  ativoInicialProduto,
  precoAtacadoEfetivo,
  somenteBonusParaEnvio,
  validarProdutoBasico,
} from "@/lib/admin-produto";
import { slugify } from "@/lib/types";
import { saveProduct, fetchProducts } from "@/app/admin/actions";
import ProdutoCores from "./ProdutoCores";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  /** false para o supervisor: o preço fica só leitura. */
  podeEditarPreco: boolean;
  /** false para o supervisor: não exclui cor nem tamanho. */
  podeExcluir: boolean;
  onChange: (list?: Product[]) => void;
  onDone: () => void;
}) {
  const [id, setId] = useState<string | null>(product?.id ?? null);
  const [nome, setNome] = useState(product?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(product?.categoria_id ?? categorias[0]?.id ?? "");
  const [preco, setPreco] = useState(product?.preco?.toString() ?? "");
  const [descricao, setDescricao] = useState(product?.descricao ?? "");
  const [ativo, setAtivo] = useState(ativoInicialProduto(product, podeEditarPreco));
  const [destaque, setDestaque] = useState(product?.destaque ?? false);
  const [somenteBonus, setSomenteBonus] = useState(product?.somente_bonus ?? false);
  const [colors, setColors] = useState<ProductColor[]>(product?.colors ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atual = { nome, categoriaId, preco, descricao, ativo, destaque, somenteBonus };
  const [base, setBase] = useState(atual);
  const passo2 = useRef<HTMLElement>(null);

  const pctCategoria = categorias.find((c) => c.id === categoriaId)?.desconto_atacado_percentual ?? null;
  const calcados = categorias.filter((c) => c.grupo === "calcados");
  const acessorios = categorias.filter((c) => c.grupo === "acessorios");

  // Prévia do preço de atacado que o revendedor verá (o valor real é calculado no banco).
  const precoNumero = parseFloat(preco.replace(",", "."));
  const previaAtacado =
    Number.isFinite(precoNumero) && precoNumero > 0
      ? precoAtacadoEfetivo(precoNumero, product?.preco_atacado ?? null, pctCategoria)
      : null;

  async function reloadColors(productId: string) {
    // Um único fetch: atualiza as cores locais e repassa a lista pro pai, que reaproveita em vez de re-buscar.
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
      somenteBonus,
    });
    if (!basico.ok) {
      setError(basico.erro);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const eraNovo = !id;
      const res = await saveProduct({
        id,
        nome: nome.trim(),
        categoria_id: categoriaId,
        colecao: product?.colecao ?? "",
        preco: basico.preco,
        descricao,
        // Campos tirados do formulário: o que já estava gravado é preservado.
        caracteristicas: product?.caracteristicas ?? [],
        ativo,
        destaque,
        ordem: product?.ordem ?? 0,
        slug: product?.slug || slugify(nome),
        desconto_percentual: product?.desconto_percentual ?? null,
        preco_atacado: product?.preco_atacado ?? null,
        // Sempre reenviado: salvar uma edição nunca zera "Somente bônus".
        somente_bonus: somenteBonusParaEnvio(product, somenteBonus),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.id && !id) setId(res.id);
      setBase(atual);
      onChange();
      if (eraNovo) setTimeout(() => passo2.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch {
      setError("Não foi possível salvar. Verifique sua internet e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      aberto
      centralizado
      kicker={id ? "EDITAR PRODUTO" : "NOVO PRODUTO"}
      titulo={id ? nome || product?.nome || "Produto" : "Cadastrar produto"}
      onFechar={onDone}
      confirmarFechar={() => confirmarDescarte(temAlteracoes(base, atual))}
    >
      <section className="pe-secao" aria-labelledby="pe-passo-1">
        <div className="pe-passo-num" id="pe-passo-1">
          Passo 1
        </div>
        <h3 className="pe-passo-titulo">Dados do produto</h3>

        {!podeEditarPreco && (
          <p role="note" className="adm-dica" style={{ margin: "0 0 12px" }}>
            {AVISO_SEM_PRECO}
          </p>
        )}

        <div className="pe-grade-campos">
          <div className="pe-campo pe-campo-largo">
            <label htmlFor="pe-nome">Nome do modelo</label>
            <input
              id="pe-nome"
              className="adm-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Sandália Nula"
            />
          </div>
          <div className="pe-campo">
            <label htmlFor="pe-categoria">Categoria</label>
            <select id="pe-categoria" className="adm-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
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
          <div className="pe-campo">
            <label htmlFor="pe-preco">Preço cheio (R$)</label>
            <input
              id="pe-preco"
              className="adm-input"
              inputMode="decimal"
              value={podeEditarPreco ? preco : ""}
              readOnly={!podeEditarPreco}
              disabled={!podeEditarPreco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder={podeEditarPreco ? "Ex: 249,90" : "Definido por um admin"}
            />
            <span className="adm-dica">
              {podeEditarPreco && previaAtacado !== null
                ? `Atacado (revendedora): ${brl(previaAtacado)}${
                    product?.preco_atacado != null ? " (preço próprio do produto)" : pctCategoria != null ? ` (${pctCategoria}% de desconto da categoria)` : ""
                  }`
                : "O preço de atacado é calculado sozinho, pelo desconto da categoria."}
            </span>
          </div>
        </div>

        <div className="pe-campo" style={{ marginTop: 14 }}>
          <label htmlFor="pe-descricao">Descrição</label>
          <textarea
            id="pe-descricao"
            className="adm-input"
            style={{ minHeight: 84, resize: "vertical" }}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Conte um pouco sobre o modelo"
          />
        </div>

        <div className="pe-opcoes">
          <label>
            <input type="checkbox" checked={ativo} disabled={!podeEditarPreco && !id} onChange={(e) => setAtivo(e.target.checked)} /> Ativo no site
          </label>
          <label>
            <input type="checkbox" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} /> Marcar como destaque
          </label>
          <label>
            <input type="checkbox" checked={somenteBonus} onChange={(e) => setSomenteBonus(e.target.checked)} /> Somente bônus
          </label>
        </div>
        {somenteBonus && <p className="adm-dica" style={{ margin: "8px 0 0" }}>{DICA_SOMENTE_BONUS}</p>}

        {error && (
          <p role="alert" className="pe-erro">
            {error}
          </p>
        )}

        <button className="adm-btn adm-btn-primario" onClick={handleSaveProduct} disabled={saving} style={{ marginTop: 16 }}>
          {saving ? "Salvando…" : id ? "Salvar alterações" : "Salvar e continuar para as cores →"}
        </button>
      </section>

      <section className="pe-passo" ref={passo2} aria-labelledby="pe-passo-2">
        <div className="pe-passo-num" id="pe-passo-2">
          Passo 2
        </div>
        {id ? (
          <ProdutoCores key={id} productId={id} colors={colors} podeExcluir={podeExcluir} onChange={() => reloadColors(id)} />
        ) : (
          <>
            <h3 className="pe-passo-titulo">Cores, fotos e estoque</h3>
            <p className="adm-dica" style={{ margin: 0 }}>
              Salve os dados do produto acima. Em seguida você escolhe a cor, sobe a foto e preenche o estoque dos tamanhos 34 a 40.
            </p>
          </>
        )}
      </section>
    </Drawer>
  );
}
