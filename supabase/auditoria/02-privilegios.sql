-- 02 — Privilégios (SOMENTE LEITURA)
-- Parte 1: por tabela
select table_name as tabela, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
group by table_name, grantee
order by table_name, grantee;

-- Parte 2: por coluna, agregada por tabela/grantee/privilégio (rode separado)
-- (a versão linha a linha passa de 100 linhas e o SQL Editor trunca em 100)
select table_name as tabela, grantee, privilege_type, count(*) as qtd_colunas,
       string_agg(column_name, ',' order by column_name) as colunas
from information_schema.role_column_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
group by table_name, grantee, privilege_type
order by table_name, grantee, privilege_type;

-- Parte 3: views e views materializadas em public (rode separado)
select c.relname as objeto, c.relkind as tipo, coalesce(c.reloptions::text, '') as opcoes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by c.relname;

-- Parte 4: o anônimo consegue ler cada coluna sensível de produto? (rode separado)
select 'products.preco_atacado' as alvo,
       has_column_privilege('anon', 'public.products', 'preco_atacado', 'select') as anon_le,
       has_column_privilege('authenticated', 'public.products', 'preco_atacado', 'select') as auth_le
union all
select 'product_sizes.estoque',
       has_column_privilege('anon', 'public.product_sizes', 'estoque', 'select'),
       has_column_privilege('authenticated', 'public.product_sizes', 'estoque', 'select')
union all
select 'products (tabela)',
       has_table_privilege('anon', 'public.products', 'select'),
       has_table_privilege('authenticated', 'public.products', 'select');
