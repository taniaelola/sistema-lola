"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Minus, Plus, X } from "lucide-react";
import type { ProductColor, ProductSize } from "@/lib/types";
import { deleteColor, deleteSize, saveColor, saveSize } from "@/app/admin/actions";
import {
  PALETA_CORES,
  adicionarTamanho,
  ajustarEstoque,
  gradePadrao,
  lerEstoque,
  totalEstoque,
  type LinhaTamanho,
} from "@/lib/admin-tamanhos";

// Limite por foto: base64 vai num campo text[] e a server action tem teto de 4 MB.
const MAX_IMG_BYTES = 1.5 * 1024 * 1024;

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/** Estoque com botões − e +, e campo para digitar. */
function Estoque({ valor, onChange, rotulo }: { valor: number; onChange: (n: number) => void; rotulo: string }) {
  return (
    <div className="pe-stepper" role="group" aria-label={`Estoque do tamanho ${rotulo}`}>
      <button
        type="button"
        aria-label={`Diminuir estoque do tamanho ${rotulo}`}
        disabled={valor <= 0}
        onClick={() => onChange(ajustarEstoque(valor, -1))}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        inputMode="numeric"
        value={valor}
        aria-label={`Quantidade em estoque do tamanho ${rotulo}`}
        onChange={(e) => onChange(lerEstoque(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" aria-label={`Aumentar estoque do tamanho ${rotulo}`} onClick={() => onChange(ajustarEstoque(valor, 1))}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Campo "+ tamanho" (ex.: 41, 35, P): usado na grade da cor nova e nas cores já salvas. */
function NovoTamanho({ onAdicionar }: { onAdicionar: (texto: string) => Promise<string | null> | string | null }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  async function adicionar() {
    const e = await onAdicionar(texto);
    setErro(e);
    if (!e) setTexto("");
  }
  return (
    <div>
      <div className="pe-novo-tam">
        <input
          className="adm-input"
          placeholder="Outro tamanho (ex.: 41)"
          value={texto}
          maxLength={10}
          aria-label="Outro tamanho"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void adicionar();
            }
          }}
        />
        <button type="button" className="adm-btn" onClick={() => void adicionar()}>
          + Tamanho
        </button>
      </div>
      {erro && (
        <p role="alert" className="pe-erro">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Tamanho já salvo: o estoque grava sozinho ~0,6 s depois do último clique. */
function TamanhoSalvo({
  size,
  podeExcluir,
  onRemovido,
}: {
  size: ProductSize;
  podeExcluir: boolean;
  onRemovido: () => void;
}) {
  const [estoque, setEstoque] = useState(size.estoque);
  const [estado, setEstado] = useState<"ok" | "salvando" | "erro">("ok");
  const gravado = useRef(size.estoque);
  const pendente = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function gravar(n: number) {
    const { error } = await saveSize({ id: size.id, color_id: size.color_id, tamanho: size.tamanho, estoque: n });
    if (!error) gravado.current = n;
    return !error;
  }

  function mudar(n: number) {
    setEstoque(n);
    pendente.current = n;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      pendente.current = null;
      if (n === gravado.current) {
        setEstado("ok");
        return;
      }
      setEstado("salvando");
      setEstado((await gravar(n)) ? "ok" : "erro");
    }, 600);
  }

  // Fechar o painel antes dos 0,6 s não perde a alteração.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const n = pendente.current;
      if (n !== null && n !== gravado.current) void gravar(n);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="pe-tam-linha">
      <span className="pe-tam-num">{size.tamanho}</span>
      <Estoque valor={estoque} onChange={mudar} rotulo={size.tamanho} />
      <span className="pe-tam-estado" role="status" aria-live="polite">
        {estado === "salvando" ? "salvando…" : estado === "erro" ? "não salvou" : estoque <= 0 ? "sem estoque" : ""}
      </span>
      {podeExcluir ? (
        <button
          type="button"
          className="pe-x"
          title="Remover tamanho"
          aria-label={`Remover o tamanho ${size.tamanho}`}
          onClick={async () => {
            const { error } = await deleteSize(size.id);
            if (error) {
              alert(`Não deu pra remover o tamanho: ${error}`);
              return;
            }
            onRemovido();
          }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function CorSalva({
  color,
  podeExcluir,
  onChange,
}: {
  color: ProductColor;
  podeExcluir: boolean;
  onChange: () => void;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <CorForm
        productId={color.product_id}
        existing={color}
        onDone={() => {
          setEditando(false);
          onChange();
        }}
        onCancel={() => setEditando(false)}
      />
    );
  }

  async function adicionarTamanho_(texto: string): Promise<string | null> {
    const atuais: LinhaTamanho[] = (color.sizes ?? []).map((s) => ({ tamanho: s.tamanho, estoque: s.estoque }));
    const r = adicionarTamanho(atuais, texto);
    if (r.erro) return r.erro;
    const tamanho = texto.trim().replace(/\s+/g, " ").slice(0, 10);
    const { error } = await saveSize({ id: null, color_id: color.id, tamanho, estoque: 0 });
    if (error) return `Não deu pra adicionar o tamanho: ${error}`;
    onChange();
    return null;
  }

  return (
    <div className="pe-cor">
      <div className="pe-cor-topo">
        <span className="pe-bolinha" style={{ background: color.hex || "#ccc" }} aria-hidden="true" />
        <strong>{color.nome}</strong>
        <span className="adm-dica">{color.imagens?.length ?? 0} foto(s)</span>
        <div className="pe-cor-acoes">
          <button type="button" className="adm-btn-mini" onClick={() => setEditando(true)}>
            Editar cor e fotos
          </button>
          {podeExcluir && (
            <button
              type="button"
              className="adm-btn-mini"
              style={{ color: "#b23b3b" }}
              onClick={async () => {
                if (!confirm(`Excluir a cor "${color.nome}"?`)) return;
                const { error } = await deleteColor(color.id);
                if (error) {
                  alert(`Não deu pra excluir a cor: ${error}`);
                  return;
                }
                onChange();
              }}
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {color.imagens?.length > 0 && (
        <div className="pe-fotos">
          {color.imagens.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={img} alt={`Foto ${i + 1} de ${color.nome}`} className="pe-foto" />
          ))}
        </div>
      )}

      <div className="pe-sub">Tamanhos e estoque</div>
      <div className="pe-tam-lista">
        {(color.sizes ?? []).length === 0 && <p className="adm-dica">Nenhum tamanho ainda. Adicione abaixo.</p>}
        {(color.sizes ?? []).map((s) => (
          <TamanhoSalvo key={s.id} size={s} podeExcluir={podeExcluir} onRemovido={onChange} />
        ))}
      </div>
      <NovoTamanho onAdicionar={adicionarTamanho_} />
    </div>
  );
}

/** Cor nova (com a grade 34–40) ou edição de nome, bolinha e fotos de uma cor existente. */
function CorForm({
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
  const [hex, setHex] = useState(existing?.hex ?? "#CDB89A");
  const [imagens, setImagens] = useState<string[]>(existing?.imagens ?? []);
  const [grade, setGrade] = useState<LinhaTamanho[]>(() => (existing ? [] : gradePadrao()));
  const [salvando, setSalvando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEscolherFotos(files: FileList | null) {
    if (!files) return;
    setErro(null);
    setProcessando(true);
    const novas: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMG_BYTES) {
        setErro(`A foto "${file.name}" é grande demais (máx. ~1,5 MB). Comprima antes de subir.`);
        continue;
      }
      try {
        novas.push(await lerComoDataUrl(file));
      } catch {
        setErro("Não foi possível processar uma das fotos. Tente novamente ou use outra foto.");
      }
    }
    setImagens((prev) => [...prev, ...novas]);
    setProcessando(false);
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro("Escolha ou digite o nome da cor.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const { error, id } = await saveColor({
        id: existing?.id ?? null,
        product_id: productId,
        nome: nome.trim(),
        hex,
        imagens,
        ordem: existing?.ordem ?? 0,
      });
      if (error || (!existing && !id)) {
        setErro(`Não foi possível salvar a cor: ${error ?? "tente de novo"}`);
        return;
      }
      if (!existing && id) {
        const falhas: string[] = [];
        for (const l of grade) {
          const r = await saveSize({ id: null, color_id: id, tamanho: l.tamanho, estoque: l.estoque });
          if (r.error) falhas.push(l.tamanho);
        }
        // A cor já existe: avisa e recarrega (um novo clique em Salvar duplicaria a cor).
        if (falhas.length > 0) alert(`Cor salva, mas não consegui criar os tamanhos: ${falhas.join(", ")}. Adicione-os na cor.`);
      }
      onDone();
    } catch {
      setErro("Não foi possível salvar a cor. Verifique sua internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pe-cor pe-cor-nova">
      <div className="pe-sub">1. Escolha a cor</div>
      <div className="pe-paleta" role="group" aria-label="Cores comuns">
        {PALETA_CORES.map((p) => (
          <button
            key={p.nome}
            type="button"
            className="pe-chip"
            aria-pressed={nome.trim().toLowerCase() === p.nome.toLowerCase()}
            onClick={() => {
              setNome(p.nome);
              setHex(p.hex);
            }}
          >
            <span className="pe-bolinha pe-bolinha-p" style={{ background: p.hex }} aria-hidden="true" />
            {p.nome}
          </button>
        ))}
      </div>
      <div className="pe-nome-cor">
        <input
          className="adm-input"
          placeholder="Ou digite o nome da cor (ex.: Creme)"
          value={nome}
          maxLength={60}
          aria-label="Nome da cor"
          onChange={(e) => setNome(e.target.value)}
        />
        <input
          type="color"
          value={hex}
          aria-label="Tom da cor"
          onChange={(e) => setHex(e.target.value)}
          className="pe-cor-input"
        />
      </div>

      <div className="pe-sub">2. Foto da cor</div>
      <label className="pe-upload">
        <ImagePlus size={22} aria-hidden="true" />
        <span>{processando ? "Processando…" : imagens.length > 0 ? "Adicionar mais fotos" : "Escolher fotos"}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={processando}
          onChange={(e) => {
            void aoEscolherFotos(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {imagens.length > 0 && (
        <div className="pe-fotos">
          {imagens.map((img, i) => (
            <div key={i} className="pe-foto-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`Foto ${i + 1}`} className="pe-foto" />
              <button
                type="button"
                className="pe-foto-x"
                aria-label={`Remover a foto ${i + 1}`}
                onClick={() => setImagens((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!existing && (
        <>
          <div className="pe-sub">3. Tamanhos e estoque</div>
          <div className="pe-tam-lista">
            {grade.map((l) => (
              <div key={l.tamanho} className="pe-tam-linha">
                <span className="pe-tam-num">{l.tamanho}</span>
                <Estoque
                  valor={l.estoque}
                  rotulo={l.tamanho}
                  onChange={(n) => setGrade((g) => g.map((x) => (x.tamanho === l.tamanho ? { ...x, estoque: n } : x)))}
                />
                <span className="pe-tam-estado">{l.estoque <= 0 ? "sem estoque" : ""}</span>
                <button
                  type="button"
                  className="pe-x"
                  title="Não trabalho com este tamanho"
                  aria-label={`Tirar o tamanho ${l.tamanho} da lista`}
                  onClick={() => setGrade((g) => g.filter((x) => x.tamanho !== l.tamanho))}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <NovoTamanho
            onAdicionar={(texto) => {
              const r = adicionarTamanho(grade, texto);
              if (!r.erro) setGrade(r.linhas);
              return r.erro;
            }}
          />
          <p className="adm-dica">Total: {totalEstoque(grade)} par(es) em {grade.length} tamanho(s).</p>
        </>
      )}

      {erro && (
        <p role="alert" className="pe-erro">
          {erro}
        </p>
      )}
      <div className="pe-rodape">
        <button type="button" className="adm-btn adm-btn-primario" onClick={() => void salvar()} disabled={salvando || processando}>
          {salvando ? "Salvando…" : existing ? "Salvar cor" : "Salvar esta cor"}
        </button>
        <button type="button" className="adm-btn" onClick={onCancel} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function ProdutoCores({
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
  // Produto sem cor abre direto o formulário da primeira cor.
  const [adicionando, setAdicionando] = useState(colors.length === 0);

  return (
    <div>
      <div className="pe-cores-topo">
        <h3>Cores, fotos e estoque</h3>
        {!adicionando && (
          <button type="button" className="adm-btn" onClick={() => setAdicionando(true)}>
            + Adicionar cor
          </button>
        )}
      </div>

      {colors.length === 0 && !adicionando && (
        <p className="adm-dica">Nenhuma cor cadastrada. Mesmo um modelo de cor única precisa de 1 cor, com foto e tamanhos.</p>
      )}

      {colors.map((c) => (
        <CorSalva key={c.id} color={c} podeExcluir={podeExcluir} onChange={onChange} />
      ))}

      {adicionando && (
        <CorForm
          productId={productId}
          onDone={() => {
            setAdicionando(false);
            onChange();
          }}
          onCancel={() => setAdicionando(false)}
        />
      )}
    </div>
  );
}
