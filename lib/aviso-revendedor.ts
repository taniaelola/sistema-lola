import { urlEntrar } from "@/lib/roles";

const SITE_PADRAO = "https://lolaonline.com.br";

/** Telefone brasileiro em formato internacional (só dígitos, com 55) ou null se inválido. */
export function telefoneParaWhatsApp(raw: string | null | undefined): string | null {
  const digitos = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) return digitos;
  return null;
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Origem do site sem barra final; cai no domínio de produção se a variável faltar ou for inválida. */
export function siteUrlSeguro(siteUrl: string | null | undefined): string {
  const v = (siteUrl ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(v) ? v : SITE_PADRAO;
}

export function mensagemAprovacao({ nome, urlAcesso }: { nome?: string | null; urlAcesso: string }): string {
  const primeiro = primeiroNome(nome);
  const saudacao = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  return (
    `${saudacao} Seu cadastro de revendedora na LOLA foi aprovado. ` +
    `Já pode entrar e ver o catálogo com o seu preço de atacado: ${urlAcesso} ` +
    `Qualquer dúvida é só responder aqui.`
  );
}

export function linkAvisoWhatsApp({
  telefone,
  nome,
  siteUrl,
}: {
  telefone: string | null | undefined;
  nome?: string | null;
  siteUrl?: string | null;
}): string | null {
  const numero = telefoneParaWhatsApp(telefone);
  if (!numero) return null;
  const urlAcesso = `${siteUrlSeguro(siteUrl)}${urlEntrar("/atacado")}`;
  const texto = mensagemAprovacao({ nome, urlAcesso });
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
