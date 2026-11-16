"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cadastrarAction,
  cadastrarRevendedorAction,
  entrarAction,
  esqueciAction,
  renovarSessaoAction,
} from "@/app/entrar/actions";
import { COPY, CAMPOS, abasLogin, aplicarMascara, diagnosticarFormulario, type Modo } from "@/components/auth/form";
import ChecklistRevendedor from "@/components/auth/ChecklistRevendedor";
import "@/components/auth/auth.css";

type Props = {
  modoInicial: Modo;
  varejoAtivo: boolean;
  next: string | null;
  etiqueta: string;
  titulo: string;
  renovar: boolean;
};

type Estado = { error?: string; destino?: string; sent?: string };

const ACOES = {
  entrar: entrarAction,
  cadastro: cadastrarAction,
  revendedor: cadastrarRevendedorAction,
  esqueci: esqueciAction,
};

function urlDoModo(modo: Modo, next: string | null): string {
  const q = new URLSearchParams();
  if (modo !== "entrar") q.set("modo", modo);
  if (next) q.set("next", next);
  const s = q.toString();
  return s ? `/entrar?${s}` : "/entrar";
}

export default function LoginView({ modoInicial, varejoAtivo, next, etiqueta, titulo, renovar }: Props) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [avisoSessao, setAvisoSessao] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState(false);
  const renovou = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!renovar || renovou.current) return;
    renovou.current = true;
    renovarSessaoAction(next).then((r) => {
      if (r.destino) router.replace(r.destino);
      else if (r.error) setAvisoSessao(r.error);
    });
  }, [renovar, next, router]);

  function ir(novo: Modo) {
    setModo(novo);
    setEnviado(false);
    setAvisoSessao("");
    setValores((v) => ({ ...v, senha: "" }));
    window.history.replaceState(null, "", urlDoModo(novo, next));
    tituloRef.current?.focus();
  }

  const copy = COPY[modo];
  const abas = abasLogin(varejoAtivo);
  const mostraAbas = abas.some((a) => a.modo === modo) && !enviado;
  const rotuloVoltar = varejoAtivo ? "Voltar à loja" : "Voltar ao início";

  return (
    <div className="auth-frame">
      <div className="auth-photo">
        <div className="auth-photo-text">
          <span className="auth-photo-label">{etiqueta}</span>
          <p className="auth-photo-title">{titulo}</p>
        </div>
      </div>

      <div className="auth-side">
        <div className="auth-top">
          <Link href="/" aria-label={`LOLA, ${rotuloVoltar.toLowerCase()}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lola-logo.png" alt="LOLA" />
          </Link>
          <Link href="/" className="auth-link">
            ← {rotuloVoltar}
          </Link>
        </div>

        <main className="auth-main">
          <div className="auth-card">
            <div className="auth-head">
              {!mostraAbas && (
                <button type="button" className="auth-back" onClick={() => ir("entrar")}>
                  ← Voltar para entrar
                </button>
              )}
              {!enviado && (
                <>
                  <h1 className="auth-title" ref={tituloRef} tabIndex={-1}>
                    {copy.titulo}
                  </h1>
                  <p className="auth-sub">{copy.subtitulo}</p>
                </>
              )}
            </div>

            <div aria-live="polite">{avisoSessao && <div className="auth-error">{avisoSessao}</div>}</div>

            {mostraAbas && (
              <div className="auth-tabs" role="group" aria-label="Acesso">
                {abas.map((a) => (
                  <button
                    key={a.modo}
                    type="button"
                    className="auth-tab"
                    aria-pressed={modo === a.modo}
                    onClick={() => ir(a.modo)}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}

            <Formulario
              key={modo}
              modo={modo}
              next={next}
              valores={valores}
              setValores={setValores}
              aoSubmeter={() => setAvisoSessao("")}
              aoMudarEnvio={setEnviado}
              onEsqueci={() => ir("esqueci")}
            />

            {mostraAbas && varejoAtivo && (
              <button type="button" className="auth-reseller" onClick={() => ir("revendedor")}>
                <span className="auth-reseller-text">
                  <span className="auth-reseller-title">Quero ser revendedor</span>
                  <span className="auth-reseller-sub">Compre no atacado com CNPJ</span>
                </span>
                <span className="auth-reseller-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

type FormularioProps = {
  modo: Modo;
  next: string | null;
  valores: Record<string, string>;
  setValores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  aoSubmeter: () => void;
  aoMudarEnvio: (enviado: boolean) => void;
  onEsqueci: () => void;
};

function Formulario({ modo, next, valores, setValores, aoSubmeter, aoMudarEnvio, onEsqueci }: FormularioProps) {
  const router = useRouter();
  const [estado, formAction, pendente] = useActionState<Estado, FormData>(ACOES[modo], {});
  const [diagnostico, setDiagnostico] = useState<{ campo: string; mensagem: string } | null>(null);

  useEffect(() => {
    if (estado.destino) router.replace(estado.destino);
  }, [estado.destino, router]);

  const enviado = !!estado.sent;
  const escondeForm = enviado;

  useEffect(() => {
    aoMudarEnvio(enviado);
  }, [enviado, aoMudarEnvio]);
  const erro = diagnostico?.mensagem || estado.error || "";

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    aoSubmeter();
    const d = diagnosticarFormulario(modo, valores);
    if (d) {
      e.preventDefault();
      setDiagnostico(d);
    }
  }

  function aoMudar(nome: string, valor: string) {
    setValores((v) => ({ ...v, [nome]: aplicarMascara(nome, valor) }));
    setDiagnostico(null);
  }

  return (
    <>
      <div aria-live="polite">
        {enviado &&
          (modo === "revendedor" ? (
            <ChecklistRevendedor email={valores.email ?? ""} />
          ) : (
            <div className="auth-success">{estado.sent}</div>
          ))}
      </div>

      {!escondeForm && (
        <form className="auth-form" action={formAction} onSubmit={aoEnviar} noValidate>
          {modo === "entrar" && <input type="hidden" name="next" value={next ?? ""} />}
          {CAMPOS[modo].map((c) => (
            <div className="auth-field" key={c.nome}>
              <div className="auth-label-row">
                <label className="auth-label" htmlFor={`auth-${c.nome}`}>
                  {c.rotulo}
                </label>
                {modo === "entrar" && c.nome === "senha" && (
                  <button type="button" className="auth-forgot" onClick={onEsqueci}>
                    Esqueci a senha
                  </button>
                )}
              </div>
              <input
                id={`auth-${c.nome}`}
                name={c.nome}
                type={c.tipo}
                className={c.mono ? "auth-input mono" : "auth-input"}
                placeholder={c.placeholder}
                autoComplete={c.autoComplete}
                inputMode={c.inputMode}
                value={valores[c.nome] ?? ""}
                onChange={(e) => aoMudar(c.nome, e.target.value)}
                aria-invalid={diagnostico?.campo === c.nome ? true : undefined}
                aria-describedby="auth-erro"
              />
            </div>
          ))}

          <div id="auth-erro" aria-live="polite">
            {erro && <div className="auth-error">{erro}</div>}
          </div>

          <button type="submit" className="auth-submit" disabled={pendente}>
            {pendente ? "Aguarde..." : COPY[modo].botao}
          </button>
          {modo === "revendedor" && <p className="auth-note">Sua solicitação será analisada pela equipe LOLA.</p>}
        </form>
      )}
    </>
  );
}
