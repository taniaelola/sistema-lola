-- Seção C: checkout (varejo off, bônus de 15 peças), convidado revogado e webhook com valor.
-- Roda em transação única; termina com TESTE_C_OK (o runner trata como sucesso).
-- Negações: só o sqlstate/mensagem esperado é aceito; chamada que SUCEDE vira FALHOU.
do $t$
declare
  u_ra  uuid := '00000000-0000-4000-8000-0000000000d1';  -- revendedor aprovado
  u_cli uuid := '00000000-0000-4000-8000-0000000000d2';  -- cliente logado (não revendedor)
  v_rev uuid; v_cat uuid; v_bonus uuid; v_bcor uuid; v_bsize38 uuid; v_bsize37 uuid;
  v_p uuid; v_c uuid; v_s uuid; i int;
  r jsonb; v_o14 uuid; v_o15 uuid; v_o30 uuid; v_ono uuid; v_ooff uuid; v_ov uuid;
  v_ord orders; v_n int; v_est int; v_pago numeric; v_seg text := 'segredo-teste-c';
  v_q int[];
  v_items jsonb; v_oa uuid; v_ob uuid; v_oc uuid;
begin
  -- ---------- fixtures ----------
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_ra, 'tc-ra@teste.invalid'), (u_cli, 'tc-cli@teste.invalid')) as x(id, em);
  update profiles set papel = 'revendedor' where id = u_ra;
  insert into revendedores (user_id, razao_social, email, status)
    values (u_ra, 'TC Revenda', 'tc-ra@teste.invalid', 'aprovado') returning id into v_rev;

  insert into categorias (grupo, nome, slug) values ('calcados', 'TC Cat', 'tc-cat') returning id into v_cat;

  -- 13 SKUs pagos: preço de atacado 50 (override), estoque 100
  create temp table t_sku (n int, prod uuid, color uuid, size uuid) on commit drop;
  for i in 1..13 loop
    insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo, ordem)
      values ('tc-p' || i, 'TC Prod ' || i, v_cat, 100, 50, true, i) returning id into v_p;
    insert into product_colors (product_id, nome, ordem) values (v_p, 'Preto', 0) returning id into v_c;
    insert into product_sizes (color_id, tamanho, estoque) values (v_c, '38', 100) returning id into v_s;
    insert into t_sku values (i, v_p, v_c, v_s);
  end loop;

  -- produto de bônus: tamanho 38 (maior estoque, 5) e 37 (3)
  insert into products (slug, nome, categoria_id, preco, ativo, somente_bonus, ordem)
    values ('tc-bonus', 'TC Bonus', v_cat, 99, true, true, 99) returning id into v_bonus;
  insert into product_colors (product_id, nome, ordem) values (v_bonus, 'Rosa', 0) returning id into v_bcor;
  insert into product_sizes (color_id, tamanho, estoque) values (v_bcor, '38', 5) returning id into v_bsize38;
  insert into product_sizes (color_id, tamanho, estoque) values (v_bcor, '37', 3) returning id into v_bsize37;

  update admin_config set bonus_ativo = true, bonus_min_pecas = 15, bonus_produto_id = v_bonus,
    bonus_quantidade = 1, varejo_ativo = false,
    webhook_secret_hash = crypt(v_seg, gen_salt('bf')) where id = 1;

  -- ---------- 1. 14 peças: sem bônus ----------
  v_q := array[2,2,1,1,1,1,1,1,1,1,1,1];   -- 14 peças, 12 SKUs
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'entrega', 'Rua A', '10', 'Centro', null, '01000-000', null, '[]'::jsonb, true);
  reset role;
  v_o14 := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_o14;
  if v_ord.bonus_aplicado then raise exception 'FALHOU: 14 peças aplicou bônus'; end if;
  if exists (select 1 from order_items where order_id = v_o14 and preco_unit = 0) then
    raise exception 'FALHOU: 14 peças tem item com preco_unit 0'; end if;
  if v_ord.valor_produtos <> 700 then raise exception 'FALHOU: valor_produtos 14 peças = % (esperado 700)', v_ord.valor_produtos; end if;

  -- ---------- 2. 15 peças: exatamente 1 bônus ----------
  v_q := array[2,2,2,1,1,1,1,1,1,1,1,1];   -- 15 peças, 12 SKUs
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_o15 := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_o15;
  if not v_ord.bonus_aplicado then raise exception 'FALHOU: 15 peças não marcou bonus_aplicado'; end if;
  if v_ord.bonus_aviso is not null then raise exception 'FALHOU: 15 peças com aviso (%)', v_ord.bonus_aviso; end if;
  select count(*) into v_n from order_items where order_id = v_o15 and preco_unit = 0;
  if v_n <> 1 then raise exception 'FALHOU: 15 peças deveria ter 1 item de bônus, tem %', v_n; end if;
  if not exists (select 1 from order_items where order_id = v_o15 and preco_unit = 0 and subtotal = 0
                 and quantidade = 1 and produto_id = v_bonus and size_id = v_bsize38) then
    raise exception 'FALHOU: item de bônus fora do esperado (produto/tamanho de maior estoque/quantidade)'; end if;
  if v_ord.valor_produtos <> 750 or v_ord.valor_total <> 750 then
    raise exception 'FALHOU: valor_produtos/total 15 peças = %/% (esperado 750/750)', v_ord.valor_produtos, v_ord.valor_total; end if;
  if v_ord.valor_produtos <> (select sum(subtotal) from order_items where order_id = v_o15 and preco_unit > 0) then
    raise exception 'FALHOU: valor_produtos difere da soma dos itens pagos'; end if;
  if jsonb_array_length(r->'itens') <> 12 then raise exception 'FALHOU: itens do retorno = % (esperado 12)', jsonb_array_length(r->'itens'); end if;
  if r->>'itens' like '%TC Bonus%' or exists (select 1 from jsonb_array_elements(r->'itens') e where (e->>'preco_unit')::numeric = 0) then
    raise exception 'FALHOU: retorno (preferência MP) contém o bônus (%)', r->'itens'; end if;
  if (select count(*) from order_items where order_id = v_o15) <> 13 then
    raise exception 'FALHOU: pedido de 15 peças deveria ter 12 pagos + 1 bônus'; end if;
  -- o checkout não baixa estoque
  select estoque into v_est from product_sizes where id = v_bsize38;
  if v_est <> 5 then raise exception 'FALHOU: checkout baixou estoque do bônus (%)', v_est; end if;

  -- ---------- 3. 30 peças: continua 1 bônus ----------
  v_q := array[3,3,3,3,3,3,2,2,2,2,2,2];   -- 30 peças
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_o30 := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_o30;
  select count(*) into v_n from order_items where order_id = v_o30 and preco_unit = 0;
  if not v_ord.bonus_aplicado or v_n <> 1 then raise exception 'FALHOU: 30 peças deveria ter exatamente 1 bônus (aplicado %, itens %)', v_ord.bonus_aplicado, v_n; end if;
  if not exists (select 1 from order_items where order_id = v_o30 and preco_unit = 0 and quantidade = 1) then
    raise exception 'FALHOU: bônus de 30 peças com quantidade <> 1'; end if;
  if v_ord.valor_produtos <> 1500 then raise exception 'FALHOU: valor_produtos 30 peças = % (esperado 1500)', v_ord.valor_produtos; end if;

  -- ---------- 8. liquidação do pedido de 15 peças ----------
  perform _settle_order(v_o15, 'mp-tc-15', 'pix');
  select estoque into v_est from product_sizes where id = v_bsize38;
  if v_est <> 4 then raise exception 'FALHOU: liquidação deveria baixar 1 do estoque do bônus (estoque %)', v_est; end if;
  select estoque into v_est from product_sizes where id = v_bsize37;
  if v_est <> 3 then raise exception 'FALHOU: liquidação mexeu no tamanho errado do bônus'; end if;
  select count(*) into v_n from sales where order_id = v_o15 and produto_id = v_bonus and valor_total = 0 and preco_unit = 0 and quantidade = 1;
  if v_n <> 1 then raise exception 'FALHOU: sales do bônus (valor_total 0) = % linhas (esperado 1)', v_n; end if;
  select coalesce(sum(valor_total), 0) into v_pago from sales where order_id = v_o15;
  if v_pago <> 750 then raise exception 'FALHOU: soma de sales do pedido = % (esperado 750)', v_pago; end if;

  -- ---------- 4. bônus sem estoque: pedido criado, sem bônus, com aviso ----------
  update product_sizes set estoque = 0 where color_id = v_bcor;
  v_q := array[2,2,2,1,1,1,1,1,1,1,1,1];
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_ono := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_ono;
  if v_ord.bonus_aplicado then raise exception 'FALHOU: bônus aplicado sem estoque'; end if;
  if v_ord.bonus_aviso is null then raise exception 'FALHOU: bônus sem estoque deveria gravar bonus_aviso'; end if;
  if exists (select 1 from order_items where order_id = v_ono and preco_unit = 0) then
    raise exception 'FALHOU: item de bônus criado sem estoque'; end if;
  if v_ord.valor_produtos <> 750 then raise exception 'FALHOU: valor_produtos sem bônus = %', v_ord.valor_produtos; end if;
  update product_sizes set estoque = 4 where id = v_bsize38;
  update product_sizes set estoque = 3 where id = v_bsize37;

  -- ---------- 5. bônus desativado com 15 peças: sem bônus e sem aviso ----------
  update admin_config set bonus_ativo = false where id = 1;
  -- 0012: o checkout esvazia o carrinho; reabastece para o próximo pedido
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_ooff := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_ooff;
  if v_ord.bonus_aplicado or v_ord.bonus_aviso is not null then
    raise exception 'FALHOU: bônus desativado deveria ficar sem bônus e sem aviso (aplicado %, aviso %)', v_ord.bonus_aplicado, v_ord.bonus_aviso; end if;
  if exists (select 1 from order_items where order_id = v_ooff and preco_unit = 0) then
    raise exception 'FALHOU: item de bônus criado com bonus_ativo = false'; end if;
  update admin_config set bonus_ativo = true where id = 1;

  -- ---------- 6. varejo desligado ----------
  select jsonb_build_array(jsonb_build_object('produto_id', t.prod, 'color_id', t.color, 'size_id', t.size, 'quantidade', 1))
    into v_items from t_sku t where t.n = 13;
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    r := checkout_iniciar_pedido('Cli Teste', '(11) 98888-0000', 'retirada', null, null, null, null, null, null,
      v_items, false);
    raise exception 'FALHOU: varejo passou com varejo_ativo = false';
  exception when raise_exception then
    if sqlerrm <> 'varejo desativado' then raise; end if;
  end;
  reset role;
  -- controle positivo: com a flag ligada o mesmo pedido de varejo funciona (a negação acima era a flag)
  update admin_config set varejo_ativo = true where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Cli Teste', '(11) 98888-0000', 'retirada', null, null, null, null, null, null,
    v_items, false);
  reset role;
  v_ov := (r->>'id')::uuid;
  if (select bonus_aplicado from orders where id = v_ov) then raise exception 'FALHOU: varejo recebeu bônus'; end if;
  update admin_config set varejo_ativo = false where id = 1;

  -- ---------- 7. convidado (anon) não executa o checkout ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform checkout_iniciar_pedido('Convidado', '(11) 97777-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, false);
    raise exception 'FALHOU: anon executou checkout_iniciar_pedido';
  exception
    when insufficient_privilege then null;
    when raise_exception then raise exception 'FALHOU: anon alcançou o corpo do checkout (%)', sqlerrm;
  end;
  reset role;
  if has_function_privilege('anon', 'public.checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)', 'execute') then
    raise exception 'FALHOU: anon ainda tem EXECUTE em checkout_iniciar_pedido'; end if;
  if not has_function_privilege('authenticated', 'public.checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)', 'execute') then
    raise exception 'FALHOU: authenticated perdeu EXECUTE em checkout_iniciar_pedido'; end if;
  select count(*) into v_n from pg_proc where proname = 'checkout_iniciar_pedido';
  if v_n <> 1 then raise exception 'FALHOU: checkout_iniciar_pedido tem % sobrecargas (esperado 1)', v_n; end if;

  -- 0012: o pedido de atacado nasce 'preparando' (sem pagamento no site). O webhook do Mercado Pago continua
  -- valendo para pedidos 'pendente' (legado/varejo): simula esse estado para conferir a regra de valores.
  update orders set status = 'pendente' where id in (v_o30, v_ono, v_ooff);

  -- ---------- 9. webhook: valor obrigatório e conferido ----------
  select count(*) into v_n from pg_proc where proname = 'mp_register_order_payment';
  if v_n <> 1 then raise exception 'FALHOU: mp_register_order_payment tem % sobrecargas (esperado 1)', v_n; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  -- chamada antiga, sem o valor: função inexistente
  begin
    perform mp_register_order_payment(v_seg, v_o30, 'mp-tc-30', 'pix');
    raise exception 'FALHOU: mp_register_order_payment aceitou chamada sem p_transaction_amount';
  exception when undefined_function then null; end;
  -- valor divergente: SEM exceção, ok=false com reason, nada liquida e o pedido segue pendente
  r := mp_register_order_payment(v_seg, v_o30, 'mp-tc-30', 'pix', 1499::numeric);
  if r->>'reason' is distinct from 'valor_abaixo_do_esperado' or (r->>'ok')::boolean is distinct from false
     or (r->>'esperado')::numeric <> 1500 or (r->>'recebido')::numeric <> 1499 then
    raise exception 'FALHOU: valor abaixo retornou %', r; end if;
  r := mp_register_order_payment(v_seg, v_o30, 'mp-tc-30', 'pix', 1501::numeric);
  if r->>'reason' is distinct from 'valor_acima_do_esperado' or (r->>'ok')::boolean is distinct from false
     or (r->>'esperado')::numeric <> 1500 or (r->>'recebido')::numeric <> 1501 then
    raise exception 'FALHOU: valor acima retornou %', r; end if;
  r := mp_register_order_payment(v_seg, v_o30, 'mp-tc-30', 'pix', null::numeric);
  if r->>'reason' is distinct from 'valor_ausente' or (r->>'ok')::boolean is distinct from false
     or (r->>'esperado')::numeric <> 1500 or r->'recebido' <> 'null'::jsonb then
    raise exception 'FALHOU: valor NULL retornou %', r; end if;
  -- segredo errado continua barrado
  begin
    perform mp_register_order_payment('segredo-errado', v_o30, 'mp-tc-30', 'pix', 1500::numeric);
    raise exception 'FALHOU: segredo errado foi aceito';
  exception when sqlstate '28000' then null; end;
  reset role;
  if (select status from orders where id = v_o30) <> 'pendente' then
    raise exception 'FALHOU: pedido liquidado/alterado apesar de valor errado'; end if;
  if exists (select 1 from sales where order_id = v_o30) then raise exception 'FALHOU: sales criada com valor errado'; end if;
  -- valor igual: liquida (chamável com a chave anon + segredo)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := mp_register_order_payment(v_seg, v_o30, 'mp-tc-30', 'pix', 1500::numeric);
  reset role;
  if (r->>'ok')::boolean is distinct from true then raise exception 'FALHOU: pagamento com valor igual retornou %', r; end if;
  if (select status from orders where id = v_o30) <> 'pago' then raise exception 'FALHOU: pedido não ficou pago'; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  -- idempotência ANTES da conferência: pedido já pago com valor errado => already
  r := mp_register_order_payment(v_seg, v_o30, 'mp-tc-30b', 'pix', 1::numeric);
  if r is distinct from jsonb_build_object('ok', true, 'already', true,
       'status_atual', 'pago', 'mp_payment_id_registrado', 'mp-tc-30') then
    raise exception 'FALHOU: pedido já pago com valor errado retornou %', r; end if;
  -- tolerância de 1 centavo (para cima e para baixo)
  r := mp_register_order_payment(v_seg, v_ono, 'mp-tc-ono', 'pix', 750.01::numeric);
  reset role;
  if (r->>'ok')::boolean is distinct from true or (select status from orders where id = v_ono) <> 'pago' then
    raise exception 'FALHOU: 750.01 deveria liquidar (%)', r; end if;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := mp_register_order_payment(v_seg, v_ooff, 'mp-tc-ooff', 'pix', 749.99::numeric);
  reset role;
  if (r->>'ok')::boolean is distinct from true or (select status from orders where id = v_ooff) <> 'pago' then
    raise exception 'FALHOU: 749.99 deveria liquidar (%)', r; end if;
  select count(*) into v_n from sales where order_id = v_o30;
  if v_n <> 13 then raise exception 'FALHOU: liquidação gerou % linhas de sales (esperado 12 pagos + 1 bônus)', v_n; end if;

  -- ---------- 11. bônus não vende além do estoque (produto de bônus também no carrinho) ----------
  update admin_config set bonus_ativo = true where id = 1;
  update products set ativo = true where id = v_bonus;
  update product_sizes set estoque = 5 where id = v_bsize38;
  update product_sizes set estoque = 0 where id = v_bsize37;
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 1 from t_sku t where t.n <= 11;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    values (v_rev, v_bonus, v_bcor, v_bsize38, 5);
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_oa := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_oa;
  if v_ord.bonus_aplicado or v_ord.bonus_aviso is null then
    raise exception 'FALHOU: bônus no mesmo size_id sem sobra deveria dar aviso (aplicado %, aviso %)', v_ord.bonus_aplicado, v_ord.bonus_aviso; end if;
  if exists (select 1 from order_items where order_id = v_oa and preco_unit = 0) then
    raise exception 'FALHOU: bônus criado sem estoque disponível (vende além do estoque)'; end if;
  perform _settle_order(v_oa, 'mp-tc-oa', 'pix');
  select estoque into v_est from product_sizes where id = v_bsize38;
  if v_est <> 0 then raise exception 'FALHOU: estoque do tamanho 38 = % (esperado 0 = 5 - 5)', v_est; end if;
  -- com um segundo tamanho disponível, o bônus usa o outro tamanho
  update product_sizes set estoque = 5 where id = v_bsize38;
  update product_sizes set estoque = 3 where id = v_bsize37;
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, 1 from t_sku t where t.n <= 11;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    values (v_rev, v_bonus, v_bcor, v_bsize38, 5);
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_ob := (r->>'id')::uuid;
  if not exists (select 1 from order_items where order_id = v_ob and preco_unit = 0 and size_id = v_bsize37 and quantidade = 1)
     or not (select bonus_aplicado from orders where id = v_ob) then
    raise exception 'FALHOU: bônus deveria usar o tamanho 37 (o 38 está comprometido)'; end if;
  perform _settle_order(v_ob, 'mp-tc-ob', 'pix');
  if (select min(estoque) from product_sizes where color_id = v_bcor) < 0 then raise exception 'FALHOU: estoque negativo'; end if;
  if (select estoque from product_sizes where id = v_bsize38) <> 0 or (select estoque from product_sizes where id = v_bsize37) <> 2 then
    raise exception 'FALHOU: estoque após liquidar (38 deveria ir a 0 e 37 a 2)'; end if;

  -- ---------- 12. produto de bônus inativo: sem bônus, com aviso ----------
  update products set ativo = false where id = v_bonus;
  update product_sizes set estoque = 5 where color_id = v_bcor;
  v_q := array[2,2,2,1,1,1,1,1,1,1,1,1];
  delete from carrinho_atacado;
  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
    select v_rev, t.prod, t.color, t.size, v_q[t.n] from t_sku t where t.n <= 12;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := checkout_iniciar_pedido('Rev Teste', '(11) 99999-0000', 'retirada', null, null, null, null, null, null, '[]'::jsonb, true);
  reset role;
  v_oc := (r->>'id')::uuid;
  select * into v_ord from orders where id = v_oc;
  if v_ord.bonus_aplicado or v_ord.bonus_aviso is null
     or exists (select 1 from order_items where order_id = v_oc and preco_unit = 0) then
    raise exception 'FALHOU: bônus inativo deveria dar aviso e não aplicar (aplicado %, aviso %)', v_ord.bonus_aplicado, v_ord.bonus_aviso; end if;

  -- ---------- 10. public_get_order sem endereço ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := public_get_order(v_o14);
  reset role;
  if exists (select 1 from jsonb_object_keys(r) k where k like 'endereco%') then
    raise exception 'FALHOU: public_get_order devolve campos de endereço (%)', r; end if;
  if r::text like '%Rua A%' or r::text like '%01000-000%' then raise exception 'FALHOU: public_get_order vaza o endereço'; end if;
  if r->>'id' <> v_o14::text or r->>'status' <> 'preparando' or jsonb_array_length(r->'items') <> 12 then
    raise exception 'FALHOU: public_get_order perdeu os campos básicos (%)', r; end if;
  if not exists (select 1 from orders where id = v_o14 and endereco_rua = 'Rua A') then
    raise exception 'FALHOU: fixture de endereço não foi gravada (teste 10 sem valor)'; end if;

  raise exception 'TESTE_C_OK';   -- desfaz tudo; o runner trata TESTE_*_OK como sucesso
end $t$;
