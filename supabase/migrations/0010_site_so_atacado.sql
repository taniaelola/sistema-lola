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

-- ========== B. CATÁLOGO FECHADO ==========
-- Acesso: equipe ou revendedor aprovado e ativo. Interna: nenhum papel a executa direto.
create or replace function _assert_catalogo_acesso()
returns void language plpgsql security definer stable set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_papel papel_usuario; v_ativo boolean;
begin
  if v_uid is null then raise exception 'sem permissão' using errcode = '42501'; end if;
  select p.papel, p.ativo into v_papel, v_ativo from profiles p where p.id = v_uid;
  if not coalesce(v_ativo, false) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if v_papel in ('superadmin', 'admin', 'supervisor') then return; end if;
  perform _atacado_revendedor_aprovado();   -- lança 42501 se não aprovado
end $$;
revoke all on function _assert_catalogo_acesso() from public, anon, authenticated;

-- Um produto no formato público, sem campos internos (nunca reutiliza _product_json).
create or replace function _catalogo_produto(p products, p_com_estoque boolean)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.nome, 'descricao', p.descricao,
    'caracteristicas', to_jsonb(p.caracteristicas), 'destaque', p.destaque,
    'categoria', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'slug', c.slug, 'grupo', c.grupo)
                  from categorias c where c.id = p.categoria_id),
    'preco_varejo', _preco_varejo(p.preco, _desconto_efetivo(p)),
    'preco_atacado', _preco_atacado(p.preco, p.preco_atacado,
      (select c.desconto_atacado_percentual from categorias c where c.id = p.categoria_id)),
    'cores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id, 'nome', pc.nome, 'hex', pc.hex, 'imagens', to_jsonb(pc.imagens),
        'tamanhos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ps.id, 'tamanho', ps.tamanho, 'estoque', ps.estoque)
                           order by ps.tamanho)
          from product_sizes ps where ps.color_id = pc.id and p_com_estoque), '[]'::jsonb))
        order by pc.ordem)
      from product_colors pc where pc.product_id = p.id), '[]'::jsonb))
$$;
revoke all on function _catalogo_produto(products, boolean) from public, anon, authenticated;

create or replace function get_catalogo_revendedor(p_categoria text default null)
returns jsonb language plpgsql security definer stable set search_path = public, extensions as $$
begin
  perform _assert_catalogo_acesso();
  return jsonb_build_object(
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'slug', c.slug, 'grupo', c.grupo)
                                             order by c.ordem) from categorias c where c.ativo), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(_catalogo_produto(p, true) order by p.ordem, p.nome)
      from products p
      where p.ativo and not p.somente_bonus
        and exists (select 1 from categorias c where c.id = p.categoria_id and c.ativo)
        and (p_categoria is null or exists (select 1 from categorias c where c.id = p.categoria_id and c.ativo and c.slug = p_categoria))
    ), '[]'::jsonb));
end $$;

create or replace function get_produto_revendedor(p_slug text)
returns jsonb language plpgsql security definer stable set search_path = public, extensions as $$
declare v_p products;
begin
  perform _assert_catalogo_acesso();
  select * into v_p from products p where p.slug = p_slug and p.ativo and not p.somente_bonus
    and exists (select 1 from categorias c where c.id = p.categoria_id and c.ativo);
  if not found then return null; end if;
  return _catalogo_produto(v_p, true);
end $$;

-- Pública por decisão do dono (spec §2/§5.3): até 8 destaques, preços já calculados.
create or replace function get_destaques_atacado()
returns jsonb language sql security definer stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'nome', p.nome,
      'imagem', (select pc.imagens[1] from product_colors pc where p.id = pc.product_id order by pc.ordem limit 1),
      'preco_varejo', _preco_varejo(p.preco, _desconto_efetivo(p)),
      'preco_atacado', _preco_atacado(p.preco, p.preco_atacado,
        (select c.desconto_atacado_percentual from categorias c where c.id = p.categoria_id))) as j
    from products p
    where p.ativo and p.destaque and not p.somente_bonus
      and exists (select 1 from categorias c where c.id = p.categoria_id and c.ativo)
      and exists (select 1 from product_colors pc join product_sizes ps on ps.color_id = pc.id
                  where pc.product_id = p.id and ps.estoque > 0)
    order by p.ordem, p.nome
    limit 8) x
$$;

revoke all on function get_catalogo_revendedor(text), get_produto_revendedor(text), get_destaques_atacado() from public, anon;
grant execute on function get_catalogo_revendedor(text), get_produto_revendedor(text) to authenticated;
grant execute on function get_destaques_atacado() to anon, authenticated;

-- Imagem de categoria para a rota /api/categoria-img (só a imagem; categoria ativa).
create or replace function get_categoria_imagem(p_id uuid)
returns text language sql security definer stable set search_path = public, extensions as $$
  select c.imagem from categorias c where c.id = p_id and c.ativo
$$;
revoke all on function get_categoria_imagem(uuid) from public;
grant execute on function get_categoria_imagem(uuid) to anon, authenticated;

-- Fecha a leitura direta (achados S-01/S-02) e dropa as políticas abertas.
drop policy if exists prod_read on products;
drop policy if exists col_read on product_colors;
drop policy if exists siz_read on product_sizes;
drop policy if exists cat_read on categorias;
revoke all on products, product_colors, product_sizes, categorias from anon, authenticated;

-- S-03: a vitrine "surpresa" é de varejo e devolvia preço de atacado e estoque.
revoke all on function public_get_surpresa() from public, anon, authenticated;
