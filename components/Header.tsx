"use client";

import { useEffect, useState } from "react";
import AvisoBar from "@/components/home/AvisoBar";
import HeaderClient from "@/components/HeaderClient";
import { buscarDadosHeader } from "@/components/loja-actions";
import { criarCache, useSnapshotCache } from "@/components/loja-cache";
import { dadosPublicosHeader, type DadosPublicosHeader, type PerfilNav } from "@/lib/header-menu";

// Só dados públicos entram no cache; o perfil nunca sobrevive entre montagens.
const cacheHeader = criarCache<DadosPublicosHeader>();

export default function Header() {
  const dados = useSnapshotCache(cacheHeader);
  const [perfil, setPerfil] = useState<PerfilNav | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarDadosHeader()
      .then((d) => {
        if (!ativo) return;
        cacheHeader.set(dadosPublicosHeader(d));
        setPerfil(d.perfil);
      })
      .catch(() => {
        if (ativo) setPerfil(null);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <>
      {dados ? (
        <AvisoBar texto={dados.avisoTexto} ativo={dados.avisoAtivo} />
      ) : (
        <div className="aviso-bar aviso-bar-reserva" aria-hidden="true" />
      )}
      <HeaderClient
        categorias={dados?.categorias ?? []}
        perfil={perfil}
        varejoAtivo={dados?.varejoAtivo ?? false}
      />
    </>
  );
}
