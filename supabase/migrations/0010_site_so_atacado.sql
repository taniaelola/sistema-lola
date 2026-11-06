-- =====================================================================
-- 0010_site_so_atacado.sql — site só atacado, catálogo fechado, bônus, papéis
-- Autoridade: specs 2026-10-27 (§4) e 2026-11-05 (§5, §12); auditoria S-01..S-08.
-- Aplicar em UMA janela junto com o deploy (a revogação do SELECT quebra o app antigo).
-- Rollback: supabase/rollback-0010.sql
-- =====================================================================
set search_path = public, extensions;

-- ========== A. FLAGS, CONFIG E COLUNAS DO BÔNUS ==========
alter table admin_config
  add column if not exists varejo_ativo boolean not null default false,
  add column if not exists bonus_ativo boolean not null default false,
  add column if not exists bonus_min_pecas int not null default 15 check (bonus_min_pecas >= 1),
  add column if not exists bonus_produto_id uuid null references products(id) on delete set null,
  add column if not exists bonus_quantidade int not null default 1 check (bonus_quantidade >= 1);

alter table products add column if not exists somente_bonus boolean not null default false;

alter table orders
  add column if not exists bonus_aplicado boolean not null default false,
  add column if not exists bonus_aviso text null;

create or replace function get_loja_flags()
returns jsonb language sql security definer stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'varejo_ativo', c.varejo_ativo,
    'bonus_ativo', c.bonus_ativo,
    'bonus_min_pecas', c.bonus_min_pecas,
    'bonus_quantidade', c.bonus_quantidade,
    'bonus_produto_nome', (select p.nome from products p where p.id = c.bonus_produto_id and p.ativo))
  from admin_config c where c.id = 1
$$;
revoke all on function get_loja_flags() from public;
grant execute on function get_loja_flags() to anon, authenticated;

create or replace function admin_get_config()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin']);
  return (select jsonb_build_object(
    'taxa_entrega_local', taxa_entrega_local, 'whatsapp', whatsapp, 'cidade_taxa', cidade_taxa,
    'varejo_ativo', varejo_ativo, 'bonus_ativo', bonus_ativo, 'bonus_min_pecas', bonus_min_pecas,
    'bonus_produto_id', bonus_produto_id, 'bonus_quantidade', bonus_quantidade)
  from admin_config where id = 1);
end $$;

create or replace function admin_set_loja_config(
  p_varejo_ativo boolean, p_bonus_ativo boolean, p_bonus_min_pecas int,
  p_bonus_produto_id uuid, p_bonus_quantidade int
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin']);
  if coalesce(p_bonus_min_pecas, 0) < 1 or coalesce(p_bonus_quantidade, 0) < 1 then
    raise exception 'valores do bônus inválidos';
  end if;
  if coalesce(p_bonus_ativo, false)
     and (p_bonus_produto_id is null or not exists (select 1 from products where id = p_bonus_produto_id)) then
    raise exception 'produto do bônus obrigatório para ligar a bonificação';
  end if;
  update admin_config set varejo_ativo = coalesce(p_varejo_ativo, false),
    bonus_ativo = coalesce(p_bonus_ativo, false), bonus_min_pecas = p_bonus_min_pecas,
    bonus_produto_id = p_bonus_produto_id, bonus_quantidade = p_bonus_quantidade
  where id = 1;
end $$;
revoke all on function admin_set_loja_config(boolean, boolean, int, uuid, int) from public, anon;
grant execute on function admin_set_loja_config(boolean, boolean, int, uuid, int) to authenticated;
