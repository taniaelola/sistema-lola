import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { comDescontoEfetivo } from "@/lib/pricing";
import { getPromocoesAtivas } from "@/lib/promocoes";
import type { Product } from "@/lib/types";
import { BRAND } from "@/lib/brand.config";
import { exigirVarejo } from "@/lib/loja-rotas-server";
import SurpresaOffer from "@/components/SurpresaOffer";

export const revalidate = 0;

export const metadata: Metadata = {
  title: `Oferta da Live — ${BRAND.nome}`,
  description: "Oferta exclusiva e por tempo limitado, direto da live.",
  robots: { index: false, follow: false },
};

async function getSurpresa(): Promise<Product | null> {
  const { data, error } = await supabase().rpc("public_get_surpresa");
  if (error || !data) return null;
  return data as unknown as Product;
}

export default async function SurpresaPage() {
  await exigirVarejo();
  const base = await getSurpresa();
  const product = base
    ? comDescontoEfetivo([base], await getPromocoesAtivas())[0]
    : null;

  if (!product) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "40px 24px",
          background: "var(--ink)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: "0.16em",
            color: "#fff",
            marginBottom: 34,
          }}
        >
          {BRAND.nome}
        </span>
        <span style={{ fontSize: 34, marginBottom: 18 }}>🎁</span>
        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            fontSize: "clamp(28px, 4vw, 40px)",
            letterSpacing: "-0.01em",
            color: "#fff",
            marginBottom: 12,
            maxWidth: "20ch",
          }}
        >
          Nenhuma oferta ativa no momento
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,.75)", maxWidth: "34ch", lineHeight: 1.6, marginBottom: 30 }}>
          Esse link fica no ar só durante as lives e promoções relâmpago. Fique de olho
          {BRAND.instagramUrl ? " no Instagram e no WhatsApp" : " no WhatsApp"} pra não perder a próxima.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {BRAND.instagramUrl && (
            <a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-outline">
              Instagram ↗
            </a>
          )}
          <a href={BRAND.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-outline">
            WhatsApp ↗
          </a>
        </div>
        <Link href="/" style={{ marginTop: 34, fontSize: 12.5, color: "rgba(255,255,255,.6)", textDecoration: "underline" }}>
          Ver a coleção completa
        </Link>
      </div>
    );
  }

  return <SurpresaOffer product={product} />;
}
