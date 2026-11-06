-- =====================================================================
-- rls-teste.sql — isolamento entre usuários e matriz de papéis
-- Roda no SQL Editor do Supabase. NÃO deixa dados: as fixtures são criadas e
-- desfeitas no mesmo bloco (raise exception 'fim_do_teste' capturado).
-- Resultado: tabela (ord, caso, quem, esperado, obtido, ok). Falhas primeiro.
-- esperado: texto exato; 'a|b' = qualquer um dos valores; 'OK' = sem erro;
--           'INFO' = só registra o obtido.
-- =====================================================================
create temp table _res (
  ord int, caso text, quem text, esperado text, obtido text, ok boolean
) on commit drop;

do $teste$
declare
  c record;
  v_obt text;
  v_ok boolean;
  v_res jsonb := '[]'::jsonb;
  v_prod uuid; v_cor uuid; v_tam uuid;
  u_cli_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  u_cli_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  u_rev_a constant uuid := '00000000-0000-4000-8000-0000000000b1';
  u_rev_b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  u_rev_p constant uuid := '00000000-0000-4000-8000-0000000000b3';
  u_sup   constant uuid := '00000000-0000-4000-8000-0000000000c1';
  u_adm   constant uuid := '00000000-0000-4000-8000-0000000000c2';
  u_sa    constant uuid := '00000000-0000-4000-8000-0000000000c3';
  r_a     constant uuid := '00000000-0000-4000-8000-0000000000d1';
  r_b     constant uuid := '00000000-0000-4000-8000-0000000000d2';
  r_p     constant uuid := '00000000-0000-4000-8000-0000000000d3';
  o_cli_a constant uuid := '00000000-0000-4000-8000-0000000000e1';
  o_cli_b constant uuid := '00000000-0000-4000-8000-0000000000e2';
  o_rev_a constant uuid := '00000000-0000-4000-8000-0000000000e3';
  o_rev_b constant uuid := '00000000-0000-4000-8000-0000000000e4';
begin
  begin
    -- ---------- fixtures (desfeitas no fim) ----------
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           x.email, now(), now(), now()
    from (values
      (u_cli_a, 't-cli-a@teste.invalid'), (u_cli_b, 't-cli-b@teste.invalid'),
      (u_rev_a, 't-rev-a@teste.invalid'), (u_rev_b, 't-rev-b@teste.invalid'),
      (u_rev_p, 't-rev-p@teste.invalid'), (u_sup, 't-sup@teste.invalid'),
      (u_adm, 't-adm@teste.invalid'), (u_sa, 't-sa@teste.invalid')
    ) as x(id, email);

    -- o gatilho handle_auth_user cria os profiles como 'cliente'; ajusta os papéis
    update profiles set papel = x.p::papel_usuario
    from (values
      (u_rev_a, 'revendedor'), (u_rev_b, 'revendedor'), (u_rev_p, 'revendedor'),
      (u_sup, 'supervisor'), (u_adm, 'admin'), (u_sa, 'superadmin')
    ) as x(id, p)
    where profiles.id = x.id;

    insert into revendedores (id, user_id, razao_social, email, status) values
      (r_a, u_rev_a, 'Teste A', 't-rev-a@teste.invalid', 'aprovado'),
      (r_b, u_rev_b, 'Teste B', 't-rev-b@teste.invalid', 'aprovado'),
      (r_p, u_rev_p, 'Teste P', 't-rev-p@teste.invalid', 'pendente');

    insert into orders (id, status, cliente_nome, cliente_telefone, entrega_tipo,
                        valor_produtos, valor_total, is_atacado, customer_id, revendedor_id) values
      (o_cli_a, 'pendente', 'Teste', '55SENTINELA77', 'retirada', 10, 10, false, u_cli_a, null),
      (o_cli_b, 'pendente', 'Teste', '000', 'retirada', 10, 10, false, u_cli_b, null),
      (o_rev_a, 'pendente', 'Teste', '000', 'retirada', 10, 10, true,  null, r_a),
      (o_rev_b, 'pendente', 'Teste', '000', 'retirada', 10, 10, true,  null, r_b);

    select p.id, pc.id, ps.id into v_prod, v_cor, v_tam
    from products p
    join product_colors pc on pc.product_id = p.id
    join product_sizes ps on ps.color_id = pc.id
    limit 1;
    if v_prod is not null then
      insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
      values (r_a, v_prod, v_cor, v_tam, 1);
    end if;

    -- ---------- casos ----------
    for c in
      select * from (values
        -- visitante (anon): tabelas privadas
        (10, 'anon não lê orders',         'anon', null::uuid, 'select count(*)::text from orders', 'ERRO'),
        (11, 'anon não lê order_items',    'anon', null::uuid, 'select count(*)::text from order_items', 'ERRO'),
        (12, 'anon não lê profiles',       'anon', null::uuid, 'select count(*)::text from profiles', 'ERRO'),
        (13, 'anon não lê revendedores',   'anon', null::uuid, 'select count(*)::text from revendedores', 'ERRO'),
        (14, 'anon não lê sales',          'anon', null::uuid, 'select count(*)::text from sales', 'ERRO'),
        (15, 'anon não lê admin_config',   'anon', null::uuid, 'select count(*)::text from admin_config', 'ERRO'),
        (16, 'anon não lê carrinho_atacado','anon', null::uuid, 'select count(*)::text from carrinho_atacado', 'ERRO'),
        (17, 'anon não lê convites_papel', 'anon', null::uuid, 'select count(*)::text from convites_papel', 'ERRO'),
        (18, 'anon não lê promocoes',      'anon', null::uuid, 'select count(*)::text from promocoes', 'ERRO'),
        -- visitante: catálogo (ALVO da spec: sem acesso direto; hoje deve falhar)
        (19, 'ALVO: anon não lê products', 'anon', null::uuid, 'select count(*)::text from products', 'ERRO'),
        (20, 'INFO: produtos com preco_atacado visíveis ao anon', 'anon', null::uuid,
             'select count(*) filter (where preco_atacado is not null)::text from products', 'INFO'),
        (21, 'ALVO: anon não lê product_sizes (estoque)', 'anon', null::uuid, 'select count(*)::text from product_sizes', 'ERRO'),
        -- visitante: RPCs
        (22, 'anon não chama admin_list_orders', 'anon', null::uuid, 'select admin_list_orders()::text', 'ERRO'),
        (23, 'anon não chama admin_list_users',  'anon', null::uuid, 'select admin_list_users()::text', 'ERRO'),
        (24, 'anon não chama admin_get_config',  'anon', null::uuid, 'select admin_get_config()::text', 'ERRO'),
        (25, 'anon não chama meus_pedidos',      'anon', null::uuid, 'select meus_pedidos()::text', 'ERRO'),
        (26, 'INFO: anon atacado_me',            'anon', null::uuid, 'select left(atacado_me()::text, 60)', 'INFO'),
        (27, 'INFO: anon lê pedido por UUID (public_get_order) devolve o telefone?', 'anon', null::uuid,
             format('select (public_get_order(%L)::text like %L)::text', o_cli_a, '%SENTINELA77%'), 'INFO'),
        (28, 'anon get_textos',                  'anon', null::uuid, 'select left(get_textos()::text, 20)', 'OK'),
        (29, 'anon get_banner_hero',             'anon', null::uuid, 'select left(get_banner_hero()::text, 20)', 'OK'),
        (30, 'anon get_promocoes_ativas',        'anon', null::uuid, 'select left(get_promocoes_ativas()::text, 20)', 'OK'),
        -- cliente A / B
        (40, 'cliente A vê só o próprio pedido', 'cli_a', u_cli_a, 'select count(*)::text from orders', '1'),
        (41, 'cliente B não vê pedido do A',     'cli_b', u_cli_b,
             format('select count(*)::text from orders where id = %L', o_cli_a), '0'),
        (42, 'cliente A vê só o próprio profile','cli_a', u_cli_a, 'select count(*)::text from profiles', '1'),
        (43, 'cliente A não vê revendedores',    'cli_a', u_cli_a, 'select count(*)::text from revendedores', '0'),
        (44, 'cliente A não lê sales',           'cli_a', u_cli_a, 'select count(*)::text from sales', 'ERRO'),
        (45, 'cliente A não lê admin_config',    'cli_a', u_cli_a, 'select count(*)::text from admin_config', 'ERRO'),
        (46, 'cliente A: meus_pedidos tem o seu', 'cli_a', u_cli_a,
             format('select (meus_pedidos()::text like %L)::text', '%' || o_cli_a::text || '%'), 'true'),
        (47, 'cliente A: meus_pedidos NÃO tem o do B', 'cli_a', u_cli_a,
             format('select (meus_pedidos()::text like %L)::text', '%' || o_cli_b::text || '%'), 'false'),
        (48, 'cliente A não chama admin_list_orders', 'cli_a', u_cli_a, 'select admin_list_orders()::text', 'ERRO'),
        (49, 'cliente A não usa carrinho de atacado', 'cli_a', u_cli_a, 'select atacado_cart_get()::text', 'ERRO'),
        (50, 'cliente A não vê pedidos de atacado', 'cli_a', u_cli_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'false|ERRO'),
        (51, 'cliente A não se promove a superadmin', 'cli_a', u_cli_a,
             format('with u as (update profiles set papel = %L where id = %L returning 1) select count(*)::text from u', 'superadmin', u_cli_a), 'ERRO|0'),
        (52, 'cliente A não marca o próprio pedido como pago', 'cli_a', u_cli_a,
             format('with u as (update orders set status = %L where id = %L returning 1) select count(*)::text from u', 'pago', o_cli_a), 'ERRO|0'),
        (53, 'cliente A não insere pedido direto', 'cli_a', u_cli_a,
             format('with i as (insert into orders (cliente_nome, cliente_telefone, entrega_tipo, customer_id) values (%L, %L, %L, %L) returning 1) select count(*)::text from i', 'x', 'y', 'retirada', u_cli_a), 'ERRO'),
        -- revendedor aprovado A / B e pendente
        (60, 'revendedor A vê só o próprio cadastro', 'rev_a', u_rev_a, 'select count(*)::text from revendedores', '1'),
        (61, 'revendedor B não vê o cadastro do A',  'rev_b', u_rev_b,
             format('select count(*)::text from revendedores where id = %L', r_a), '0'),
        (62, 'revendedor A vê o próprio carrinho',   'rev_a', u_rev_a, 'select count(*)::text from carrinho_atacado', '1|0'),
        (63, 'revendedor B não vê carrinho do A',    'rev_b', u_rev_b, 'select count(*)::text from carrinho_atacado', '0'),
        (64, 'revendedor A: atacado_my_orders tem o seu', 'rev_a', u_rev_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'true'),
        (65, 'revendedor A: atacado_my_orders NÃO tem o do B', 'rev_a', u_rev_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_b::text || '%'), 'false'),
        (66, 'revendedor A não vê pedido de varejo de cliente', 'rev_a', u_rev_a,
             format('select count(*)::text from orders where id = %L', o_cli_a), '0'),
        (67, 'revendedor aprovado usa carrinho de atacado', 'rev_b', u_rev_b, 'select atacado_cart_get()::text', 'OK'),
        (68, 'revendedor PENDENTE não usa carrinho',  'rev_p', u_rev_p, 'select atacado_cart_get()::text', 'ERRO'),
        (69, 'revendedor PENDENTE não vê pedidos de atacado', 'rev_p', u_rev_p,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'false|ERRO'),
        (70, 'revendedor PENDENTE não se auto-aprova', 'rev_p', u_rev_p,
             format('with u as (update revendedores set status = %L where user_id = %L returning 1) select count(*)::text from u', 'aprovado', u_rev_p), 'ERRO|0'),
        (71, 'revendedor aprovado não altera o próprio status', 'rev_a', u_rev_a,
             format('with u as (update revendedores set status = %L where user_id = %L returning 1) select count(*)::text from u', 'recusado', u_rev_a), 'ERRO|0'),
        (72, 'revendedor não chama admin_list_revendedores', 'rev_a', u_rev_a, 'select admin_list_revendedores()::text', 'ERRO'),
        (73, 'revendedor não chama admin_list_orders', 'rev_a', u_rev_a, 'select admin_list_orders()::text', 'ERRO'),
        -- equipe (matriz atual; supervisor ainda sem Produtos até a Parte A)
        (80, 'supervisor chama admin_list_orders',  'sup', u_sup, 'select left(admin_list_orders()::text, 20)', 'OK'),
        (81, 'supervisor chama admin_list_revendedores', 'sup', u_sup, 'select left(admin_list_revendedores()::text, 20)', 'OK'),
        (82, 'supervisor NÃO chama admin_list_users', 'sup', u_sup, 'select admin_list_users()::text', 'ERRO'),
        (83, 'supervisor NÃO chama admin_get_config', 'sup', u_sup, 'select admin_get_config()::text', 'ERRO'),
        (84, 'INFO: supervisor admin_list_products (vira OK na Parte A)', 'sup', u_sup, 'select left(admin_list_products()::text, 20)', 'INFO'),
        (85, 'supervisor NÃO exclui produto', 'sup', u_sup,
             format('select admin_delete_product(%L)::text', gen_random_uuid()), 'ERRO'),
        (86, 'supervisor NÃO altera papel de usuário', 'sup', u_sup,
             format('select admin_set_user(%L, %L, true)::text', u_cli_a, 'admin'), 'ERRO'),
        (87, 'admin chama admin_list_users', 'adm', u_adm, 'select left(admin_list_users()::text, 20)', 'OK'),
        (88, 'admin chama admin_list_orders', 'adm', u_adm, 'select left(admin_list_orders()::text, 20)', 'OK'),
        (89, 'admin NÃO chama admin_get_config (só superadmin)', 'adm', u_adm, 'select admin_get_config()::text', 'ERRO'),
        (90, 'admin NÃO cria superadmin', 'adm', u_adm,
             format('select admin_set_user(%L, %L, true)::text', u_cli_a, 'superadmin'), 'ERRO'),
        (91, 'superadmin chama admin_get_config', 'sa', u_sa, 'select left(admin_get_config()::text, 20)', 'OK'),
        (92, 'superadmin chama admin_list_users', 'sa', u_sa, 'select left(admin_list_users()::text, 20)', 'OK')
      ) as t(ord, caso, quem, uid, sql, esperado)
      order by ord
    loop
      v_obt := null;
      begin
        perform set_config('request.jwt.claims',
          case when c.uid is null then '{"role":"anon"}'
               else json_build_object('sub', c.uid, 'role', 'authenticated')::text end, true);
        execute case when c.uid is null then 'set local role anon'
                     else 'set local role authenticated' end;
        execute c.sql into v_obt;
        reset role;
      exception when others then
        v_obt := 'ERRO';   -- o savepoint desfaz o set local role
      end;
      v_ok := case
                when c.esperado = 'INFO' then true
                when c.esperado = 'OK'   then v_obt is distinct from 'ERRO'
                else v_obt = any (string_to_array(c.esperado, '|'))
              end;
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'ord', c.ord, 'caso', c.caso, 'quem', c.quem, 'esperado', c.esperado,
        'obtido', coalesce(v_obt, 'null'), 'ok', v_ok));
    end loop;

    raise exception 'fim_do_teste';   -- desfaz TODAS as fixtures
  exception when raise_exception then
    if sqlerrm <> 'fim_do_teste' then raise; end if;
  end;

  -- fora do sub-bloco: o resultado sobrevive (v_res é variável local)
  insert into _res
  select (e->>'ord')::int, e->>'caso', e->>'quem', e->>'esperado', e->>'obtido', (e->>'ok')::boolean
  from jsonb_array_elements(v_res) as e;
end
$teste$;

select ord, caso, quem, esperado, obtido, ok
from _res
order by ok, ord;
