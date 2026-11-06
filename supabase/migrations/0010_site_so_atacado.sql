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


-- ========== C. CHECKOUT (varejo off, bônus), CONVIDADO REVOGADO, WEBHOOK COM VALOR ==========
-- Mesma assinatura de 11 argumentos de 0008 (create or replace, sem sobrecarga). Corpo de 0008 com:
-- (1) varejo lança "varejo desativado" se admin_config.varejo_ativo = false; (2) atacado aplica o bônus;
-- (3) EXECUTE só para authenticated (decisão 1(a): checkout de convidado fechado).
create or replace function checkout_iniciar_pedido(
  p_cliente_nome text,
  p_cliente_telefone text,
  p_entrega_tipo entrega_tipo,
  p_endereco_rua text,
  p_endereco_numero text,
  p_endereco_bairro text,
  p_endereco_complemento text,
  p_endereco_cep text,
  p_endereco_cidade text,
  p_items jsonb,               -- varejo: [{produto_id,color_id,size_id,quantidade}]; atacado: ignorado
  p_is_atacado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_prod products;
  v_size product_sizes;
  v_color product_colors;
  v_preco numeric;
  v_qtd int;
  v_qtd_total int;
  v_prod_total numeric := 0;
  v_taxa numeric := 0;
  v_mp_itens jsonb := '[]'::jsonb;
  v_uid uuid := auth.uid();
  v_rev uuid;
  v_ca carrinho_atacado;
  v_pct int;
  v_skus int;
  v_cfg admin_config;
  v_pecas int;
  v_bsize product_sizes;
  v_bcolor product_colors;
  v_bprod products;
begin
  -- ===== ATACADO =====
  if coalesce(p_is_atacado, false) then
    -- Lança 'revendedor não aprovado' sem sessão, sem revendedor aprovado ou
    -- com perfil inativo. Nada do payload identifica o revendedor.
    v_rev := _atacado_revendedor_aprovado();

    if not exists (select 1 from carrinho_atacado where revendedor_id = v_rev) then
      raise exception 'carrinho vazio';
    end if;

    if p_entrega_tipo = 'entrega' then
      select taxa_entrega_local into v_taxa from admin_config where id = 1;
    end if;

    insert into orders(status, cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa,
      endereco_rua, endereco_numero, endereco_bairro, endereco_complemento, endereco_cep, endereco_cidade,
      is_atacado, customer_id, revendedor_id, valor_produtos, valor_total)
    values ('pendente', p_cliente_nome, regexp_replace(p_cliente_telefone,'\D','','g'),
      p_entrega_tipo, coalesce(v_taxa,0),
      p_endereco_rua, p_endereco_numero, p_endereco_bairro, p_endereco_complemento, p_endereco_cep,
      case when p_entrega_tipo = 'entrega_fora' then p_endereco_cidade else null end,
      true, v_uid, v_rev, 0, 0)
    returning id into v_order_id;

    -- Mesma ordem de trava do varejo (size_id crescente) => deadlock-safe entre os dois.
    for v_ca in
      select ca.* from carrinho_atacado ca
      where ca.revendedor_id = v_rev
      order by ca.size_id
    loop
      select * into v_prod from products where id = v_ca.product_id;
      if not found then raise exception 'produto indisponível'; end if;
      if not v_prod.ativo then
        raise exception 'produto indisponível: %', v_prod.nome;
      end if;
      select * into v_color from product_colors
        where id = v_ca.color_id and product_id = v_prod.id;
      if not found then raise exception 'cor indisponível: %', v_prod.nome; end if;
      select * into v_size from product_sizes
        where id = v_ca.size_id and color_id = v_color.id
        for update;
      if not found then raise exception 'tamanho indisponível: %', v_prod.nome; end if;

      -- Um size_id só aparece uma vez por revendedor (unique + checagens de
      -- cor/tamanho acima), então a linha é o total pedido daquele SKU.
      if v_size.estoque < v_ca.quantidade then
        raise exception 'estoque insuficiente: % - % - % (disponível: %)',
          v_prod.nome, v_color.nome, v_size.tamanho, v_size.estoque;
      end if;

      v_pct := null;
      select c.desconto_atacado_percentual into v_pct from categorias c where c.id = v_prod.categoria_id;
      v_preco := _preco_atacado(v_prod.preco, v_prod.preco_atacado, v_pct);
      v_qtd := v_ca.quantidade;
      v_prod_total := v_prod_total + v_preco * v_qtd;

      insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
        color_id, size_id, quantidade, preco_unit, subtotal)
      values (v_order_id, v_prod.id, v_prod.nome, v_color.nome, v_size.tamanho,
        v_color.id, v_size.id, v_qtd, v_preco, v_preco * v_qtd);

      v_mp_itens := v_mp_itens || jsonb_build_object(
        'titulo', concat_ws(' - ', v_prod.nome, v_color.nome, v_size.tamanho),
        'quantidade', v_qtd,
        'preco_unit', v_preco);
    end loop;

    -- Conta sobre o que de fato foi gravado no pedido. A exceção desfaz o
    -- pedido inteiro (nenhum pedido é criado abaixo do mínimo).
    select count(distinct (i.produto_id, i.color_id, i.size_id))::int into v_skus
    from order_items i where i.order_id = v_order_id;
    if v_skus < 12 then
      raise exception 'mínimo de 12 SKUs distintos (carrinho tem %)', v_skus;
    end if;

    -- ===== BÔNUS (spec 27/10 §4): não acumula, recalculado a cada pedido =====
    -- Entra depois da checagem de 12 SKUs e não vai para v_mp_itens (o Mercado Pago só vê itens pagos).
    select coalesce(sum(i.quantidade), 0)::int into v_pecas from order_items i where i.order_id = v_order_id;
    select * into v_cfg from admin_config where id = 1;
    if v_cfg.bonus_ativo and v_cfg.bonus_produto_id is not null and v_pecas >= v_cfg.bonus_min_pecas then
      select ps.* into v_bsize
      from product_sizes ps
      join product_colors pc on pc.id = ps.color_id
      join products p on p.id = pc.product_id
      where p.id = v_cfg.bonus_produto_id and p.ativo
        -- estoque disponível = estoque menos o que este pedido já reservou nesse mesmo size_id
        and ps.estoque - coalesce((select sum(oi.quantidade) from order_items oi
              where oi.order_id = v_order_id and oi.size_id = ps.id), 0) >= v_cfg.bonus_quantidade
      order by ps.estoque - coalesce((select sum(oi.quantidade) from order_items oi
              where oi.order_id = v_order_id and oi.size_id = ps.id), 0) desc, ps.id
      limit 1
      for update of ps skip locked;
      if found then
        select * into v_bcolor from product_colors where id = v_bsize.color_id;
        select * into v_bprod from products where id = v_cfg.bonus_produto_id;
        insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
          color_id, size_id, quantidade, preco_unit, subtotal)
        values (v_order_id, v_bprod.id, v_bprod.nome, v_bcolor.nome, v_bsize.tamanho,
          v_bcolor.id, v_bsize.id, v_cfg.bonus_quantidade, 0, 0);
        update orders set bonus_aplicado = true where id = v_order_id;
      else
        update orders set bonus_aviso = 'bônus indisponível: sem estoque, produto inativo ou em uso por outro pedido'
        where id = v_order_id;
      end if;
    end if;

    update orders set valor_produtos = v_prod_total,
                      valor_total = v_prod_total + coalesce(v_taxa,0)
    where id = v_order_id;

    return jsonb_build_object('id', v_order_id, 'entrega_taxa', coalesce(v_taxa, 0),
      'itens', coalesce(v_mp_itens, '[]'::jsonb));
  end if;

  -- ===== VAREJO (corpo de 0007; customer_id da sessão, revendedor_id nulo) =====
  if not coalesce((select c.varejo_ativo from admin_config c where c.id = 1), false) then
    raise exception 'varejo desativado';
  end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'carrinho vazio';
  end if;

  -- taxa de entrega
  if p_entrega_tipo = 'entrega' then
    select taxa_entrega_local into v_taxa from admin_config where id = 1;
  end if;

  insert into orders(status, cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa,
    endereco_rua, endereco_numero, endereco_bairro, endereco_complemento, endereco_cep, endereco_cidade,
    is_atacado, customer_id, revendedor_id, valor_produtos, valor_total)
  values ('pendente', p_cliente_nome, regexp_replace(p_cliente_telefone,'\D','','g'),
    p_entrega_tipo, coalesce(v_taxa,0),
    p_endereco_rua, p_endereco_numero, p_endereco_bairro, p_endereco_complemento, p_endereco_cep,
    case when p_entrega_tipo = 'entrega_fora' then p_endereco_cidade else null end,
    false, v_uid, null, 0, 0)
  returning id into v_order_id;

  -- Ordena por size_id (nulls last) => travas `for update` sempre na mesma ordem (deadlock-safe).
  for v_item in
    select t.value
    from jsonb_array_elements(p_items) as t(value)
    order by nullif(t.value->>'size_id','')::uuid nulls last
  loop
    v_qtd := (v_item->>'quantidade')::int;
    if v_qtd is null or v_qtd < 1 then raise exception 'quantidade inválida'; end if;

    select * into v_prod  from products       where id = (v_item->>'produto_id')::uuid and ativo;
    if not found then raise exception 'produto indisponível'; end if;
    select * into v_color from product_colors where id = (v_item->>'color_id')::uuid and product_id = v_prod.id;
    if not found then raise exception 'cor indisponível'; end if;

    if nullif(v_item->>'size_id','') is not null then
      select * into v_size from product_sizes where id = (v_item->>'size_id')::uuid and color_id = v_color.id
        for update;
      if not found then raise exception 'tamanho indisponível'; end if;
      -- Soma a quantidade pedida para este size_id em todo o carrinho (evita oversell do mesmo SKU repetido).
      select coalesce(sum((it->>'quantidade')::int), 0) into v_qtd_total
      from jsonb_array_elements(p_items) as it
      where nullif(it->>'size_id','')::uuid = nullif(v_item->>'size_id','')::uuid;
      if v_size.estoque < v_qtd_total then raise exception 'estoque insuficiente'; end if;
    end if;

    v_preco := _preco_varejo(v_prod.preco, _desconto_efetivo(v_prod));
    v_prod_total := v_prod_total + v_preco * v_qtd;

    insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
      color_id, size_id, quantidade, preco_unit, subtotal)
    values (v_order_id, v_prod.id, v_prod.nome, v_color.nome,
      case when nullif(v_item->>'size_id','') is not null then v_size.tamanho else null end,
      v_color.id, nullif(v_item->>'size_id','')::uuid, v_qtd, v_preco, v_preco * v_qtd);

    -- Linhas precificadas server-side para montar a preferência Mercado Pago.
    -- É esta a fonte da verdade do valor cobrado — nunca o preço vindo do cliente.
    v_mp_itens := v_mp_itens || jsonb_build_object(
      'titulo', concat_ws(' - ', v_prod.nome, v_color.nome,
         case when nullif(v_item->>'size_id','') is not null then v_size.tamanho end),
      'quantidade', v_qtd,
      'preco_unit', v_preco);
  end loop;

  update orders set valor_produtos = v_prod_total,
                    valor_total = v_prod_total + coalesce(v_taxa,0)
  where id = v_order_id;

  return jsonb_build_object('id', v_order_id, 'entrega_taxa', coalesce(v_taxa, 0),
    'itens', coalesce(v_mp_itens, '[]'::jsonb));
end $$;


-- Convidado fechado (decisão 1(a)): só authenticated executa o checkout. O ramo de atacado
-- continua exigindo revendedor aprovado; o de varejo exige a flag varejo_ativo.
revoke all on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
from public, anon;
grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to authenticated;

-- Webhook: p_transaction_amount passa a ser OBRIGATÓRIO e é conferido com o total do pedido.
-- A assinatura antiga (5 args, valor opcional) é removida: sem sobrecarga que mantenha a porta aberta.
drop function if exists mp_register_order_payment(text, uuid, text, text, numeric);

create or replace function mp_register_order_payment(
  p_secret text, p_order_id uuid, p_mp_payment_id text, p_forma_pagamento text,
  p_transaction_amount numeric
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ord orders;
begin
  perform assert_webhook(p_secret);
  select * into v_ord from orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;

  -- idempotência: pedido já liquidado, ou o mesmo pagamento já registrado => no-op.
  if v_ord.status <> 'pendente'
     or (v_ord.mp_payment_id is not null and v_ord.mp_payment_id = p_mp_payment_id) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- O valor cobrado tem de bater com o total do pedido (tolerância de 1 centavo). Sem exceção: o
  -- Mercado Pago retenta em HTTP 500; ok:false vira 200 no webhook. Nunca liquida; o pedido segue pendente.
  if p_transaction_amount is null then
    raise warning 'pagamento sem valor: pedido % esperava %', p_order_id, v_ord.valor_total;
    return jsonb_build_object('ok', false, 'reason', 'valor_ausente',
      'esperado', v_ord.valor_total, 'recebido', null);
  end if;
  if p_transaction_amount < v_ord.valor_total - 0.01 then
    raise warning 'pagamento abaixo do esperado: pedido % esperava % recebeu %',
      p_order_id, v_ord.valor_total, p_transaction_amount;
    return jsonb_build_object('ok', false, 'reason', 'valor_abaixo_do_esperado',
      'esperado', v_ord.valor_total, 'recebido', p_transaction_amount);
  end if;
  if p_transaction_amount > v_ord.valor_total + 0.01 then
    raise warning 'pagamento acima do esperado (revisão manual): pedido % esperava % recebeu %',
      p_order_id, v_ord.valor_total, p_transaction_amount;
    return jsonb_build_object('ok', false, 'reason', 'valor_acima_do_esperado',
      'esperado', v_ord.valor_total, 'recebido', p_transaction_amount);
  end if;

  perform _settle_order(p_order_id, p_mp_payment_id, p_forma_pagamento);

  return jsonb_build_object('ok', true);
end $$;
-- Continua chamável com a chave anon + segredo do webhook (decisão 3(a)).
revoke all on function mp_register_order_payment(text, uuid, text, text, numeric) from public;
grant execute on function mp_register_order_payment(text, uuid, text, text, numeric) to anon, authenticated;

-- Leitura pública de pedido por id: sem os campos de endereço (chaves reais de _order_json, 0002).
create or replace function public_get_order(p_id uuid)
returns jsonb language sql security definer set search_path = public, extensions stable as $$
  select _order_json(p_id) - 'endereco_rua' - 'endereco_numero' - 'endereco_bairro'
    - 'endereco_complemento' - 'endereco_cep' - 'endereco_cidade';
$$;

-- ========== D. PAPÉIS: PEDIDOS SEM VALORES E CADASTRO DE PRODUTO PARA O SUPERVISOR ==========
-- Supervisor: vê Pedidos sem valores (como admin_list_sales) e cadastra produtos sem mexer em preço.
-- Preço (preco, preco_atacado, desconto_percentual, desconto_atacado_percentual) segue admin/superadmin.
-- admin_set_desconto, admin_set_surpresa e admin_delete_* continuam só admin/superadmin (não mudam aqui).
-- Para qualquer papel: ativar produto com preco = 0 lança 'defina o preço antes de ativar'.

-- Máscara de dinheiro de um pedido (formato de _order_json): valor_produtos/valor_total/entrega_taxa e
-- items[].preco_unit/subtotal viram JSON null; pedido sem itens devolve items []. Helper interno, sem grant.
create or replace function _mascarar_dinheiro_pedido(p jsonb)
returns jsonb language sql immutable set search_path = public, extensions as $$
  select p || jsonb_build_object('valor_produtos', null, 'valor_total', null, 'entrega_taxa', null,
    'items', coalesce((select jsonb_agg(it || jsonb_build_object('preco_unit', null, 'subtotal', null) order by n)
                       from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) with ordinality as t(it, n)), '[]'::jsonb));
$$;
revoke all on function _mascarar_dinheiro_pedido(jsonb) from public, anon, authenticated;

-- Pedidos: o supervisor recebe a máscara acima (telefone e endereço continuam). Chaves reais de _order_json (0002).
create or replace function admin_list_orders(p_filtro text default 'todos')
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare v_papel text;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((
    select jsonb_agg(
      case when v_papel = 'supervisor' then _mascarar_dinheiro_pedido(x.j) else x.j end
      order by x.created_at desc)
    from (
      select o.created_at,
        (_order_json(o.id) || jsonb_build_object(
          'cliente_telefone', o.cliente_telefone, 'mp_payment_id', o.mp_payment_id,
          'forma_pagamento', o.forma_pagamento, 'revendedor_id', o.revendedor_id)) as j
      from orders o
      where (p_filtro = 'todos' or p_filtro is null)
         or (p_filtro = 'varejo'  and o.is_atacado = false)
         or (p_filtro = 'atacado' and o.is_atacado = true)
    ) x
  ), '[]'::jsonb);
end $$;

-- Leitura pública de pedido: sem endereço; se quem chama é supervisor ativo, sem dinheiro (senão os ids
-- de admin_list_orders anulariam a máscara). Mesma assinatura e grants da seção C (anon e authenticated).
create or replace function public_get_order(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare v_j jsonb;
begin
  v_j := _order_json(p_id) - 'endereco_rua' - 'endereco_numero' - 'endereco_bairro'
    - 'endereco_complemento' - 'endereco_cep' - 'endereco_cidade';
  if v_j is not null and exists (select 1 from profiles where id = auth.uid() and ativo and papel = 'supervisor') then
    v_j := _mascarar_dinheiro_pedido(v_j);
  end if;
  return v_j;
end $$;
revoke all on function public_get_order(uuid) from public;
grant execute on function public_get_order(uuid) to anon, authenticated;

-- _product_json passa a expor somente_bonus (o editor reenvia o valor atual). Cópia de 0007:380 + a chave.
create or replace function _product_json(p products)
returns jsonb language sql set search_path = public stable as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.nome, 'categoria_id', p.categoria_id,
    'colecao', p.colecao, 'preco', p.preco, 'desconto_percentual', p.desconto_percentual,
    'desconto_efetivo', _desconto_efetivo(p), 'created_at', p.created_at,
    'preco_atacado', p.preco_atacado, 'descricao', p.descricao,
    'caracteristicas', to_jsonb(p.caracteristicas), 'ativo', p.ativo,
    'destaque', p.destaque, 'ordem', p.ordem, 'surpresa_ativo', p.surpresa_ativo,
    'somente_bonus', p.somente_bonus,
    'categoria', (select to_jsonb(c) - 'imagem' from categorias c where c.id = p.categoria_id),
    'colors', coalesce((select jsonb_agg(jsonb_build_object(
        'id', col.id, 'product_id', col.product_id, 'nome', col.nome, 'hex', col.hex,
        'imagens', to_jsonb(col.imagens), 'ordem', col.ordem,
        'sizes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', s.id, 'color_id', s.color_id, 'tamanho', s.tamanho, 'estoque', s.estoque)
            order by s.tamanho) from product_sizes s where s.color_id = col.id), '[]'::jsonb))
      order by col.ordem) from product_colors col where col.product_id = p.id), '[]'::jsonb));
$$;

-- Produtos: leitura do cadastro para o supervisor.
create or replace function admin_list_products()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((select jsonb_agg(_product_json(p) order by p.ordem, p.nome) from products p), '[]'::jsonb);
end $$;

-- Novo parâmetro final (p_somente_bonus): muda a assinatura, então a antiga é derrubada.
drop function if exists admin_upsert_product(uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text);
create or replace function admin_upsert_product(
  p_id uuid, p_nome text, p_categoria_id uuid, p_colecao text,
  p_preco numeric, p_desconto_percentual int, p_preco_atacado numeric, p_descricao text,
  p_caracteristicas text[], p_ativo boolean, p_destaque boolean, p_ordem int, p_slug text,
  p_somente_bonus boolean default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_papel text; v_preco numeric; v_cat_atual uuid; v_pa numeric;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    if v_papel = 'supervisor' then
      -- cadastro sem preço: nasce com preco 0 e inativo até um admin definir o preço
      insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
        descricao,caracteristicas,ativo,destaque,ordem,slug,somente_bonus)
      values (p_nome,p_categoria_id,p_colecao,0,null,null,
        p_descricao,coalesce(p_caracteristicas,'{}'),false,p_destaque,coalesce(p_ordem,0),v_slug,
        coalesce(p_somente_bonus,false))
      returning id into v_id;
    else
      if coalesce(p_ativo,false) and coalesce(p_preco,0) = 0 then
        raise exception 'defina o preço antes de ativar';
      end if;
      insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
        descricao,caracteristicas,ativo,destaque,ordem,slug,somente_bonus)
      values (p_nome,p_categoria_id,p_colecao,p_preco,nullif(p_desconto_percentual,0),p_preco_atacado,
        p_descricao,coalesce(p_caracteristicas,'{}'),p_ativo,p_destaque,coalesce(p_ordem,0),v_slug,
        coalesce(p_somente_bonus,false))
      returning id into v_id;
    end if;
  else
    if v_papel = 'supervisor' then
      -- preco, preco_atacado e desconto_percentual atuais são preservados (argumentos ignorados)
      select preco, categoria_id, preco_atacado into v_preco, v_cat_atual, v_pa from products where id = p_id;
      if not found then raise exception 'registro não encontrado'; end if;
      -- mudar de categoria muda o preço de atacado efetivo (desconto da categoria) quando não há override
      if p_categoria_id is distinct from v_cat_atual and v_pa is null
         and (select desconto_atacado_percentual from categorias where id = v_cat_atual)
             is distinct from (select desconto_atacado_percentual from categorias where id = p_categoria_id) then
        raise exception 'sem permissão para mudar a categoria: altera o preço de atacado' using errcode = '42501';
      end if;
      if coalesce(p_ativo,false) and v_preco = 0 then
        raise exception 'defina o preço antes de ativar';
      end if;
      update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao,
        descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
        destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug,
        somente_bonus=coalesce(p_somente_bonus, products.somente_bonus)
      where id=p_id returning id into v_id;
    else
      if coalesce(p_ativo,false) and coalesce(p_preco,0) = 0 then
        raise exception 'defina o preço antes de ativar';
      end if;
      update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao, preco=p_preco,
        desconto_percentual=nullif(p_desconto_percentual,0), preco_atacado=p_preco_atacado,
        descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
        destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug,
        somente_bonus=coalesce(p_somente_bonus, products.somente_bonus)
      where id=p_id returning id into v_id;
    end if;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function admin_set_ativo(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_ativo and exists (select 1 from products where id = p_id and preco = 0) then
    raise exception 'defina o preço antes de ativar';
  end if;
  update products set ativo = p_ativo where id = p_id;
end $$;

create or replace function admin_set_destaque(p_id uuid, p_destaque boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  update products set destaque = p_destaque where id = p_id;
end $$;

create or replace function admin_upsert_color(
  p_id uuid, p_product_id uuid, p_nome text, p_hex text,
  p_imagens text[], p_ordem int
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_id is null then
    insert into product_colors(product_id, nome, hex, imagens, ordem)
    values (p_product_id, p_nome, p_hex, coalesce(p_imagens,'{}'), coalesce(p_ordem,0))
    returning id into v_id;
  else
    update product_colors set product_id=p_product_id, nome=p_nome, hex=p_hex,
      imagens=coalesce(p_imagens,'{}'), ordem=coalesce(p_ordem,0)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function admin_upsert_size(
  p_id uuid, p_color_id uuid, p_tamanho text, p_estoque int
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_estoque is null or p_estoque < 0 then raise exception 'estoque inválido'; end if;
  if p_id is null then
    insert into product_sizes(color_id, tamanho, estoque)
    values (p_color_id, p_tamanho, p_estoque)
    returning id into v_id;
  else
    update product_sizes set color_id=p_color_id, tamanho=p_tamanho,
      estoque=p_estoque
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function admin_list_categorias()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.grupo, c.ordem, c.nome) from categorias c), '[]'::jsonb);
end $$;

-- Supervisor: update não toca desconto_atacado_percentual; insert grava null.
create or replace function admin_upsert_categoria(
  p_id uuid, p_grupo text, p_nome text, p_slug text, p_ordem int,
  p_ativo boolean, p_desconto_atacado_percentual int, p_imagem text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_papel text; v_imagem text := nullif(trim(coalesce(p_imagem, '')), '');
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  if v_imagem is not null and (left(v_imagem, 11) <> 'data:image/'
     or lower(left(v_imagem, 14)) = 'data:image/svg') then
    raise exception 'imagem da categoria inválida';
  end if;
  if length(v_imagem) > 1500000 then
    raise exception 'imagem da categoria muito grande';
  end if;
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    insert into categorias(grupo, nome, slug, ordem, ativo, desconto_atacado_percentual, imagem)
    values (p_grupo, p_nome, v_slug, coalesce(p_ordem,0), coalesce(p_ativo,true),
      case when v_papel = 'supervisor' then null else p_desconto_atacado_percentual end, v_imagem)
    returning id into v_id;
  elsif v_papel = 'supervisor' then
    update categorias set grupo=p_grupo, nome=p_nome, slug=v_slug, ordem=coalesce(p_ordem,0),
      ativo=coalesce(p_ativo,true), imagem=v_imagem
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  else
    update categorias set grupo=p_grupo, nome=p_nome, slug=v_slug, ordem=coalesce(p_ordem,0),
      ativo=coalesce(p_ativo,true), desconto_atacado_percentual=p_desconto_atacado_percentual,
      imagem=v_imagem
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

-- Privilégios: só authenticated executa (o papel é checado dentro de cada função). create or replace
-- preserva o ACL, exceto admin_upsert_product (assinatura nova, que nasce com o padrão do Supabase).
revoke all on function
  admin_list_orders(text),
  admin_list_products(),
  admin_upsert_product(uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text, boolean),
  admin_set_ativo(uuid, boolean),
  admin_set_destaque(uuid, boolean),
  admin_upsert_color(uuid, uuid, text, text, text[], int),
  admin_upsert_size(uuid, uuid, text, int),
  admin_list_categorias(),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int, text)
from public, anon, authenticated;
grant execute on function
  admin_list_orders(text),
  admin_list_products(),
  admin_upsert_product(uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text, boolean),
  admin_set_ativo(uuid, boolean),
  admin_set_destaque(uuid, boolean),
  admin_upsert_color(uuid, uuid, text, text, text[], int),
  admin_upsert_size(uuid, uuid, text, int),
  admin_list_categorias(),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int, text)
to authenticated;

-- ========== E. HIGIENE (S-08): search_path fixo nas funções puras ==========
alter function _slugify(text) set search_path = public, extensions;
alter function _preco_atacado(numeric, numeric, int) set search_path = public, extensions;
alter function _preco_varejo(numeric, int) set search_path = public, extensions;
