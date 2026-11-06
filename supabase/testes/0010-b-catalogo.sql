-- Seção B: catálogo fechado e funções de leitura por papel. Roda em transação única;
-- termina com TESTE_B_OK (o runner trata como sucesso). Negações: só 42501 é aceito.
do $t$
declare
  r jsonb; txt text; s text; tb text; pv text; i int;
  u_ra  uuid := '00000000-0000-4000-8000-0000000000f1';  -- revendedor aprovado
  u_rp  uuid := '00000000-0000-4000-8000-0000000000f2';  -- revendedor pendente
  u_rr  uuid := '00000000-0000-4000-8000-0000000000f3';  -- revendedor recusado
  u_ri  uuid := '00000000-0000-4000-8000-0000000000f4';  -- aprovado mas perfil inativo
  u_cli uuid := '00000000-0000-4000-8000-0000000000f5';
  u_sup uuid := '00000000-0000-4000-8000-0000000000f6';
  u_adm uuid := '00000000-0000-4000-8000-0000000000f7';
  v_cat uuid; v_cat_off uuid;
  v_a uuid; v_off uuid; v_bonus uuid; v_semest uuid; v_destbonus uuid; v_destoff uuid;
  v_ovr uuid; v_catoff uuid; u_sa uuid := '00000000-0000-4000-8000-0000000000f8';
  v_cor uuid; v_exp_varejo numeric; v_exp_atacado numeric; v_item jsonb;
begin
  -- ---------- fixtures ----------
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.em, now(), now(), now()
  from (values (u_ra,'tb-ra@teste.invalid'),(u_rp,'tb-rp@teste.invalid'),(u_rr,'tb-rr@teste.invalid'),
               (u_ri,'tb-ri@teste.invalid'),(u_cli,'tb-cli@teste.invalid'),(u_sup,'tb-sup@teste.invalid'),
               (u_adm,'tb-adm@teste.invalid'),(u_sa,'tb-sa@teste.invalid')) as x(id, em);
  update profiles set papel = 'revendedor' where id in (u_ra, u_rp, u_rr, u_ri);
  update profiles set papel = 'supervisor' where id = u_sup;
  update profiles set papel = 'admin' where id = u_adm;
  update profiles set papel = 'superadmin' where id = u_sa;
  insert into revendedores (user_id, razao_social, email, status) values
    (u_ra, 'TB A', 'tb-ra@teste.invalid', 'aprovado'),
    (u_rp, 'TB P', 'tb-rp@teste.invalid', 'pendente'),
    (u_rr, 'TB R', 'tb-rr@teste.invalid', 'recusado'),
    (u_ri, 'TB I', 'tb-ri@teste.invalid', 'aprovado');
  update profiles set ativo = false where id = u_ri;

  insert into categorias (grupo, nome, slug, desconto_atacado_percentual, imagem)
    values ('calcados', 'TB Cat', 'tb-cat', 40, 'data:image/png;base64,SEGREDOIMG') returning id into v_cat;
  insert into categorias (grupo, nome, slug, ativo, imagem)
    values ('calcados', 'TB Cat Off', 'tb-cat-off', false, 'data:image/png;base64,INATIVA') returning id into v_cat_off;

  -- produto ativo, destaque, com estoque: o principal (ordem muito baixa para ficar entre os 8)
  insert into products (slug, nome, categoria_id, preco, desconto_percentual, descricao, caracteristicas, ativo, destaque, ordem)
    values ('tb-ativo', 'TB Ativo', v_cat, 100, 10, 'desc', array['a','b'], true, true, -1000) returning id into v_a;
  insert into products (slug, nome, categoria_id, preco, ativo, ordem) values ('tb-inativo', 'TB Inativo', v_cat, 100, false, -999) returning id into v_off;
  insert into products (slug, nome, categoria_id, preco, ativo, somente_bonus, ordem) values ('tb-bonus', 'TB Bonus', v_cat, 100, true, true, -998) returning id into v_bonus;
  insert into products (slug, nome, categoria_id, preco, ativo, destaque, ordem) values ('tb-semest', 'TB Sem Estoque', v_cat, 100, true, true, -997) returning id into v_semest;
  insert into products (slug, nome, categoria_id, preco, ativo, destaque, somente_bonus, ordem) values ('tb-destbonus', 'TB Dest Bonus', v_cat, 100, true, true, true, -996) returning id into v_destbonus;
  insert into products (slug, nome, categoria_id, preco, ativo, destaque, ordem) values ('tb-destoff', 'TB Dest Off', v_cat, 100, false, true, -995) returning id into v_destoff;

  -- cor + tamanhos para cada um (todos com estoque, exceto o "sem estoque")
  for s in select unnest(array['tb-ativo','tb-inativo','tb-bonus','tb-destbonus','tb-destoff']) loop
    insert into product_colors (product_id, nome, hex, imagens, ordem)
      values ((select id from products where slug = s), 'Preto', '#000000', array['img-' || s || '-1', 'img-' || s || '-2'], 0)
      returning id into v_cor;
    insert into product_sizes (color_id, tamanho, estoque) values (v_cor, '38', 5), (v_cor, '37', 3);
  end loop;
  insert into product_colors (product_id, nome, imagens, ordem) values (v_semest, 'Preto', array['img-sem'], 0) returning id into v_cor;
  insert into product_sizes (color_id, tamanho, estoque) values (v_cor, '38', 0);

  -- 9 destaques extras com estoque para provar o limite de 8
  for i in 1..9 loop
    insert into products (slug, nome, categoria_id, preco, ativo, destaque, ordem)
      values ('tb-extra-' || i, 'TB Extra ' || i, v_cat, 50, true, true, i);
    insert into product_colors (product_id, nome, ordem)
      values ((select id from products where slug = 'tb-extra-' || i), 'Azul', 0) returning id into v_cor;
    insert into product_sizes (color_id, tamanho, estoque) values (v_cor, '40', 1);
  end loop;

  -- produto com override de atacado (123) e sem desconto; produto ativo em categoria INATIVA (destaque com estoque)
  insert into products (slug, nome, categoria_id, preco, preco_atacado, ativo, ordem)
    values ('tb-ovr', 'TB Override', v_cat, 200, 123, true, -990) returning id into v_ovr;
  insert into product_colors (product_id, nome, ordem) values (v_ovr, 'Preto', 0) returning id into v_cor;
  insert into product_sizes (color_id, tamanho, estoque) values (v_cor, '38', 2);
  insert into products (slug, nome, categoria_id, preco, ativo, destaque, ordem)
    values ('tb-catoff', 'TB Cat Inativa', v_cat_off, 100, true, true, -989) returning id into v_catoff;
  insert into product_colors (product_id, nome, ordem) values (v_catoff, 'Preto', 0) returning id into v_cor;
  insert into product_sizes (color_id, tamanho, estoque) values (v_cor, '38', 2);

  -- valores esperados: literais (100 com 10% de desconto = 90; 100 com 40% da categoria = 60)
  v_exp_varejo := 90; v_exp_atacado := 60;

  -- ---------- 1. anon não chama as funções de revendedor ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform get_catalogo_revendedor();
    raise exception 'FALHOU: anon executou get_catalogo_revendedor';
  exception when insufficient_privilege then null; end;
  begin
    perform get_produto_revendedor('tb-ativo');
    raise exception 'FALHOU: anon executou get_produto_revendedor';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ---------- 2. pendente, recusado, perfil inativo e cliente: negados (42501) ----------
  foreach s in array array[u_rp::text, u_rr::text, u_ri::text, u_cli::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform get_catalogo_revendedor();
      raise exception 'FALHOU: % conseguiu get_catalogo_revendedor', s;
    exception when insufficient_privilege then null; end;
    begin
      perform get_produto_revendedor('tb-ativo');
      raise exception 'FALHOU: % conseguiu get_produto_revendedor', s;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- ---------- 3. revendedor aprovado ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_ra, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := get_catalogo_revendedor();
  txt := r::text;
  if txt like '%desconto_atacado_percentual%' then raise exception 'FALHOU: catálogo vaza desconto_atacado_percentual'; end if;
  if txt like '%"custo"%' or txt like '%SEGREDOIMG%' then raise exception 'FALHOU: catálogo vaza custo/imagem de categoria'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'produtos') e where e->>'id' = v_a::text) then
    raise exception 'FALHOU: produto ativo ausente do catálogo'; end if;
  foreach s in array array[v_off::text, v_bonus::text, v_destoff::text, v_destbonus::text] loop
    if exists (select 1 from jsonb_array_elements(r->'produtos') e where e->>'id' = s) then
      raise exception 'FALHOU: catálogo trouxe produto inativo ou somente_bonus (%)', s; end if;
  end loop;
  select e into v_item from jsonb_array_elements(r->'produtos') e where e->>'id' = v_a::text;
  if (v_item->>'preco_varejo')::numeric <> v_exp_varejo then raise exception 'FALHOU: preco_varejo % <> %', v_item->>'preco_varejo', v_exp_varejo; end if;
  if (v_item->>'preco_atacado')::numeric <> v_exp_atacado then raise exception 'FALHOU: preco_atacado % <> %', v_item->>'preco_atacado', v_exp_atacado; end if;
  if v_item->'categoria' <> jsonb_build_object('id', v_cat, 'nome', 'TB Cat', 'slug', 'tb-cat', 'grupo', 'calcados') then
    raise exception 'FALHOU: objeto categoria fora do formato (%)', v_item->'categoria'; end if;
  if jsonb_array_length(v_item->'cores') <> 1 or jsonb_array_length(v_item->'cores'->0->'tamanhos') <> 2
     or (v_item->'cores'->0->'tamanhos'->0->>'estoque')::int <> 3 then
    raise exception 'FALHOU: cores/tamanhos/estoque do produto (%)', v_item->'cores'; end if;
  if v_item->'cores'->0->'imagens'->>0 <> 'img-tb-ativo-1' or v_item->'cores'->0->>'hex' <> '#000000' then
    raise exception 'FALHOU: cor sem hex/imagens'; end if;
  if jsonb_array_length(r->'categorias') < 1 then raise exception 'FALHOU: categorias vazias'; end if;
  -- filtro por categoria
  r := get_catalogo_revendedor('tb-cat');
  if not exists (select 1 from jsonb_array_elements(r->'produtos') e where e->>'id' = v_a::text) then
    raise exception 'FALHOU: filtro por categoria perdeu o produto'; end if;
  r := get_catalogo_revendedor('nao-existe');
  if jsonb_array_length(r->'produtos') <> 0 then raise exception 'FALHOU: categoria inexistente devolveu produtos'; end if;
  r := get_catalogo_revendedor('tb-cat-off');
  if jsonb_array_length(r->'produtos') <> 0 then raise exception 'FALHOU: slug de categoria inativa devolveu produtos'; end if;
  r := get_catalogo_revendedor();
  if exists (select 1 from jsonb_array_elements(r->'produtos') e where e->>'id' = v_catoff::text) then
    raise exception 'FALHOU: produto de categoria inativa no catálogo'; end if;
  if exists (select 1 from jsonb_array_elements(r->'categorias') e where e->>'id' = v_cat_off::text) then
    raise exception 'FALHOU: categoria inativa na lista de categorias'; end if;
  -- override de atacado (literal) e varejo sem desconto
  select e into v_item from jsonb_array_elements(r->'produtos') e where e->>'id' = v_ovr::text;
  if v_item is null or (v_item->>'preco_atacado')::numeric <> 123 or (v_item->>'preco_varejo')::numeric <> 200 then
    raise exception 'FALHOU: override de atacado (%)', v_item; end if;
  if get_produto_revendedor('tb-catoff') is distinct from null then
    raise exception 'FALHOU: detalhe de produto em categoria inativa deveria ser null'; end if;
  -- detalhe
  r := get_produto_revendedor('tb-ativo');
  if r->>'id' <> v_a::text or r::text like '%desconto_atacado_percentual%' or (r->>'preco_atacado')::numeric <> v_exp_atacado then
    raise exception 'FALHOU: detalhe do produto (%)', r; end if;
  foreach s in array array['tb-inativo', 'tb-bonus', 'nao-existe'] loop
    if get_produto_revendedor(s) is distinct from null then raise exception 'FALHOU: detalhe devolveu % que deveria ser null', s; end if;
  end loop;
  reset role;

  -- ---------- 4. equipe ----------
  foreach s in array array[u_sup::text, u_adm::text, u_sa::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := get_catalogo_revendedor();
    if not exists (select 1 from jsonb_array_elements(r->'produtos') e where e->>'id' = v_a::text) then
      raise exception 'FALHOU: equipe % não vê o catálogo', s; end if;
    reset role;
  end loop;

  -- ---------- 5. destaques públicos ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := get_destaques_atacado();
  txt := r::text;
  if jsonb_array_length(r) <> 8 then raise exception 'FALHOU: destaques deve limitar em 8 (%)', jsonb_array_length(r); end if;
  select e into v_item from jsonb_array_elements(r) e where e->>'id' = v_a::text;
  if v_item is null then raise exception 'FALHOU: destaque ativo com estoque ausente'; end if;
  foreach s in array array[v_semest::text, v_destbonus::text, v_destoff::text, v_off::text, v_bonus::text, v_catoff::text] loop
    if exists (select 1 from jsonb_array_elements(r) e where e->>'id' = s) then
      raise exception 'FALHOU: destaques trouxe item indevido (%)', s; end if;
  end loop;
  if (select array_agg(k order by k) from jsonb_object_keys(v_item) k)
     is distinct from array['id','imagem','nome','preco_atacado','preco_varejo','slug'] then
    raise exception 'FALHOU: chaves do destaque (%)', v_item; end if;
  if (v_item->>'preco_varejo')::numeric <> v_exp_varejo or (v_item->>'preco_atacado')::numeric <> v_exp_atacado
     or v_item->>'imagem' <> 'img-tb-ativo-1' then
    raise exception 'FALHOU: valores do destaque (%)', v_item; end if;
  if txt like '%estoque%' or txt like '%cores%' or txt like '%tamanho%' or txt like '%desconto_atacado_percentual%' then
    raise exception 'FALHOU: destaques vaza estoque/cores/percentual'; end if;
  reset role;
  -- authenticated (cliente) também pode
  perform set_config('request.jwt.claims', json_build_object('sub', u_cli, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform get_destaques_atacado();
  reset role;

  -- ---------- 6. leitura direta fechada (anon e authenticated) ----------
  foreach s in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims',
      case when s = 'anon' then '{"role":"anon"}' else json_build_object('sub', u_cli, 'role', 'authenticated')::text end, true);
    execute 'set local role ' || s;
    foreach tb in array array['products', 'product_sizes', 'product_colors', 'categorias'] loop
      begin
        execute 'select count(*) from ' || tb;
        raise exception 'FALHOU: % leu % diretamente', s, tb;
      exception when insufficient_privilege then null; end;
    end loop;
    reset role;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
             and policyname in ('prod_read', 'col_read', 'siz_read', 'cat_read')) then
    raise exception 'FALHOU: políticas de leitura aberta ainda existem'; end if;

  -- ---------- 7. public_get_surpresa sem EXECUTE ----------
  foreach s in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims',
      case when s = 'anon' then '{"role":"anon"}' else json_build_object('sub', u_cli, 'role', 'authenticated')::text end, true);
    execute 'set local role ' || s;
    begin
      perform public_get_surpresa();
      raise exception 'FALHOU: % executou public_get_surpresa', s;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- ---------- 8. imagem de categoria: só de categoria ativa ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  if get_categoria_imagem(v_cat) is distinct from 'data:image/png;base64,SEGREDOIMG' then
    raise exception 'FALHOU: imagem da categoria ativa não veio'; end if;
  if get_categoria_imagem(v_cat_off) is not null then raise exception 'FALHOU: imagem de categoria inativa vazou'; end if;
  if get_categoria_imagem(gen_random_uuid()) is not null then raise exception 'FALHOU: id inexistente devolveu algo'; end if;
  reset role;

  -- ---------- 9. privilégios em nível de tabela e de função ----------
  foreach s in array array['anon', 'authenticated'] loop
    foreach tb in array array['products', 'product_colors', 'product_sizes', 'categorias'] loop
      foreach pv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
        if has_table_privilege(s, 'public.' || tb, pv) then
          raise exception 'FALHOU: % tem % em %', s, pv, tb; end if;
      end loop;
    end loop;
  end loop;
  if has_function_privilege('anon', 'public.get_catalogo_revendedor(text)', 'execute') then raise exception 'FALHOU: anon executa get_catalogo_revendedor'; end if;
  if has_function_privilege('anon', 'public.get_produto_revendedor(text)', 'execute') then raise exception 'FALHOU: anon executa get_produto_revendedor'; end if;
  foreach s in array array['anon', 'authenticated'] loop
    if has_function_privilege(s, 'public._assert_catalogo_acesso()', 'execute') then raise exception 'FALHOU: % executa _assert_catalogo_acesso', s; end if;
    if has_function_privilege(s, 'public._catalogo_produto(public.products, boolean)', 'execute') then raise exception 'FALHOU: % executa _catalogo_produto', s; end if;
    if has_function_privilege(s, 'public.public_get_surpresa()', 'execute') then raise exception 'FALHOU: % executa public_get_surpresa', s; end if;
  end loop;
  if not has_function_privilege('anon', 'public.get_destaques_atacado()', 'execute') then raise exception 'FALHOU: anon sem execute em get_destaques_atacado'; end if;
  if not has_function_privilege('anon', 'public.get_categoria_imagem(uuid)', 'execute') then raise exception 'FALHOU: anon sem execute em get_categoria_imagem'; end if;

  raise exception 'TESTE_B_OK';   -- desfaz tudo; o runner trata TESTE_*_OK como sucesso
end $t$;
