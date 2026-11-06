"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand.config";
import { corStatus } from "@/lib/admin-status";
import { sairAction } from "@/app/entrar/actions";
import SwingTag from "@/components/SwingTag";

export type EstadoGate = "pendente" | "recusado" | "sem-cadastro";

const CONTEUDO: Record<EstadoGate, { rotulo: string | null; status: string; texto: string }> = {
  pendente: {
    rotulo: "Cadastro pendente",
    status: "Cadastro pendente",
    texto: "Seu cadastro de revendedor está sendo avaliado pela equipe LOLA. Avisaremos assim que houver uma resposta.",
  },
  recusado: {
    rotulo: "Cadastro não aprovado",
    status: "Recusado",
    texto: "Seu cadastro de revendedor não foi aprovado desta vez. Em caso de dúvida, fale com a equipe da loja.",
  },
  "sem-cadastro": {
    rotulo: null,
    status: "Pendente",
    texto: "Não encontramos um cadastro de revendedor para esta conta. Entre em contato com a loja para liberar o acesso ao atacado.",
  },
};

export default function GateStatus({ estado }: { estado: EstadoGate }) {
  const router = useRouter();
  const [saindo, iniciarSaida] = useTransition();
  const { rotulo, status, texto } = CONTEUDO[estado];
  const cor = corStatus(status);

  function sair() {
    iniciarSaida(async () => {
      await sairAction();
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <main className="atc-gate">
      <div className="atc-gate-caixa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lola-logo.png" alt={BRAND.nome} />
        {rotulo && (
          <SwingTag color={cor.bg} textColor={cor.text} size="md">
            {rotulo}
          </SwingTag>
        )}
        <p className="atc-gate-texto" role="status">
          {texto}
        </p>
        <a href={BRAND.whatsappUrl} target="_blank" rel="noopener noreferrer" className="atc-gate-link">
          Falar com a equipe no WhatsApp
        </a>
        <Link href="/" className="atc-gate-link">
          Voltar para a loja
        </Link>
        <button type="button" className="atc-gate-link" onClick={sair} disabled={saindo}>
          Sair da conta
        </button>
      </div>
    </main>
  );
}
