"use client";

import { useEffect } from "react";
import { lerHashAcesso } from "@/components/auth/recuperacao";

/**
 * Rede de segurança: se o Supabase devolver o link do e-mail (convite, confirmação, redefinir senha) para outra
 * página (ex.: a home, quando o redirect não está liberado), leva o hash para /entrar/redefinir, onde a pessoa
 * define a senha. Só age quando o hash traz um token válido de acesso.
 */
export default function RedirecionaLinkAcesso() {
  useEffect(() => {
    if (window.location.pathname === "/entrar/redefinir") return;
    if (!lerHashAcesso(window.location.hash)) return;
    window.location.replace(`/entrar/redefinir${window.location.hash}`);
  }, []);
  return null;
}
