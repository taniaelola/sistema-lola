-- release-0012.sql — pedido de atacado SEM pagamento no site + revendedora premium (sem pedido mínimo).
--   (GERADO por scripts/build-release-sql.mjs; NÃO edite à mão. Contém somente a migração 0012_pedido_sem_pagamento_premium.sql;
--    as migrações 0001 a 0011 já estão aplicadas em produção.)
--   ORDEM: rode este SQL ANTES de promover o app novo. O app novo (botão "Enviar pedido") exige a 0012:
--   sem ela o pedido nasceria 'pendente' e a vendedora não teria como separar/avisar. O app antigo com o SQL novo
--   continua abrindo o Mercado Pago, mas o pedido nasce 'preparando' e o webhook não o liquida: por isso o SQL
--   vai logo antes do deploy, em horário de pouco movimento.
--   Cole o arquivo inteiro no SQL Editor do projeto LOLA e rode UMA vez (create or replace: idempotente).
--   Rollback: supabase/rollback-0012.sql.

-- 0012_pedido_sem_pagamento_premium.sql
--  (1) PEDIDO SEM PAGAMENTO NO SITE: o pedido de atacado nasce em 'preparando' (Em separação), sem Mercado Pago.
--      A vendedora separa, avisa no WhatsApp, manda o link de pagamento (feito fora do sistema) e registra o
--      pagamento no admin ('Aguardando pagamento' = 'pendente' -> 'pago' via admin_settle_order, que baixa o
--      estoque e grava a venda). O carrinho de atacado esvazia na criação do pedido.
--  (2) REVENDEDORA PREMIUM: revendedores.premium (caixa no admin) isenta do pedido mínimo de peças.
-- Redefine: checkout_iniciar_pedido, atacado_me, admin_update_order_status, admin_settle_order.
-- Cria: admin_set_revendedor_premium. Não edite a 0011 (já aplicada em produção).

alter table revendedores add column if not exists premium boolean not null default false;

create or replace function atacado_me()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  if auth.uid() is null then return null; end if;
  return (
    select jsonb_build_object('id', r.id, 'status', r.status, 'razao_social', r.razao_social,
                              'premium', r.premium)
    from revendedores r where r.user_id = auth.uid());
end $$;

-- Só superadmin/admin marcam (supervisor não).
create or replace function admin_set_revendedor_premium(p_id uuid, p_premium boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  if p_premium is null then raise exception 'valor inválido'; end if;
  update revendedores set premium = p_premium where id = p_id;
  if not found then raise exception 'revendedor não encontrado'; end if;
end $$;

revoke all on function admin_set_revendedor_premium(uuid, boolean) from public, anon, authenticated;
grant execute on function admin_set_revendedor_premium(uuid, boolean) to authenticated;

--  (3) CONVITE DE EQUIPE POR E-MAIL: a pessoa convidada abre o link do e-mail, informa nome e senha e a tela
--      grava o nome no perfil com esta função (só o próprio usuário, só se o nome ainda estiver vazio).
create or replace function set_meu_nome(p_nome text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_nome text := left(trim(coalesce(p_nome, '')), 200);
begin
  if auth.uid() is null then raise exception 'sem sessão' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'nome obrigatório'; end if;
  update profiles set nome = v_nome where id = auth.uid() and nome = '';
end $$;

revoke all on function set_meu_nome(text) from public, anon;
grant execute on function set_meu_nome(text) to authenticated;

create or replace function checkout_iniciar_pedido(
  p_cliente_nome text,
  p_cliente_telefone text,
  p_entrega_tipo entrega_tipo,
  p_endereco_rua text,
  p_endereco_numero text,
  p_endereco_bairro text,
  p_endereco_complemento text,
  p_endereco_cep text,
  p_endereco_cidade text,
  p_items jsonb,               -- varejo: [{produto_id,color_id,size_id,quantidade}]; atacado: ignorado
  p_is_atacado boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_prod products;
  v_size product_sizes;
  v_color product_colors;
  v_preco numeric;
  v_qtd int;
  v_qtd_total int;
  v_prod_total numeric := 0;
  v_taxa numeric := 0;
  v_mp_itens jsonb := '[]'::jsonb;
  v_uid uuid := auth.uid();
  v_rev uuid;
  v_ca carrinho_atacado;
  v_pct int;
  v_skus int;                  -- total de peças do pedido (nome mantido da 0010)
  v_premium boolean := false;  -- revendedora premium: sem pedido mínimo
  v_min constant int := 12;    -- mínimo de peças do atacado (única fonte no SQL; app: MIN_PECAS_ATACADO)
  v_cfg admin_config;
  v_pecas int;
  v_bsize product_sizes;
  v_bcolor product_colors;
  v_bprod products;
begin
  -- ===== ATACADO =====
  if coalesce(p_is_atacado, false) then
    -- Lança 'revendedor não aprovado' sem sessão, sem revendedor aprovado ou
    -- com perfil inativo. Nada do payload identifica o revendedor.
    v_rev := _atacado_revendedor_aprovado();
    select coalesce(r.premium, false) into v_premium from revendedores r where r.id = v_rev;

    if not exists (select 1 from carrinho_atacado where revendedor_id = v_rev) then
      raise exception 'carrinho vazio';
    end if;

    if p_entrega_tipo = 'entrega' then
      select taxa_entrega_local into v_taxa from admin_config where id = 1;
    end if;

    insert into orders(status, cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa,
      endereco_rua, endereco_numero, endereco_bairro, endereco_complemento, endereco_cep, endereco_cidade,
      is_atacado, customer_id, revendedor_id, valor_produtos, valor_total)
    values ('preparando', p_cliente_nome, regexp_replace(p_cliente_telefone,'\D','','g'),
      p_entrega_tipo, coalesce(v_taxa,0),
      p_endereco_rua, p_endereco_numero, p_endereco_bairro, p_endereco_complemento, p_endereco_cep,
      case when p_entrega_tipo = 'entrega_fora' then p_endereco_cidade else null end,
      true, v_uid, v_rev, 0, 0)
    returning id into v_order_id;

    -- Mesma ordem de trava do varejo (size_id crescente) => deadlock-safe entre os dois.
    for v_ca in
      select ca.* from carrinho_atacado ca
      where ca.revendedor_id = v_rev
      order by ca.size_id
    loop
      select * into v_prod from products where id = v_ca.product_id;
      if not found then raise exception 'produto indisponível'; end if;
      if not v_prod.ativo then
        raise exception 'produto indisponível: %', v_prod.nome;
      end if;
      select * into v_color from product_colors
        where id = v_ca.color_id and product_id = v_prod.id;
      if not found then raise exception 'cor indisponível: %', v_prod.nome; end if;
      select * into v_size from product_sizes
        where id = v_ca.size_id and color_id = v_color.id
        for update;
      if not found then raise exception 'tamanho indisponível: %', v_prod.nome; end if;

      -- Um size_id só aparece uma vez por revendedor (unique + checagens de
      -- cor/tamanho acima), então a linha é o total pedido daquele SKU.
      if v_size.estoque < v_ca.quantidade then
        raise exception 'estoque insuficiente: % - % - % (disponível: %)',
          v_prod.nome, v_color.nome, v_size.tamanho, v_size.estoque;
      end if;

      v_pct := null;
      select c.desconto_atacado_percentual into v_pct from categorias c where c.id = v_prod.categoria_id;
      v_preco := _preco_atacado(v_prod.preco, v_prod.preco_atacado, v_pct);
      v_qtd := v_ca.quantidade;
      v_prod_total := v_prod_total + v_preco * v_qtd;

      insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
        color_id, size_id, quantidade, preco_unit, subtotal)
      values (v_order_id, v_prod.id, v_prod.nome, v_color.nome, v_size.tamanho,
        v_color.id, v_size.id, v_qtd, v_preco, v_preco * v_qtd);

      v_mp_itens := v_mp_itens || jsonb_build_object(
        'titulo', concat_ws(' - ', v_prod.nome, v_color.nome, v_size.tamanho),
        'quantidade', v_qtd,
        'preco_unit', v_preco);
    end loop;

    -- Conta sobre o que de fato foi gravado no pedido. A exceção desfaz o
    -- pedido inteiro (nenhum pedido é criado abaixo do mínimo).
    -- Mínimo do atacado: 12 PEÇAS (soma de quantidade), não 12 modelos/SKUs distintos.
    -- Três pares do mesmo modelo e tamanho valem 3. O bônus (inserido depois) não entra na conta.
    select coalesce(sum(i.quantidade), 0)::int into v_skus
    from order_items i where i.order_id = v_order_id;
    if not v_premium and v_skus < v_min then
      raise exception 'mínimo de % peças (carrinho tem %)', v_min, v_skus;
    end if;

    -- ===== BÔNUS (spec 27/10 §4): não acumula, recalculado a cada pedido =====
    -- Entra depois da checagem de 12 peças e não vai para v_mp_itens (o Mercado Pago só vê itens pagos).
    select coalesce(sum(i.quantidade), 0)::int into v_pecas from order_items i where i.order_id = v_order_id;
    select * into v_cfg from admin_config where id = 1;
    if v_cfg.bonus_ativo and v_cfg.bonus_produto_id is not null and v_pecas >= v_cfg.bonus_min_pecas then
      select ps.* into v_bsize
      from product_sizes ps
      join product_colors pc on pc.id = ps.color_id
      join products p on p.id = pc.product_id
      where p.id = v_cfg.bonus_produto_id and p.ativo
        -- estoque disponível = estoque menos o que este pedido já reservou nesse mesmo size_id
        and ps.estoque - coalesce((select sum(oi.quantidade) from order_items oi
              where oi.order_id = v_order_id and oi.size_id = ps.id), 0) >= v_cfg.bonus_quantidade
      order by ps.estoque - coalesce((select sum(oi.quantidade) from order_items oi
              where oi.order_id = v_order_id and oi.size_id = ps.id), 0) desc, ps.id
      limit 1
      for update of ps skip locked;
      if found then
        select * into v_bcolor from product_colors where id = v_bsize.color_id;
        select * into v_bprod from products where id = v_cfg.bonus_produto_id;
        insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
          color_id, size_id, quantidade, preco_unit, subtotal)
        values (v_order_id, v_bprod.id, v_bprod.nome, v_bcolor.nome, v_bsize.tamanho,
          v_bcolor.id, v_bsize.id, v_cfg.bonus_quantidade, 0, 0);
        update orders set bonus_aplicado = true where id = v_order_id;
      else
        update orders set bonus_aviso = 'bônus indisponível: sem estoque, produto inativo ou em uso por outro pedido'
        where id = v_order_id;
      end if;
    end if;

    update orders set valor_produtos = v_prod_total,
                      valor_total = v_prod_total + coalesce(v_taxa,0)
    where id = v_order_id;

    -- Sem pagamento no site: o pedido já está feito, então o carrinho esvazia agora.
    delete from carrinho_atacado where revendedor_id = v_rev;

    return jsonb_build_object('id', v_order_id, 'entrega_taxa', coalesce(v_taxa, 0),
      'itens', coalesce(v_mp_itens, '[]'::jsonb));
  end if;

  -- ===== VAREJO (corpo de 0007; customer_id da sessão, revendedor_id nulo) =====
  if not coalesce((select c.varejo_ativo from admin_config c where c.id = 1), false) then
    raise exception 'varejo desativado';
  end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'carrinho vazio';
  end if;

  -- taxa de entrega
  if p_entrega_tipo = 'entrega' then
    select taxa_entrega_local into v_taxa from admin_config where id = 1;
  end if;

  insert into orders(status, cliente_nome, cliente_telefone, entrega_tipo, entrega_taxa,
    endereco_rua, endereco_numero, endereco_bairro, endereco_complemento, endereco_cep, endereco_cidade,
    is_atacado, customer_id, revendedor_id, valor_produtos, valor_total)
  values ('pendente', p_cliente_nome, regexp_replace(p_cliente_telefone,'\D','','g'),
    p_entrega_tipo, coalesce(v_taxa,0),
    p_endereco_rua, p_endereco_numero, p_endereco_bairro, p_endereco_complemento, p_endereco_cep,
    case when p_entrega_tipo = 'entrega_fora' then p_endereco_cidade else null end,
    false, v_uid, null, 0, 0)
  returning id into v_order_id;

  -- Ordena por size_id (nulls last) => travas `for update` sempre na mesma ordem (deadlock-safe).
  for v_item in
    select t.value
    from jsonb_array_elements(p_items) as t(value)
    order by nullif(t.value->>'size_id','')::uuid nulls last
  loop
    v_qtd := (v_item->>'quantidade')::int;
    if v_qtd is null or v_qtd < 1 then raise exception 'quantidade inválida'; end if;

    select * into v_prod  from products       where id = (v_item->>'produto_id')::uuid and ativo;
    if not found then raise exception 'produto indisponível'; end if;
    select * into v_color from product_colors where id = (v_item->>'color_id')::uuid and product_id = v_prod.id;
    if not found then raise exception 'cor indisponível'; end if;

    if nullif(v_item->>'size_id','') is not null then
      select * into v_size from product_sizes where id = (v_item->>'size_id')::uuid and color_id = v_color.id
        for update;
      if not found then raise exception 'tamanho indisponível'; end if;
      -- Soma a quantidade pedida para este size_id em todo o carrinho (evita oversell do mesmo SKU repetido).
      select coalesce(sum((it->>'quantidade')::int), 0) into v_qtd_total
      from jsonb_array_elements(p_items) as it
      where nullif(it->>'size_id','')::uuid = nullif(v_item->>'size_id','')::uuid;
      if v_size.estoque < v_qtd_total then raise exception 'estoque insuficiente'; end if;
    end if;

    v_preco := _preco_varejo(v_prod.preco, _desconto_efetivo(v_prod));
    v_prod_total := v_prod_total + v_preco * v_qtd;

    insert into order_items(order_id, produto_id, produto_nome, produto_cor, produto_tamanho,
      color_id, size_id, quantidade, preco_unit, subtotal)
    values (v_order_id, v_prod.id, v_prod.nome, v_color.nome,
      case when nullif(v_item->>'size_id','') is not null then v_size.tamanho else null end,
      v_color.id, nullif(v_item->>'size_id','')::uuid, v_qtd, v_preco, v_preco * v_qtd);

    -- Linhas precificadas server-side para montar a preferência Mercado Pago.
    -- É esta a fonte da verdade do valor cobrado — nunca o preço vindo do cliente.
    v_mp_itens := v_mp_itens || jsonb_build_object(
      'titulo', concat_ws(' - ', v_prod.nome, v_color.nome,
         case when nullif(v_item->>'size_id','') is not null then v_size.tamanho end),
      'quantidade', v_qtd,
      'preco_unit', v_preco);
  end loop;

  update orders set valor_produtos = v_prod_total,
                    valor_total = v_prod_total + coalesce(v_taxa,0)
  where id = v_order_id;

  return jsonb_build_object('id', v_order_id, 'entrega_taxa', coalesce(v_taxa, 0),
    'itens', coalesce(v_mp_itens, '[]'::jsonb));
end $$;


-- Convidado fechado (decisão 1(a)): só authenticated executa o checkout. O ramo de atacado
-- continua exigindo revendedor aprovado; o de varejo exige a flag varejo_ativo.
revoke all on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
from public, anon;
grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to authenticated;

create or replace function admin_update_order_status(p_id uuid, p_status order_status)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_atual order_status; v_pag text;
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_status = 'pago' then
    raise exception 'use a liquidação manual para marcar como pago';
  end if;
  select status, mp_payment_id into v_atual, v_pag from orders where id = p_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  -- Aguardando pagamento ('pendente') só vem de 'Em separação' ('preparando') e só se nada foi pago
  -- (pedido já liquidado tem mp_payment_id e voltaria a baixar estoque).
  if p_status = 'pendente' and v_atual <> 'pendente'
     and not (v_atual = 'preparando' and v_pag is null) then
    raise exception 'pedido não pode voltar a pendente';
  end if;
  if v_atual = 'pendente' and p_status not in ('pendente', 'cancelado') then
    raise exception 'pedido pendente só pode ser cancelado ou liquidado como pago';
  end if;
  -- Sem pagamento registrado não há retirada nem entrega: só separação, aguardando pagamento ou cancelado.
  if v_atual = 'preparando' and v_pag is null and p_status not in ('preparando', 'pendente', 'cancelado') then
    raise exception 'pedido sem pagamento só pode ir para aguardando pagamento ou ser cancelado';
  end if;
  update orders set status = p_status where id = p_id;
end $$;

-- Liquidação manual: aceita 'pendente' (aguardando pagamento) e 'preparando' ainda sem pagamento
-- (cliente pagou no balcão antes de a vendedora marcar aguardando). Idempotente.
create or replace function admin_settle_order(
  p_order_id uuid, p_forma_pagamento text default 'Manual'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ord orders;
begin
  perform assert_papel(array['superadmin','admin']);
  select * into v_ord from orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if not (v_ord.status = 'pendente' or (v_ord.status = 'preparando' and v_ord.mp_payment_id is null)) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  perform _settle_order(p_order_id, 'manual-' || gen_random_uuid()::text,
    coalesce(p_forma_pagamento, 'Manual'));
  return jsonb_build_object('ok', true);
end $$;
