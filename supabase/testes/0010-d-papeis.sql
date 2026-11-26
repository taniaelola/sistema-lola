-- Seção D/E: papéis (supervisor sem valores em Pedidos, cadastro de produto sem preço) e higiene de search_path.
-- Roda em transação única; termina com TESTE_D_OK (o runner trata como sucesso).
-- Negações: só o sqlstate esperado é aceito (42501 para papel; P0001 com a mensagem exata para a trava de preço).
do $t$
declare
  u_sup uuid := '00000000-0000-4000-8000-0000000000e1';
  u_adm uuid := '00000000-0000-4000-8000-0000000000e2';
  u_sa  uuid := '00000000-0000-4000-8000-0000000000e3';
  u_cli uuid := '00000000-0000-4000-8000-0000000000e4';
  v_cat uuid; v_p100 uuid; v_p0 uuid; v_novo uuid; v_novo2 uuid; v_cat_sup uuid;
  v_o1 uuid; v_o2 uuid;
  r jsonb; e jsonb; it jsonb; n int; who text;
  rp record;
  v_cA uuid; v_cB uuid; v_cC uuid; v_pnov uuid; v_pov uuid; v_o3 uuid;
begin
  -- ---------- fixtures ----------
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_sup,'td-sup@teste.invalid'),(u_adm,'td-adm@teste.invalid'),
               (u_sa,'td-sa@teste.invalid'),(u_cli,'td-cli@teste.invalid')) as x(id, em);
  update profiles set papel = 'supervisor' where id = u_sup;
  update profiles set papel = 'admin' where id = u_adm;
  update profiles set papel = 'superadmin' where id = u_sa;
  update profiles set papel = 'cliente' where id = u_cli;

  insert into categorias (grupo, nome, slug, desconto_atacado_percentual)
    values ('calcados', 'TD Cat', 'td-cat', 40) returning id into v_cat;
  insert into products (slug, nome, categoria_id, preco, desconto_percentual, preco_atacado, ativo)
    values ('td-p100', 'TD Cem', v_cat, 100, 10, 60, true) returning id into v_p100;
  insert into products (slug, nome, categoria_id, preco, ativo)
    values ('td-p0', 'TD Zero', v_cat, 0, false) returning id into v_p0;

  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, endereco_rua,
                      valor_produtos, valor_total, is_atacado)
    values ('TD Cliente Varejo', '11999990001', 'entrega', 10, 'Rua A', 200, 210, false) returning id into v_o1;
  insert into order_items (order_id, produto_id, produto_nome, produto_cor, produto_tamanho, quantidade, preco_unit, subtotal)
    values (v_o1, v_p100, 'TD Cem', 'Preto', '38', 2, 100, 200),
           (v_o1, v_p100, 'TD Cem', 'Branco', '39', 1, 100, 100);
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total, is_atacado)
    values ('TD Atacado', '11999990002', 'retirada', 0, 120, 120, true) returning id into v_o2;
  insert into order_items (order_id, produto_id, produto_nome, quantidade, preco_unit, subtotal)
    values (v_o2, v_p100, 'TD Cem', 2, 60, 120);

  -- ---------- 1. supervisor: Pedidos sem NENHUM valor, com telefone ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_orders();
  reset role;
  if jsonb_array_length(r) < 2 then raise exception 'FALHOU 1: lista do supervisor sem os pedidos de fixture'; end if;
  n := 0;
  for e in select * from jsonb_array_elements(r) loop
    if jsonb_typeof(e->'valor_total') is distinct from 'null' then raise exception 'FALHOU 1: valor_total visível para supervisor: %', e->'valor_total'; end if;
    if jsonb_typeof(e->'valor_produtos') is distinct from 'null' then raise exception 'FALHOU 1: valor_produtos visível para supervisor'; end if;
    if jsonb_typeof(e->'entrega_taxa') is distinct from 'null' then raise exception 'FALHOU 1: entrega_taxa visível para supervisor'; end if;
    if e->>'cliente_telefone' is null then raise exception 'FALHOU 1: telefone sumiu para o supervisor'; end if;
    if jsonb_typeof(e->'items') is distinct from 'array' then raise exception 'FALHOU 1: items não é array'; end if;
    for it in select * from jsonb_array_elements(e->'items') loop
      if jsonb_typeof(it->'preco_unit') is distinct from 'null' then raise exception 'FALHOU 1: preco_unit visível para supervisor'; end if;
      if jsonb_typeof(it->'subtotal') is distinct from 'null' then raise exception 'FALHOU 1: subtotal visível para supervisor'; end if;
      if it->>'produto_nome' is null or (it->>'quantidade')::int < 1 then raise exception 'FALHOU 1: item perdeu nome/quantidade'; end if;
    end loop;
    if (e->>'id')::uuid = v_o1 then
      if e->>'endereco_rua' <> 'Rua A' then raise exception 'FALHOU 1: endereço sumiu'; end if;
      if jsonb_array_length(e->'items') <> 2 then raise exception 'FALHOU 1: pedido 1 deveria ter 2 itens'; end if;
      n := n + 1;
    elsif (e->>'id')::uuid = v_o2 then
      if jsonb_array_length(e->'items') <> 1 then raise exception 'FALHOU 1: pedido 2 deveria ter 1 item'; end if;
      n := n + 1;
    end if;
  end loop;
  if n <> 2 then raise exception 'FALHOU 1: pedidos de fixture ausentes na lista (%)', n; end if;
  -- o filtro continua valendo para o supervisor
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := admin_list_orders('atacado');
  reset role;
  if exists (select 1 from jsonb_array_elements(r) x where (x->>'is_atacado')::boolean is not true) then
    raise exception 'FALHOU 1: filtro atacado devolveu pedido de varejo';
  end if;

  -- ---------- 2. admin e superadmin mantêm os valores ----------
  foreach who in array array['adm','sa'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', case who when 'adm' then u_adm else u_sa end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := admin_list_orders();
    reset role;
    select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_o1;
    if e is null then raise exception 'FALHOU 2 (%): pedido 1 ausente', who; end if;
    if (e->>'valor_total')::numeric <> 210 or (e->>'valor_produtos')::numeric <> 200 or (e->>'entrega_taxa')::numeric <> 10 then
      raise exception 'FALHOU 2 (%): valores do pedido mudaram: %', who, e;
    end if;
    if not exists (select 1 from jsonb_array_elements(e->'items') i where (i->>'preco_unit')::numeric = 100 and (i->>'subtotal')::numeric = 200) then
      raise exception 'FALHOU 2 (%): preco_unit/subtotal dos itens sumiram', who;
    end if;
  end loop;

  -- ---------- 3. (0013) supervisor cria produto: preço 999 gravado e pode ativar; atacado/desconto ignorados ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_novo := admin_upsert_product(
    p_id => null, p_nome => 'TD Novo Sup', p_categoria_id => v_cat, p_colecao => 'x',
    p_preco => 999, p_desconto_percentual => 50, p_preco_atacado => 500, p_descricao => 'd',
    p_caracteristicas => array['a'], p_ativo => true, p_destaque => false, p_ordem => 3, p_slug => 'td-novo-sup',
    p_somente_bonus => true);
  reset role;
  select * into rp from products where id = v_novo;
  if rp.preco <> 999 then raise exception 'FALHOU 3: supervisor gravou preco % (esperado 999)', rp.preco; end if;
  if not rp.ativo then raise exception 'FALHOU 3: produto do supervisor com preço deveria poder nascer ativo'; end if;
  if rp.preco_atacado is not null or rp.desconto_percentual is not null then
    raise exception 'FALHOU 3: supervisor gravou preco_atacado/desconto (% / %)', rp.preco_atacado, rp.desconto_percentual;
  end if;
  if rp.nome <> 'TD Novo Sup' or rp.slug <> 'td-novo-sup' or rp.ordem <> 3 or not rp.somente_bonus then
    raise exception 'FALHOU 3: campos de cadastro não gravados (nome %, slug %, ordem %, somente_bonus %)', rp.nome, rp.slug, rp.ordem, rp.somente_bonus;
  end if;

  -- ---------- 4. (0013) supervisor edita: cadastro e preço cheio mudam; atacado próprio e desconto preservados ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(
    p_id => v_p100, p_nome => 'TD Cem Editado', p_categoria_id => v_cat, p_colecao => 'nova',
    p_preco => 1, p_desconto_percentual => 99, p_preco_atacado => 1, p_descricao => 'outra',
    p_caracteristicas => array['b','c'], p_ativo => true, p_destaque => true, p_ordem => 7, p_slug => 'td-p100');
  reset role;
  select * into rp from products where id = v_p100;
  if rp.nome <> 'TD Cem Editado' or rp.colecao <> 'nova' or rp.descricao <> 'outra' or rp.ordem <> 7 or not rp.destaque then
    raise exception 'FALHOU 4: campos de cadastro não mudaram (%)', rp.nome;
  end if;
  if rp.preco <> 1 then raise exception 'FALHOU 4: supervisor deveria gravar o preço cheio (preco = %)', rp.preco; end if;
  if rp.preco_atacado is distinct from 60 then raise exception 'FALHOU 4: preco_atacado mudou para %', rp.preco_atacado; end if;
  if rp.desconto_percentual is distinct from 10 then raise exception 'FALHOU 4: desconto_percentual mudou para %', rp.desconto_percentual; end if;
  -- supervisor com id inexistente: erro de negócio (não cria nada)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform admin_upsert_product(gen_random_uuid(), 'x', v_cat, null, 1, null, null, null, null, false, false, 0, 'td-x');
    reset role;
    raise exception 'FALHOU 4: supervisor atualizou produto inexistente';
  exception when raise_exception then
    reset role;
    if sqlerrm <> 'registro não encontrado' then raise exception 'FALHOU 4: mensagem inesperada: %', sqlerrm; end if;
  end;

  -- ---------- 5. supervisor não altera desconto de atacado da categoria ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_categoria(v_cat, 'calcados', 'TD Cat Renomeada', 'td-cat', 2, true, 5, null);
  v_cat_sup := admin_upsert_categoria(null, 'calcados', 'TD Cat Sup', 'td-cat-sup', 1, true, 33, null);
  reset role;
  select * into rp from categorias where id = v_cat;
  if rp.nome <> 'TD Cat Renomeada' or rp.ordem <> 2 then raise exception 'FALHOU 5: cadastro da categoria não mudou'; end if;
  if rp.desconto_atacado_percentual is distinct from 40 then
    raise exception 'FALHOU 5: supervisor mudou desconto_atacado_percentual para %', rp.desconto_atacado_percentual;
  end if;
  select * into rp from categorias where id = v_cat_sup;
  if rp.desconto_atacado_percentual is not null then
    raise exception 'FALHOU 5: categoria criada pelo supervisor nasceu com desconto %', rp.desconto_atacado_percentual;
  end if;
  -- admin continua editando o desconto da categoria
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_categoria(v_cat, 'calcados', 'TD Cat Renomeada', 'td-cat', 2, true, 25, null);
  reset role;
  if (select desconto_atacado_percentual from categorias where id = v_cat) is distinct from 25 then
    raise exception 'FALHOU 5: admin não conseguiu mudar desconto_atacado_percentual';
  end if;

  -- supervisor consegue listar, ativar com preço, destacar, cor e tamanho
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if jsonb_array_length(admin_list_products()) < 2 then raise exception 'FALHOU: supervisor não lista produtos'; end if;
  if jsonb_array_length(admin_list_categorias()) < 1 then raise exception 'FALHOU: supervisor não lista categorias'; end if;
  perform admin_set_ativo(v_p100, true);
  perform admin_set_destaque(v_p100, false);
  v_novo2 := admin_upsert_color(null, v_p100, 'Verde', '#00ff00', array['i1'], 1);
  perform admin_upsert_size(null, v_novo2, '40', 4);
  reset role;
  if not exists (select 1 from product_sizes where color_id = v_novo2 and tamanho = '40' and estoque = 4) then
    raise exception 'FALHOU: supervisor não cadastrou cor/tamanho';
  end if;

  -- ---------- 6. supervisor negado (42501) em delete, desconto e surpresa ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_delete_product(v_p100);
    raise exception 'FALHOU 6: supervisor executou admin_delete_product';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_set_desconto(v_p100, 50);
    raise exception 'FALHOU 6: supervisor executou admin_set_desconto';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_set_surpresa(v_p100, true);
    raise exception 'FALHOU 6: supervisor executou admin_set_surpresa';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_delete_categoria(v_cat_sup);
    raise exception 'FALHOU 6: supervisor executou admin_delete_categoria';
  exception when insufficient_privilege then null; end;
  reset role;
  if not exists (select 1 from products where id = v_p100) then raise exception 'FALHOU 6: produto foi excluído'; end if;
  if (select desconto_percentual from products where id = v_p100) is distinct from 10 then raise exception 'FALHOU 6: desconto mudou'; end if;

  -- ---------- 7. qualquer papel: ativar produto com preco 0 lança ----------
  foreach who in array array['sup','adm','sa'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case who when 'sup' then u_sup when 'adm' then u_adm else u_sa end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform admin_set_ativo(v_p0, true);
      raise exception 'FALHOU 7 (%): ativou produto com preco 0', who;
    exception when raise_exception then
      reset role;
      if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 7 (%): mensagem inesperada: %', who, sqlerrm; end if;
    end;
    reset role;
    if (select ativo from products where id = v_p0) then raise exception 'FALHOU 7 (%): produto ficou ativo', who; end if;
  end loop;
  -- desativar um produto de preco 0 continua permitido; admin não cria/atualiza ativo com preco 0
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_ativo(v_p0, false);
  begin
    perform admin_upsert_product(null, 'TD Ativo Zero', v_cat, null, 0, null, null, null, null, true, false, 0, 'td-ativo-zero');
    raise exception 'FALHOU 7: admin criou produto ativo com preco 0';
  exception when raise_exception then
    reset role;
    if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 7: mensagem (insert) inesperada: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_upsert_product(v_p0, 'TD Zero', v_cat, null, 0, null, null, null, null, true, false, 0, 'td-p0');
    raise exception 'FALHOU 7: admin atualizou produto para ativo com preco 0';
  exception when raise_exception then
    reset role;
    if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 7: mensagem (update) inesperada: %', sqlerrm; end if;
  end;
  -- supervisor ativando via upsert um produto de preco 0 também lança
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_upsert_product(v_p0, 'TD Zero', v_cat, null, 0, null, null, null, null, true, false, 0, 'td-p0');
    raise exception 'FALHOU 7: supervisor ativou produto com preco 0 pelo upsert';
  exception when raise_exception then
    reset role;
    if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 7: mensagem (sup upsert) inesperada: %', sqlerrm; end if;
  end;
  if (select ativo from products where id = v_p0) then raise exception 'FALHOU 7: produto ficou ativo'; end if;

  -- ---------- 8. visitante e cliente negados em admin_list_products (42501) ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform admin_list_products();
    raise exception 'FALHOU 8: visitante executou admin_list_products';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_list_products();
    raise exception 'FALHOU 8: cliente executou admin_list_products';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_upsert_product(null, 'x', v_cat, null, 1, null, null, null, null, false, false, 0, 'td-cli');
    raise exception 'FALHOU 8: cliente executou admin_upsert_product';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_list_orders();
    raise exception 'FALHOU 8: cliente executou admin_list_orders';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ---------- 9. search_path fixo nas três funções puras; sem sobrecarga antiga; ACL ----------
  select count(*) into n from pg_proc where proname in ('_slugify','_preco_atacado','_preco_varejo');
  if n <> 3 then raise exception 'FALHOU 9: esperava 3 helpers, achou %', n; end if;
  select count(*) into n from pg_proc
    where proname in ('_slugify','_preco_atacado','_preco_varejo')
      and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'));
  if n <> 0 then raise exception 'FALHOU 9: % helper(s) sem search_path', n; end if;
  select count(*) into n from pg_proc where proname = 'admin_upsert_product' and pronamespace = 'public'::regnamespace;
  if n <> 1 then raise exception 'FALHOU 9: admin_upsert_product tem % sobrecargas (esperado 1)', n; end if;
  if pg_get_function_identity_arguments(to_regproc('admin_upsert_product')) not like '%p_somente_bonus boolean' then
    raise exception 'FALHOU 9: p_somente_bonus não é o último parâmetro';
  end if;
  if has_function_privilege('anon', to_regproc('admin_upsert_product'), 'EXECUTE')
     or has_function_privilege('public', to_regproc('admin_upsert_product'), 'EXECUTE') then
    raise exception 'FALHOU 9: anon/public executa admin_upsert_product';
  end if;
  if not has_function_privilege('authenticated', to_regproc('admin_upsert_product'), 'EXECUTE') then
    raise exception 'FALHOU 9: authenticated não executa admin_upsert_product';
  end if;

  -- ---------- 9b. admin edita preços e a flag somente_bonus persiste ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(
    p_id => v_p100, p_nome => 'TD Cem Admin', p_categoria_id => v_cat, p_colecao => null,
    p_preco => 150, p_desconto_percentual => 20, p_preco_atacado => 90, p_descricao => null,
    p_caracteristicas => null, p_ativo => true, p_destaque => false, p_ordem => 1, p_slug => 'td-p100',
    p_somente_bonus => true);
  v_novo2 := admin_upsert_product(null, 'TD Novo Adm', v_cat, null, 80, null, 48, null, null, true, false, 0, 'td-novo-adm');
  reset role;
  select * into rp from products where id = v_p100;
  if rp.preco <> 150 or rp.preco_atacado <> 90 or rp.desconto_percentual <> 20 then
    raise exception 'FALHOU 9b: admin não conseguiu editar preços (% / % / %)', rp.preco, rp.preco_atacado, rp.desconto_percentual;
  end if;
  if not rp.somente_bonus then raise exception 'FALHOU 9b: somente_bonus não persistiu'; end if;
  select * into rp from products where id = v_novo2;
  if rp.preco <> 80 or not rp.ativo or rp.somente_bonus then raise exception 'FALHOU 9b: insert do admin incorreto (default de somente_bonus = false)'; end if;
  -- ---------- 9c. somente_bonus: update SEM o parâmetro (como a UI atual) preserva; com o parâmetro muda ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p100, 'TD Cem Admin', v_cat, null, 150, 20, 90, null, null, true, false, 1, 'td-p100');
  reset role;
  if not (select somente_bonus from products where id = v_p100) then raise exception 'FALHOU 9c: update sem p_somente_bonus zerou a flag (admin)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p100, 'TD Cem Sup', v_cat, null, 1, 1, 1, null, null, true, false, 1, 'td-p100');
  reset role;
  if not (select somente_bonus from products where id = v_p100) then raise exception 'FALHOU 9c: update sem p_somente_bonus zerou a flag (supervisor)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p100, 'TD Cem Admin', v_cat, null, 150, 20, 90, null, null, true, false, 1, 'td-p100', false);
  reset role;
  if (select somente_bonus from products where id = v_p100) then raise exception 'FALHOU 9c: p_somente_bonus=false não desligou a flag'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p100, 'TD Cem Admin', v_cat, null, 150, 20, 90, null, null, true, false, 1, 'td-p100', true);
  perform admin_upsert_product(v_p100, 'TD Cem Admin', v_cat, null, 150, 20, 90, null, null, true, false, 1, 'td-p100');
  r := admin_list_products();
  reset role;
  if not (select somente_bonus from products where id = v_p100) then raise exception 'FALHOU 9c: flag deveria continuar true'; end if;
  select x into e from jsonb_array_elements(r) x where (x->>'id')::uuid = v_p100;
  if jsonb_typeof(e->'somente_bonus') is distinct from 'boolean' or (e->>'somente_bonus')::boolean is not true then
    raise exception 'FALHOU 9c: admin_list_products não devolve somente_bonus (%)', e->'somente_bonus';
  end if;

  -- ---------- 11. public_get_order: supervisor sem dinheiro; demais com valores; ninguém vê endereço ----------
  insert into orders (cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa, valor_produtos, valor_total)
    values ('TD Sem Itens', '11999990003', 'entrega', 5, 0, 5) returning id into v_o3;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public_get_order(v_o1);
  e := public_get_order(v_o3);
  reset role;
  if jsonb_typeof(r->'valor_total') is distinct from 'null' or jsonb_typeof(r->'valor_produtos') is distinct from 'null'
     or jsonb_typeof(r->'entrega_taxa') is distinct from 'null' then
    raise exception 'FALHOU 11: supervisor vê valores em public_get_order: %', r;
  end if;
  if jsonb_array_length(r->'items') <> 2 then raise exception 'FALHOU 11: itens do pedido (supervisor)'; end if;
  for it in select * from jsonb_array_elements(r->'items') loop
    if jsonb_typeof(it->'preco_unit') is distinct from 'null' or jsonb_typeof(it->'subtotal') is distinct from 'null' then
      raise exception 'FALHOU 11: supervisor vê preco_unit/subtotal em public_get_order';
    end if;
    if it->>'produto_nome' is null then raise exception 'FALHOU 11: item perdeu nome'; end if;
  end loop;
  if r->>'cliente_nome' is null or r ? 'endereco_rua' then raise exception 'FALHOU 11: nome ausente ou endereço presente'; end if;
  if e->'items' is distinct from '[]'::jsonb then raise exception 'FALHOU 11: pedido sem itens deveria dar items [] (%)', e->'items'; end if;
  if jsonb_typeof(e->'valor_total') is distinct from 'null' then raise exception 'FALHOU 11: pedido sem itens vazou valor_total'; end if;
  foreach who in array array['adm','sa','cli','anon'] loop
    if who = 'anon' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
    else
      perform set_config('request.jwt.claims', json_build_object('sub',
        case who when 'adm' then u_adm when 'sa' then u_sa else u_cli end, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
    r := public_get_order(v_o1);
    reset role;
    if (r->>'valor_total')::numeric <> 210 or (r->>'valor_produtos')::numeric <> 200 or (r->>'entrega_taxa')::numeric <> 10 then
      raise exception 'FALHOU 11 (%): valores do pedido sumiram: %', who, r;
    end if;
    if not exists (select 1 from jsonb_array_elements(r->'items') i where (i->>'preco_unit')::numeric = 100 and (i->>'subtotal')::numeric = 200) then
      raise exception 'FALHOU 11 (%): preco_unit/subtotal sumiram', who;
    end if;
    if r ? 'endereco_rua' or r ? 'endereco_cep' then raise exception 'FALHOU 11 (%): endereço vazou', who; end if;
  end loop;
  -- o helper interno não é chamável por quem está logado
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform _mascarar_dinheiro_pedido('{}'::jsonb);
    raise exception 'FALHOU 11: supervisor executou o helper interno';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ---------- 12. (0013) supervisor: pode trocar de categoria livremente (o preço cheio ele já edita) ----------
  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TD A', 'td-a', 10) returning id into v_cA;
  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TD B', 'td-b', 20) returning id into v_cB;
  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TD C', 'td-c', 10) returning id into v_cC;
  insert into products (slug, nome, categoria_id, preco, ativo) values ('td-pnov', 'TD Sem Override', v_cA, 100, true) returning id into v_pnov;
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo) values ('td-pov', 'TD Com Override', v_cA, 100, 50, true) returning id into v_pov;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_pnov, 'TD Sem Override', v_cB, null, 1, null, null, null, null, true, false, 0, 'td-pnov');
  reset role;
  if (select categoria_id from products where id = v_pnov) <> v_cB then raise exception 'FALHOU 12: supervisor deveria trocar a categoria'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_pnov, 'TD Sem Override', v_cC, null, 1, null, null, null, null, true, false, 0, 'td-pnov');   -- mesmo desconto (10)
  perform admin_upsert_product(v_pov, 'TD Com Override', v_cB, null, 1, null, null, null, null, true, false, 0, 'td-pov');     -- override
  v_novo := admin_upsert_product(null, 'TD Sup Cat Livre', v_cB, null, 1, null, null, null, null, true, false, 0, 'td-sup-livre'); -- insert
  reset role;
  if (select categoria_id from products where id = v_pnov) <> v_cC then raise exception 'FALHOU 12: troca para desconto igual deveria valer'; end if;
  if (select categoria_id from products where id = v_pov) <> v_cB then raise exception 'FALHOU 12: troca com override deveria valer'; end if;
  if (select categoria_id from products where id = v_novo) <> v_cB then raise exception 'FALHOU 12: insert do supervisor deveria aceitar qualquer categoria'; end if;
  if (select preco_atacado from products where id = v_pov) is distinct from 50 then raise exception 'FALHOU 12: override mudou'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_pnov, 'TD Sem Override', v_cB, null, 100, null, null, null, null, true, false, 0, 'td-pnov');
  reset role;
  if (select categoria_id from products where id = v_pnov) <> v_cB then raise exception 'FALHOU 12: admin deveria mudar a categoria livremente'; end if;

  -- ---------- 10. fim ----------
  raise exception 'TESTE_D_OK';
end $t$;
