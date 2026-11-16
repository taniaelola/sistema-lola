-- Seção A: flags e config. Levanta exceção se algo falhar. Roda em transação única.
do $t$
declare
  r jsonb;
  u uuid := '00000000-0000-4000-8000-0000000000c3';
  papeis text[] := array['cliente','revendedor','supervisor','admin'];
  ids uuid[] := array[
    '00000000-0000-4000-8000-0000000000c4'::uuid, '00000000-0000-4000-8000-0000000000c5'::uuid,
    '00000000-0000-4000-8000-0000000000c6'::uuid, '00000000-0000-4000-8000-0000000000c7'::uuid];
  i int; v_cat uuid; v_ativo uuid; v_inativo uuid; v_default text;
begin
  -- padrão seguro: varejo desligado, bônus desligado
  r := get_loja_flags();
  if (r->>'varejo_ativo')::boolean is distinct from false then raise exception 'FALHOU: varejo_ativo deve começar false (%)', r; end if;
  if (r->>'bonus_ativo')::boolean is distinct from false then raise exception 'FALHOU: bonus_ativo deve começar false'; end if;
  if (r->>'bonus_min_pecas')::int <> 15 then raise exception 'FALHOU: bonus_min_pecas padrão 15'; end if;
  select column_default into v_default from information_schema.columns
   where table_name = 'admin_config' and column_name = 'bonus_quantidade';
  if v_default is distinct from '1' then raise exception 'FALHOU: default de bonus_quantidade deve ser 1 (%)', v_default; end if;

  -- fixtures de usuários
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-sa@teste.invalid', now(), now(), now());
  update profiles set papel = 'superadmin' where id = u;
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            't-' || papeis[i] || '@teste.invalid', now(), now(), now());
    update profiles set papel = papeis[i]::papel_usuario where id = ids[i];
  end loop;

  -- fixtures de catálogo: categoria, produto ativo e produto inativo
  insert into categorias (grupo, nome, slug) values ('calcados', 'T Bônus', 't-bonus-cat') returning id into v_cat;
  insert into products (nome, categoria_id, preco, ativo) values ('Brinde Ativo', v_cat, 10, true) returning id into v_ativo;
  insert into products (nome, categoria_id, preco, ativo) values ('Brinde Inativo', v_cat, 10, false) returning id into v_inativo;

  -- anon lê as flags; não grava
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform get_loja_flags();                                   -- anon pode
  begin
    perform admin_set_loja_config(true, false, 15, null, 1);   -- anon não pode
    raise exception 'FALHOU: anon gravou config';
  exception when insufficient_privilege then null; end;
  reset role;

  -- logado sem ser superadmin: nem grava nem lê a config (42501 'sem permissão')
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', ids[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform admin_set_loja_config(true, false, 15, null, 1);
      raise exception 'FALHOU: % conseguiu gravar admin_set_loja_config', papeis[i];
    exception when insufficient_privilege then
      if sqlerrm <> 'sem permissão' then raise exception 'FALHOU: % recebeu mensagem inesperada (%)', papeis[i], sqlerrm; end if;
    end;
    begin
      perform admin_get_config();
      raise exception 'FALHOU: % conseguiu ler admin_get_config', papeis[i];
    exception when insufficient_privilege then
      if sqlerrm <> 'sem permissão' then raise exception 'FALHOU: % recebeu mensagem inesperada (%)', papeis[i], sqlerrm; end if;
    end;
    reset role;
  end loop;
  if (select varejo_ativo from admin_config where id = 1) is distinct from false then
    raise exception 'FALHOU: um papel não-superadmin alterou varejo_ativo';
  end if;

  -- superadmin grava e lê
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_loja_config(true, false, 20, null, 2);
  r := admin_get_config();
  if (r->>'varejo_ativo')::boolean is distinct from true or (r->>'bonus_min_pecas')::int <> 20 then
    raise exception 'FALHOU: admin_get_config não reflete a gravação (%)', r;
  end if;

  -- bônus ligado sem produto: só a mensagem de validação é aceita
  begin
    perform admin_set_loja_config(false, true, 15, null, 1);
    raise exception 'FALHOU: aceitou bônus ligado sem produto';
  exception when others then
    if sqlerrm not like '%produto do bônus obrigatório%' then raise exception 'FALHOU: erro inesperado em bônus sem produto (%)', sqlerrm; end if;
  end;
  -- valores < 1
  begin
    perform admin_set_loja_config(false, false, 0, null, 1);
    raise exception 'FALHOU: aceitou bonus_min_pecas 0';
  exception when others then
    if sqlerrm not like '%valores do bônus inválidos%' then raise exception 'FALHOU: erro inesperado em min_pecas 0 (%)', sqlerrm; end if;
  end;
  begin
    perform admin_set_loja_config(false, false, 15, null, 0);
    raise exception 'FALHOU: aceitou bonus_quantidade 0';
  exception when others then
    if sqlerrm not like '%valores do bônus inválidos%' then raise exception 'FALHOU: erro inesperado em quantidade 0 (%)', sqlerrm; end if;
  end;

  -- caminho feliz: bônus ligado com produto ativo
  perform admin_set_loja_config(false, true, 12, v_ativo, 3);
  r := get_loja_flags();
  if (r->>'bonus_ativo')::boolean is distinct from true or (r->>'bonus_min_pecas')::int <> 12
     or (r->>'bonus_quantidade')::int <> 3 or r->>'bonus_produto_nome' is distinct from 'Brinde Ativo' then
    raise exception 'FALHOU: flags do bônus não refletem a gravação (%)', r;
  end if;
  -- produto inativo como bônus: nome oculto
  perform admin_set_loja_config(false, true, 12, v_inativo, 3);
  r := get_loja_flags();
  if r->'bonus_produto_nome' <> 'null'::jsonb then
    raise exception 'FALHOU: produto inativo vazou o nome (%)', r;
  end if;
  reset role;

  raise exception 'TESTE_A_OK';   -- desfaz tudo; o runner trata TESTE_*_OK como sucesso
end $t$;
