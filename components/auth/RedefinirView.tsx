"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { finalizarCadastroAction, redefinirAction } from "@/app/entrar/actions";
import { diagnosticarNovaSenha } from "@/components/auth/form";
import { lerHashAcesso } from "@/components/auth/recuperacao";
import "@/components/auth/auth.css";

const semAssinatura = () => () => {};
const hashAtual = () => window.location.hash;
const hashNoServidor = () => null;

export default function RedefinirView() {
  const hash = useSyncExternalStore(semAssinatura, hashAtual, hashNoServidor);
  if (hash === null) return <Moldura>{null}</Moldura>;
  return <Conteudo hashInicial={hash} />;
}

function Conteudo({ hashInicial }: { hashInicial: string }) {
  const [acesso] = useState(() => lerHashAcesso(hashInicial));

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return (
    <Moldura>
      {acesso?.tipo === "convite" ? (
        <FinalizarCadastro token={acesso.token} />
      ) : acesso ? (
        <NovaSenha token={acesso.token} />
      ) : (
        <>
          <div className="auth-head">
            <h1 className="auth-title">Link inválido ou expirado</h1>
            <p className="auth-sub">Peça um novo link para redefinir sua senha.</p>
          </div>
          <Link className="auth-link-btn" href="/entrar?modo=esqueci">
            Pedir novo link
          </Link>
        </>
      )}
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-frame">
      <div className="auth-photo" />
      <div className="auth-side">
        <div className="auth-top">
          <Link href="/" aria-label="LOLA, voltar à loja">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lola-logo.png" alt="LOLA" />
          </Link>
          <Link href="/" className="auth-link">
            ← Voltar à loja
          </Link>
        </div>
        <main className="auth-main">
          <div className="auth-card">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NovaSenha({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(redefinirAction, undefined);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [diagnostico, setDiagnostico] = useState<{ campo: string; mensagem: string } | null>(null);

  if (estado?.ok) {
    return (
      <>
        <div className="auth-head">
          <h1 className="auth-title">Senha alterada.</h1>
        </div>
        <div className="auth-success" role="status">
          Pronto, sua senha foi redefinida. Entre com a nova senha.
        </div>
        <Link className="auth-link-btn" href="/entrar">
          Ir para entrar
        </Link>
      </>
    );
  }

  const erro = diagnostico?.mensagem || estado?.error || "";

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    const d = diagnosticarNovaSenha(senha, confirmar);
    if (d) {
      e.preventDefault();
      setDiagnostico(d);
    }
  }

  return (
    <>
      <div className="auth-head">
        <h1 className="auth-title">Nova senha</h1>
        <p className="auth-sub">Escolha uma senha nova para a sua conta LOLA.</p>
      </div>
      <form className="auth-form" action={formAction} onSubmit={aoEnviar} noValidate>
        <input type="hidden" name="access_token" value={token} />
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-senha">
            Nova senha
          </label>
          <input
            id="auth-senha"
            name="senha"
            type="password"
            className="auth-input"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setDiagnostico(null);
            }}
            aria-invalid={diagnostico?.campo === "senha" ? true : undefined}
            aria-describedby="auth-erro"
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-confirmar">
            Confirme a senha
          </label>
          <input
            id="auth-confirmar"
            name="confirmar"
            type="password"
            className="auth-input"
            placeholder="Repita a senha"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => {
              setConfirmar(e.target.value);
              setDiagnostico(null);
            }}
            aria-invalid={diagnostico?.campo === "confirmar" ? true : undefined}
            aria-describedby="auth-erro"
          />
        </div>
        <div id="auth-erro" aria-live="polite">
          {erro && <div className="auth-error">{erro}</div>}
        </div>
        {erro && !diagnostico && (
          <Link className="auth-link-inline" href="/entrar?modo=esqueci">
            Pedir um novo link
          </Link>
        )}
        <button type="submit" className="auth-submit" disabled={pendente}>
          {pendente ? "Aguarde..." : "Salvar nova senha"}
        </button>
      </form>
    </>
  );
}

// Convite de equipe: a pessoa chega pelo link do e-mail e informa nome e senha.
function FinalizarCadastro({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(finalizarCadastroAction, undefined);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [diagnostico, setDiagnostico] = useState<{ campo: string; mensagem: string } | null>(null);

  if (estado?.ok) {
    return (
      <>
        <div className="auth-head">
          <h1 className="auth-title">Cadastro concluído.</h1>
        </div>
        <div className="auth-success" role="status">
          Pronto! Sua conta LOLA está criada. Entre com o seu e-mail e a senha que você acabou de escolher.
        </div>
        <Link className="auth-link-btn" href="/entrar">
          Ir para entrar
        </Link>
      </>
    );
  }

  const erro = diagnostico?.mensagem || estado?.error || "";

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (!nome.trim()) {
      e.preventDefault();
      setDiagnostico({ campo: "nome", mensagem: "Informe o seu nome." });
      return;
    }
    const d = diagnosticarNovaSenha(senha, confirmar);
    if (d) {
      e.preventDefault();
      setDiagnostico(d);
    }
  }

  return (
    <>
      <div className="auth-head">
        <h1 className="auth-title">Finalize seu cadastro</h1>
        <p className="auth-sub">Você foi convidado(a) para a equipe da LOLA. Informe seu nome e crie uma senha.</p>
      </div>
      <form className="auth-form" action={formAction} onSubmit={aoEnviar} noValidate>
        <input type="hidden" name="access_token" value={token} />
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-nome">
            Seu nome
          </label>
          <input
            id="auth-nome"
            name="nome"
            type="text"
            className="auth-input"
            placeholder="Nome e sobrenome"
            autoComplete="name"
            maxLength={120}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setDiagnostico(null);
            }}
            aria-invalid={diagnostico?.campo === "nome" ? true : undefined}
            aria-describedby="auth-erro"
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-senha">
            Senha
          </label>
          <input
            id="auth-senha"
            name="senha"
            type="password"
            className="auth-input"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value);
              setDiagnostico(null);
            }}
            aria-invalid={diagnostico?.campo === "senha" ? true : undefined}
            aria-describedby="auth-erro"
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-confirmar">
            Confirme a senha
          </label>
          <input
            id="auth-confirmar"
            name="confirmar"
            type="password"
            className="auth-input"
            placeholder="Repita a senha"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => {
              setConfirmar(e.target.value);
              setDiagnostico(null);
            }}
            aria-invalid={diagnostico?.campo === "confirmar" ? true : undefined}
            aria-describedby="auth-erro"
          />
        </div>
        <div id="auth-erro" aria-live="polite">
          {erro && <div className="auth-error">{erro}</div>}
        </div>
        <button type="submit" className="auth-submit" disabled={pendente}>
          {pendente ? "Aguarde..." : "Concluir cadastro"}
        </button>
      </form>
    </>
  );
}
