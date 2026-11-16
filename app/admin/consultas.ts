import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Categoria,
  EstoqueBaixoItem,
  Order,
  Product,
  Revendedor,
  Sale,
} from "@/lib/types";

import type { ConfigAdmin } from "@/lib/admin-config";

export type { ConfigAdmin };

async function lista<T>(sb: SupabaseClient, rpc: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await sb.rpc(rpc, args);
  if (error) return [];
  return (data ?? []) as T[];
}

export function listarProdutos(sb: SupabaseClient): Promise<Product[]> {
  return lista<Product>(sb, "admin_list_products");
}

export function listarCategorias(sb: SupabaseClient): Promise<Categoria[]> {
  return lista<Categoria>(sb, "admin_list_categorias");
}

export function listarPedidos(sb: SupabaseClient, p_filtro: string): Promise<Order[]> {
  return lista<Order>(sb, "admin_list_orders", { p_filtro });
}

export function listarVendas(sb: SupabaseClient, p_filtro: string): Promise<Sale[]> {
  return lista<Sale>(sb, "admin_list_sales", { p_filtro });
}

export function listarRevendedores(sb: SupabaseClient, p_status: string): Promise<Revendedor[]> {
  return lista<Revendedor>(sb, "admin_list_revendedores", { p_status });
}

export function listarEstoqueBaixo(sb: SupabaseClient): Promise<EstoqueBaixoItem[]> {
  return lista<EstoqueBaixoItem>(sb, "admin_estoque_baixo");
}

export async function lerConfig(sb: SupabaseClient): Promise<ConfigAdmin | null> {
  const { data, error } = await sb.rpc("admin_get_config");
  if (error) return null;
  return (data as ConfigAdmin | null) ?? null;
}
