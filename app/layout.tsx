import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { BRAND } from "@/lib/brand.config";
import { CartProvider } from "@/lib/cart";
import RedirecionaLinkAcesso from "@/components/RedirecionaLinkAcesso";

export const metadata: Metadata = {
  title: `${BRAND.nome} — Loja`,
  description: `${BRAND.nome} — ${BRAND.tagline}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Fontes carregadas via <link> global de propósito: são usadas em todas
            as rotas e a troca de identidade visual passa por brand.config + CSS vars. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Jost:wght@300..600&family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Martian+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>
        <RedirecionaLinkAcesso />
        <CartProvider>{children}</CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
