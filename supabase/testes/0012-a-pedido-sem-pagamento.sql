-- 0012: pedido de atacado sem pagamento no site + revendedora premium + set_meu_nome.
-- Transação única; termina com TESTE_0012_OK (o runner trata como sucesso).
do $t$
declare
  u_ra  uuid := '00000000-0000-4000-8000-0000000000a1';
  u_ad  uuid := '00000000-0000-4000-8000-0000000000a2';
  u_sp  uuid := '00000000-0000-4000-8000-0000000000a3';
  v_rev uuid; v_cat uuid;
  v_p uuid; v_c uuid; v_s uuid;
  r jsonb; v_o uuid; v_ord orders; v_n int; v_est int; v_ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (u_ra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't12-ra@teste.invalid', now(), now(), now()),
    (u_ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't12-ad@teste.invalid', now(), now(), now()),
    (u_sp, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't12-sp@teste.invalid', now(), now(), now());
  update profiles set papel = 'revendedor' where id = u_ra;
  update profiles set papel = 'admin' where id = u_ad;
  update profiles set papel = 'supervisor' where id = u_sp;
  insert into revendedores (user_id, razao_social, email, status)
    values (u_ra, 'T12 Revenda', 't12-ra@teste.invalid', 'aprovado') returning id into v_rev;
  insert into categorias (grupo, nome, slug) values ('calcados', 'T12 Cat', 't12-cat') returning id into v_cat;
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo, ordem)
    values ('t12-p', 'T12 Prod', v_cat, 100, 50, true, 1) returning id into v_p;
  insert into product_colors (product_id, nome, ordem) values (v_p, 'Preto', 0) returning id into v_c;
  insert into product_sizes (color_id, tamanho, estoque) values (v_c, '38', 100) returning id into v_s;
  update admin_config set bonus_ativo = false, varejo_ativo = false where id = 1;

  -- 1. NÃO premium com 3 peças: recusa pelo mínimo
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade) values (v_rev, v_p, v_c, v_s, 3);
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
    raise exception 'FALHOU 1: 3 peças passou sem ser premium';
  exception when raise_exception then
    if sqlerrm <> 'mínimo de 12 peças (carrinho tem 3)' then raise exception 'FALHOU 1: mensagem inesperada (%)', sqlerrm; end if;
  end;
  reset role;

  -- 2. o atacado_me expõe premium=false; supervisor NÃO marca premium; admin marca
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (atacado_me()->>'premium')::boolean is distinct from false then raise exception 'FALHOU 2: premium inicial deveria ser false'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_set_revendedor_premium(v_rev, true);
    raise exception 'FALHOU 2: supervisor marcou premium';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_revendedor_premium(v_rev, true);
  reset role;
  if not (select premium from revendedores where id = v_rev) then raise exception 'FALHOU 2: premium não gravou'; end if;

  -- 3. premium com 3 peças: passa; pedido nasce 'preparando' e o carrinho esvazia
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_o := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_o;
  if v_ord.status <> 'preparando' then raise exception 'FALHOU 3: status inicial = % (esperado preparando)', v_ord.status; end if;
  if v_ord.valor_produtos <> 150 then raise exception 'FALHOU 3: valor_produtos = %', v_ord.valor_produtos; end if;
  if exists (select 1 from carrinho_atacado where revendedor_id = v_rev) then raise exception 'FALHOU 3: carrinho não esvaziou'; end if;
  select estoque into v_est from product_sizes where id = v_s;
  if v_est <> 100 then raise exception 'FALHOU 3: estoque baixou sem pagamento (%)', v_est; end if;

  -- 4. pedido sem pagamento: não vai para retirada/entrega; vai para aguardando pagamento e pode cancelar
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_update_order_status(v_o, 'pronto_retirada');
    raise exception 'FALHOU 4: pronto_retirada sem pagamento passou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform admin_update_order_status(v_o, 'retirado');
    raise exception 'FALHOU 4: retirado sem pagamento passou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform admin_update_order_status(v_o, 'pago');
    raise exception 'FALHOU 4: pago por status passou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  perform admin_update_order_status(v_o, 'pendente');
  reset role;
  if (select status from orders where id = v_o) <> 'pendente' then raise exception 'FALHOU 4: não foi para aguardando pagamento'; end if;

  -- 5. cliente (revendedora) não registra pagamento; supervisora registra: baixa estoque, grava venda, status pago
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_settle_order(v_o);
    raise exception 'FALHOU 5: revendedora liquidou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_settle_order(v_o);
  reset role;
  if (select status from orders where id = v_o) <> 'pago' then raise exception 'FALHOU 5: status não virou pago'; end if;
  select estoque into v_est from product_sizes where id = v_s;
  if v_est <> 97 then raise exception 'FALHOU 5: estoque = % (esperado 97)', v_est; end if;
  select count(*) into v_n from sales where order_id = v_o;
  if v_n <> 1 then raise exception 'FALHOU 5: vendas = %', v_n; end if;

  -- 6. liquidar de novo é idempotente (não baixa estoque duas vezes)
  perform set_config('request.jwt.claims', json_build_object('sub', u_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_settle_order(v_o);
  reset role;
  if (r->>'already')::boolean is not true then raise exception 'FALHOU 6: segunda liquidação não foi idempotente'; end if;
  select estoque into v_est from product_sizes where id = v_s;
  if v_est <> 97 then raise exception 'FALHOU 6: estoque baixou de novo (%)', v_est; end if;

  -- 7. depois de pago segue o fluxo normal e NÃO volta a pendente
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_update_order_status(v_o, 'pronto_retirada');
  begin
    perform admin_update_order_status(v_o, 'pendente');
    raise exception 'FALHOU 7: pedido pago voltou a pendente';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  perform admin_update_order_status(v_o, 'retirado');
  reset role;

  -- 8. pago no balcão direto de "Em separação" (sem passar por aguardando): admin liquida
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade) values (v_rev, v_p, v_c, v_s, 2);
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_o := (r->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_settle_order(v_o);
  reset role;
  if (select status from orders where id = v_o) <> 'pago' then raise exception 'FALHOU 8: balcão não liquidou'; end if;

  -- 9. set_meu_nome: só o próprio usuário e só se o nome estiver vazio
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform set_meu_nome('  Maria da Silva ');
  reset role;
  if (select nome from profiles where id = u_sp) <> 'Maria da Silva' then raise exception 'FALHOU 9: nome não gravou'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform set_meu_nome('Outro Nome');
  reset role;
  if (select nome from profiles where id = u_sp) <> 'Maria da Silva' then raise exception 'FALHOU 9: sobrescreveu um nome já definido'; end if;
  set local role anon;
  begin
    perform set_meu_nome('Anon');
    raise exception 'FALHOU 9: anon executou set_meu_nome';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  reset role;

  raise exception 'TESTE_0012_OK';
end $t$;
