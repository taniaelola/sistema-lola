-- Seção F: bônus visível nos pedidos (public_get_order, atacado_my_orders, admin_list_orders) e preços do
-- supervisor mascarados em admin_list_products. Transação única; termina com TESTE_F_OK.
do $t$
declare
  u_sup uuid := '00000000-0000-4000-8000-0000000000f1';
  u_adm uuid := '00000000-0000-4000-8000-0000000000f2';
  u_ra  uuid := '00000000-0000-4000-8000-0000000000f3';
  v_rev uuid; v_cat uuid; v_p uuid; v_pb uuid; v_ob uuid; v_on uuid;
  r jsonb; e jsonb; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_sup,'tf-sup@teste.invalid'),(u_adm,'tf-adm@teste.invalid'),(u_ra,'tf-ra@teste.invalid')) as x(id, em);
  update profiles set papel = 'supervisor' where id = u_sup;
  update profiles set papel = 'admin' where id = u_adm;
  update profiles set papel = 'revendedor' where id = u_ra;
  insert into revendedores (user_id, razao_social, email, status)
    values (u_ra, 'TF Revenda', 'tf-ra@teste.invalid', 'aprovado') returning id into v_rev;

  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TF Cat', 'tf-cat', 40) returning id into v_cat;
  insert into products (slug, nome, categoria_id, preco, desconto_percentual, preco_atacado, ativo)
    values ('tf-p', 'TF Prod', v_cat, 100, 10, 60, true) returning id into v_p;
  insert into products (slug, nome, categoria_id, preco, ativo, somente_bonus)
    values ('tf-b', 'TF Brinde', v_cat, 99, true, true) returning id into v_pb;

  -- pedido com bônus: 1 item pago + 1 brinde a preço 0
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total,
                      is_atacado, revendedor_id, bonus_aplicado, bonus_aviso)
    values ('TF Bonus', '11999990011', 'retirada', 0, 600, 600, true, v_rev, true, 'aviso interno') returning id into v_ob;
  insert into order_items (order_id, produto_id, produto_nome, quantidade, preco_unit, subtotal)
    values (v_ob, v_p, 'TF Prod', 10, 60, 600), (v_ob, v_pb, 'TF Brinde', 1, 0, 0);
  -- pedido sem bônus mas com item a preço 0 (não pode virar "bonus")
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total,
                      is_atacado, revendedor_id, bonus_aplicado, bonus_aviso)
    values ('TF Sem', '11999990012', 'retirada', 0, 60, 60, true, v_rev, false, 'sem estoque') returning id into v_on;
  insert into order_items (order_id, produto_id, produto_nome, quantidade, preco_unit, subtotal)
    values (v_on, v_p, 'TF Prod', 1, 60, 60), (v_on, v_pb, 'TF Zero', 1, 0, 0);

  -- ---------- 1. public_get_order (anon): bonus_aplicado e item bonus; sem bonus_aviso ----------
  set local role anon;
  r := public_get_order(v_ob);
  reset role;
  if (r->>'bonus_aplicado')::boolean is distinct from true then raise exception 'FALHOU 1: bonus_aplicado ausente em public_get_order (%)', r; end if;
  if r ? 'bonus_aviso' then raise exception 'FALHOU 1: bonus_aviso vazou em public_get_order'; end if;
  select count(*) into n from jsonb_array_elements(r->'items') i where (i->>'bonus')::boolean is true;
  if n <> 1 then raise exception 'FALHOU 1: esperado 1 item bonus, achei % (%)', n, r->'items'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'items') i
                 where i->>'produto_nome' = 'TF Brinde' and (i->>'bonus')::boolean is true) then
    raise exception 'FALHOU 1: o brinde não está marcado como bonus';
  end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i
             where i->>'produto_nome' = 'TF Prod' and (i->>'bonus')::boolean is not false) then
    raise exception 'FALHOU 1: item pago marcado como bonus';
  end if;
  -- pedido sem bônus: item a preço 0 NÃO é bonus
  set local role anon;
  r := public_get_order(v_on);
  reset role;
  if (r->>'bonus_aplicado')::boolean is distinct from false then raise exception 'FALHOU 1: pedido sem bônus com bonus_aplicado'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where (i->>'bonus')::boolean is distinct from false) then
    raise exception 'FALHOU 1: item de pedido sem bônus marcado como bonus';
  end if;

  -- ---------- 2. supervisor: dinheiro null, bonus continua true ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public_get_order(v_ob);
  reset role;
  if jsonb_typeof(r->'valor_total') is distinct from 'null' then raise exception 'FALHOU 2: valor_total visível ao supervisor'; end if;
  if (r->>'bonus_aplicado')::boolean is distinct from true then raise exception 'FALHOU 2: bonus_aplicado perdido na máscara'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where jsonb_typeof(i->'preco_unit') is distinct from 'null') then
    raise exception 'FALHOU 2: preco_unit visível ao supervisor';
  end if;
  select count(*) into n from jsonb_array_elements(r->'items') i where (i->>'bonus')::boolean is true;
  if n <> 1 then raise exception 'FALHOU 2: bonus por item perdido na máscara (%)', n; end if;

  -- ---------- 3. atacado_my_orders devolve bonus_aplicado ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := atacado_my_orders();
  reset role;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_ob;
  if e is null or (e->>'bonus_aplicado')::boolean is distinct from true then raise exception 'FALHOU 3: bonus_aplicado ausente no pedido com bônus (%)', e; end if;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_on;
  if e is null or (e->>'bonus_aplicado')::boolean is distinct from false then raise exception 'FALHOU 3: bonus_aplicado deveria ser false (%)', e; end if;
  if e ? 'bonus_aviso' then raise exception 'FALHOU 3: bonus_aviso vazou para o revendedor'; end if;

  -- ---------- 4. admin_list_orders: bonus_aplicado e bonus_aviso; fora do admin não há aviso ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_orders('atacado');
  reset role;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_on;
  if e->>'bonus_aviso' is distinct from 'sem estoque' or (e->>'bonus_aplicado')::boolean is distinct from false then
    raise exception 'FALHOU 4: admin sem bonus_aviso/bonus_aplicado (%)', e;
  end if;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_ob;
  if (e->>'bonus_aplicado')::boolean is distinct from true or e->>'bonus_aviso' is distinct from 'aviso interno' then
    raise exception 'FALHOU 4: admin sem dados do pedido com bônus (%)', e;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_orders('atacado');
  reset role;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_ob;
  if (e->>'bonus_aplicado')::boolean is distinct from true then raise exception 'FALHOU 4: supervisor sem bonus_aplicado'; end if;
  if not exists (select 1 from jsonb_array_elements(e->'items') i where (i->>'bonus')::boolean is true) then
    raise exception 'FALHOU 4: supervisor sem item bonus';
  end if;
  r := public_lookup_orders('11999990011');
  if r::text like '%bonus_aviso%' then raise exception 'FALHOU 4: bonus_aviso vazou em public_lookup_orders'; end if;

  -- ---------- 5. (0013) admin_list_products: supervisor e admin veem os preços do produto ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_products();
  reset role;
  select x into e from jsonb_array_elements(r) x where x->>'slug' = 'tf-p';
  if e is null then raise exception 'FALHOU 5: produto ausente na lista do supervisor'; end if;
  if jsonb_typeof(e->'preco') is distinct from 'number' then
    raise exception 'FALHOU 5: supervisor deveria ver o preço do produto (%)', e;
  end if;
  if e->>'nome' <> 'TF Prod' or e->'categoria'->>'nome' <> 'TF Cat' or jsonb_typeof(e->'colors') is distinct from 'array' then
    raise exception 'FALHOU 5: cadastro do supervisor ficou incompleto (%)', e;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_products();
  reset role;
  select x into e from jsonb_array_elements(r) x where x->>'slug' = 'tf-p';
  if (e->>'preco')::numeric <> 100 or (e->>'preco_atacado')::numeric <> 60 or (e->>'desconto_percentual')::numeric <> 10
     or (e->'categoria'->>'desconto_atacado_percentual')::numeric <> 40 then
    raise exception 'FALHOU 5: admin deixou de ver preços (%)', e;
  end if;

  raise exception 'TESTE_F_OK';
end $t$;
