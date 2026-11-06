"use client";

import { useState } from "react";
import { saveConfig, salvarLojaConfig } from "@/app/admin/actions";
import type { Product } from "@/lib/types";
import {
  AVISO_VAREJO,
  lojaConfigDe,
  produtosBrinde,
  validarLojaConfig,
  type ConfigAdmin,
} from "@/lib/admin-config";

type Config = ConfigAdmin | null;

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
  color: "var(--adm-text-secondary)",
  display: "block",
  marginBottom: 6,
};
const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--adm-text-secondary)",
  marginBottom: 14,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  padding: 20,
  marginBottom: 28,
  maxWidth: 560,
};
const okStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--peach)",
  marginTop: 10,
};

export default function ConfigTab({
  config,
  products,
  onSaved,
  onClose,
}: {
  config: Config;
  products: Product[];
  onSaved: () => void;
  onClose?: () => void;
}) {
  const base = config ?? { taxa_entrega_local: 0, whatsapp: "", cidade_taxa: "" };

  const [taxa, setTaxa] = useState(String(base.taxa_entrega_local ?? 0));
  const [cidade, setCidade] = useState(base.cidade_taxa ?? "");
  const [whatsapp, setWhatsapp] = useState(base.whatsapp ?? "");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configOk, setConfigOk] = useState(false);

  const loja = lojaConfigDe(config);
  const brindes = produtosBrinde(products);
  const [varejoAtivo, setVarejoAtivo] = useState(loja.varejo_ativo);
  const [bonusAtivo, setBonusAtivo] = useState(loja.bonus_ativo);
  const [minPecas, setMinPecas] = useState(String(loja.bonus_min_pecas));
  const [quantidade, setQuantidade] = useState(String(loja.bonus_quantidade));
  const [produtoId, setProdutoId] = useState(loja.bonus_produto_id ?? "");
  const [savingLoja, setSavingLoja] = useState(false);
  const [lojaOk, setLojaOk] = useState(false);

  async function handleSaveLoja() {
    const r = validarLojaConfig({ varejoAtivo, bonusAtivo, minPecas, quantidade, produtoId });
    if (!r.ok) {
      alert(r.erro);
      return;
    }
    if (r.valor.varejo_ativo && !loja.varejo_ativo && !confirm(`${AVISO_VAREJO}\n\nLigar mesmo assim?`)) return;
    setLojaOk(false);
    setSavingLoja(true);
    const { error } = await salvarLojaConfig(r.valor);
    setSavingLoja(false);
    if (error) {
      alert(`Não deu pra salvar a configuração da loja: ${error}`);
      return;
    }
    setLojaOk(true);
    onSaved();
  }

  async function handleSaveConfig() {
    const taxaNum = parseFloat(taxa.replace(",", "."));
    if (isNaN(taxaNum) || taxaNum < 0) {
      alert("A taxa de entrega deve ser um número maior ou igual a zero.");
      return;
    }
    const digits = whatsapp.replace(/\D/g, "");
    setConfigOk(false);
    setSavingConfig(true);
    const { error } = await saveConfig({
      taxa_entrega_local: taxaNum,
      whatsapp: digits,
      cidade_taxa: cidade.trim(),
    });
    setSavingConfig(false);
    if (error) {
      alert(`Não deu pra salvar as configurações: ${error}`);
      return;
    }
    setWhatsapp(digits);
    setConfigOk(true);
    onSaved();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(43,36,32,.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Configurações
          </h2>
          <button
            onClick={() => onClose?.()}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: "var(--adm-text-secondary)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={cardStyle}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          Entrega e contato
        </h3>

        <label style={labelStyle}>Taxa de entrega local (R$)</label>
        <input
          type="number"
          step="0.01"
          min={0}
          style={inputStyle}
          value={taxa}
          onChange={(e) => setTaxa(e.target.value)}
        />
        <div style={hintStyle}>
          cobrada nos pedidos com entrega na cidade
        </div>

        <label style={labelStyle}>Cidade da taxa</label>
        <input
          style={inputStyle}
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          placeholder="Ex: Belo Horizonte"
        />
        <div style={hintStyle}>
          cidade em que a taxa de entrega local se aplica
        </div>

        <label style={labelStyle}>WhatsApp</label>
        <input
          style={inputStyle}
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="5531999999999"
          inputMode="numeric"
        />
        <div style={hintStyle}>
          só dígitos, com DDI 55 e DDD (ex: 5531999999999)
        </div>

        <button
          className="btn"
          onClick={handleSaveConfig}
          disabled={savingConfig}
        >
          {savingConfig ? "Salvando…" : "Salvar"}
        </button>
        {configOk && <div style={okStyle}>Configurações salvas.</div>}
      </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Varejo e bonificação</h3>
          <div style={{ ...hintStyle, marginBottom: 16 }}>
            Salvar grava o varejo e a bonificação juntos.
          </div>

          <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input type="checkbox" checked={varejoAtivo} onChange={(e) => setVarejoAtivo(e.target.checked)} />
            Varejo ligado
          </label>
          <div
            role="note"
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              border: "1px solid var(--line)",
              borderLeft: "3px solid var(--peach-deep)",
              padding: "8px 10px",
              marginBottom: 20,
              color: "var(--ink)",
            }}
          >
            <strong>Atenção:</strong> {AVISO_VAREJO}
          </div>

          <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={bonusAtivo} onChange={(e) => setBonusAtivo(e.target.checked)} />
            Bonificação ligada (brinde no pedido de atacado)
          </label>

          <label style={labelStyle}>Peças mínimas no pedido</label>
          <input
            style={inputStyle}
            inputMode="numeric"
            value={minPecas}
            onChange={(e) => setMinPecas(e.target.value)}
          />
          <div style={hintStyle}>quantas peças o pedido precisa ter para ganhar o brinde</div>

          <label style={labelStyle}>Quantidade do brinde</label>
          <input
            style={inputStyle}
            inputMode="numeric"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
          <div style={hintStyle}>unidades do produto brinde adicionadas ao pedido</div>

          <label style={labelStyle}>Produto do brinde</label>
          <select style={inputStyle} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">Nenhum</option>
            {brindes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
          <div style={hintStyle}>
            {brindes.length === 0
              ? "Nenhum produto marcado como \"Somente bônus\". Marque um em Produtos para poder escolher."
              : "só aparecem produtos marcados como \"Somente bônus\" (preço nominal maior que zero e ativo)"}
          </div>

          <button className="btn" onClick={handleSaveLoja} disabled={savingLoja}>
            {savingLoja ? "Salvando…" : "Salvar"}
          </button>
          {lojaOk && <div style={okStyle}>Configuração da loja salva.</div>}
        </div>

      </div>
    </div>
  );
}
