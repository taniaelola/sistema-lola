# Auditoria de Segurança (B0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar, em produção e sem alterar dado nem esquema, o isolamento entre usuários e a matriz de permissões do Supabase da LOLA, entregando um roteiro de testes repetível (`supabase/rls-teste.sql`) e um relatório de achados por gravidade.

**Architecture:** Três entregas independentes: (1) consultas de inventário somente leitura no catálogo do Postgres, (2) um roteiro de isolamento que simula cada papel com fixtures criadas e desfeitas dentro de um único bloco `DO` (tabela de casos, resultado em tabela temporária), (3) relatório em Markdown. As correções não são feitas aqui: entram na migração `0010` do plano da Parte A.

**Tech Stack:** PostgreSQL (Supabase), SQL Editor do Supabase (via Chrome), Markdown.

**Spec:** `docs/superpowers/specs/2026-11-05-loja-lola-site-so-atacado-seguranca-rastreamento-design.md` (§4). Base: `docs/superpowers/specs/2026-10-27-loja-lola-lp-atacado-bonus-design.md`.

## Global Constraints

- B0 é **somente leitura**: nenhum `create/alter/drop/grant/revoke` persistente, nenhum `insert/update/delete` que sobreviva à execução (spec §4).
- Projeto Supabase de produção: `uqfhbtkwnmksbtmkdcop` (Sistema-Lola); SQL Editor: `https://supabase.com/dashboard/project/uqfhbtkwnmksbtmkdcop/sql/new`.
- Fixtures do roteiro usam e-mails `*.invalid` e UUIDs fixos `00000000-0000-4000-8000-0000000000xx`; tudo é desfeito dentro do mesmo bloco por `raise exception` capturado.
- O roteiro de isolamento **só roda em produção com o OK explícito do dono** (ele insere linhas transitórias em `auth.users`).
- Nenhum segredo, token, e-mail real ou dado pessoal de cliente entra no relatório nem no repositório.
- Apague no Supabase o snippet "Untitled query" criado em cada execução (o editor salva sozinho).
- Papéis: `superadmin`, `admin`, `supervisor`, `revendedor`, `cliente` (enum `papel_usuario`); status de revendedor: `pendente`, `aprovado`, `recusado`.
- Texto em português do Brasil.

---

## File Structure

- Create `supabase/auditoria/01-tabelas-rls.sql` — RLS e políticas por tabela.
- Create `supabase/auditoria/02-privilegios.sql` — privilégios de `anon`/`authenticated`/`PUBLIC` por tabela, por coluna e views.
- Create `supabase/auditoria/03-funcoes.sql` — funções `public`: definer, `search_path`, `EXECUTE`, validação de sessão, argumentos sensíveis.
- Create `supabase/rls-teste.sql` — roteiro de isolamento por papel (repetível).
- Create `docs/auditoria-seguranca-2026-11.md` — relatório.

---

### Task 1: Inventário somente leitura (tabelas, privilégios, funções)

**Files:**
- Create: `supabase/auditoria/01-tabelas-rls.sql`
- Create: `supabase/auditoria/02-privilegios.sql`
- Create: `supabase/auditoria/03-funcoes.sql`
- Create (rascunho local, não versionar): resultados colados em `docs/auditoria-seguranca-2026-11.md` na Task 3

**Interfaces:**
- Produces: três listas (tabelas/políticas, privilégios, funções) que a Task 3 transforma em achados.

- [ ] **Step 1: Criar `supabase/auditoria/01-tabelas-rls.sql`**

```sql
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
```

- [ ] **Step 2: Criar `supabase/auditoria/02-privilegios.sql`**

```sql
-- 02 — Privilégios (SOMENTE LEITURA)
-- Parte 1: por tabela
select table_name as tabela, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
group by table_name, grantee
order by table_name, grantee;

-- Parte 2: por coluna (rode separado)
select table_name as tabela, column_name as coluna, grantee, privilege_type
from information_schema.role_column_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, column_name, grantee;

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
```

- [ ] **Step 3: Criar `supabase/auditoria/03-funcoes.sql`**

```sql
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
```

- [ ] **Step 4: Rodar cada consulta no SQL Editor e registrar o resultado**

Abra `https://supabase.com/dashboard/project/uqfhbtkwnmksbtmkdcop/sql/new`, cole **uma parte por vez**, `Ctrl+Enter`, leia a grade com `get_page_text` (ou zoom). Se a grade truncar, repita com `limit 25 offset N`. Anote os resultados num rascunho temporário (fora do git).
Esperado: 01 lista as 17 tabelas do app (`admin_config`, `banner_hero`, `carrinho_atacado`, `categorias`, `convites_papel`, `order_items`, `orders`, `product_colors`, `product_sizes`, `products`, `profiles`, `promocoes`, `revendedores`, `revendedores_legado`, `sales`, `textos_loja`, e as que houver) com `rls_ligado = true` em todas; qualquer `false` é achado **crítico**.

- [ ] **Step 5: Apagar o snippet temporário e commitar os arquivos SQL**

No Supabase: clique direito em "Untitled query" > Delete query > confirmar.

```bash
git add supabase/auditoria/01-tabelas-rls.sql supabase/auditoria/02-privilegios.sql supabase/auditoria/03-funcoes.sql
git commit -m "chore: consultas de inventário de segurança (somente leitura)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Roteiro de isolamento por papel (`rls-teste.sql`)

**Files:**
- Create: `supabase/rls-teste.sql`

**Interfaces:**
- Consumes: tabelas e RPCs listadas no mapa de nomes abaixo (assinaturas verificadas nas migrações `0001`–`0009`).
- Produces: uma grade `ord, caso, quem, esperado, obtido, ok` ordenada com as falhas primeiro. Cada linha com `ok = false` é um candidato a achado (a Task 3 decide se é falha real ou expectativa errada).

Mapa de nomes usado: tabelas `orders(id, status, cliente_nome, cliente_telefone, entrega_tipo, valor_produtos, valor_total, is_atacado, customer_id, revendedor_id)`, `profiles(id, email, nome, papel, ativo)`, `revendedores(id, user_id, razao_social, email, status)`, `carrinho_atacado(revendedor_id, product_id, color_id, size_id, quantidade)`; RPCs `meus_pedidos()`, `atacado_me()`, `atacado_my_orders()`, `atacado_cart_get()`, `public_get_order(uuid)`, `admin_list_orders(text default 'todos')`, `admin_list_users()`, `admin_list_revendedores(text default 'todos')`, `admin_list_products()`, `admin_get_config()`, `admin_delete_product(uuid)`, `admin_set_user(uuid,text,boolean)`, `get_textos()`, `get_banner_hero()`, `get_promocoes_ativas()`.

- [ ] **Step 1: Criar `supabase/rls-teste.sql`**

```sql
-- =====================================================================
-- rls-teste.sql — isolamento entre usuários e matriz de papéis
-- Roda no SQL Editor do Supabase. NÃO deixa dados: as fixtures são criadas e
-- desfeitas no mesmo bloco (raise exception 'fim_do_teste' capturado).
-- Resultado: tabela (ord, caso, quem, esperado, obtido, ok). Falhas primeiro.
-- esperado: texto exato; 'a|b' = qualquer um dos valores; 'OK' = sem erro;
--           'INFO' = só registra o obtido.
-- =====================================================================
create temp table _res (
  ord int, caso text, quem text, esperado text, obtido text, ok boolean
) on commit drop;

do $teste$
declare
  c record;
  v_obt text;
  v_ok boolean;
  v_res jsonb := '[]'::jsonb;
  v_prod uuid; v_cor uuid; v_tam uuid;
  u_cli_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  u_cli_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  u_rev_a constant uuid := '00000000-0000-4000-8000-0000000000b1';
  u_rev_b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  u_rev_p constant uuid := '00000000-0000-4000-8000-0000000000b3';
  u_sup   constant uuid := '00000000-0000-4000-8000-0000000000c1';
  u_adm   constant uuid := '00000000-0000-4000-8000-0000000000c2';
  u_sa    constant uuid := '00000000-0000-4000-8000-0000000000c3';
  r_a     constant uuid := '00000000-0000-4000-8000-0000000000d1';
  r_b     constant uuid := '00000000-0000-4000-8000-0000000000d2';
  r_p     constant uuid := '00000000-0000-4000-8000-0000000000d3';
  o_cli_a constant uuid := '00000000-0000-4000-8000-0000000000e1';
  o_cli_b constant uuid := '00000000-0000-4000-8000-0000000000e2';
  o_rev_a constant uuid := '00000000-0000-4000-8000-0000000000e3';
  o_rev_b constant uuid := '00000000-0000-4000-8000-0000000000e4';
begin
  begin
    -- ---------- fixtures (desfeitas no fim) ----------
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           x.email, now(), now(), now()
    from (values
      (u_cli_a, 't-cli-a@teste.invalid'), (u_cli_b, 't-cli-b@teste.invalid'),
      (u_rev_a, 't-rev-a@teste.invalid'), (u_rev_b, 't-rev-b@teste.invalid'),
      (u_rev_p, 't-rev-p@teste.invalid'), (u_sup, 't-sup@teste.invalid'),
      (u_adm, 't-adm@teste.invalid'), (u_sa, 't-sa@teste.invalid')
    ) as x(id, email);

    -- o gatilho handle_auth_user cria os profiles como 'cliente'; ajusta os papéis
    update profiles set papel = x.p::papel_usuario
    from (values
      (u_rev_a, 'revendedor'), (u_rev_b, 'revendedor'), (u_rev_p, 'revendedor'),
      (u_sup, 'supervisor'), (u_adm, 'admin'), (u_sa, 'superadmin')
    ) as x(id, p)
    where profiles.id = x.id;

    insert into revendedores (id, user_id, razao_social, email, status) values
      (r_a, u_rev_a, 'Teste A', 't-rev-a@teste.invalid', 'aprovado'),
      (r_b, u_rev_b, 'Teste B', 't-rev-b@teste.invalid', 'aprovado'),
      (r_p, u_rev_p, 'Teste P', 't-rev-p@teste.invalid', 'pendente');

    insert into orders (id, status, cliente_nome, cliente_telefone, entrega_tipo,
                        valor_produtos, valor_total, is_atacado, customer_id, revendedor_id) values
      (o_cli_a, 'pendente', 'Teste', '000', 'retirada', 10, 10, false, u_cli_a, null),
      (o_cli_b, 'pendente', 'Teste', '000', 'retirada', 10, 10, false, u_cli_b, null),
      (o_rev_a, 'pendente', 'Teste', '000', 'retirada', 10, 10, true,  null, r_a),
      (o_rev_b, 'pendente', 'Teste', '000', 'retirada', 10, 10, true,  null, r_b);

    select p.id, pc.id, ps.id into v_prod, v_cor, v_tam
    from products p
    join product_colors pc on pc.product_id = p.id
    join product_sizes ps on ps.color_id = pc.id
    limit 1;
    if v_prod is not null then
      insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
      values (r_a, v_prod, v_cor, v_tam, 1);
    end if;

    -- ---------- casos ----------
    for c in
      select * from (values
        -- visitante (anon): tabelas privadas
        (10, 'anon não lê orders',         'anon', null::uuid, 'select count(*)::text from orders', 'ERRO'),
        (11, 'anon não lê order_items',    'anon', null::uuid, 'select count(*)::text from order_items', 'ERRO'),
        (12, 'anon não lê profiles',       'anon', null::uuid, 'select count(*)::text from profiles', 'ERRO'),
        (13, 'anon não lê revendedores',   'anon', null::uuid, 'select count(*)::text from revendedores', 'ERRO'),
        (14, 'anon não lê sales',          'anon', null::uuid, 'select count(*)::text from sales', 'ERRO'),
        (15, 'anon não lê admin_config',   'anon', null::uuid, 'select count(*)::text from admin_config', 'ERRO'),
        (16, 'anon não lê carrinho_atacado','anon', null::uuid, 'select count(*)::text from carrinho_atacado', 'ERRO'),
        (17, 'anon não lê convites_papel', 'anon', null::uuid, 'select count(*)::text from convites_papel', 'ERRO'),
        (18, 'anon não lê promocoes',      'anon', null::uuid, 'select count(*)::text from promocoes', 'ERRO'),
        -- visitante: catálogo (ALVO da spec: sem acesso direto; hoje deve falhar)
        (19, 'ALVO: anon não lê products', 'anon', null::uuid, 'select count(*)::text from products', 'ERRO'),
        (20, 'INFO: produtos com preco_atacado visíveis ao anon', 'anon', null::uuid,
             'select count(*) filter (where preco_atacado is not null)::text from products', 'INFO'),
        (21, 'ALVO: anon não lê product_sizes (estoque)', 'anon', null::uuid, 'select count(*)::text from product_sizes', 'ERRO'),
        -- visitante: RPCs
        (22, 'anon não chama admin_list_orders', 'anon', null::uuid, 'select admin_list_orders()::text', 'ERRO'),
        (23, 'anon não chama admin_list_users',  'anon', null::uuid, 'select admin_list_users()::text', 'ERRO'),
        (24, 'anon não chama admin_get_config',  'anon', null::uuid, 'select admin_get_config()::text', 'ERRO'),
        (25, 'anon não chama meus_pedidos',      'anon', null::uuid, 'select meus_pedidos()::text', 'ERRO'),
        (26, 'INFO: anon atacado_me',            'anon', null::uuid, 'select left(atacado_me()::text, 60)', 'INFO'),
        (27, 'INFO: anon lê pedido por UUID (public_get_order) devolve telefone?', 'anon', null::uuid,
             format('select (public_get_order(%L)::text like %L)::text', o_cli_a, '%000%'), 'INFO'),
        (28, 'anon get_textos',                  'anon', null::uuid, 'select left(get_textos()::text, 20)', 'OK'),
        (29, 'anon get_banner_hero',             'anon', null::uuid, 'select left(get_banner_hero()::text, 20)', 'OK'),
        (30, 'anon get_promocoes_ativas',        'anon', null::uuid, 'select left(get_promocoes_ativas()::text, 20)', 'OK'),
        -- cliente A / B
        (40, 'cliente A vê só o próprio pedido', 'cli_a', u_cli_a, 'select count(*)::text from orders', '1'),
        (41, 'cliente B não vê pedido do A',     'cli_b', u_cli_b,
             format('select count(*)::text from orders where id = %L', o_cli_a), '0'),
        (42, 'cliente A vê só o próprio profile','cli_a', u_cli_a, 'select count(*)::text from profiles', '1'),
        (43, 'cliente A não vê revendedores',    'cli_a', u_cli_a, 'select count(*)::text from revendedores', '0'),
        (44, 'cliente A não lê sales',           'cli_a', u_cli_a, 'select count(*)::text from sales', 'ERRO'),
        (45, 'cliente A não lê admin_config',    'cli_a', u_cli_a, 'select count(*)::text from admin_config', 'ERRO'),
        (46, 'cliente A: meus_pedidos tem o seu', 'cli_a', u_cli_a,
             format('select (meus_pedidos()::text like %L)::text', '%' || o_cli_a::text || '%'), 'true'),
        (47, 'cliente A: meus_pedidos NÃO tem o do B', 'cli_a', u_cli_a,
             format('select (meus_pedidos()::text like %L)::text', '%' || o_cli_b::text || '%'), 'false'),
        (48, 'cliente A não chama admin_list_orders', 'cli_a', u_cli_a, 'select admin_list_orders()::text', 'ERRO'),
        (49, 'cliente A não usa carrinho de atacado', 'cli_a', u_cli_a, 'select atacado_cart_get()::text', 'ERRO'),
        (50, 'cliente A não vê pedidos de atacado', 'cli_a', u_cli_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'false|ERRO'),
        (51, 'cliente A não se promove a superadmin', 'cli_a', u_cli_a,
             format('with u as (update profiles set papel = %L where id = %L returning 1) select count(*)::text from u', 'superadmin', u_cli_a), 'ERRO|0'),
        (52, 'cliente A não marca o próprio pedido como pago', 'cli_a', u_cli_a,
             format('with u as (update orders set status = %L where id = %L returning 1) select count(*)::text from u', 'pago', o_cli_a), 'ERRO|0'),
        (53, 'cliente A não insere pedido direto', 'cli_a', u_cli_a,
             format('with i as (insert into orders (cliente_nome, cliente_telefone, entrega_tipo, customer_id) values (%L, %L, %L, %L) returning 1) select count(*)::text from i', 'x', 'y', 'retirada', u_cli_a), 'ERRO'),
        -- revendedor aprovado A / B e pendente
        (60, 'revendedor A vê só o próprio cadastro', 'rev_a', u_rev_a, 'select count(*)::text from revendedores', '1'),
        (61, 'revendedor B não vê o cadastro do A',  'rev_b', u_rev_b,
             format('select count(*)::text from revendedores where id = %L', r_a), '0'),
        (62, 'revendedor A vê o próprio carrinho',   'rev_a', u_rev_a, 'select count(*)::text from carrinho_atacado', '1|0'),
        (63, 'revendedor B não vê carrinho do A',    'rev_b', u_rev_b, 'select count(*)::text from carrinho_atacado', '0'),
        (64, 'revendedor A: atacado_my_orders tem o seu', 'rev_a', u_rev_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'true'),
        (65, 'revendedor A: atacado_my_orders NÃO tem o do B', 'rev_a', u_rev_a,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_b::text || '%'), 'false'),
        (66, 'revendedor A não vê pedido de varejo de cliente', 'rev_a', u_rev_a,
             format('select count(*)::text from orders where id = %L', o_cli_a), '0'),
        (67, 'revendedor aprovado usa carrinho de atacado', 'rev_b', u_rev_b, 'select atacado_cart_get()::text', 'OK'),
        (68, 'revendedor PENDENTE não usa carrinho',  'rev_p', u_rev_p, 'select atacado_cart_get()::text', 'ERRO'),
        (69, 'revendedor PENDENTE não vê pedidos de atacado', 'rev_p', u_rev_p,
             format('select (atacado_my_orders()::text like %L)::text', '%' || o_rev_a::text || '%'), 'false|ERRO'),
        (70, 'revendedor PENDENTE não se auto-aprova', 'rev_p', u_rev_p,
             format('with u as (update revendedores set status = %L where user_id = %L returning 1) select count(*)::text from u', 'aprovado', u_rev_p), 'ERRO|0'),
        (71, 'revendedor aprovado não altera o próprio status', 'rev_a', u_rev_a,
             format('with u as (update revendedores set status = %L where user_id = %L returning 1) select count(*)::text from u', 'recusado', u_rev_a), 'ERRO|0'),
        (72, 'revendedor não chama admin_list_revendedores', 'rev_a', u_rev_a, 'select admin_list_revendedores()::text', 'ERRO'),
        (73, 'revendedor não chama admin_list_orders', 'rev_a', u_rev_a, 'select admin_list_orders()::text', 'ERRO'),
        -- equipe (matriz atual; supervisor ainda sem Produtos até a Parte A)
        (80, 'supervisor chama admin_list_orders',  'sup', u_sup, 'select left(admin_list_orders()::text, 20)', 'OK'),
        (81, 'supervisor chama admin_list_revendedores', 'sup', u_sup, 'select left(admin_list_revendedores()::text, 20)', 'OK'),
        (82, 'supervisor NÃO chama admin_list_users', 'sup', u_sup, 'select admin_list_users()::text', 'ERRO'),
        (83, 'supervisor NÃO chama admin_get_config', 'sup', u_sup, 'select admin_get_config()::text', 'ERRO'),
        (84, 'INFO: supervisor admin_list_products (vira OK na Parte A)', 'sup', u_sup, 'select left(admin_list_products()::text, 20)', 'INFO'),
        (85, 'supervisor NÃO exclui produto', 'sup', u_sup,
             format('select admin_delete_product(%L)::text', gen_random_uuid()), 'ERRO'),
        (86, 'supervisor NÃO altera papel de usuário', 'sup', u_sup,
             format('select admin_set_user(%L, %L, true)::text', u_cli_a, 'admin'), 'ERRO'),
        (87, 'admin chama admin_list_users', 'adm', u_adm, 'select left(admin_list_users()::text, 20)', 'OK'),
        (88, 'admin chama admin_list_orders', 'adm', u_adm, 'select left(admin_list_orders()::text, 20)', 'OK'),
        (89, 'admin NÃO chama admin_get_config (só superadmin)', 'adm', u_adm, 'select admin_get_config()::text', 'ERRO'),
        (90, 'admin NÃO cria superadmin', 'adm', u_adm,
             format('select admin_set_user(%L, %L, true)::text', u_cli_a, 'superadmin'), 'ERRO'),
        (91, 'superadmin chama admin_get_config', 'sa', u_sa, 'select left(admin_get_config()::text, 20)', 'OK'),
        (92, 'superadmin chama admin_list_users', 'sa', u_sa, 'select left(admin_list_users()::text, 20)', 'OK')
      ) as t(ord, caso, quem, uid, sql, esperado)
      order by ord
    loop
      v_obt := null;
      begin
        perform set_config('request.jwt.claims',
          case when c.uid is null then '{"role":"anon"}'
               else json_build_object('sub', c.uid, 'role', 'authenticated')::text end, true);
        execute case when c.uid is null then 'set local role anon'
                     else 'set local role authenticated' end;
        execute c.sql into v_obt;
        reset role;
      exception when others then
        v_obt := 'ERRO';   -- o savepoint desfaz o set local role
      end;
      v_ok := case
                when c.esperado = 'INFO' then true
                when c.esperado = 'OK'   then v_obt is distinct from 'ERRO'
                else v_obt = any (string_to_array(c.esperado, '|'))
              end;
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'ord', c.ord, 'caso', c.caso, 'quem', c.quem, 'esperado', c.esperado,
        'obtido', coalesce(v_obt, 'null'), 'ok', v_ok));
    end loop;

    raise exception 'fim_do_teste';   -- desfaz TODAS as fixtures
  exception when raise_exception then
    if sqlerrm <> 'fim_do_teste' then raise; end if;
  end;

  -- fora do sub-bloco: o resultado sobrevive (v_res é variável local)
  insert into _res
  select (e->>'ord')::int, e->>'caso', e->>'quem', e->>'esperado', e->>'obtido', (e->>'ok')::boolean
  from jsonb_array_elements(v_res) as e;
end
$teste$;

select ord, caso, quem, esperado, obtido, ok
from _res
order by ok, ord;
```

- [ ] **Step 2: Revisão estática antes de rodar**

Confira, sem executar: (a) toda `format()` usa `%L` para UUID e texto; (b) nenhum `commit`/`create`/`grant` persistente no arquivo; (c) o sub-bloco termina em `raise exception 'fim_do_teste'`; (d) nenhum e-mail real; (e) `_res` é `on commit drop`.
Run: `grep -nEi "^(create (table|function|policy|index|extension)|alter |drop |grant |revoke |commit)" supabase/rls-teste.sql`
Expected: apenas a linha `create temp table _res (` (temp, descartada no commit).

- [ ] **Step 3: Pedir o OK do dono e rodar em produção**

Mostre ao dono, em uma frase: "O roteiro insere 8 usuários de teste, pedidos e um carrinho dentro de um bloco que é desfeito no fim; nada persiste. Posso rodar em produção?" **Só continue com um sim.**
Cole o arquivo inteiro no SQL Editor, `Ctrl+Enter`, leia a grade.
Expected: a grade tem 62 linhas; linhas `ok = false` vêm primeiro. **Resultado esperado hoje:** falham os casos `19` e `21` (catálogo legível por anon: é o alvo da Parte A). Qualquer outra falha é candidata a achado; se o SQL em si falhar (erro de coluna, enum ou gatilho), corrija o arquivo, rode de novo e registre o ajuste no commit.

- [ ] **Step 4: Confirmar que nada persistiu**

Num snippet novo, rode:

```sql
select (select count(*) from auth.users where email like '%@teste.invalid') as usuarios_teste,
       (select count(*) from orders where cliente_nome = 'Teste' and cliente_telefone = '000') as pedidos_teste,
       (select count(*) from revendedores where razao_social like 'Teste %') as revendedores_teste;
```
Expected: `0 | 0 | 0`. Se algum for maior que zero, **pare** e avise o dono antes de qualquer outra coisa (limpeza manual por id).
Depois apague os snippets criados no Supabase.

- [ ] **Step 5: Commit**

```bash
git add supabase/rls-teste.sql
git commit -m "test: roteiro de isolamento por papel (rls-teste.sql)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Relatório de achados e triagem

**Files:**
- Create: `docs/auditoria-seguranca-2026-11.md`

**Interfaces:**
- Consumes: resultados das Tasks 1 e 2.
- Produces: lista de achados (id `S-01`, `S-02`...) com gravidade e correção proposta, que o plano da Parte A transforma em SQL da migração `0010`.

- [ ] **Step 1: Triar cada falha do `rls-teste.sql` e cada linha suspeita do inventário**

Para cada linha `ok = false`: abra o corpo da função ou a política (`pg_get_functiondef('public.nome(args)'::regprocedure)` ou `01-tabelas-rls.sql`) e decida **falha real** ou **expectativa errada do roteiro**. Se for expectativa errada, corrija o caso em `supabase/rls-teste.sql` e rode de novo.
Inventário, marque como achado: tabela com `rls_ligado = false`; função `definer = true` sem `search_path` em `config`; função com `anon_exec = true` que não é pública por desenho (públicas por desenho: `get_textos`, `get_banner_hero`, `get_promocoes_ativas`, `public_get_order`, `public_get_surpresa`, e as do checkout de varejo); `arg_sensivel = true` com `valida_sessao = false`; privilégio de escrita (`INSERT/UPDATE/DELETE`) para `anon`/`authenticated` em tabela sensível.

- [ ] **Step 2: Escrever `docs/auditoria-seguranca-2026-11.md`**

Estrutura fixa (preencha com os dados reais; nada de e-mail, token ou dado de cliente):

```markdown
# Auditoria de segurança — Supabase LOLA (2026-11)

Data: AAAA-MM-DD · Escopo: schema `public` do projeto Sistema-Lola, somente leitura.
Método: inventário do catálogo do Postgres (`supabase/auditoria/01..03`) e roteiro de isolamento por papel (`supabase/rls-teste.sql`, 62 casos).

## Resumo
- Crítico: N · Alto: N · Médio: N · Baixo: N
- Casos do roteiro: X de 62 passaram; falhas: lista de ids.

## Achados
| Id | Gravidade | Onde | Evidência | Correção proposta | Entra na Parte A? |
|---|---|---|---|---|---|
| S-01 | Alto | `products`, `product_sizes` | `anon` lê todas as colunas (casos 19–21) | Revogar SELECT de anon; ler por funções com papel | Sim (spec §5.1) |

## Matriz de permissões observada
Papel x tela/RPC: o que cada papel realmente consegue executar (casos 80–92), comparada com a matriz do README e do `lib/roles.ts`. Diferenças viram achado.

## O que passou
Lista curta dos controles confirmados (RLS ligado em todas as tabelas, anon sem acesso a pedidos, perfis e carrinho, isolamento entre clientes e entre revendedores, pendente sem acesso ao atacado...).

## Limitações
O roteiro simula papéis por `set local role` e `request.jwt.claims`; não testa o servidor Next.js, o Storage do Supabase nem a API de Auth (rate limit, e-mails). Dados reais de clientes não foram lidos.
```

Gravidade: **Crítico** = leitura ou escrita de dado de outro usuário, escalada de papel, `anon` executando `admin_*`; **Alto** = vazamento ao anônimo de preço de atacado ou dado pessoal; **Médio** = função `definer` sem `search_path` ou `EXECUTE` em `PUBLIC` sem necessidade; **Baixo** = endurecimento.

- [ ] **Step 3: Verificar o relatório**

Run: `grep -nEi "(@|token|secret|senha|apikey|sb_secret|eyJ)" docs/auditoria-seguranca-2026-11.md`
Expected: sem e-mail real, sem chave, sem valor de segredo (menções à palavra "secret" no sentido de nome de coluna ou função são aceitáveis; revise cada uma).

- [ ] **Step 4: Commit e entrega**

```bash
git add docs/auditoria-seguranca-2026-11.md supabase/rls-teste.sql
git commit -m "docs: relatório da auditoria de segurança do Supabase (B0)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Entregue ao dono: resumo com contagem por gravidade, os achados críticos/altos em texto corrido e o que entra na Parte A. **Achado crítico em produção hoje**: avise o dono no mesmo dia, antes de seguir para a Parte A, com a correção proposta e o risco de esperar.

---

## Self-Review (feito na escrita)

- **Cobertura da spec §4:** inventário de tabelas e RLS (Task 1, `01`), privilégios por tabela e coluna e exposição por consulta direta (`02`, casos 19–21), funções definer/`search_path`/argumentos do cliente (`03`), isolamento por papel com fixtures desfeitas (Task 2), relatório com gravidade (Task 3). Sem alteração de esquema.
- **Fora desta entrega (planos próprios):** Parte A (migração `0010`, funções de catálogo, rotas, LP, papéis) e Parte C (GTM, consentimento, API de Conversões, SEO). O plano da A é escrito depois da B0, porque os achados entram na migração.
- **Consistência de nomes:** `_res`, `v_res`, UUIDs `u_*`, `r_*`, `o_*` definidos uma vez e usados nos casos; RPCs conferidas contra as migrações.
- **Contagem:** o roteiro tem 62 linhas de caso (ids 10–30, 40–53, 60–73, 80–92: 21+14+14+13). Se ao rodar a contagem divergir, ajuste o texto do Step 3 e do relatório.
