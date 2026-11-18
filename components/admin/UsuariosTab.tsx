"use client";

import { useEffect, useId, useState } from "react";
import {
  deleteConvite,
  fetchConvites,
  fetchUsuarios,
  inviteUsuario,
  reenviarConvite,
  saveUsuario,
  type ResultadoConvite,
} from "@/app/admin/actions";
import { dicaRevogarAtacado, rotuloPapel } from "@/lib/admin-acesso";
import { podeGerirPapel, type Papel } from "@/lib/roles";
import {
  FILTROS_PAPEL,
  chipPapel,
  filtrarUsuarios,
  inicialDoUsuario,
  motivoSemEdicao,
  opcoesDePapel,
  rotuloStatus,
  rotuloUltimoAcesso,
  validarConvite,
  type Convite,
  type FiltroPapel,
  type Usuario,
} from "@/lib/admin-usuarios";
import Drawer from "./Drawer";
import { confirmarDescarte, temAlteracoes } from "@/lib/admin-rascunho";
import Campo from "./Campo";

const COLUNAS = "1.3fr 1.4fr 130px 150px 90px 80px";

function ChipPapel({ papel }: { papel: Papel }) {
  const c = chipPapel(papel);
  return (
    <span className="adm-chip" style={{ background: c.bg, color: c.texto }}>
      {rotuloPapel(papel)}
    </span>
  );
}

export default function UsuariosTab({
  ator,
  onToast,
}: {
  ator: { id: string; papel: Papel };
  onToast: (mensagem: string) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erroConvites, setErroConvites] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroPapel>("todos");
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([fetchUsuarios(), fetchConvites()]).then(([u, c]) => {
      if (!ativo) return;
      if (u.usuarios) setUsuarios(u.usuarios);
      else setErroCarga(u.error ?? "Não foi possível carregar os usuários.");
      if (c.convites) setConvites(c.convites);
      setErroConvites(c.convites ? null : (c.error ?? "Não foi possível carregar os convites."));
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function recarregar() {
    const [u, c] = await Promise.all([fetchUsuarios(), fetchConvites()]);
    if (u.usuarios) setUsuarios(u.usuarios);
    if (c.convites) setConvites(c.convites);
    setErroConvites(c.convites ? null : (c.error ?? "Não foi possível carregar os convites."));
  }

  async function cancelarConvite(c: Convite) {
    setCancelando(c.email);
    const r = await deleteConvite(c.email);
    setCancelando(null);
    onToast(r.error ?? "Convite cancelado.");
    await recarregar();
  }

  if (erroCarga) {
    return (
      <div role="alert" className="adm-cartao">
        {erroCarga}
      </div>
    );
  }
  if (!usuarios) {
    return (
      <div className="adm-cartao" aria-busy="true">
        Carregando usuários…
      </div>
    );
  }

  const visiveis = filtrarUsuarios(usuarios, filtro);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="adm-topo">
        <div className="adm-segmento" role="group" aria-label="Filtrar por papel">
          {FILTROS_PAPEL.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
              {f.rotulo}
            </button>
          ))}
        </div>
        <button type="button" className="adm-btn adm-btn-primario" onClick={() => setConvidando(true)}>
          + Adicionar usuário
        </button>
      </div>

      <div className="adm-tabela">
        <div className="adm-tabela-cab" style={{ gridTemplateColumns: COLUNAS, minWidth: 900 }}>
          <div>NOME</div>
          <div>E-MAIL</div>
          <div>PAPEL</div>
          <div>ÚLTIMO ACESSO</div>
          <div>STATUS</div>
          <div />
        </div>
        {visiveis.length === 0 ? (
          <div className="adm-tabela-vazia">Nenhum usuário com esse papel.</div>
        ) : (
          visiveis.map((u) => (
            <div key={u.id} className="adm-tabela-linha" style={{ gridTemplateColumns: COLUNAS, minWidth: 900 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    flex: "none",
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {inicialDoUsuario(u)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {u.nome || "Sem nome"}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--adm-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {u.email}
              </div>
              <div>
                <ChipPapel papel={u.papel} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--adm-text-secondary)" }}>
                {rotuloUltimoAcesso(u.ultimo_acesso)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: u.ativo ? "var(--adm-success-text)" : "var(--adm-text-secondary)",
                }}
              >
                {rotuloStatus(u.ativo)}
              </div>
              <div>
                <button type="button" className="adm-btn-mini" onClick={() => setEditando(u)}>
                  Editar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <section aria-labelledby="convites-titulo" className="adm-cartao" style={{ gap: 10 }}>
        <h2 id="convites-titulo" className="adm-grupo-titulo">
          Convites pendentes
        </h2>
        <p className="adm-dica" style={{ margin: 0 }}>
          Cancelar só vale para convites ainda não usados. Quem já criou a conta com o e-mail convidado não é afetado: para mudar o papel dessa pessoa, use Editar na lista acima.
        </p>
        {erroConvites ? (
          <div role="alert" className="adm-erro">
            {erroConvites}
          </div>
        ) : convites.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--adm-text-secondary)" }}>Nenhum convite pendente.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
            {convites.map((c) => (
              <li
                key={c.email}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 0",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}>
                  {c.email}
                </span>
                <ChipPapel papel={c.papel} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--adm-text-secondary)" }}>
                  {rotuloUltimoAcesso(c.created_at)}
                </span>
                <button
                  type="button"
                  className="adm-btn-mini"
                  disabled={cancelando === c.email || !podeGerirPapel(ator.papel, c.papel)}
                  onClick={async () => {
                    const r = await reenviarConvite(c.email);
                    onToast(r.error ?? `E-mail reenviado para ${c.email}.`);
                  }}
                  aria-label={`Reenviar e-mail de convite para ${c.email}`}
                >
                  Reenviar e-mail
                </button>
                <button
                  type="button"
                  className="adm-btn-mini"
                  disabled={cancelando === c.email || !podeGerirPapel(ator.papel, c.papel)}
                  onClick={() => cancelarConvite(c)}
                  aria-label={`Cancelar convite de ${c.email}`}
                >
                  Cancelar convite
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editando && (
        <UsuarioDrawer
          key={editando.id}
          usuario={editando}
          ator={ator}
          onFechar={() => setEditando(null)}
          onConcluir={async (mensagem) => {
            setEditando(null);
            onToast(mensagem);
            await recarregar();
          }}
        />
      )}
      {convidando && (
        <ConviteDrawer
          ator={ator}
          onFechar={() => setConvidando(false)}
          onConcluir={async (mensagem) => {
            setConvidando(false);
            onToast(mensagem);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function UsuarioDrawer({
  usuario,
  ator,
  onFechar,
  onConcluir,
}: {
  usuario: Usuario;
  ator: { id: string; papel: Papel };
  onFechar: () => void;
  onConcluir: (mensagem: string) => void | Promise<void>;
}) {
  const formId = useId();
  const bloqueio = motivoSemEdicao(ator.papel, usuario, ator.id);
  const opcoes = opcoesDePapel(ator.papel);
  const [papel, setPapel] = useState<Papel>(usuario.papel);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inicial = useState({ papel, ativo })[0];
  const alterado = temAlteracoes(inicial, { papel, ativo });
  const fechar = () => {
    if (confirmarDescarte(alterado)) onFechar();
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueio || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await saveUsuario({ id: usuario.id, papel, ativo });
    setOcupado(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    await onConcluir("Usuário atualizado.");
  }

  return (
    <Drawer
      aberto
      kicker="EDITAR USUÁRIO"
      titulo={usuario.nome || usuario.email}
      onFechar={onFechar}
      confirmarFechar={() => confirmarDescarte(alterado)}
      rodape={
        <>
          <button type="button" className="adm-btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="adm-btn adm-btn-primario" disabled={Boolean(bloqueio) || ocupado}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {bloqueio && (
          <p className="adm-aviso" style={{ margin: 0 }}>
            {bloqueio}
          </p>
        )}
        <div className="adm-campo">
          <span className="adm-rotulo">E-mail</span>
          <span style={{ fontSize: 13, overflowWrap: "anywhere" }}>{usuario.email}</span>
        </div>
        <Campo rotulo="Papel">
          {(p) => (
            <select
              {...p}
              className="adm-input"
              value={papel}
              disabled={Boolean(bloqueio)}
              onChange={(e) => setPapel(e.target.value as Papel)}
            >
              {!opcoes.includes(usuario.papel) && <option value={usuario.papel}>{rotuloPapel(usuario.papel)}</option>}
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {rotuloPapel(o)}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {dicaRevogarAtacado(usuario.papel) && (
          <p className="adm-aviso" style={{ margin: 0 }}>
            {dicaRevogarAtacado(usuario.papel)}
          </p>
        )}
        <label
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, cursor: bloqueio ? "not-allowed" : "pointer" }}
        >
          Conta ativa
          <input
            type="checkbox"
            className="swtoggle"
            checked={ativo}
            disabled={Boolean(bloqueio)}
            onChange={(e) => setAtivo(e.target.checked)}
          />
        </label>
        <p className="adm-dica" style={{ margin: 0 }}>
          Conta inativa não consegue entrar. Promover alguém a equipe exige que o e-mail dela já esteja confirmado.
        </p>
        <div aria-live="polite">
          {erro && (
            <div role="alert" className="adm-erro">
              {erro}
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}

function ConviteDrawer({
  ator,
  onFechar,
  onConcluir,
}: {
  ator: { id: string; papel: Papel };
  onFechar: () => void;
  onConcluir: (mensagem: string) => void | Promise<void>;
}) {
  const formId = useId();
  const opcoes = opcoesDePapel(ator.papel);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>(opcoes.includes("supervisor") ? "supervisor" : (opcoes[0] ?? "cliente"));
  const [erros, setErros] = useState<{ email?: string; papel?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [registrado, setRegistrado] = useState<{ email: string; papel: Papel; resultado: ResultadoConvite } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [reenvio, setReenvio] = useState<string | null>(null);
  const inicial = useState({ email, papel })[0];
  const alterado = temAlteracoes(inicial, { email, papel });
  const fechar = () => {
    if (confirmarDescarte(alterado)) onFechar();
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    const v = validarConvite(ator.papel, email, papel);
    setErros(v.erros);
    setErro(null);
    if (v.erros.email || v.erros.papel) return;
    setOcupado(true);
    const r = await inviteUsuario({ email: v.email, papel });
    setOcupado(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    setRegistrado({ email: v.email, papel, resultado: r });
  }

  async function reenviar() {
    if (!registrado || reenviando) return;
    setReenviando(true);
    setReenvio(null);
    const r = await reenviarConvite(registrado.email);
    setReenviando(false);
    if (r.error) setReenvio(r.error);
    else {
      setRegistrado({ ...registrado, resultado: { emailEnviado: true } });
      setReenvio("E-mail reenviado.");
    }
  }

  return (
    <Drawer
      aberto
      kicker="NOVO USUÁRIO"
      titulo="Adicionar usuário"
      onFechar={registrado ? () => onConcluir("Convite registrado.") : onFechar}
      confirmarFechar={() => registrado !== null || confirmarDescarte(alterado)}
      rodape={
        registrado ? (
          <button type="button" className="adm-btn adm-btn-primario" onClick={() => onConcluir("Convite registrado.")}>
            Concluir
          </button>
        ) : (
          <>
            <button type="button" className="adm-btn" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" form={formId} className="adm-btn adm-btn-primario" disabled={ocupado}>
              {ocupado ? "Enviando…" : "Convidar por e-mail"}
            </button>
          </>
        )
      }
    >
      {registrado ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {registrado.resultado.aplicadoAgora ? (
            <p className="adm-nota" style={{ margin: 0 }}>
              <strong>{registrado.email}</strong> já tinha conta confirmada: o papel <strong>{rotuloPapel(registrado.papel)}</strong>{" "}
              foi aplicado agora. A pessoa só precisa sair e entrar de novo. Nenhum e-mail foi necessário.
            </p>
          ) : registrado.resultado.emailEnviado ? (
            <>
              <p className="adm-nota" style={{ margin: 0 }}>
                <strong>E-mail enviado para {registrado.email}.</strong> A pessoa abre o link, informa o nome e cria a senha, e já
                entra com o papel <strong>{rotuloPapel(registrado.papel)}</strong>.
              </p>
              <p className="adm-dica" style={{ margin: 0 }}>
                Se o e-mail não chegar em alguns minutos, peça para olhar o spam ou use &quot;Reenviar e-mail&quot; abaixo (e também
                na lista de convites pendentes).
              </p>
            </>
          ) : (
            <p className="adm-nota" style={{ margin: 0 }} role="alert">
              <strong>Convite registrado, mas o e-mail não saiu</strong>
              {registrado.resultado.avisoEmail ? `: ${registrado.resultado.avisoEmail}` : "."} O convite continua pendente: tente
              &quot;Reenviar e-mail&quot; em instantes.
            </p>
          )}
          {!registrado.resultado.aplicadoAgora && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="adm-btn" onClick={reenviar} disabled={reenviando}>
                {reenviando ? "Enviando…" : "Reenviar e-mail"}
              </button>
              {reenvio && (
                <span role="status" className="adm-dica">
                  {reenvio}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
      <form id={formId} onSubmit={enviar} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="adm-nota" style={{ margin: 0 }}>
          Ao registrar, a LOLA envia um e-mail para a pessoa com o link para finalizar o cadastro (nome e senha). Ela entra já com o papel escolhido. Se ela já tem conta confirmada, o papel é aplicado agora e não há e-mail.
        </p>
        <Campo rotulo="E-mail *" erro={erros.email}>
          {(p) => (
            <input
              {...p}
              className="adm-input"
              type="email"
              value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Papel" erro={erros.papel}>
          {(p) => (
            <select {...p} className="adm-input" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {rotuloPapel(o)}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <div aria-live="polite">
          {erro && (
            <div role="alert" className="adm-erro">
              {erro}
            </div>
          )}
        </div>
      </form>
      )}
    </Drawer>
  );
}
