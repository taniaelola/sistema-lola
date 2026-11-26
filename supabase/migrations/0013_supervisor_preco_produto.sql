-- 0013_supervisor_preco_produto.sql — o supervisor passa a VER e EDITAR o preço cheio do produto.
--  - admin_list_products: sem máscara de preço para o supervisor (precisa ver para editar).
--  - admin_upsert_product: o supervisor grava o preço (p_preco), pode ativar com preço, e pode mudar a categoria.
--    Continuam SÓ com admin/superadmin: preço de atacado próprio (override), desconto de varejo, desconto de
--    atacado da categoria, Live Surpresa e exclusão. Para o supervisor esses dois campos do produto são preservados
--    (insert: nulos). Pedidos, vendas e financeiro continuam sem valores para o supervisor.
-- Mesmas assinaturas e grants da 0010. Não edite a 0010 (já aplicada em produção).

create or replace function admin_list_products()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((select jsonb_agg(_product_json(p) order by p.ordem, p.nome) from products p), '[]'::jsonb);
end $$;

create or replace function admin_upsert_product(
  p_id uuid, p_nome text, p_categoria_id uuid, p_colecao text,
  p_preco numeric, p_desconto_percentual int, p_preco_atacado numeric, p_descricao text,
  p_caracteristicas text[], p_ativo boolean, p_destaque boolean, p_ordem int, p_slug text,
  p_somente_bonus boolean default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_papel text; v_pa numeric; v_desc int;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_preco is not null and p_preco < 0 then raise exception 'preço inválido'; end if;

  if p_id is null then
    -- supervisor não define preço de atacado próprio nem desconto de varejo
    v_pa   := case when v_papel = 'supervisor' then null else p_preco_atacado end;
    v_desc := case when v_papel = 'supervisor' then null else nullif(p_desconto_percentual,0) end;
    if coalesce(p_ativo,false) then
      perform _assert_pode_ativar(p_preco, v_pa, p_categoria_id, coalesce(p_somente_bonus,false));
    end if;
    insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
      descricao,caracteristicas,ativo,destaque,ordem,slug,somente_bonus)
    values (p_nome,p_categoria_id,p_colecao,coalesce(p_preco,0),v_desc,v_pa,
      p_descricao,coalesce(p_caracteristicas,'{}'),p_ativo,p_destaque,coalesce(p_ordem,0),v_slug,
      coalesce(p_somente_bonus,false))
    returning id into v_id;
  else
    if v_papel = 'supervisor' then
      select preco_atacado, desconto_percentual into v_pa, v_desc from products where id = p_id;
      if not found then raise exception 'registro não encontrado'; end if;
    else
      v_pa   := p_preco_atacado;
      v_desc := nullif(p_desconto_percentual,0);
    end if;
    if coalesce(p_ativo,false) then
      perform _assert_pode_ativar(p_preco, v_pa, p_categoria_id,
        coalesce(p_somente_bonus, (select somente_bonus from products where id = p_id), false));
    end if;
    update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao, preco=coalesce(p_preco,0),
      desconto_percentual=v_desc, preco_atacado=v_pa,
      descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
      destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug,
      somente_bonus=coalesce(p_somente_bonus, products.somente_bonus)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;
