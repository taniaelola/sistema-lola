"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarSessao, encerrarNoSupabase, getSessao, perfilPorToken, type Perfil } from "@/lib/auth";
import { supabaseComToken } from "@/lib/supabase";
import { MSG_PERFIL_INDISPONIVEL, decidirAcesso, type AcaoAdmin } from "@/lib/admin-acesso";
import type {
  Product,
  Categoria,
  Order,
  Sale,
  OrderStatus,
  Revendedor,
  RevendedorStatus,
  EstoqueBaixoItem,
} from "@/lib/types";
import { PAPEIS, podeGerirPapel, type Papel } from "@/lib/roles";
import { validarImagemCategoria } from "@/lib/admin-categoria-imagem";
import { MSG_DADOS_INVALIDOS, textosValidos, traduzirErroCategoria } from "@/lib/admin-erros";
import { payloadParaForm, traduzirErroPromocao, validarPromocao, type Promocao, type PromocaoPayload } from "@/lib/admin-promocoes";
import { motivoSemEdicao, traduzirErroUsuarios, validarConvite, type Convite, type Usuario } from "@/lib/admin-usuarios";
import { traduzirErroRevendedor, validarRevendedor, type RevendedorPayload } from "@/lib/admin-revendedores";
import { mesclarTextos } from "@/lib/textos";
import { validarValoresServidor } from "@/lib/admin-textos";
import {
  montarRascunho,
  normalizarServidor,
  validarRascunhoServidor,
  type BannerDados,
  type BannerServidor,
} from "@/lib/admin-banner";
import {
  lerConfig,
  listarCategorias,
  listarEstoqueBaixo,
  listarPedidos,
  listarProdutos,
  listarRevendedores,
  listarVendas,
  type ConfigAdmin,
} from "./consultas";
import {
  lojaConfigValida,
  traduzirErroLojaConfig,
  type ConfigEntrega,
  type LojaConfig,
} from "@/lib/admin-config";

export type { Revendedor } from "@/lib/types";

const SEM_SESSAO = "Sessão expirada. Entre de novo.";

type Guarda = { sb: SupabaseClient; perfil: Perfil } | { error: string };

async function autorizar(acao: AcaoAdmin): Promise<Guarda> {
  try {
    const sessao = await getSessao({ renovar: true });
    if (!sessao) return { error: SEM_SESSAO };
    const perfil = await perfilPorToken(sessao.accessToken);
    const decisao = decidirAcesso(perfil, acao);
    if (decisao.ok) {
      return perfil ? { sb: supabaseComToken(sessao.accessToken), perfil } : { error: MSG_PERFIL_INDISPONIVEL };
    }
    if (decisao.encerrarSessao) {
      await encerrarNoSupabase(sessao.accessToken);
      await apagarSessao();
    }
    return { error: decisao.error };
  } catch {
    return { error: MSG_PERFIL_INDISPONIVEL };
  }
}

async function cliente(acao: AcaoAdmin): Promise<SupabaseClient | null> {
  const g = await autorizar(acao);
  return "sb" in g ? g.sb : null;
}

export async function fetchProducts(): Promise<Product[]> {
  const sb = await cliente("cadastro");
  return sb ? listarProdutos(sb) : [];
}

export async function fetchCategorias(): Promise<Categoria[]> {
  const sb = await cliente("cadastro");
  return sb ? listarCategorias(sb) : [];
}

export async function fetchOrders(p_filtro: string = "todos"): Promise<Order[]> {
  const sb = await cliente("pedidos");
  return sb ? listarPedidos(sb, p_filtro) : [];
}

export async function fetchSales(p_filtro: string = "todos"): Promise<Sale[]> {
  const sb = await cliente("vendas-leitura");
  return sb ? listarVendas(sb, p_filtro) : [];
}

export async function fetchEstoqueBaixo(): Promise<EstoqueBaixoItem[]> {
  const sb = await cliente("estoque-baixo");
  return sb ? listarEstoqueBaixo(sb) : [];
}

// --- Produtos / cores / tamanhos (mutations) -------------------------------

export async function saveProduct(payload: {
  id: string | null;
  nome: string;
  categoria_id: string;
  colecao: string;
  preco: number;
  descricao: string;
  caracteristicas: string[];
  ativo: boolean;
  destaque: boolean;
  ordem: number;
  slug: string;
  desconto_percentual: number | null;
  preco_atacado: number | null;
  // Sempre reenviado pelo editor; null = manter o valor atual (o banco usa coalesce).
  somente_bonus: boolean | null;
}): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_upsert_product", {
    p_id: payload.id,
    p_nome: payload.nome,
    p_categoria_id: payload.categoria_id,
    p_colecao: payload.colecao || null,
    p_preco: payload.preco,
    p_desconto_percentual: payload.desconto_percentual,
    p_preco_atacado: payload.preco_atacado,
    p_descricao: payload.descricao,
    p_caracteristicas: payload.caracteristicas,
    p_ativo: payload.ativo,
    p_destaque: payload.destaque,
    p_ordem: payload.ordem,
    p_slug: payload.slug,
    p_somente_bonus: payload.somente_bonus,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

export async function deleteProduct(id: string): Promise<{ error?: string }> {
  const g = await autorizar("exclusao");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_product", { p_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function setAtivo(id: string, ativo: boolean): Promise<{ error?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_ativo", { p_id: id, p_ativo: ativo });
  if (error) return { error: error.message };
  return {};
}

// Desconto de varejo rápido — passar null remove o desconto.
export async function setDesconto(
  id: string,
  pct: number | null
): Promise<{ error?: string }> {
  const g = await autorizar("preco");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_desconto", {
    p_id: id,
    p_desconto_percentual: pct,
  });
  if (error) return { error: error.message };
  return {};
}

// Ativar um produto na Live Surpresa desativa os demais no servidor.
export async function setSurpresa(id: string, ativo: boolean): Promise<{ error?: string }> {
  const g = await autorizar("preco");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_surpresa", { p_id: id, p_ativo: ativo });
  if (error) return { error: error.message };
  return {};
}

export async function setDestaque(
  id: string,
  destaque: boolean
): Promise<{ error?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_destaque", { p_id: id, p_destaque: destaque });
  if (error) return { error: error.message };
  return {};
}

export async function saveColor(payload: {
  id: string | null;
  product_id: string;
  nome: string;
  hex: string;
  imagens: string[];
  ordem: number;
}): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_upsert_color", {
    p_id: payload.id,
    p_product_id: payload.product_id,
    p_nome: payload.nome,
    p_hex: payload.hex,
    p_imagens: payload.imagens,
    p_ordem: payload.ordem,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

export async function deleteColor(id: string): Promise<{ error?: string }> {
  const g = await autorizar("exclusao");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_color", { p_id: id });
  if (error) return { error: error.message };
  return {};
}

export async function saveSize(payload: {
  id: string | null;
  color_id: string;
  tamanho: string;
  estoque: number;
}): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_upsert_size", {
    p_id: payload.id,
    p_color_id: payload.color_id,
    p_tamanho: payload.tamanho,
    p_estoque: payload.estoque,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

export async function deleteSize(id: string): Promise<{ error?: string }> {
  const g = await autorizar("exclusao");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_size", { p_id: id });
  if (error) return { error: error.message };
  return {};
}

// --- Categorias (mutations) ----------------------------------------------

// admin_upsert_categoria grava a imagem como recebida (null apaga). Sem
// `imagem` no payload, reenvia a imagem atual em vez de apagá-la.
export async function saveCategoria(payload: {
  id: string | null;
  grupo: "calcados" | "acessorios";
  nome: string;
  slug: string;
  ordem: number;
  ativo: boolean;
  desconto_atacado_percentual: number | null;
  imagem?: string | null;
}): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("cadastro");
  if ("error" in g) return { error: g.error };
  if (!textosValidos(payload, ["grupo", "nome", "slug"]) || (payload.id !== null && typeof payload.id !== "string")) {
    return { error: MSG_DADOS_INVALIDOS };
  }
  const erroImagem = validarImagemCategoria(payload.imagem);
  if (erroImagem) return { error: erroImagem };

  let imagem = payload.imagem || null;
  if (payload.imagem === undefined && payload.id) {
    // A tabela categorias está fechada: a imagem atual vem da RPC de equipe admin_list_categorias.
    const { data, error } = await g.sb.rpc("admin_list_categorias");
    if (error || !Array.isArray(data)) return { error: "Não foi possível ler a imagem atual da categoria." };
    const atual = (data as { id: string; imagem?: string | null }[]).find((c) => c.id === payload.id);
    imagem = atual?.imagem ?? null;
  }

  const { data, error } = await g.sb.rpc("admin_upsert_categoria", {
    p_id: payload.id,
    p_grupo: payload.grupo,
    p_nome: payload.nome,
    p_slug: payload.slug,
    p_ordem: payload.ordem,
    p_ativo: payload.ativo,
    p_desconto_atacado_percentual: payload.desconto_atacado_percentual,
    p_imagem: imagem,
  });
  if (error) return { error: traduzirErroCategoria(error.message) };
  return { id: data as string };
}

export async function deleteCategoria(id: string): Promise<{ error?: string }> {
  const g = await autorizar("exclusao");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_categoria", { p_id: id });
  if (error) return { error: traduzirErroCategoria(error.message) };
  return {};
}

// --- Pedidos / Vendas (mutations) --------------------------------------

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<{ error?: string }> {
  const g = await autorizar("pedidos");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_update_order_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };
  return {};
}

// Liquidação manual de um pedido `pendente` quando o webhook não chegou:
// baixa estoque + grava `sales` via a RPC `admin_settle_order`.
export async function settleOrder(id: string): Promise<{ error?: string }> {
  const g = await autorizar("liquidar");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_settle_order", { p_order_id: id });
  if (error) return { error: error.message };
  const res = data as { ok?: boolean } | null;
  if (res && res.ok === false) return { error: "Não foi possível registrar o pagamento." };
  return {};
}

export async function insertSale(payload: {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  preco_unit: number;
  valor_total: number;
  forma_pagamento: string;
  cliente: string;
  produto_cor: string | null;
  produto_tamanho: string | null;
  size_id: string | null;
  is_atacado: boolean;
}): Promise<{ error?: string }> {
  const g = await autorizar("vendas-escrita");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_insert_sale", {
    p_produto_id: payload.produto_id,
    p_produto_nome: payload.produto_nome,
    p_quantidade: payload.quantidade,
    p_preco_unit: payload.preco_unit,
    p_valor_total: payload.valor_total,
    p_forma_pagamento: payload.forma_pagamento,
    p_cliente: payload.cliente || null,
    p_produto_cor: payload.produto_cor,
    p_produto_tamanho: payload.produto_tamanho,
    p_size_id: payload.size_id,
    p_is_atacado: payload.is_atacado,
  });
  if (error) return { error: error.message };
  return {};
}

export async function deleteSale(id: string): Promise<{ error?: string }> {
  const g = await autorizar("vendas-escrita");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_sale", { p_id: id });
  if (error) return { error: error.message };
  return {};
}

// --- Config ------------------------------------------------------------------

export async function fetchConfig(): Promise<ConfigAdmin | null> {
  const sb = await cliente("config");
  return sb ? lerConfig(sb) : null;
}

export async function saveConfig(payload: ConfigEntrega): Promise<{ error?: string }> {
  const g = await autorizar("config");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_config", {
    p_taxa: payload.taxa_entrega_local,
    p_whatsapp: payload.whatsapp,
    p_cidade: payload.cidade_taxa,
  });
  if (error) return { error: error.message };
  return {};
}

// Varejo ligado/desligado e bonificação (só superadmin; o banco confere com assert_papel).
export async function salvarLojaConfig(payload: LojaConfig): Promise<{ error?: string }> {
  const g = await autorizar("config");
  if ("error" in g) return { error: g.error };
  if (!lojaConfigValida(payload)) return { error: MSG_DADOS_INVALIDOS };
  const { error } = await g.sb.rpc("admin_set_loja_config", {
    p_varejo_ativo: payload.varejo_ativo,
    p_bonus_ativo: payload.bonus_ativo,
    p_bonus_min_pecas: payload.bonus_min_pecas,
    p_bonus_produto_id: payload.bonus_produto_id,
    p_bonus_quantidade: payload.bonus_quantidade,
  });
  if (error) return { error: traduzirErroLojaConfig(error.message) };
  return {};
}

// --- Revendedores ------------------------------------------------------------

export async function fetchRevendedores(p_status: string = "todos"): Promise<Revendedor[]> {
  const sb = await cliente("revendedores");
  return sb ? listarRevendedores(sb, p_status) : [];
}

export async function setRevendedorStatus(
  id: string,
  status: RevendedorStatus
): Promise<{ error?: string }> {
  const g = await autorizar("revendedores-status");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_set_revendedor_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };
  return {};
}

export async function saveRevendedor(
  payload: { id: string | null } & RevendedorPayload
): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("revendedores");
  if ("error" in g) return { error: g.error };
  if (
    !textosValidos(payload, ["razao_social", "cnpj", "responsavel", "email", "whatsapp", "cidade", "uf"]) ||
    (payload.id !== null && typeof payload.id !== "string")
  ) {
    return { error: MSG_DADOS_INVALIDOS };
  }
  const { id, ...campos } = payload;
  const { erros, payload: dados } = validarRevendedor(campos);
  if (!dados) return { error: Object.values(erros)[0] ?? "Dados do revendedor inválidos." };
  const { data, error } = await g.sb.rpc("admin_upsert_revendedor", {
    p_id: id,
    p_razao_social: dados.razao_social,
    p_cnpj: dados.cnpj,
    p_responsavel: dados.responsavel,
    p_email: dados.email,
    p_whatsapp: dados.whatsapp,
    p_cidade: dados.cidade,
    p_uf: dados.uf,
  });
  if (error) return { error: traduzirErroRevendedor(error.message) };
  return { id: data as string };
}

// --- Promoções -----------------------------------------------------------------

export async function fetchPromocoes(): Promise<{ promocoes?: Promocao[]; error?: string }> {
  const g = await autorizar("promocoes");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_list_promocoes");
  if (error) return { error: "Não foi possível carregar as promoções." };
  return { promocoes: (data ?? []) as Promocao[] };
}

export async function savePromocao(
  payload: { id: string | null } & PromocaoPayload
): Promise<{ error?: string; id?: string }> {
  const g = await autorizar("promocoes");
  if ("error" in g) return { error: g.error };
  const p = payload as Record<string, unknown>;
  if (
    !textosValidos(p, ["nome"]) ||
    typeof p.desconto !== "number" ||
    typeof p.ativa !== "boolean" ||
    (p.id !== null && typeof p.id !== "string") ||
    ["categoria_id", "inicio", "fim", "cupom"].some((c) => p[c] !== null && typeof p[c] !== "string")
  ) {
    return { error: MSG_DADOS_INVALIDOS };
  }
  const { id, ...campos } = payload;
  const { erros, payload: dados } = validarPromocao(payloadParaForm(campos));
  if (!dados) return { error: Object.values(erros)[0] ?? "Dados da promoção inválidos." };
  const { data, error } = await g.sb.rpc("admin_upsert_promocao", {
    p_id: id,
    p_nome: dados.nome,
    p_desconto: dados.desconto,
    p_categoria_id: dados.categoria_id,
    p_inicio: dados.inicio,
    p_fim: dados.fim,
    p_cupom: dados.cupom,
    p_ativa: dados.ativa,
  });
  if (error) return { error: traduzirErroPromocao(error.message) };
  return { id: data as string };
}

export async function deletePromocao(id: string): Promise<{ error?: string }> {
  const g = await autorizar("promocoes");
  if ("error" in g) return { error: g.error };
  const { error } = await g.sb.rpc("admin_delete_promocao", { p_id: id });
  if (error) return { error: traduzirErroPromocao(error.message) };
  return {};
}

// --- Usuários e convites -------------------------------------------------------

const ERRO_USUARIOS = "Não foi possível carregar os usuários.";

export async function fetchUsuarios(): Promise<{ usuarios?: Usuario[]; error?: string }> {
  const g = await autorizar("usuarios");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_list_users");
  if (error) return { error: ERRO_USUARIOS };
  return { usuarios: (data ?? []) as Usuario[] };
}

export async function saveUsuario(payload: {
  id: string;
  papel: Papel;
  ativo: boolean;
}): Promise<{ error?: string }> {
  const g = await autorizar("usuarios");
  if ("error" in g) return { error: g.error };
  if (typeof payload?.id !== "string" || !PAPEIS.includes(payload.papel) || typeof payload.ativo !== "boolean") {
    return { error: MSG_DADOS_INVALIDOS };
  }
  const { data, error: erroLista } = await g.sb.rpc("admin_list_users");
  if (erroLista) return { error: ERRO_USUARIOS };
  const alvo = ((data ?? []) as Usuario[]).find((u) => u.id === payload.id);
  if (!alvo) return { error: traduzirErroUsuarios("usuário não encontrado") };
  const bloqueio = motivoSemEdicao(g.perfil.papel, alvo, g.perfil.id);
  if (bloqueio) return { error: bloqueio };
  if (!podeGerirPapel(g.perfil.papel, payload.papel)) {
    return { error: "Seu papel não permite atribuir esse papel." };
  }
  const { error } = await g.sb.rpc("admin_set_user", {
    p_id: payload.id,
    p_papel: payload.papel,
    p_ativo: payload.ativo,
  });
  if (error) return { error: traduzirErroUsuarios(error.message) };
  return {};
}

export async function inviteUsuario(payload: { email: string; papel: Papel }): Promise<{ error?: string }> {
  const g = await autorizar("usuarios");
  if ("error" in g) return { error: g.error };
  if (typeof payload?.email !== "string" || !PAPEIS.includes(payload.papel)) return { error: MSG_DADOS_INVALIDOS };
  const { erros, email } = validarConvite(g.perfil.papel, payload.email, payload.papel);
  const primeiro = erros.email ?? erros.papel;
  if (primeiro) return { error: primeiro };
  const { error } = await g.sb.rpc("admin_invite_user", { p_email: email, p_papel: payload.papel });
  if (error) return { error: traduzirErroUsuarios(error.message) };
  return {};
}

export async function fetchConvites(): Promise<{ convites?: Convite[]; error?: string }> {
  const g = await autorizar("usuarios");
  if ("error" in g) return { error: g.error };
  const { data, error } = await g.sb.rpc("admin_list_convites");
  if (error) return { error: "Não foi possível carregar os convites." };
  return { convites: (data ?? []) as Convite[] };
}

// admin_delete_convite só remove convites ainda não usados; quem já criou a conta não é afetado.
export async function deleteConvite(email: string): Promise<{ error?: string }> {
  const g = await autorizar("usuarios");
  if ("error" in g) return { error: g.error };
  if (typeof email !== "string") return { error: MSG_DADOS_INVALIDOS };
  const alvo = email.trim().toLowerCase();
  const { data, error: erroLista } = await g.sb.rpc("admin_list_convites");
  if (erroLista) return { error: "Não foi possível carregar os convites." };
  const convite = ((data ?? []) as Convite[]).find((c) => c.email.toLowerCase() === alvo);
  if (!convite) return { error: traduzirErroUsuarios("convite não encontrado") };
  if (!podeGerirPapel(g.perfil.papel, convite.papel)) return { error: "Sem permissão." };
  const { error } = await g.sb.rpc("admin_delete_convite", { p_email: alvo });
  if (error) return { error: traduzirErroUsuarios(error.message) };
  return {};
}

// --- Textos da loja e Banner do hero ----------------------------------------

type ResultadoRpc = { data?: unknown; error?: string };

async function chamarRpc(
  acao: AcaoAdmin,
  nome: string,
  args?: Record<string, unknown>
): Promise<ResultadoRpc> {
  try {
    const g = await autorizar(acao);
    if ("error" in g) return { error: g.error };
    const { data, error } = await g.sb.rpc(nome, args);
    if (error) return { error: error.message };
    return { data };
  } catch {
    return { error: "Não foi possível falar com o servidor agora. Tente de novo." };
  }
}

export async function fetchTextos(): Promise<{ valores?: Record<string, string>; error?: string }> {
  const r = await chamarRpc("textos", "get_textos");
  if (r.error) return { error: r.error };
  return { valores: mesclarTextos(r.data) };
}

export async function saveTextos(valores: Record<string, string>): Promise<{ error?: string }> {
  const invalido = validarValoresServidor(valores);
  if (invalido) return { error: invalido };
  const r = await chamarRpc("textos", "admin_set_textos", { p_valores: valores });
  return r.error ? { error: r.error } : {};
}

export async function fetchBanner(): Promise<{ banner?: BannerServidor; error?: string }> {
  const r = await chamarRpc("banner", "admin_get_banner_hero");
  if (r.error) return { error: r.error };
  const banner = normalizarServidor(r.data);
  return banner ? { banner } : { error: "Banner não encontrado." };
}

export async function saveBannerRascunho(dados: BannerDados): Promise<{ error?: string }> {
  const invalido = validarRascunhoServidor(dados);
  if (invalido) return { error: invalido };
  const r = await chamarRpc("banner", "admin_save_banner_rascunho", { p_dados: montarRascunho(dados) });
  return r.error ? { error: r.error } : {};
}

export async function publishBanner(): Promise<{ error?: string }> {
  const r = await chamarRpc("banner", "admin_publish_banner");
  return r.error ? { error: r.error } : {};
}

export async function discardBanner(): Promise<{ error?: string }> {
  const r = await chamarRpc("banner", "admin_discard_banner");
  return r.error ? { error: r.error } : {};
}
