"use client";

import { useId, useState } from "react";
import type { Categoria } from "@/lib/types";
import { slugify } from "@/lib/types";
import { saveCategoria, deleteCategoria } from "@/app/admin/actions";
import {
  LIMITE_ARQUIVO_CATEGORIA,
  QUALIDADE_JPEG_CATEGORIA,
  dimensoesCategoria,
  validarImagemCategoria,
  validarTipoImagemCategoria,
} from "@/lib/admin-categoria-imagem";

function lerArquivo(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
    img.src = src;
  });
}

async function prepararImagemCategoria(arquivo: File): Promise<string> {
  const erroTipo = validarTipoImagemCategoria(arquivo.type);
  if (erroTipo) throw new Error(erroTipo);
  if (arquivo.size > LIMITE_ARQUIVO_CATEGORIA) {
    throw new Error("Esse arquivo é grande demais. Use uma imagem de até 15 MB.");
  }
  const img = await carregarImagem(await lerArquivo(arquivo));
  const { largura, altura } = dimensoesCategoria(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(img, 0, 0, largura, altura);
  const uri = canvas.toDataURL("image/jpeg", QUALIDADE_JPEG_CATEGORIA);
  const erro = validarImagemCategoria(uri);
  if (erro) throw new Error(erro);
  return uri;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 13.5,
  marginBottom: 6,
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  letterSpacing: "0.04em",
  color: "var(--adm-text-secondary)",
  display: "block",
  marginBottom: 6,
};
const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--adm-text-secondary)",
  marginBottom: 14,
};

const GRUPO_LABEL: Record<Categoria["grupo"], string> = {
  calcados: "Calçados",
  acessorios: "Acessórios",
};

type FormState = {
  id: string | null;
  grupo: "calcados" | "acessorios";
  nome: string;
  slug: string;
  ordem: string;
  ativo: boolean;
  desconto: string;
  imagem?: string | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  grupo: "calcados",
  nome: "",
  slug: "",
  ordem: "0",
  ativo: true,
  desconto: "",
  imagem: null,
};

function fromCategoria(c: Categoria): FormState {
  return {
    id: c.id,
    grupo: c.grupo,
    nome: c.nome,
    slug: c.slug,
    ordem: String(c.ordem),
    ativo: c.ativo,
    desconto:
      c.desconto_atacado_percentual != null
        ? String(c.desconto_atacado_percentual)
        : "",
    imagem: c.imagem,
  };
}

export default function CategoriasTab({
  categorias,
  podeEditarPreco,
  podeExcluir,
  onChange,
}: {
  categorias: Categoria[];
  /** false para o supervisor: o desconto de atacado da categoria fica oculto (o banco o preserva). */
  podeEditarPreco: boolean;
  /** false para o supervisor: não exclui categoria. */
  podeExcluir: boolean;
  onChange: () => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lendoImagem, setLendoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState<string | null>(null);
  const imagemId = useId();

  const grupos: Categoria["grupo"][] = ["calcados", "acessorios"];

  function openNova() {
    setForm({ ...EMPTY_FORM });
  }

  function openEditar(c: Categoria) {
    setForm(fromCategoria(c));
  }

  function fecharForm() {
    setForm(null);
    setErroImagem(null);
  }

  async function aoEscolherImagem(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroImagem(null);
    setLendoImagem(true);
    try {
      const uri = await prepararImagemCategoria(arquivo);
      setForm((f) => (f ? { ...f, imagem: uri } : f));
    } catch (e) {
      setErroImagem(e instanceof Error ? e.message : "Não foi possível usar essa imagem.");
    } finally {
      setLendoImagem(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    if (!form.nome.trim()) {
      alert("Informe o nome da categoria.");
      return;
    }
    const ordemNum = parseInt(form.ordem, 10);
    if (isNaN(ordemNum) || ordemNum < 0) {
      alert("A ordem deve ser um número maior ou igual a zero.");
      return;
    }
    let desconto: number | null = null;
    if (podeEditarPreco && form.desconto.trim()) {
      desconto = parseInt(form.desconto.trim(), 10);
      if (isNaN(desconto) || desconto < 0 || desconto > 100) {
        alert("O desconto de atacado deve ser um número entre 0 e 100.");
        return;
      }
    }
    const erroDaImagem = validarImagemCategoria(form.imagem);
    if (erroDaImagem) {
      setErroImagem(erroDaImagem);
      return;
    }
    const slug = form.slug.trim() || slugify(form.nome);
    setSaving(true);
    const { error } = await saveCategoria({
      id: form.id,
      grupo: form.grupo,
      nome: form.nome.trim(),
      slug,
      ordem: ordemNum,
      ativo: form.ativo,
      desconto_atacado_percentual: desconto,
      imagem: form.imagem,
    });
    setSaving(false);
    if (error) {
      alert(`Não deu pra salvar a categoria: ${error}`);
      return;
    }
    setForm(null);
    onChange();
  }

  async function handleDelete(c: Categoria) {
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    setBusyId(c.id);
    const { error } = await deleteCategoria(c.id);
    setBusyId(null);
    if (error) {
      alert(error);
      return;
    }
    onChange();
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          Categorias ({categorias.length})
        </h2>
        {!form && (
          <button
            onClick={openNova}
            style={{
              background: "var(--peach)",
              color: "var(--ink)",
              border: "none",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Nova categoria
          </button>
        )}
      </div>

      {form && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 20,
            marginBottom: 28,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            {form.id ? "Editar categoria" : "Nova categoria"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            <div>
              <label style={labelStyle}>Grupo</label>
              <select
                style={inputStyle}
                value={form.grupo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    grupo: e.target.value as "calcados" | "acessorios",
                  })
                }
              >
                <option value="calcados">Calçados</option>
                <option value="acessorios">Acessórios</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                style={inputStyle}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Bota"
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            <div>
              <label style={labelStyle}>Slug (opcional)</label>
              <input
                style={inputStyle}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="deixe vazio para gerar do nome"
              />
              <div style={hintStyle}>
                gerado automaticamente do nome quando em branco
              </div>
            </div>
            <div>
              <label style={labelStyle}>Ordem</label>
              <input
                type="number"
                min={0}
                style={inputStyle}
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: e.target.value })}
              />
              <div style={hintStyle}>menor aparece primeiro na vitrine</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            {podeEditarPreco && (
            <div>
              <label style={labelStyle}>
                Desconto de atacado (%, opcional)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                style={inputStyle}
                value={form.desconto}
                onChange={(e) =>
                  setForm({ ...form, desconto: e.target.value })
                }
                placeholder="Ex: 30"
              />
              <div style={hintStyle}>usado no preço de atacado (Fase 3)</div>
            </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor={imagemId} style={labelStyle}>
              Imagem da categoria
            </label>
            <div className="adm-img-categoria">
              {form.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imagem} alt="Prévia da imagem da categoria" className="adm-img-categoria-previa" />
              ) : (
                <div className="adm-img-categoria-previa" aria-hidden="true" />
              )}
              <input
                id={imagemId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={lendoImagem}
                onChange={(e) => {
                  void aoEscolherImagem(e.target.files?.[0]);
                  e.target.value = "";
                }}
                aria-describedby={imagemId + "-dica"}
              />
              {form.imagem && (
                <button
                  type="button"
                  className="adm-btn-mini"
                  onClick={() => {
                    setErroImagem(null);
                    setForm({ ...form, imagem: null });
                  }}
                >
                  Remover imagem
                </button>
              )}
            </div>
            <div id={imagemId + "-dica"} style={hintStyle}>
              {lendoImagem ? "Processando a imagem…" : "JPG, PNG ou WebP. A imagem é reduzida para até 800 px de largura."}
            </div>
            <div aria-live="polite">
              {erroImagem && (
                <div role="alert" className="adm-erro">
                  {erroImagem}
                </div>
              )}
            </div>
          </div>

          <label
            style={{
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />{" "}
            Ativa
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving || lendoImagem}
              style={{
                background: "var(--peach)",
                color: "var(--ink)",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Criar categoria"}
            </button>
            <button
              onClick={fecharForm}
              style={{
                background: "none",
                border: "none",
                color: "var(--adm-text-secondary)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              cancelar
            </button>
          </div>
        </div>
      )}

      {categorias.length === 0 ? (
        <p style={{ color: "var(--adm-text-secondary)", fontSize: 13.5 }}>
          Nenhuma categoria cadastrada ainda.
        </p>
      ) : (
        grupos.map((grupo) => {
          const doGrupo = categorias
            .filter((c) => c.grupo === grupo)
            .sort((a, b) => a.ordem - b.ordem);
          if (doGrupo.length === 0) return null;
          return (
            <div key={grupo} style={{ marginBottom: 28 }}>
              <h3
                style={{
                  fontSize: 13,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--adm-text-secondary)",
                  marginBottom: 10,
                }}
              >
                {GRUPO_LABEL[grupo]}
              </h3>
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                {doGrupo.map((c) => {
                  const busy = busyId === c.id;
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        flexWrap: "wrap",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {c.nome}{" "}
                          {!c.ativo && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--adm-text-secondary)",
                                fontWeight: 400,
                              }}
                            >
                              (inativa)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--adm-text-secondary)" }}>
                          /{c.slug} · ordem {c.ordem} · ativa:{" "}
                          {c.ativo ? "sim" : "não"}
                          {podeEditarPreco
                            ? ` · atacado: ${c.desconto_atacado_percentual != null ? `${c.desconto_atacado_percentual}%` : "—"}`
                            : ""}{" "}
                          · imagem: {c.imagem ? "sim" : "não"}
                        </div>
                      </div>
                      <button
                        onClick={() => openEditar(c)}
                        disabled={busy}
                        style={{
                          background: "none",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                      {podeExcluir && (
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={busy}
                        style={{
                          background: "none",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 12,
                          cursor: busy ? "wait" : "pointer",
                          color: "var(--adm-pink-text)",
                        }}
                      >
                        Excluir
                      </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
