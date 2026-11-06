-- rollback-0010.sql — devolve o que a 0010 fechou e quebra o app ANTIGO.
-- Use junto com o rollback do deploy. Idempotente (pode rodar mais de uma vez).
-- NÃO desfaz colunas/funções novas (têm default seguro) nem restaura mp_register_order_payment/admin_*.
-- _order_json, atacado_my_orders e admin_list_orders/admin_list_products só ganharam chaves extras (bonus*) ou
-- máscara do supervisor: o app antigo ignora as chaves; nada a desfazer para o app antigo.
set search_path = public, extensions;

grant select on products, product_colors, product_sizes, categorias to anon, authenticated;

drop policy if exists prod_read on products;
create policy prod_read on products for select using (true);
drop policy if exists col_read on product_colors;
create policy col_read on product_colors for select using (true);
drop policy if exists siz_read on product_sizes;
create policy siz_read on product_sizes for select using (true);
drop policy if exists cat_read on categorias;
create policy cat_read on categorias for select using (true);

grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to anon, authenticated;
grant execute on function public_get_surpresa() to anon, authenticated;

-- O app antigo é uma loja de varejo; a 0010 cria admin_config.varejo_ativo com default false e o
-- checkout passaria a lançar 'varejo desativado'. Religa o varejo para a compra voltar a funcionar.
update admin_config set varejo_ativo = true where id = 1;
