-- Seção H: trava de ativação exige preço de atacado efetivo > 0 (override 0, desconto de categoria 100%),
-- em admin_upsert_product (admin e supervisor) e admin_set_ativo. Brinde (somente_bonus) mantém só a regra do preço.
-- Transação única; termina com TESTE_H_OK (o runner trata como sucesso).
do $t$
declare
  u_adm uuid := '00000000-0000-4000-8000-0000000000b1';
  u_sup uuid := '00000000-0000-4000-8000-0000000000b2';
  v_cat uuid; v_cat100 uuid; v_p uuid; v_pov uuid; v_pc100 uuid; v_pb uuid; v_novo uuid;
  v_msg text := 'Defina um preço de atacado maior que zero antes de ativar';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_adm,'th-adm@teste.invalid'),(u_sup,'th-sup@teste.invalid')) as x(id, em);
  update profiles set papel = 'admin' where id = u_adm;
  update profiles set papel = 'supervisor' where id = u_sup;

  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TH Cat', 'th-cat', 30) returning id into v_cat;
  insert into categorias (grupo, nome, slug, desconto_atacado_percentual) values ('calcados', 'TH Cat100', 'th-cat100', 100) returning id into v_cat100;
  insert into products (slug, nome, categoria_id, preco, ativo) values ('th-ok', 'TH Ok', v_cat, 100, false) returning id into v_p;
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo) values ('th-ov0', 'TH Override 0', v_cat, 100, 0, false) returning id into v_pov;
  insert into products (slug, nome, categoria_id, preco, ativo) values ('th-c100', 'TH Cat 100', v_cat100, 100, false) returning id into v_pc100;
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo, somente_bonus)
    values ('th-bonus', 'TH Brinde', v_cat100, 99, 0, false, true) returning id into v_pb;

  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---------- 1. admin_set_ativo ----------
  begin
    perform admin_set_ativo(v_pov, true);
    raise exception 'FALHOU 1: ativou produto com override de atacado 0';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 1: mensagem inesperada (override 0): %', sqlerrm; end if;
  end;
  begin
    perform admin_set_ativo(v_pc100, true);
    raise exception 'FALHOU 1: ativou produto com desconto de categoria 100%%';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 1: mensagem inesperada (cat 100): %', sqlerrm; end if;
  end;
  perform admin_set_ativo(v_p, true);              -- 100 com 30% => 70: passa
  perform admin_set_ativo(v_pb, true);             -- brinde: só preço > 0
  perform admin_set_ativo(v_p, false);
  perform admin_set_ativo(v_pov, false);           -- desativar nunca é bloqueado
  reset role;
  if (select ativo from products where id = v_pov) or (select ativo from products where id = v_pc100) then
    raise exception 'FALHOU 1: produto ruim ficou ativo';
  end if;
  if not (select ativo from products where id = v_p) is false then raise exception 'FALHOU 1: desativação falhou'; end if;
  if not (select ativo from products where id = v_pb) then raise exception 'FALHOU 1: brinde não ativou'; end if;

  -- ---------- 2. admin_upsert_product: update e insert ----------
  set local role authenticated;
  begin
    perform admin_upsert_product(v_pov, 'TH Override 0', v_cat, null, 100, null, 0, null, null, true, false, 0, 'th-ov0');
    raise exception 'FALHOU 2: upsert ativou com override 0';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 2: mensagem (upsert override 0): %', sqlerrm; end if;
  end;
  begin
    perform admin_upsert_product(v_pc100, 'TH Cat 100', v_cat100, null, 100, null, null, null, null, true, false, 0, 'th-c100');
    raise exception 'FALHOU 2: upsert ativou com categoria 100%%';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 2: mensagem (upsert cat 100): %', sqlerrm; end if;
  end;
  begin
    perform admin_upsert_product(null, 'TH Novo Ruim', v_cat, null, 100, null, 0, null, null, true, false, 0, 'th-novo-ruim');
    raise exception 'FALHOU 2: insert ativo com override 0';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 2: mensagem (insert override 0): %', sqlerrm; end if;
  end;
  -- normal passa (update e insert); override positivo vence categoria 100%; inativo com atacado 0 é permitido
  perform admin_upsert_product(v_p, 'TH Ok', v_cat, null, 100, null, null, null, null, true, false, 0, 'th-ok');
  v_novo := admin_upsert_product(null, 'TH Novo Bom', v_cat100, null, 100, null, 40, null, null, true, false, 0, 'th-novo-bom');
  perform admin_upsert_product(v_pov, 'TH Override 0', v_cat, null, 100, null, 0, null, null, false, false, 0, 'th-ov0');
  -- brinde via upsert: só a regra do preço (atacado 0 aceito); preço 0 continua bloqueado
  perform admin_upsert_product(v_pb, 'TH Brinde', v_cat100, null, 99, null, 0, null, null, true, false, 0, 'th-bonus', true);
  begin
    perform admin_upsert_product(v_pb, 'TH Brinde', v_cat100, null, 0, null, 0, null, null, true, false, 0, 'th-bonus', true);
    raise exception 'FALHOU 2: brinde ativo com preço 0';
  exception when raise_exception then
    if sqlerrm <> 'defina o preço antes de ativar' then raise exception 'FALHOU 2: mensagem (brinde preço 0): %', sqlerrm; end if;
  end;
  reset role;
  if not (select ativo from products where id = v_p) or not (select ativo from products where id = v_novo) then
    raise exception 'FALHOU 2: produto normal não ficou ativo';
  end if;
  if (select ativo from products where id = v_pov) or (select ativo from products where id = v_pc100) then
    raise exception 'FALHOU 2: produto ruim ficou ativo';
  end if;

  -- ---------- 3. supervisor: nasce inativo com preço 0; ativar com atacado efetivo 0 também é barrado ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_novo := admin_upsert_product(null, 'TH Sup', v_cat, null, null, null, null, null, null, true, false, 0, 'th-sup');
  reset role;
  if (select ativo from products where id = v_novo) or (select preco from products where id = v_novo) <> 0 then
    raise exception 'FALHOU 3: produto do supervisor deveria nascer inativo com preço 0';
  end if;
  set local role authenticated;
  begin
    perform admin_upsert_product(v_pc100, 'TH Cat 100', v_cat100, null, null, null, null, null, null, true, false, 0, 'th-c100');
    raise exception 'FALHOU 3: supervisor ativou produto com atacado efetivo 0';
  exception when raise_exception then
    if sqlerrm <> v_msg then raise exception 'FALHOU 3: mensagem (supervisor): %', sqlerrm; end if;
  end;
  reset role;

  raise exception 'TESTE_H_OK';
end $t$;
