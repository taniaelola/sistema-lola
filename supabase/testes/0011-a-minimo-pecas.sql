-- 0011: o mínimo do atacado é de 12 PEÇAS (soma de quantidade), não de 12 SKUs distintos.
-- Transação única; termina com TESTE_0011_OK (o runner trata como sucesso).
do $t$
declare
  u_ra  uuid := '00000000-0000-4000-8000-0000000000f1';
  v_rev uuid; v_cat uuid; v_bonus uuid; v_bcor uuid;
  v_p uuid; v_c uuid; v_s uuid; i int;
  r jsonb; v_o uuid; v_ord orders; v_n int; v_antes int;
  v_q int[];
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u_ra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't11-ra@teste.invalid', now(), now(), now());
  update profiles set papel = 'revendedor' where id = u_ra;
  insert into revendedores (user_id, razao_social, email, status)
    values (u_ra, 'T11 Revenda', 't11-ra@teste.invalid', 'aprovado') returning id into v_rev;
  insert into categorias (grupo, nome, slug) values ('calcados', 'T11 Cat', 't11-cat') returning id into v_cat;

  create temp table t_sku (n int, prod uuid, color uuid, size uuid) on commit drop;
  for i in 1..12 loop
    insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo, ordem)
      values ('t11-p' || i, 'T11 Prod ' || i, v_cat, 100, 50, true, i) returning id into v_p;
    insert into product_colors (product_id, nome, ordem) values (v_p, 'Preto', 0) returning id into v_c;
    insert into product_sizes (color_id, tamanho, estoque) values (v_c, '38', 100) returning id into v_s;
    insert into t_sku values (i, v_p, v_c, v_s);
  end loop;

  insert into products (slug, nome, categoria_id, preco, ativo, somente_bonus, ordem)
    values ('t11-bonus', 'T11 Bonus', v_cat, 99, true, true, 99) returning id into v_bonus;
  insert into product_colors (product_id, nome, ordem) values (v_bonus, 'Rosa', 0) returning id into v_bcor;
  insert into product_sizes (color_id, tamanho, estoque) values (v_bcor, '38', 5);
  update admin_config set bonus_ativo = false, varejo_ativo = false where id = 1;

  -- 1. UM SKU com quantidade 12: passa (antes da 0011 recusava: 1 SKU distinto)
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 12 from t_sku t where t.n = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_o := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_o;
  if v_ord.valor_produtos <> 600 then raise exception 'FALHOU 1: valor_produtos = % (esperado 600)', v_ord.valor_produtos; end if;

  -- 2. UM SKU com 11 peças: recusa com a mensagem nova e NÃO cria pedido
  select count(*) into v_antes from orders;
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 11 from t_sku t where t.n = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
    raise exception 'FALHOU 2: 11 peças passou';
  exception when raise_exception then
    if sqlerrm <> 'mínimo de 12 peças (carrinho tem 11)' then raise exception 'FALHOU 2: mensagem inesperada (%)', sqlerrm; end if;
  end;
  reset role;
  if (select count(*) from orders) <> v_antes then raise exception 'FALHOU 2: criou pedido abaixo do mínimo'; end if;

  -- 3. 11 SKUs com 1 peça cada (11 peças): recusa
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 1 from t_sku t where t.n <= 11;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
    raise exception 'FALHOU 3: 11 SKUs x 1 passou';
  exception when raise_exception then
    if sqlerrm <> 'mínimo de 12 peças (carrinho tem 11)' then raise exception 'FALHOU 3: mensagem inesperada (%)', sqlerrm; end if;
  end;
  reset role;

  -- 4. 3 SKUs somando 12 peças (5+4+3): passa
  v_q := array[5,4,3];
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 3;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  select * into v_ord from orders where id = (r->>'id')::uuid;
  if v_ord.valor_produtos <> 600 then raise exception 'FALHOU 4: valor_produtos = %', v_ord.valor_produtos; end if;

  -- 5. bônus: não conta como peça do mínimo; segue a regra de peças (min 12 aqui)
  update admin_config set bonus_ativo = true, bonus_min_pecas = 12, bonus_produto_id = v_bonus, bonus_quantidade = 1 where id = 1;
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 11 from t_sku t where t.n = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
    raise exception 'FALHOU 5: 11 peças + bônus passou';
  exception when raise_exception then
    if sqlerrm <> 'mínimo de 12 peças (carrinho tem 11)' then raise exception 'FALHOU 5: mensagem inesperada (%)', sqlerrm; end if;
  end;
  reset role;
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 12 from t_sku t where t.n = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  select * into v_ord from orders where id = (r->>'id')::uuid;
  if not v_ord.bonus_aplicado then raise exception 'FALHOU 5: 12 peças deveria aplicar o bônus'; end if;
  select count(*) into v_n from order_items where order_id = v_ord.id and preco_unit = 0;
  if v_n <> 1 then raise exception 'FALHOU 5: itens de bônus = %', v_n; end if;
  if v_ord.valor_produtos <> 600 then raise exception 'FALHOU 5: valor_produtos = %', v_ord.valor_produtos; end if;

  -- 6. texto da LP com o padrão novo
  if (select valor from textos_loja where chave = 'lp_regra_skus') <> '12 peças por pedido, do mesmo modelo ou de modelos diferentes.' then
    raise exception 'FALHOU 6: lp_regra_skus não foi atualizado pela 0011'; end if;

  if (select valor from textos_loja where chave = 'revendedora.texto') <> 'Preço de atacado a partir de 12 peças por pedido. Cadastro com CNPJ, aprovação rápida.' then
    raise exception 'FALHOU 6: revendedora.texto não foi atualizado pela 0011'; end if;

  raise exception 'TESTE_0011_OK';
end $t$;
