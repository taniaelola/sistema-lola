-- Roda DEPOIS de rollback-0010.sql, na mesma transação. Termina com exceção TESTE_ROLLBACK_OK (desfaz tudo).
do $$
declare
  v_cat uuid := '00000000-0000-4000-8000-0000000000e1';
  v_prod uuid := '00000000-0000-4000-8000-0000000000e2';
  v_cor uuid := '00000000-0000-4000-8000-0000000000e3';
  v_tam uuid := '00000000-0000-4000-8000-0000000000e4';
  r jsonb;
  v_erro text;
begin
  -- ---------- privilégios e políticas ----------
  if not has_table_privilege('anon', 'public.products', 'select') then
    raise exception 'FALHOU: anon sem SELECT em products após o rollback';
  end if;
  if not has_table_privilege('anon', 'public.product_colors', 'select')
     or not has_table_privilege('anon', 'public.product_sizes', 'select')
     or not has_table_privilege('anon', 'public.categorias', 'select') then
    raise exception 'FALHOU: anon sem SELECT em product_colors/product_sizes/categorias após o rollback';
  end if;
  if not has_table_privilege('authenticated', 'public.products', 'select')
     or not has_table_privilege('authenticated', 'public.product_colors', 'select')
     or not has_table_privilege('authenticated', 'public.product_sizes', 'select')
     or not has_table_privilege('authenticated', 'public.categorias', 'select') then
    raise exception 'FALHOU: authenticated sem SELECT nas tabelas do catálogo após o rollback';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'prod_read') then
    raise exception 'FALHOU: política prod_read ausente após o rollback';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public' and cmd = 'SELECT'
        and (tablename, policyname) in (('products','prod_read'),('product_colors','col_read'),
                                        ('product_sizes','siz_read'),('categorias','cat_read'))) <> 4 then
    raise exception 'FALHOU: as quatro políticas *_read (cmd SELECT) não voltaram';
  end if;
  if not has_function_privilege('anon', 'public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)', 'EXECUTE') then
    raise exception 'FALHOU: anon sem EXECUTE em checkout_iniciar_pedido após o rollback';
  end if;
  if not has_function_privilege('anon', 'public.public_get_surpresa()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.public_get_surpresa()', 'EXECUTE') then
    raise exception 'FALHOU: public_get_surpresa sem EXECUTE para anon/authenticated após o rollback';
  end if;

  -- ---------- varejo religado ----------
  if not coalesce((select varejo_ativo from public.admin_config where id = 1), false) then
    raise exception 'FALHOU: admin_config.varejo_ativo continua false após o rollback';
  end if;

  -- ---------- compra de varejo como anon (o fluxo do app antigo) ----------
  insert into public.categorias (id, grupo, nome, slug) values (v_cat, 'calcados', 'RB Cat', 'rb-cat');
  insert into public.products (id, slug, nome, categoria_id, preco, ativo, ordem)
    values (v_prod, 'rb-prod', 'RB Prod', v_cat, 100, true, 1);
  insert into public.product_colors (id, product_id, nome, ordem) values (v_cor, v_prod, 'Preto', 0);
  insert into public.product_sizes (id, color_id, tamanho, estoque) values (v_tam, v_cor, '38', 10);

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    r := public.checkout_iniciar_pedido(
      'Teste Rollback', '11999990000', 'retirada'::entrega_tipo, null, null, null, null, null, null,
      jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'color_id', v_cor, 'size_id', v_tam, 'quantidade', 1)),
      false);
  exception when others then
    v_erro := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_erro is not null then
    raise exception 'FALHOU: compra de varejo como anon após o rollback levantou erro: %', v_erro;
  end if;
  if r is null or (r->>'id') is null then
    raise exception 'FALHOU: checkout de varejo como anon não devolveu um pedido: %', r;
  end if;

  raise exception 'TESTE_ROLLBACK_OK';
end $$;
