-- Seção F/E: textos da LP semeados pela 0010. Levanta exceção se algo falhar. Transação única.
do $t$
declare
  chaves text[] := array[
    'lp_hero_titulo','lp_hero_subtitulo','lp_hero_botao','lp_regras_titulo','lp_regra_skus',
    'lp_regra_bonus','lp_regra_preco','lp_passos_titulo','lp_passo_1','lp_passo_2','lp_passo_3',
    'lp_amostra_titulo','lp_amostra_aviso','lp_final_titulo','lp_final_botao'];
  k text; r jsonb; v text;
  u uuid := '00000000-0000-4000-8000-0000000000e1';
  c uuid := '00000000-0000-4000-8000-0000000000e2';
begin
  -- 1. as 15 chaves existem em textos_loja com valor não vazio
  foreach k in array chaves loop
    select valor into v from textos_loja where chave = k;
    if v is null or btrim(v) = '' then raise exception 'FALHOU 1: chave % ausente ou vazia', k; end if;
  end loop;
  if (select count(*) from textos_loja) <> 34 then
    raise exception 'FALHOU 1: textos_loja deveria ter 34 chaves (%)', (select count(*) from textos_loja);
  end if;

  -- 2. anon lê as chaves por get_textos()
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := get_textos();
  reset role;
  foreach k in array chaves loop
    if not (r ? k) then raise exception 'FALHOU 2: get_textos() não devolveu %', k; end if;
  end loop;
  if (select count(*) from jsonb_object_keys(r)) <> 34 then
    raise exception 'FALHOU 2: get_textos() deveria devolver 34 chaves';
  end if;

  -- fixtures: superadmin e cliente
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-e-sa@teste.invalid', now(), now(), now()),
         (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-e-cl@teste.invalid', now(), now(), now());
  update profiles set papel = 'superadmin' where id = u;
  update profiles set papel = 'cliente' where id = c;

  -- 3. cliente não altera textos (denial estrito)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform admin_set_textos('{"lp_hero_titulo":"invasor"}'::jsonb);
    raise exception 'FALHOU 3: cliente alterou texto da LP';
  exception when insufficient_privilege then null; end;
  reset role;
  if (select valor from textos_loja where chave = 'lp_hero_titulo') = 'invasor' then
    raise exception 'FALHOU 3: valor do cliente foi gravado';
  end if;

  -- 4. superadmin altera uma chave nova
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_textos('{"lp_hero_titulo":"Novo título da LP"}'::jsonb);
  reset role;
  if (select valor from textos_loja where chave = 'lp_hero_titulo') is distinct from 'Novo título da LP' then
    raise exception 'FALHOU 4: superadmin não conseguiu atualizar lp_hero_titulo';
  end if;

  -- 5. chave desconhecida continua rejeitada (só a mensagem esperada)
  set local role authenticated;
  begin
    perform admin_set_textos('{"lp_chave_que_nao_existe":"x"}'::jsonb);
    raise exception 'FALHOU 5: aceitou chave desconhecida';
  exception when raise_exception then
    if sqlerrm not like 'chave de texto desconhecida:%' then
      raise exception 'FALHOU 5: erro inesperado (%)', sqlerrm;
    end if;
  end;
  reset role;

  raise exception 'TESTE_E_OK';
end $t$;
