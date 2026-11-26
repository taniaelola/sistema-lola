-- rollback-0013.sql — volta o supervisor a NÃO ver nem editar preço de produto (funções da 0010).
-- Use junto com o rollback do deploy. Idempotente.
set search_path = public, extensions;

create or replace function admin_list_products()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare v_papel text;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((select jsonb_agg(
      case when v_papel = 'supervisor'
           then x.j || jsonb_build_object('preco', null, 'preco_atacado', null,
                  'desconto_percentual', null, 'desconto_efetivo', null,
                  'categoria', case when jsonb_typeof(x.j->'categoria') = 'object'
                                    then (x.j->'categoria') || jsonb_build_object('desconto_atacado_percentual', null)
                                    else x.j->'categoria' end)
           else x.j end
      order by p.ordem, p.nome)
    from products p cross join lateral (select _product_json(p) as j) x), '[]'::jsonb);
end $$;

create or replace function admin_upsert_product(
  p_id uuid, p_nome text, p_categoria_id uuid, p_colecao text,
  p_preco numeric, p_desconto_percentual int, p_preco_atacado numeric, p_descricao text,
  p_caracteristicas text[], p_ativo boolean, p_destaque boolean, p_ordem int, p_slug text,
  p_somente_bonus boolean default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_papel text; v_preco numeric; v_cat_atual uuid; v_pa numeric; v_sb boolean;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    if v_papel = 'supervisor' then
      -- cadastro sem preço: nasce com preco 0 e inativo até um admin definir o preço
      insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
        descricao,caracteristicas,ativo,destaque,ordem,slug,somente_bonus)
      values (p_nome,p_categoria_id,p_colecao,0,null,null,
        p_descricao,coalesce(p_caracteristicas,'{}'),false,p_destaque,coalesce(p_ordem,0),v_slug,
        coalesce(p_somente_bonus,false))
      returning id into v_id;
    else
      if coalesce(p_ativo,false) then
        perform _assert_pode_ativar(p_preco, p_preco_atacado, p_categoria_id, coalesce(p_somente_bonus,false));
      end if;
      insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
        descricao,caracteristicas,ativo,destaque,ordem,slug,somente_bonus)
      values (p_nome,p_categoria_id,p_colecao,p_preco,nullif(p_desconto_percentual,0),p_preco_atacado,
        p_descricao,coalesce(p_caracteristicas,'{}'),p_ativo,p_destaque,coalesce(p_ordem,0),v_slug,
        coalesce(p_somente_bonus,false))
      returning id into v_id;
    end if;
  else
    if v_papel = 'supervisor' then
      -- preco, preco_atacado e desconto_percentual atuais são preservados (argumentos ignorados)
      select preco, categoria_id, preco_atacado, somente_bonus into v_preco, v_cat_atual, v_pa, v_sb from products where id = p_id;
      if not found then raise exception 'registro não encontrado'; end if;
      -- mudar de categoria muda o preço de atacado efetivo (desconto da categoria) quando não há override
      if p_categoria_id is distinct from v_cat_atual and v_pa is null
         and (select desconto_atacado_percentual from categorias where id = v_cat_atual)
             is distinct from (select desconto_atacado_percentual from categorias where id = p_categoria_id) then
        raise exception 'sem permissão para mudar a categoria: altera o preço de atacado' using errcode = '42501';
      end if;
      if coalesce(p_ativo,false) then
        perform _assert_pode_ativar(v_preco, v_pa, p_categoria_id, coalesce(p_somente_bonus, v_sb));
      end if;
      update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao,
        descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
        destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug,
        somente_bonus=coalesce(p_somente_bonus, products.somente_bonus)
      where id=p_id returning id into v_id;
    else
      if coalesce(p_ativo,false) then
        perform _assert_pode_ativar(p_preco, p_preco_atacado, p_categoria_id,
          coalesce(p_somente_bonus, (select somente_bonus from products where id = p_id), false));
      end if;
      update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao, preco=p_preco,
        desconto_percentual=nullif(p_desconto_percentual,0), preco_atacado=p_preco_atacado,
        descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
        destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug,
        somente_bonus=coalesce(p_somente_bonus, products.somente_bonus)
      where id=p_id returning id into v_id;
    end if;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;
