"use client";

import { useId, useState } from "react";
import type { Revendedor } from "@/lib/types";
import { podeAprovarRevendedor, type Papel } from "@/lib/roles";
import { confirmarDescarte, temAlteracoes } from "@/lib/admin-rascunho";
import SwingTag from "@/components/SwingTag";
import { corStatus } from "@/lib/admin-status";
import { saveRevendedor } from "@/app/admin/actions";
import {
  REVENDEDOR_VAZIO,
  avisoTrocaEmail,
  revendedorParaForm,
  validarRevendedor,
  type ErrosRevendedor,
  type RevendedorForm,
} from "@/lib/admin-revendedores";
import { linkAvisoWhatsApp } from "@/lib/aviso-revendedor";
import { mascararCnpj, mascararWhatsapp } from "@/lib/validators";
import Drawer from "./Drawer";
import Campo from "./Campo";

const STATUS_LABEL: Record<Revendedor["status"], string> = {
  pendente: "Cadastro pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

const COLUNAS = "1.5fr 1fr 110px 150px 180px 80px";

export default function RevendedoresTab({
  revendedores,
  papel,
  onAprovar,
  onRecusar,
  onSalvo,
}: {
  revendedores: Revendedor[];
  papel: Papel;
  onAprovar?: (id: string) => void | Promise<void>;
  onRecusar?: (id: string) => void | Promise<void>;
  onSalvo: (mensagem: string) => void | Promise<void>;
}) {
  const [editor, setEditor] = useState<{ revendedor: Revendedor | null } | null>(null);
  const podeDecidir = Boolean(onAprovar && onRecusar);
  const [aprovadoId, setAprovadoId] = useState<string | null>(null);
  const recemAprovada = revendedores.find((r) => r.id === aprovadoId && r.status === "aprovado") ?? null;

  async function aprovar(id: string) {
    await onAprovar?.(id);
    setAprovadoId(id);
  }

  function botaoAvisar(r: Revendedor) {
    const link = linkAvisoWhatsApp({
      telefone: r.whatsapp,
      nome: r.responsavel || null,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });
    return link ? (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="adm-btn-mini adm-btn-aviso"
        aria-label={`Avisar ${r.razao_social} no WhatsApp`}
        style={{ background: "var(--adm-success-bg)", borderColor: "var(--mint)" }}
      >
        Avisar no WhatsApp
      </a>
    ) : (
      <button type="button" className="adm-btn-mini adm-btn-aviso" disabled title="Sem WhatsApp válido">
        Sem WhatsApp válido
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="adm-topo" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn adm-btn-primario" onClick={() => setEditor({ revendedor: null })}>
          + Cadastrar revendedor
        </button>
      </div>

      {recemAprovada && (
        <div role="status" className="adm-nota" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>Cadastro aprovado. Avise a revendedora:</span>
          {botaoAvisar(recemAprovada)}
        </div>
      )}

      <div className="adm-tabela">
        <div className="adm-tabela-cab" style={{ gridTemplateColumns: COLUNAS, minWidth: 900 }}>
          <div>LOJA</div>
          <div>CIDADE/UF</div>
          <div>SOLICITADO</div>
          <div>STATUS</div>
          <div>AÇÕES</div>
          <div />
        </div>
        {revendedores.length === 0 ? (
          <div className="adm-tabela-vazia">Nenhum revendedor cadastrado ainda.</div>
        ) : (
          revendedores.map((r) => {
            const cor = corStatus(STATUS_LABEL[r.status]);
            const local = [r.cidade, r.uf].filter(Boolean).join("/");
            return (
              <div key={r.id} className="adm-tabela-linha" style={{ gridTemplateColumns: COLUNAS, minWidth: 900 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.razao_social}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--adm-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.email}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--adm-text-secondary)" }}>{local}</div>
                <div style={{ fontSize: 12, color: "var(--adm-text-secondary)" }}>
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </div>
                <div>
                  {r.status === "pendente" ? (
                    <SwingTag color={cor.bg} textColor={cor.text} size="sm">
                      Cadastro pendente
                    </SwingTag>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--adm-text-secondary)" }}>{STATUS_LABEL[r.status]}</span>
                  )}
                </div>
                {podeDecidir && r.status === "pendente" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="adm-btn-mini"
                      onClick={() => aprovar(r.id)}
                      aria-label={`Aprovar ${r.razao_social}`}
                      style={{ background: "var(--adm-success-bg)", borderColor: "var(--mint)" }}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="adm-btn-mini"
                      onClick={() => onRecusar?.(r.id)}
                      aria-label={`Recusar ${r.razao_social}`}
                      style={{ background: "var(--adm-pink-bg)", borderColor: "var(--pink)" }}
                    >
                      Recusar
                    </button>
                  </div>
                ) : r.status === "aprovado" ? (
                  <div>{botaoAvisar(r)}</div>
                ) : (
                  <div />
                )}
                <div>
                  <button
                    type="button"
                    className="adm-btn-mini"
                    onClick={() => setEditor({ revendedor: r })}
                    aria-label={`Editar ${r.razao_social}`}
                  >
                    Editar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editor && (
        <RevendedorDrawer
          key={editor.revendedor?.id ?? "novo"}
          revendedor={editor.revendedor}
          papel={papel}
          onFechar={() => setEditor(null)}
          onConcluir={async (mensagem) => {
            setEditor(null);
            await onSalvo(mensagem);
          }}
        />
      )}
    </div>
  );
}

function RevendedorDrawer({
  revendedor,
  papel,
  onFechar,
  onConcluir,
}: {
  revendedor: Revendedor | null;
  papel: Papel;
  onFechar: () => void;
  onConcluir: (mensagem: string) => void | Promise<void>;
}) {
  const formId = useId();
  const [form, setForm] = useState<RevendedorForm>(revendedor ? revendedorParaForm(revendedor) : REVENDEDOR_VAZIO);
  const [erros, setErros] = useState<ErrosRevendedor>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const inicial = useState(form)[0];
  const alterado = temAlteracoes(inicial, form);
  const fechar = () => {
    if (confirmarDescarte(alterado)) onFechar();
  };
  const aviso = avisoTrocaEmail(papel, revendedor, form.email);

  function alterar<K extends keyof RevendedorForm>(chave: K, valor: RevendedorForm[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    const { erros: novos, payload } = validarRevendedor(form);
    setErros(novos);
    setErroGeral(null);
    if (!payload) return;
    setOcupado(true);
    const r = await saveRevendedor({ id: revendedor?.id ?? null, ...payload });
    setOcupado(false);
    if (r.error) {
      setErroGeral(r.error);
      return;
    }
    await onConcluir(revendedor ? "Revendedor atualizado." : "Revendedor cadastrado.");
  }

  return (
    <Drawer
      aberto
      kicker={revendedor ? "EDITAR REVENDEDOR" : "NOVO REVENDEDOR"}
      titulo={revendedor ? revendedor.razao_social : "Cadastrar revendedor"}
      onFechar={onFechar}
      confirmarFechar={() => confirmarDescarte(alterado)}
      rodape={
        <>
          <button type="button" className="adm-btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="adm-btn adm-btn-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={salvar} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Campo rotulo="Loja / razão social *" erro={erros.razao_social}>
          {(p) => (
            <input
              {...p}
              className="adm-input"
              value={form.razao_social}
              maxLength={200}
              onChange={(e) => alterar("razao_social", e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="CNPJ" erro={erros.cnpj}>
          {(p) => (
            <input
              {...p}
              className="adm-input"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              style={{ fontFamily: "var(--font-mono)" }}
              onChange={(e) => alterar("cnpj", mascararCnpj(e.target.value))}
            />
          )}
        </Campo>
        <Campo rotulo="Responsável">
          {(p) => (
            <input
              {...p}
              className="adm-input"
              value={form.responsavel}
              maxLength={200}
              onChange={(e) => alterar("responsavel", e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="E-mail *" erro={erros.email}>
          {(p) => (
            <input
              {...p}
              className="adm-input"
              type="email"
              value={form.email}
              onChange={(e) => alterar("email", e.target.value)}
            />
          )}
        </Campo>
        {aviso && (
          <p role="status" className="adm-aviso" style={{ margin: 0 }}>
            {aviso}
          </p>
        )}
        <Campo rotulo="WhatsApp" erro={erros.whatsapp}>
          {(p) => (
            <input
              {...p}
              className="adm-input"
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={form.whatsapp}
              style={{ fontFamily: "var(--font-mono)" }}
              onChange={(e) => alterar("whatsapp", mascararWhatsapp(e.target.value))}
            />
          )}
        </Campo>
        <div className="adm-linha-campos" style={{ gridTemplateColumns: "1fr 90px" }}>
          <Campo rotulo="Cidade">
            {(p) => (
              <input
                {...p}
                className="adm-input"
                value={form.cidade}
                maxLength={200}
                onChange={(e) => alterar("cidade", e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="UF" erro={erros.uf}>
            {(p) => (
              <input
                {...p}
                className="adm-input"
                maxLength={2}
                autoCapitalize="characters"
                value={form.uf}
                style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                onChange={(e) => alterar("uf", e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
              />
            )}
          </Campo>
        </div>
        {revendedor && (
          <p className="adm-dica" style={{ margin: 0 }}>
            {!podeAprovarRevendedor(papel)
              ? "Seu papel não altera o status."
              : revendedor.status === "pendente"
                ? "O status é alterado pelos botões Aprovar e Recusar na lista."
                : "Status já definido."}
          </p>
        )}
        <div aria-live="polite">
          {erroGeral && (
            <div role="alert" className="adm-erro">
              {erroGeral}
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}
