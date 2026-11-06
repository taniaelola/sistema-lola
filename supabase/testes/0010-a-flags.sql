-- Seção A: flags e config. Levanta exceção se algo falhar. Roda em transação única.
do $t$
declare r jsonb; u uuid := '00000000-0000-4000-8000-0000000000c3'; v_obt text;
begin
  -- padrão seguro: varejo desligado, bônus desligado
  r := get_loja_flags();
  if (r->>'varejo_ativo')::boolean is distinct from false then raise exception 'FALHOU: varejo_ativo deve começar false (%)', r; end if;
  if (r->>'bonus_ativo')::boolean is distinct from false then raise exception 'FALHOU: bonus_ativo deve começar false'; end if;
  if (r->>'bonus_min_pecas')::int <> 15 then raise exception 'FALHOU: bonus_min_pecas padrão 15'; end if;

  -- anon lê as flags; só superadmin grava
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-sa@teste.invalid', now(), now(), now());
  update profiles set papel = 'superadmin' where id = u;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform get_loja_flags();                                   -- anon pode
  begin
    perform admin_set_loja_config(true, false, 15, null, 1);   -- anon não pode
    raise exception 'FALHOU: anon gravou config';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_loja_config(true, false, 20, null, 2);
  r := admin_get_config();
  if (r->>'varejo_ativo')::boolean is distinct from true or (r->>'bonus_min_pecas')::int <> 20 then
    raise exception 'FALHOU: admin_get_config não reflete a gravação (%)', r;
  end if;
  begin
    perform admin_set_loja_config(false, true, 15, null, 1);   -- bônus ligado sem produto
    raise exception 'FALHOU: aceitou bônus ligado sem produto';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  reset role;
  raise exception 'TESTE_A_OK';   -- desfaz tudo; o runner trata TESTE_*_OK como sucesso
end $t$;
