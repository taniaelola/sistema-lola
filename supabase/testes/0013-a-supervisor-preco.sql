-- 0013: o supervisor vê e edita o preço cheio do produto; atacado próprio e desconto de varejo seguem só com admin.
-- Transação única; termina com TESTE_0013_OK (o runner trata como sucesso).
do $t$
declare
  u_sp uuid := '00000000-0000-4000-8000-0000000000d1';
  u_ad uuid := '00000000-0000-4000-8000-0000000000d2';
  v_cat uuid; v_p uuid; v_q uuid; e jsonb; rp products;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (u_sp, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't13-sp@teste.invalid', now(), now(), now()),
    (u_ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't13-ad@teste.invalid', now(), now(), now());
  update profiles set papel = 'supervisor' where id = u_sp;
  update profiles set papel = 'admin' where id = u_ad;
  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'T13 Cat', 't13-cat', 30) returning id into v_cat;

  -- 1. supervisor cria produto com preço 120, tentando também atacado 5 e desconto 50: preço vale, o resto é ignorado; nasce ativo
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_p := admin_upsert_product(null, 'T13 Prod', v_cat, null, 120, 50, 5, 'd', array[]::text[], true, false, 0, 't13-prod');
  reset role;
  select * into rp from products where id = v_p;
  if rp.preco <> 120 then raise exception 'FALHOU 1: preco = % (esperado 120)', rp.preco; end if;
  if not rp.ativo then raise exception 'FALHOU 1: deveria nascer ativo (tem preço)'; end if;
  if rp.preco_atacado is not null or rp.desconto_percentual is not null then
    raise exception 'FALHOU 1: supervisor gravou atacado/desconto (% / %)', rp.preco_atacado, rp.desconto_percentual; end if;

  -- 2. admin define atacado próprio 60 e desconto 10; supervisor edita o preço para 150: preço muda, os dois ficam
  perform set_config('request.jwt.claims', json_build_object('sub', u_ad, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p, 'T13 Prod', v_cat, null, 120, 10, 60, 'd', array[]::text[], true, false, 0, 't13-prod');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_upsert_product(v_p, 'T13 Prod', v_cat, null, 150, 99, 1, 'd', array[]::text[], true, false, 0, 't13-prod');
  reset role;
  select * into rp from products where id = v_p;
  if rp.preco <> 150 then raise exception 'FALHOU 2: preco = % (esperado 150)', rp.preco; end if;
  if rp.preco_atacado is distinct from 60 then raise exception 'FALHOU 2: atacado próprio mudou para %', rp.preco_atacado; end if;
  if rp.desconto_percentual is distinct from 10 then raise exception 'FALHOU 2: desconto mudou para %', rp.desconto_percentual; end if;

  -- 3. a lista do supervisor mostra o preço
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select x into e from jsonb_array_elements(admin_list_products()) x where x->>'slug' = 't13-prod';
  reset role;
  if (e->>'preco')::numeric <> 150 then raise exception 'FALHOU 3: supervisor não vê o preço (%)', e->'preco'; end if;

  -- 4. preço negativo é recusado; ativar sem preço continua barrado
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_upsert_product(v_p, 'T13 Prod', v_cat, null, -5, null, null, 'd', array[]::text[], true, false, 0, 't13-prod');
    raise exception 'FALHOU 4: preço negativo passou';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'preço inválido' then raise exception 'FALHOU 4: mensagem inesperada (%)', sqlerrm; end if;
  end;
  begin
    perform admin_upsert_product(null, 'T13 Sem Preço', v_cat, null, 0, null, null, 'd', array[]::text[], true, false, 0, 't13-sem');
    raise exception 'FALHOU 4: ativou sem preço';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 4: mensagem (sem preço): %', sqlerrm; end if;
  end;
  -- sem preço, inativo: pode (rascunho)
  v_q := admin_upsert_product(null, 'T13 Rascunho', v_cat, null, 0, null, null, 'd', array[]::text[], false, false, 0, 't13-rasc');
  reset role;
  if (select ativo from products where id = v_q) then raise exception 'FALHOU 4: rascunho ficou ativo'; end if;

  -- 5. continua só com admin: desconto rápido e exclusão
  perform set_config('request.jwt.claims', json_build_object('sub', u_sp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_set_desconto(v_p, 20);
    raise exception 'FALHOU 5: supervisor executou admin_set_desconto';
  exception when insufficient_privilege then null; end;
  begin
    perform admin_delete_product(v_p);
    raise exception 'FALHOU 5: supervisor executou admin_delete_product';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'TESTE_0013_OK';
end $t$;
