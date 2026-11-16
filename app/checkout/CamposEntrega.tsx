"use client";

import { ENTREGAS_ATACADO } from "@/lib/checkout";

export type EntregaTipo = "retirada" | "entrega" | "entrega_fora";

export type DadosForm = {
  nome: string;
  telefone: string;
  entregaTipo: EntregaTipo;
  rua: string;
  numero: string;
  bairro: string;
  complemento: string;
  cep: string;
  cidade: string;
};

export const DADOS_VAZIOS: DadosForm = {
  nome: "",
  telefone: "",
  entregaTipo: "retirada",
  rua: "",
  numero: "",
  bairro: "",
  complemento: "",
  cep: "",
  cidade: "",
};

export const OPCOES: { valor: EntregaTipo; titulo: string; descricao: string }[] = [
  {
    valor: "retirada",
    titulo: "Retirar na loja — grátis",
    descricao: "Você retira o pedido pessoalmente na loja, sem custo de entrega.",
  },
  {
    valor: "entrega",
    titulo: "Receber em casa",
    descricao: "Entrega no seu endereço. A taxa de entrega é calculada no checkout.",
  },
  {
    valor: "entrega_fora",
    titulo: "Entrega em outra cidade — frete a combinar",
    descricao:
      "Para fora da área de entrega. O frete é combinado pelo WhatsApp depois da compra; o pagamento aqui cobre só os produtos.",
  },
];

/** Opções do atacado: só as formas em ENTREGAS_ATACADO (lib/checkout.ts). */
export const OPCOES_ATACADO = OPCOES.filter((op) => ENTREGAS_ATACADO.includes(op.valor));

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid var(--line)",
  fontSize: 13.5,
  background: "#fff",
};
export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: 6,
};

export function CamposEntrega({
  dados,
  set,
  opcoes = OPCOES,
}: {
  dados: DadosForm;
  set: <K extends keyof DadosForm>(campo: K, valor: DadosForm[K]) => void;
  opcoes?: typeof OPCOES;
}) {
  const precisaEndereco =
    dados.entregaTipo === "entrega" || dados.entregaTipo === "entrega_fora";

  return (
    <>
      <div>
        <label style={labelStyle}>Nome completo</label>
        <input
          style={inputStyle}
          value={dados.nome}
          onChange={(e) => set("nome", e.target.value)}
          placeholder="Seu nome"
          required
        />
      </div>
      <div>
        <label style={labelStyle}>WhatsApp / telefone</label>
        <input
          style={inputStyle}
          value={dados.telefone}
          onChange={(e) => set("telefone", e.target.value)}
          placeholder="(00) 90000-0000"
          required
        />
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          É por esse número que a loja fala com você sobre o pedido.
        </p>
      </div>
  
      <div>
        <label style={labelStyle}>Como você quer receber</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {opcoes.map((op) => (
            <label
              key={op.valor}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 14px",
                border:
                  dados.entregaTipo === op.valor
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--line)",
                cursor: "pointer",
                fontSize: 13.5,
              }}
            >
              <input
                type="radio"
                name="entregaTipo"
                style={{ marginTop: 3 }}
                checked={dados.entregaTipo === op.valor}
                onChange={() => set("entregaTipo", op.valor)}
              />
              <span>
                <strong style={{ color: "var(--ink-soft)" }}>{op.titulo}</strong>
                <br />
                <span style={{ color: "var(--muted)", fontSize: 12 }}>{op.descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
  
      {precisaEndereco && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: "var(--surface-muted)",
            padding: 18,
          }}
        >
          {dados.entregaTipo === "entrega_fora" && (
            <div>
              <label style={labelStyle}>Cidade</label>
              <input
                style={inputStyle}
                value={dados.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                required
              />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Rua</label>
              <input
                style={inputStyle}
                value={dados.rua}
                onChange={(e) => set("rua", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Número</label>
              <input
                style={inputStyle}
                value={dados.numero}
                onChange={(e) => set("numero", e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Bairro</label>
              <input
                style={inputStyle}
                value={dados.bairro}
                onChange={(e) => set("bairro", e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>CEP (opcional)</label>
              <input
                style={inputStyle}
                value={dados.cep}
                onChange={(e) => set("cep", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Complemento (opcional)</label>
            <input
              style={inputStyle}
              value={dados.complemento}
              onChange={(e) => set("complemento", e.target.value)}
              placeholder="Apto, bloco, ponto de referência…"
            />
          </div>
        </div>
      )}
    </>
  );
}
