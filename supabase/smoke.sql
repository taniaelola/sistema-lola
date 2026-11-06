-- =====================================================================
-- smoke.sql — verificação pós-lançamento (SOMENTE LEITURA)
-- Rode no SQL Editor do Supabase DEPOIS de release-unico.sql e/ou release-0010.sql, do merge e de
-- criar a conta do dono. Nenhum insert/update/delete/DDL.
--
-- COMO INTERPRETAR: o resultado é uma tabela (nome, ok, detalhe).
--   * Tudo deve vir com ok = true.
--   * Única exceção aceitável: "superadmin ativo (>= 1)" pode ser false ANTES
--     de a conta do dono ser criada/confirmada. Depois disso deve virar true.
--   * "convites_papel pendentes" é informativo (ok sempre true).
--   * Qualquer outra linha com ok = false: não libere a loja; anote o detalhe.
-- =====================================================================
select nome, ok, detalhe from (

  -- ---------- tabelas esperadas ----------
  select 10 as ord, 'tabela ' || t as nome,
         to_regclass('public.' || t) is not null as ok,
         case when to_regclass('public.' || t) is not null then 'existe' else 'AUSENTE' end as detalhe
  from unnest(array['profiles','convites_papel','revendedores','carrinho_atacado',
                    'textos_loja','banner_hero','promocoes']) as t

  union all

  -- ---------- RLS ligado ----------
  select 20, 'RLS ligado em ' || t,
         coalesce((select c.relrowsecurity from pg_class c
                   where c.oid = to_regclass('public.' || t)), false),
         'relrowsecurity'
  from unnest(array['profiles','convites_papel','revendedores','carrinho_atacado',
                    'textos_loja','banner_hero','promocoes']) as t

  union all

  -- ---------- funções-chave (assinaturas exatas) ----------
  select 30, 'função ' || f,
         to_regprocedure('public.' || f) is not null,
         case when to_regprocedure('public.' || f) is not null then 'existe' else 'AUSENTE' end
  from unnest(array[
    'assert_papel(text[])',
    'get_my_profile()',
    'admin_list_users()',
    'admin_set_user(uuid,text,boolean)',
    'checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)',
    'get_textos()',
    'get_banner_hero()',
    'get_promocoes_ativas()',
    'atacado_me()',
    'admin_update_order_status(uuid,order_status)',
    'admin_estoque_baixo()'
  ]) as f

  union all

  -- ---------- nenhuma função com p_secret fora do webhook ----------
  select 40, 'sem p_secret fora do webhook',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and 'p_secret' = any(p.proargnames)
             and p.proname not in ('mp_register_order_payment', 'assert_webhook')),
         'esperado: so mp_register_order_payment e assert_webhook usam p_secret. Encontradas: '
           || coalesce((select string_agg(distinct p.proname, ', ')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and 'p_secret' = any(p.proargnames)), '(nenhuma)')

  union all

  select 41, 'nenhuma função chama assert_admin',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ilike '%assert_admin%'),
         'esperado: 0 funções; encontradas: '
           || coalesce((select string_agg(distinct p.proname, ', ')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.prosrc ilike '%assert_admin%'), '(nenhuma)')

  union all

  -- ---------- admin_* não executáveis por anon ----------
  select 50, 'admin_* sem EXECUTE para anon',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'admin\_%'
             and has_function_privilege('anon', p.oid, 'EXECUTE')),
         'funções admin_* verificadas: '
           || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname like 'admin\_%')::text
           || '; expostas a anon: '
           || coalesce((select string_agg(p.proname, ', ')
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname like 'admin\_%'
                          and has_function_privilege('anon', p.oid, 'EXECUTE')), '(nenhuma)')

  union all

  -- ---------- internas sem EXECUTE para anon/authenticated ----------
  select 60, 'atacado_cart_clear_for(uuid) sem EXECUTE para anon/authenticated',
         to_regprocedure('public.atacado_cart_clear_for(uuid)') is not null
           and not has_function_privilege('anon', to_regprocedure('public.atacado_cart_clear_for(uuid)'), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure('public.atacado_cart_clear_for(uuid)'), 'EXECUTE'),
         'deve existir e estar fechada'

  union all

  select 61, '_settle_order(uuid,text,text) sem EXECUTE para anon/authenticated',
         to_regprocedure('public._settle_order(uuid,text,text)') is not null
           and not has_function_privilege('anon', to_regprocedure('public._settle_order(uuid,text,text)'), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure('public._settle_order(uuid,text,text)'), 'EXECUTE'),
         'deve existir e estar fechada'

  union all

  -- ---------- checkout: público, só a assinatura nova ----------
  select 70, 'checkout_iniciar_pedido sem EXECUTE para anon e com para authenticated',
         to_regprocedure('public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)') is not null
           and not has_function_privilege('anon', to_regprocedure('public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)'), 'EXECUTE')
           and has_function_privilege('authenticated', to_regprocedure('public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)'), 'EXECUTE'),
         'convidado revogado na 0010; só logado compra'

  union all

  select 71, 'checkout_iniciar_pedido sem a assinatura antiga de 13 argumentos',
         to_regprocedure('public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean,uuid,uuid)') is null,
         'p_customer_id/p_revendedor_id não podem existir'

  union all

  select 72, 'checkout_iniciar_pedido com uma única sobrecarga',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'checkout_iniciar_pedido') = 1,
         'sobrecargas encontradas: '
           || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'checkout_iniciar_pedido')::text

  union all

  -- ---------- conteúdo público ----------
  select 80, 'get_textos() devolve 34 chaves',
         (select count(*) from jsonb_object_keys(public.get_textos())) = 34,
         'chaves: ' || (select count(*) from jsonb_object_keys(public.get_textos()))::text

  union all

  select 81, 'get_banner_hero() não nulo',
         public.get_banner_hero() is not null,
         case when public.get_banner_hero() is not null then 'banner publicado presente' else 'NULO' end

  union all

  select 82, 'conteúdo público executável por anon (get_textos, get_banner_hero, get_promocoes_ativas)',
         to_regprocedure('public.get_textos()') is not null
           and to_regprocedure('public.get_banner_hero()') is not null
           and to_regprocedure('public.get_promocoes_ativas()') is not null
           and has_function_privilege('anon', to_regprocedure('public.get_textos()'), 'EXECUTE')
           and has_function_privilege('anon', to_regprocedure('public.get_banner_hero()'), 'EXECUTE')
           and has_function_privilege('anon', to_regprocedure('public.get_promocoes_ativas()'), 'EXECUTE'),
         'a Home pública depende destas três'

  union all

  select 83, 'assert_papel(text[]) sem EXECUTE para anon/authenticated',
         to_regprocedure('public.assert_papel(text[])') is not null
           and not has_function_privilege('anon', to_regprocedure('public.assert_papel(text[])'), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure('public.assert_papel(text[])'), 'EXECUTE'),
         'deve existir e estar fechada'

  union all

  select 84, '_desconto_efetivo(products) sem EXECUTE para anon/authenticated',
         to_regprocedure('public._desconto_efetivo(products)') is not null
           and not has_function_privilege('anon', to_regprocedure('public._desconto_efetivo(products)'), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure('public._desconto_efetivo(products)'), 'EXECUTE'),
         'deve existir e estar fechada'

  union all

  select 85, '_promocoes_vigentes() sem EXECUTE para anon/authenticated',
         to_regprocedure('public._promocoes_vigentes()') is not null
           and not has_function_privilege('anon', to_regprocedure('public._promocoes_vigentes()'), 'EXECUTE')
           and not has_function_privilege('authenticated', to_regprocedure('public._promocoes_vigentes()'), 'EXECUTE'),
         'deve existir e estar fechada'

  union all

  select 86, 'mp_register_order_payment(text,uuid,text,text,numeric) executável por anon (webhook)',
         to_regprocedure('public.mp_register_order_payment(text,uuid,text,text,numeric)') is not null
           and has_function_privilege('anon', to_regprocedure('public.mp_register_order_payment(text,uuid,text,text,numeric)'), 'EXECUTE'),
         'o webhook usa a chave anon; a proteção é o p_secret'

  union all

  -- ---------- trigger de auth ----------
  select 90, 'trigger lola_on_auth_user em auth.users',
         exists (select 1 from pg_trigger t
                 where t.tgrelid = 'auth.users'::regclass
                   and t.tgname = 'lola_on_auth_user' and not t.tgisinternal),
         'cria perfil e aplica convite ao inserir/confirmar e-mail'

  union all

  -- ---------- superadmin e convites ----------
  select 100, 'superadmin ativo (>= 1)',
         (select count(*) from public.profiles where papel = 'superadmin' and ativo) >= 1,
         'superadmins ativos: ' || (select count(*) from public.profiles where papel = 'superadmin' and ativo)::text
           || '. Se 0: normal antes de criar/confirmar a conta do dono; depois disso deve ser >= 1.'

  union all

  select 101, 'convites_papel pendentes (informativo)',
         true,
         'pendentes: ' || (select count(*) from public.convites_papel)::text
           || '. O convite do dono some assim que a conta confirmada o consome.'

  union all

  -- ---------- 0010: colunas novas ----------
  select 110, 'coluna ' || c,
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = split_part(c, '.', 1) and column_name = split_part(c, '.', 2)),
         'admin_config/products/orders (0010)'
  from unnest(array['admin_config.varejo_ativo','admin_config.bonus_ativo','admin_config.bonus_min_pecas',
                    'admin_config.bonus_produto_id','admin_config.bonus_quantidade',
                    'products.somente_bonus','orders.bonus_aplicado','orders.bonus_aviso']) as c

  union all

  -- ---------- 0010: funções públicas e de revendedor ----------
  select 120, 'get_loja_flags() existe e é executável por anon',
         to_regprocedure('public.get_loja_flags()') is not null
           and has_function_privilege('anon', to_regprocedure('public.get_loja_flags()'), 'EXECUTE'),
         'a Home lê as flags sem login'

  union all

  select 121, 'get_destaques_atacado() executável por anon',
         to_regprocedure('public.get_destaques_atacado()') is not null
           and has_function_privilege('anon', to_regprocedure('public.get_destaques_atacado()'), 'EXECUTE'),
         'vitrine sem preço para visitante'

  union all

  select 122, 'get_categoria_imagem(uuid) executável por anon',
         to_regprocedure('public.get_categoria_imagem(uuid)') is not null
           and has_function_privilege('anon', to_regprocedure('public.get_categoria_imagem(uuid)'), 'EXECUTE'),
         'rota /api/categoria-img'

  union all

  select 123, f || ' sem EXECUTE para anon e com para authenticated',
         to_regprocedure('public.' || f) is not null
           and not has_function_privilege('anon', to_regprocedure('public.' || f), 'EXECUTE')
           and has_function_privilege('authenticated', to_regprocedure('public.' || f), 'EXECUTE'),
         'catálogo de atacado só para logado'
  from unnest(array['get_catalogo_revendedor(text)','get_produto_revendedor(text)']) as f

  union all

  select 124, 'public_get_surpresa() sem EXECUTE para anon',
         to_regprocedure('public.public_get_surpresa()') is not null
           and not has_function_privilege('anon', to_regprocedure('public.public_get_surpresa()'), 'EXECUTE'),
         'vitrine surpresa (varejo) fechada'

  union all

  select 125, 'mp_register_order_payment: assinatura de 5 argumentos e uma única sobrecarga',
         to_regprocedure('public.mp_register_order_payment(text,uuid,text,text,numeric)') is not null
           and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'mp_register_order_payment') = 1,
         'sobrecargas encontradas: '
           || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'mp_register_order_payment')::text

  union all

  select 126, 'admin_upsert_product com uma única sobrecarga',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'admin_upsert_product') = 1,
         'sobrecargas encontradas: '
           || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'admin_upsert_product')::text

  union all

  select 127, f || ' sem EXECUTE para anon/authenticated',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = f)
           and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = f
                             and (has_function_privilege('anon', p.oid, 'EXECUTE')
                                  or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
         'helper interno: deve existir e estar fechado'
  from unnest(array['_mascarar_dinheiro_pedido','_assert_catalogo_acesso','_catalogo_produto']) as f

  union all

  select 128, f || ' com search_path configurado',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = f)
           and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'public' and p.proname = f
                             and not coalesce(exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                                                      where cfg like 'search_path=%'), false)),
         'proconfig contém search_path'
  from unnest(array['_slugify','_preco_atacado','_preco_varejo']) as f

  union all

  -- ---------- 0010: catálogo fechado ----------
  select 130, 'política ' || pol || ' ausente',
         not exists (select 1 from pg_policies where schemaname = 'public' and policyname = pol),
         'a leitura direta do catálogo foi fechada'
  from unnest(array['prod_read','col_read','siz_read','cat_read']) as pol

  union all

  select 131, 'anon e authenticated sem SELECT em ' || t,
         not has_table_privilege('anon', 'public.' || t, 'select')
           and not has_table_privilege('authenticated', 'public.' || t, 'select'),
         'catálogo só por RPC'
  from unnest(array['products','product_colors','product_sizes','categorias']) as t

) as checagens
order by ord, nome;
