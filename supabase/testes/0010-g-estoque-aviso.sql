-- Seção G: liquidação com estoque insuficiente (dois pedidos pendentes pedindo o mesmo estoque) grava
-- orders.estoque_aviso; o aviso aparece só em admin_list_orders; _settle_order continua sem EXECUTE para anon.
-- Também cobre o retorno aditivo de mp_register_order_payment ('already' com status_atual e id registrado).
-- Transação única; termina com TESTE_G_OK (o runner trata como sucesso).
do $t$
declare
  u_adm uuid := '00000000-0000-4000-8000-0000000000a1';
  u_ra  uuid := '00000000-0000-4000-8000-0000000000a2';
  v_rev uuid; v_cat uuid; v_p uuid; v_c uuid; v_s uuid;
  v_o1 uuid; v_o2 uuid; v_o3 uuid;
  v_seg text := 'segredo-teste-g';
  r jsonb; e jsonb; v_est int; v_av text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_adm,'tg-adm@teste.invalid'),(u_ra,'tg-ra@teste.invalid')) as x(id, em);
  update profiles set papel = 'admin' where id = u_adm;
  update profiles set papel = 'revendedor' where id = u_ra;
  insert into revendedores (user_id, razao_social, email, status)
    values (u_ra, 'TG Revenda', 'tg-ra@teste.invalid', 'aprovado') returning id into v_rev;

  insert into categorias (grupo, nome, slug) values ('calcados', 'TG Cat', 'tg-cat') returning id into v_cat;
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo)
    values ('tg-p', 'Tênis TG', v_cat, 100, 50, true) returning id into v_p;
  insert into product_colors (product_id, nome, ordem) values (v_p, 'Preto', 0) returning id into v_c;
  insert into product_sizes (color_id, tamanho, estoque) values (v_c, '38', 12) returning id into v_s;
  update admin_config set webhook_secret_hash = crypt(v_seg, gen_salt('bf')) where id = 1;

  -- dois pedidos pendentes, cada um com 12 un. do mesmo tamanho (estoque 12)
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total,
                      is_atacado, revendedor_id)
    values ('TG Um', '11999990021', 'retirada', 0, 600, 600, true, v_rev) returning id into v_o1;
  insert into order_items (order_id, produto_id, produto_nome, produto_cor, produto_tamanho, color_id, size_id,
                           quantidade, preco_unit, subtotal)
    values (v_o1, v_p, 'Tênis TG', 'Preto', '38', v_c, v_s, 12, 50, 600);
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total,
                      is_atacado, revendedor_id)
    values ('TG Dois', '11999990022', 'retirada', 0, 600, 600, true, v_rev) returning id into v_o2;
  insert into order_items (order_id, produto_id, produto_nome, produto_cor, produto_tamanho, color_id, size_id,
                           quantidade, preco_unit, subtotal)
    values (v_o2, v_p, 'Tênis TG', 'Preto', '38', v_c, v_s, 12, 50, 600);

  -- ---------- 1. primeiro pedido liquida sem aviso ----------
  r := mp_register_order_payment(v_seg, v_o1, 'mp-tg-1', 'pix', 600::numeric);
  if (r->>'ok')::boolean is distinct from true or r ? 'already' then raise exception 'FALHOU 1: retorno inesperado (%)', r; end if;
  select estoque into v_est from product_sizes where id = v_s;
  if v_est <> 0 then raise exception 'FALHOU 1: estoque esperado 0, achei %', v_est; end if;
  if (select status from orders where id = v_o1)::text <> 'pago' then raise exception 'FALHOU 1: pedido 1 não ficou pago'; end if;
  if (select estoque_aviso from orders where id = v_o1) is not null then raise exception 'FALHOU 1: pedido 1 com aviso'; end if;

  -- ---------- 2. segundo pedido liquida mesmo assim (dinheiro recebido), estoque 0 e aviso ----------
  r := mp_register_order_payment(v_seg, v_o2, 'mp-tg-2', 'pix', 600::numeric);
  if (r->>'ok')::boolean is distinct from true then raise exception 'FALHOU 2: liquidação recusada (%)', r; end if;
  select estoque into v_est from product_sizes where id = v_s;
  if v_est <> 0 then raise exception 'FALHOU 2: estoque negativo ou diferente de 0 (%)', v_est; end if;
  if (select status from orders where id = v_o2)::text <> 'pago' then raise exception 'FALHOU 2: pedido 2 não ficou pago'; end if;
  select estoque_aviso into v_av from orders where id = v_o2;
  if v_av is distinct from 'Faltaram 12 un. de Tênis TG / Preto / 38' then
    raise exception 'FALHOU 2: aviso inesperado (%)', v_av;
  end if;
  if (select count(*) from sales where order_id in (v_o1, v_o2)) <> 2 then raise exception 'FALHOU 2: vendas não registradas'; end if;

  -- ---------- 3. admin_list_orders traz estoque_aviso; sem aviso vem null ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_orders('atacado');
  reset role;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_o2;
  if e->>'estoque_aviso' is distinct from v_av then raise exception 'FALHOU 3: admin sem estoque_aviso (%)', e; end if;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_o1;
  if not (e ? 'estoque_aviso') or jsonb_typeof(e->'estoque_aviso') is distinct from 'null' then
    raise exception 'FALHOU 3: pedido sem aviso deveria trazer estoque_aviso null (%)', e;
  end if;

  -- ---------- 4. public_get_order / public_lookup_orders / atacado_my_orders NÃO expõem estoque_aviso ----------
  set local role anon;
  r := public_get_order(v_o2);
  reset role;
  if r::text like '%estoque_aviso%' then raise exception 'FALHOU 4: estoque_aviso vazou em public_get_order'; end if;
  r := public_lookup_orders('11999990022');
  if r::text like '%estoque_aviso%' then raise exception 'FALHOU 4: estoque_aviso vazou em public_lookup_orders'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := atacado_my_orders();
  reset role;
  if r::text like '%estoque_aviso%' then raise exception 'FALHOU 4: estoque_aviso vazou em atacado_my_orders'; end if;

  -- ---------- 5. _settle_order segue sem EXECUTE para anon/authenticated/public ----------
  if has_function_privilege('anon', 'public._settle_order(uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._settle_order(uuid, text, text)', 'execute') then
    raise exception 'FALHOU 5: _settle_order com EXECUTE indevido';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid = 'public._settle_order(uuid, text, text)'::regprocedure and a.grantee = 0) then
    raise exception 'FALHOU 5: _settle_order com EXECUTE para public';
  end if;
  set local role anon;
  begin
    perform _settle_order(v_o2, 'x', 'pix');
    raise exception 'FALHOU 5: anon executou _settle_order';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ---------- 6. mp_register_order_payment: 'already' traz status_atual e mp_payment_id_registrado ----------
  r := mp_register_order_payment(v_seg, v_o2, 'mp-tg-2', 'pix', 600::numeric);   -- mesmo pagamento (retentativa)
  if (r->>'already')::boolean is distinct from true or r->>'status_atual' is distinct from 'pago'
     or r->>'mp_payment_id_registrado' is distinct from 'mp-tg-2' then
    raise exception 'FALHOU 6: retentativa (%)', r;
  end if;
  r := mp_register_order_payment(v_seg, v_o2, 'mp-tg-2b', 'pix', 600::numeric);  -- segundo pagamento
  if (r->>'already')::boolean is distinct from true or r->>'status_atual' is distinct from 'pago'
     or r->>'mp_payment_id_registrado' is distinct from 'mp-tg-2' then
    raise exception 'FALHOU 6: segundo pagamento (%)', r;
  end if;
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total,
                      is_atacado, revendedor_id, status)
    values ('TG Cancelado', '11999990023', 'retirada', 0, 600, 600, true, v_rev, 'cancelado') returning id into v_o3;
  r := mp_register_order_payment(v_seg, v_o3, 'mp-tg-3', 'pix', 600::numeric);
  if (r->>'already')::boolean is distinct from true or r->>'status_atual' is distinct from 'cancelado'
     or jsonb_typeof(r->'mp_payment_id_registrado') is distinct from 'null' then
    raise exception 'FALHOU 6: pedido cancelado (%)', r;
  end if;

  raise exception 'TESTE_G_OK';
end $t$;
