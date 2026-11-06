-- Roda DEPOIS de rollback-0010.sql, na mesma transação. Termina com exceção TESTE_ROLLBACK_OK (desfaz tudo).
do $$
begin
  if not has_table_privilege('anon', 'public.products', 'select') then
    raise exception 'FALHOU: anon sem SELECT em products após o rollback';
  end if;
  if not has_table_privilege('anon', 'public.product_colors', 'select')
     or not has_table_privilege('anon', 'public.product_sizes', 'select')
     or not has_table_privilege('anon', 'public.categorias', 'select') then
    raise exception 'FALHOU: anon sem SELECT em product_colors/product_sizes/categorias após o rollback';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'prod_read') then
    raise exception 'FALHOU: política prod_read ausente após o rollback';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and policyname in ('prod_read','col_read','siz_read','cat_read')) <> 4 then
    raise exception 'FALHOU: as quatro políticas *_read não voltaram';
  end if;
  if not has_function_privilege('anon', 'public.checkout_iniciar_pedido(text,text,entrega_tipo,text,text,text,text,text,text,jsonb,boolean)', 'EXECUTE') then
    raise exception 'FALHOU: anon sem EXECUTE em checkout_iniciar_pedido após o rollback';
  end if;
  if not has_function_privilege('anon', 'public.public_get_surpresa()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.public_get_surpresa()', 'EXECUTE') then
    raise exception 'FALHOU: public_get_surpresa sem EXECUTE para anon/authenticated após o rollback';
  end if;
  raise exception 'TESTE_ROLLBACK_OK';
end $$;
