-- 03 — Funções do schema public (SOMENTE LEITURA)
-- Colunas: definer = SECURITY DEFINER; config = SET da função (esperado search_path);
-- anon_exec / auth_exec = EXECUTE efetivo (inclui PUBLIC); valida_sessao = o corpo chama
-- assert_papel/assert_admin/assert_webhook ou auth.uid(); arg_sensivel = argumento com
-- nome de segredo, papel, uid ou preço (o cliente controlaria).
select p.oid::regprocedure::text as funcao,
       p.prosecdef as definer,
       coalesce(array_to_string(p.proconfig, ','), '') as config,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       (p.prosrc ~* '(assert_papel|assert_admin|assert_webhook|auth\.uid\(\))') as valida_sessao,
       (pg_get_function_arguments(p.oid) ~* '(secret|papel|role|uid|user_id|preco)') as arg_sensivel
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by (has_function_privilege('anon', p.oid, 'execute')) desc, p.proname;
