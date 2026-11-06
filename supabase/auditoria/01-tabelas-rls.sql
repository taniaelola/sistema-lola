-- 01 — RLS e políticas (SOMENTE LEITURA)
-- Parte 1: RLS por tabela
select c.relname as tabela,
       c.relrowsecurity as rls_ligado,
       c.relforcerowsecurity as rls_forcado,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- Parte 2: políticas (rode separado)
select p.polrelid::regclass::text as tabela,
       p.polname as politica,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                     when 'd' then 'DELETE' else 'ALL' end as comando,
       coalesce((select string_agg(r.rolname, ',') from pg_roles r where r.oid = any (p.polroles)),
                'public') as papeis,
       pg_get_expr(p.polqual, p.polrelid) as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
from pg_policy p
order by 1, 2;
