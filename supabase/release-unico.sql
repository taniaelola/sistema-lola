-- =====================================================================
-- release-unico.sql  (GERADO por scripts/build-release-sql.mjs; NÃO edite à mão)
-- Conteúdo: migrações 0004_auth_perfis.sql, 0005_admin_por_sessao.sql, 0006_atacado.sql, 0007_cms_textos_promos.sql, 0008_checkout_atacado.sql nessa ordem + bloco final do dono.
-- As migrações 0001 a 0003 JÁ estão aplicadas em produção e não fazem parte deste arquivo.
-- =====================================================================
--
-- PRÉ-REQUISITOS BLOQUEANTES (faça ANTES de rodar este SQL)
--   1. Supabase > Authentication > Providers > Email: LIGADO, com
--      "Confirm email" = ON (BLOQUEANTE: sem isso qualquer pessoa poderia
--      assumir o papel de um e-mail convidado sem ser dona dele).
--      Senha mínima: 8.
--   2. Supabase > Authentication > URL Configuration:
--        Site URL         = https://<seu-dominio>
--        Redirect URLs    = https://<seu-dominio>/entrar
--                           https://<seu-dominio>/entrar/redefinir
--      URLs exatas, SEM curinga (nada de ** nem *).
--   3. Cloudflare > Worker > Variables and secrets (e Build > Variables): NEXT_PUBLIC_SITE_URL = https://<seu-dominio>
--      (Production e Preview) e redeploy depois de salvar.
--   4. Edite o e-mail do dono no BLOCO FINAL deste arquivo (procure por
--      SEU_EMAIL_AQUI@exemplo.com). O bloco aborta se o e-mail não for trocado.
--   5. BLOQUEANTE (anti sequestro de conta): abra Authentication > Users e, se
--      existir conta NÃO confirmada com o e-mail do dono (ou de qualquer
--      funcionário a convidar), APAGUE-A antes de rodar este SQL e antes de
--      cada convite de equipe. Para o dono use somente 'Add user' com
--      'Auto Confirm User'. (Convite de equipe só vale para conta criada
--      DEPOIS dele; conta anterior nunca é promovida pelo trigger.)
--
-- ORDEM DE EXECUÇÃO
--   1. Rode ESTE arquivo inteiro no SQL Editor do projeto Supabase da LOLA
--      (uma vez, antes do merge).
--   2. Só então mergeie o PR (o deploy novo já espera este esquema).
--   3. Crie a conta do dono:
--        - SOMENTE por Supabase > Authentication > Users > Add user (e-mail do
--          dono, senha, marcar "Auto Confirm User"). Não use o cadastro público
--          em /entrar para o dono.
--      Se a conta for criada DEPOIS deste SQL, o convite gravado no bloco final
--      a torna superadmin automaticamente ao confirmar o e-mail. Se a conta já
--      existia e estava confirmada, o bloco final já a promoveu.
--   4. Rode supabase/smoke.sql (somente leitura) e confira que tudo está ok=true.
--   5. Passe docs/QA.md.
--
-- AVISOS
--   * JANELA: entre rodar este SQL e o deploy publicar, o admin antigo e o
--     checkout atual falham (assinaturas antigas removidas). Rode o SQL e
--     mergeie em seguida, em horário de pouco movimento.
--   * NUNCA reaplique 0002 nem 0007 depois do 0008: reabriria p_customer_id,
--     criaria sobrecarga ambígua de checkout_iniciar_pedido (PGRST203) e
--     perderia a limpeza do carrinho de atacado em _settle_order.
--   * Rode este arquivo uma vez. A re-execução é segura para as partes
--     idempotentes (create or replace, if not exists), mas não reaplique
--     migrações antigas depois dele.
-- =====================================================================

-- =====================================================================
-- >>> 0004_auth_perfis.sql
-- =====================================================================

-- =====================================================================
-- 0004_auth_perfis.sql — perfis (Supabase Auth), convites de papel e assert_papel
-- Substitui o antigo 0004_revendedores.sql (nunca aplicado; revendedores vão para 0006).
-- Regra central: o papel NUNCA vem de metadado do cliente. Papéis de equipe
-- (superadmin, admin, supervisor) só por convite + e-mail confirmado, ou por
-- um superadmin/admin via admin_set_user/admin_invite_user.
-- =====================================================================

set search_path = public, extensions;

-- ========== ENUM ==========
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'papel_usuario' and n.nspname = 'public'
  ) then
    create type public.papel_usuario as enum
      ('superadmin','admin','supervisor','revendedor','cliente');
  end if;
end $$;

-- ========== TABELAS ==========
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null default '',
  papel papel_usuario not null default 'cliente',
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on profiles(email);
create index if not exists profiles_papel_idx on profiles(papel);

create table if not exists convites_papel (
  email text primary key check (email = lower(email) and email <> ''),
  papel papel_usuario not null,
  created_at timestamptz not null default now()
);

alter table profiles       enable row level security;
alter table convites_papel enable row level security;

drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles
  for select to authenticated using (id = (select auth.uid()));
-- Sem policy de escrita em profiles; convites_papel sem policy alguma.

revoke all on table profiles       from anon, authenticated;
revoke all on table convites_papel from anon, authenticated;
grant select on table profiles to authenticated;

-- ========== TRIGGER EM auth.users ==========
-- Papel inicial: convite (só com e-mail confirmado) > 'revendedor' se metadado
-- tipo='revendedor' > 'cliente'. Em linha já existente o metadado é ignorado
-- (o usuário pode editá-lo a qualquer momento) e o papel só muda por convite.
-- Não rebaixa papel de equipe: convite de nível menor não reduz quem já é
-- equipe; rebaixar é só via admin_set_user (que também apaga o convite).
-- Convite é de uso único: consumido (apagado) assim que é lido com e-mail confirmado.
create or replace function public.handle_auth_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email   text := lower(coalesce(new.email, ''));
  v_nome    text := coalesce(trim(new.raw_user_meta_data->>'nome'), '');
  v_convite papel_usuario;
  v_inicial papel_usuario;
begin
  if new.email_confirmed_at is not null and v_email <> '' then
    perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
    -- Convite de equipe só vale para conta criada DEPOIS dele (anti pré-cadastro:
    -- conta anterior ao convite é promovida só por admin_set_user / bloco do dono).
    select c.papel into v_convite from convites_papel c
    where c.email = v_email
      and (c.papel not in ('superadmin','admin','supervisor')
           or new.created_at >= c.created_at);
  end if;

  v_inicial := coalesce(
    v_convite,
    case when new.raw_user_meta_data->>'tipo' = 'revendedor'
         then 'revendedor'::papel_usuario
         else 'cliente'::papel_usuario end);

  insert into profiles as p (id, email, nome, papel)
  values (new.id, v_email, v_nome, v_inicial)
  on conflict (id) do update set
    email = excluded.email,
    nome  = case when p.nome = '' then excluded.nome else p.nome end,
    papel = case
      when v_convite is null then p.papel
      when p.papel in ('superadmin','admin','supervisor')
       and (case v_convite when 'superadmin' then 3 when 'admin' then 2
                           when 'supervisor' then 1 else 0 end)
         < (case p.papel   when 'superadmin' then 3 when 'admin' then 2
                           when 'supervisor' then 1 else 0 end)
        then p.papel
      else v_convite
    end;

  if v_convite is not null then
    delete from convites_papel where email = v_email;
  end if;

  return new;
end $$;

drop trigger if exists lola_on_auth_user on auth.users;
create trigger lola_on_auth_user
  after insert or update of email_confirmed_at, email on auth.users
  for each row execute function public.handle_auth_user();

-- Backfill: contas já existentes ganham perfil (sem erro se auth.users vazia).
insert into profiles (id, email, nome, papel)
select
  u.id,
  lower(coalesce(u.email, '')),
  coalesce(trim(u.raw_user_meta_data->>'nome'), ''),
  coalesce(
    case when u.email_confirmed_at is not null then c.papel end,
    case when u.raw_user_meta_data->>'tipo' = 'revendedor'
         then 'revendedor'::papel_usuario
         else 'cliente'::papel_usuario end)
from auth.users u
left join convites_papel c on c.email = lower(u.email)
on conflict (id) do nothing;

-- ========== ASSERT ==========
-- Lança 'sem permissão' se não há sessão, perfil ausente/inativo ou papel fora
-- da lista. Retorna o papel do chamador (uso: v_meu := assert_papel(array[...])).
create or replace function assert_papel(p_papeis text[])
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_papel papel_usuario;
  v_ativo boolean;
begin
  if v_uid is null then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  select p.papel, p.ativo into v_papel, v_ativo from profiles p where p.id = v_uid;
  if not found or not coalesce(v_ativo, false)
     or not coalesce(v_papel::text = any(p_papeis), false) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return v_papel::text;
end $$;

-- ========== PERFIL DO CHAMADOR ==========
create or replace function get_my_profile()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  return (select to_jsonb(p) from profiles p where p.id = auth.uid());
end $$;

create or replace function touch_ultimo_acesso()
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then return; end if;
  update profiles set ultimo_acesso = now() where id = auth.uid();
end $$;

-- ========== GESTÃO DE USUÁRIOS (spec §4.4) ==========
-- Só superadmin mexe em superadmin (linha atual ou papel novo); admin gerencia
-- os demais; ninguém altera a si mesmo; sempre resta um superadmin ativo.
-- Mudanças de papel serializadas por advisory lock e o chamador é revalidado
-- depois do lock.
create or replace function admin_list_users()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', p.email, 'nome', p.nome, 'papel', p.papel,
      'ativo', p.ativo, 'ultimo_acesso', p.ultimo_acesso, 'created_at', p.created_at
    ) order by p.created_at desc)
    from profiles p
  ), '[]'::jsonb);
end $$;

create or replace function admin_set_user(p_id uuid, p_papel text, p_ativo boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meu        text;
  v_alvo       profiles;
  v_novo       papel_usuario;
  v_novo_ativo boolean;
  v_confirmado boolean;
begin
  perform assert_papel(array['superadmin','admin']);
  if p_id is null then raise exception 'usuário não encontrado'; end if;
  if p_id = auth.uid() then
    raise exception 'não é possível alterar o próprio usuário';
  end if;
  if p_papel is not null
     and not (p_papel = any(enum_range(null::papel_usuario)::text[])) then
    raise exception 'papel inválido';
  end if;

  perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
  v_meu := assert_papel(array['superadmin','admin']);

  select * into v_alvo from profiles where id = p_id for update;
  if not found then raise exception 'usuário não encontrado'; end if;

  v_novo       := coalesce(p_papel::papel_usuario, v_alvo.papel);
  v_novo_ativo := coalesce(p_ativo, v_alvo.ativo);

  if (v_alvo.papel = 'superadmin' or v_novo = 'superadmin') and v_meu <> 'superadmin' then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  if v_novo <> v_alvo.papel and v_novo in ('superadmin','admin','supervisor') then
    select u.email_confirmed_at is not null into v_confirmado
    from auth.users u where u.id = p_id;
    if not coalesce(v_confirmado, false) then
      raise exception 'e-mail do usuário ainda não confirmado';
    end if;
  end if;

  if v_alvo.papel = 'superadmin' and v_alvo.ativo
     and (v_novo <> 'superadmin' or not v_novo_ativo)
     and not exists (
       select 1 from profiles
       where papel = 'superadmin' and ativo and id <> v_alvo.id) then
    raise exception 'é preciso manter ao menos um superadmin ativo';
  end if;

  update profiles set papel = v_novo, ativo = v_novo_ativo where id = p_id;

  -- Sem isto, uma nova confirmação/troca de e-mail reaplicaria o convite antigo.
  if v_novo <> v_alvo.papel then
    delete from convites_papel
    where email = v_alvo.email and (v_meu = 'superadmin' or papel <> 'superadmin');
  end if;
end $$;

create or replace function admin_invite_user(p_email text, p_papel text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meu   text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_papel papel_usuario;
  v_atual papel_usuario;
  v_aplicado boolean := false;
  r       record;
begin
  perform assert_papel(array['superadmin','admin']);
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'e-mail inválido';
  end if;
  if p_papel is null
     or not (p_papel = any(enum_range(null::papel_usuario)::text[])) then
    raise exception 'papel inválido';
  end if;
  v_papel := p_papel::papel_usuario;

  perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
  v_meu := assert_papel(array['superadmin','admin']);

  if v_papel = 'superadmin' and v_meu <> 'superadmin' then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  select c.papel into v_atual from convites_papel c where c.email = v_email for update;
  if v_atual = 'superadmin' and v_meu <> 'superadmin' then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  for r in
    select p.id, p.papel, p.ativo, (u.email_confirmed_at is not null) as confirmado
    from profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = v_email
    for update of p
  loop
    if r.id = auth.uid() then
      raise exception 'não é possível alterar o próprio usuário';
    end if;
    if r.papel = 'superadmin' and v_meu <> 'superadmin' then
      raise exception 'sem permissão' using errcode = '42501';
    end if;
    if r.confirmado then
      if r.papel = 'superadmin' and r.ativo and v_papel <> 'superadmin'
         and not exists (
           select 1 from profiles
           where papel = 'superadmin' and ativo and id <> r.id) then
        raise exception 'é preciso manter ao menos um superadmin ativo';
      end if;
      update profiles set papel = v_papel where id = r.id;
      v_aplicado := true;
    end if;
  end loop;

  -- Convite de uso único: aplicado na hora não fica pendente.
  if v_aplicado then
    delete from convites_papel where email = v_email;
  else
    insert into convites_papel (email, papel) values (v_email, v_papel)
    on conflict (email) do update set papel = excluded.papel, created_at = now();
  end if;
end $$;

create or replace function admin_list_convites()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'email', c.email, 'papel', c.papel, 'created_at', c.created_at
    ) order by c.created_at desc)
    from convites_papel c
  ), '[]'::jsonb);
end $$;

create or replace function admin_delete_convite(p_email text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meu   text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_atual papel_usuario;
begin
  perform assert_papel(array['superadmin','admin']);
  perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
  v_meu := assert_papel(array['superadmin','admin']);

  select c.papel into v_atual from convites_papel c where c.email = v_email for update;
  if not found then raise exception 'convite não encontrado'; end if;
  if v_atual = 'superadmin' and v_meu <> 'superadmin' then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  delete from convites_papel where email = v_email;
end $$;

-- ========== PRIVILÉGIOS ==========
-- O Supabase concede EXECUTE a anon/authenticated por padrão; revogar tudo e
-- conceder só o necessário. Nada aqui é público (anon).
revoke all on function
  public.handle_auth_user(),
  assert_papel(text[]),
  get_my_profile(),
  touch_ultimo_acesso(),
  admin_list_users(),
  admin_set_user(uuid, text, boolean),
  admin_invite_user(text, text),
  admin_list_convites(),
  admin_delete_convite(text)
from public, anon, authenticated;

grant execute on function
  get_my_profile(),
  touch_ultimo_acesso(),
  admin_list_users(),
  admin_set_user(uuid, text, boolean),
  admin_invite_user(text, text),
  admin_list_convites(),
  admin_delete_convite(text)
to authenticated;

-- =====================================================================
-- >>> 0005_admin_por_sessao.sql
-- =====================================================================

-- =====================================================================
-- 0005_admin_por_sessao.sql — RPCs admin_* autenticadas por sessão + papel
-- Substitui as admin_* de 0002_functions.sql: sai o parâmetro p_secret e o
-- assert_admin (senha única); entra assert_papel(array[...]) conforme a matriz
-- do spec §4.4. Corpos idênticos aos de 0002, exceto a autorização, o
-- mascaramento de valores para supervisor em admin_list_sales e a trava de
-- 'pago' em admin_update_order_status. Novas: admin_set_destaque, admin_estoque_baixo.
-- A assinatura antiga é derrubada antes porque remover p_secret muda a
-- assinatura (create or replace criaria uma sobrecarga em vez de substituir).
-- Webhook (assert_webhook, mp_register_order_payment, _settle_order) não muda.
-- admin_config.secret_hash permanece como coluna legada, mas é zerada no fim.
-- =====================================================================

set search_path = public, extensions;

-- ========== PRODUTOS ==========
drop function if exists admin_list_products(text);
create or replace function admin_list_products()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return coalesce((select jsonb_agg(_product_json(p) order by p.ordem, p.nome) from products p), '[]'::jsonb);
end $$;

drop function if exists admin_upsert_product(text, uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text);
create or replace function admin_upsert_product(
  p_id uuid, p_nome text, p_categoria_id uuid, p_colecao text,
  p_preco numeric, p_desconto_percentual int, p_preco_atacado numeric, p_descricao text,
  p_caracteristicas text[], p_ativo boolean, p_destaque boolean, p_ordem int, p_slug text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text;
begin
  perform assert_papel(array['superadmin','admin']);
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    insert into products(nome,categoria_id,colecao,preco,desconto_percentual,preco_atacado,
      descricao,caracteristicas,ativo,destaque,ordem,slug)
    values (p_nome,p_categoria_id,p_colecao,p_preco,nullif(p_desconto_percentual,0),p_preco_atacado,
      p_descricao,coalesce(p_caracteristicas,'{}'),p_ativo,p_destaque,coalesce(p_ordem,0),v_slug)
    returning id into v_id;
  else
    update products set nome=p_nome, categoria_id=p_categoria_id, colecao=p_colecao, preco=p_preco,
      desconto_percentual=nullif(p_desconto_percentual,0), preco_atacado=p_preco_atacado,
      descricao=p_descricao, caracteristicas=coalesce(p_caracteristicas,'{}'), ativo=p_ativo,
      destaque=p_destaque, ordem=coalesce(p_ordem,0), slug=v_slug
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

drop function if exists admin_delete_product(text, uuid);
create or replace function admin_delete_product(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  delete from products where id = p_id;
end $$;

drop function if exists admin_set_ativo(text, uuid, boolean);
create or replace function admin_set_ativo(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  update products set ativo = p_ativo where id = p_id;
end $$;

drop function if exists admin_set_desconto(text, uuid, int);
create or replace function admin_set_desconto(p_id uuid, p_desconto_percentual int)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  update products set desconto_percentual = nullif(p_desconto_percentual,0) where id = p_id;
end $$;

drop function if exists admin_set_surpresa(text, uuid, boolean);
create or replace function admin_set_surpresa(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  if p_id is null then raise exception 'id obrigatório'; end if;
  if p_ativo then update products set surpresa_ativo = (id = p_id);
  else update products set surpresa_ativo = false where id = p_id; end if;
end $$;

-- Versão antiga (com p_secret) veio do release-unico.sql anterior; pode não existir.
drop function if exists admin_set_destaque(text, uuid, boolean);
create or replace function admin_set_destaque(p_id uuid, p_destaque boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  update products set destaque = p_destaque where id = p_id;
end $$;

-- ========== CORES E TAMANHOS ==========
drop function if exists admin_upsert_color(text, uuid, uuid, text, text, text[], int);
create or replace function admin_upsert_color(
  p_id uuid, p_product_id uuid, p_nome text, p_hex text,
  p_imagens text[], p_ordem int
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform assert_papel(array['superadmin','admin']);
  if p_id is null then
    insert into product_colors(product_id, nome, hex, imagens, ordem)
    values (p_product_id, p_nome, p_hex, coalesce(p_imagens,'{}'), coalesce(p_ordem,0))
    returning id into v_id;
  else
    update product_colors set product_id=p_product_id, nome=p_nome, hex=p_hex,
      imagens=coalesce(p_imagens,'{}'), ordem=coalesce(p_ordem,0)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

drop function if exists admin_delete_color(text, uuid);
create or replace function admin_delete_color(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  delete from product_colors where id = p_id;
end $$;

drop function if exists admin_upsert_size(text, uuid, uuid, text, int);
create or replace function admin_upsert_size(
  p_id uuid, p_color_id uuid, p_tamanho text, p_estoque int
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform assert_papel(array['superadmin','admin']);
  if p_estoque is null or p_estoque < 0 then raise exception 'estoque inválido'; end if;
  if p_id is null then
    insert into product_sizes(color_id, tamanho, estoque)
    values (p_color_id, p_tamanho, p_estoque)
    returning id into v_id;
  else
    update product_sizes set color_id=p_color_id, tamanho=p_tamanho,
      estoque=p_estoque
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

drop function if exists admin_delete_size(text, uuid);
create or replace function admin_delete_size(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  delete from product_sizes where id = p_id;
end $$;

-- ========== CATEGORIAS ==========
drop function if exists admin_list_categorias(text);
create or replace function admin_list_categorias()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.grupo, c.ordem, c.nome) from categorias c), '[]'::jsonb);
end $$;

drop function if exists admin_upsert_categoria(text, uuid, text, text, text, int, boolean, int);
create or replace function admin_upsert_categoria(
  p_id uuid, p_grupo text, p_nome text, p_slug text, p_ordem int,
  p_ativo boolean, p_desconto_atacado_percentual int
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text;
begin
  perform assert_papel(array['superadmin','admin']);
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    insert into categorias(grupo, nome, slug, ordem, ativo, desconto_atacado_percentual)
    values (p_grupo, p_nome, v_slug, coalesce(p_ordem,0), coalesce(p_ativo,true),
      p_desconto_atacado_percentual)
    returning id into v_id;
  else
    update categorias set grupo=p_grupo, nome=p_nome, slug=v_slug, ordem=coalesce(p_ordem,0),
      ativo=coalesce(p_ativo,true), desconto_atacado_percentual=p_desconto_atacado_percentual
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

drop function if exists admin_delete_categoria(text, uuid);
create or replace function admin_delete_categoria(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  if exists (select 1 from products where categoria_id = p_id) then
    raise exception 'categoria tem produtos';
  end if;
  delete from categorias where id = p_id;
end $$;

-- ========== PEDIDOS ==========
drop function if exists admin_list_orders(text, text);
create or replace function admin_list_orders(p_filtro text default 'todos')
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((
    select jsonb_agg(
      (_order_json(o.id) || jsonb_build_object(
        'cliente_telefone', o.cliente_telefone, 'mp_payment_id', o.mp_payment_id,
        'forma_pagamento', o.forma_pagamento, 'revendedor_id', o.revendedor_id))
      order by o.created_at desc)
    from orders o
    where (p_filtro = 'todos' or p_filtro is null)
       or (p_filtro = 'varejo'  and o.is_atacado = false)
       or (p_filtro = 'atacado' and o.is_atacado = true)
  ), '[]'::jsonb);
end $$;

drop function if exists admin_update_order_status(text, uuid, order_status);
-- 'pago' só via admin_settle_order (que baixa estoque e grava a venda); nenhum
-- pedido volta a 'pendente' (reabriria a liquidação e baixaria estoque de novo);
-- pendente só sai para 'cancelado' (sem pagamento não há preparo/envio/entrega).
create or replace function admin_update_order_status(p_id uuid, p_status order_status)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_atual order_status;
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_status = 'pago' then
    raise exception 'use a liquidação manual para marcar como pago';
  end if;
  select status into v_atual from orders where id = p_id for update;
  if p_status = 'pendente' and v_atual <> 'pendente' then
    raise exception 'pedido não pode voltar a pendente';
  end if;
  if v_atual = 'pendente' and p_status not in ('pendente', 'cancelado') then
    raise exception 'pedido pendente só pode ser cancelado ou liquidado como pago';
  end if;
  update orders set status = p_status where id = p_id;
end $$;

-- Liquidação manual pelo painel quando o webhook não chegou: reaproveita
-- _settle_order (baixa estoque + grava `sales`) em vez de só trocar o enum,
-- que perderia a venda do razão. Idempotente: só age se o pedido está pendente.
-- Efeito financeiro (estoque + venda): só superadmin/admin, não supervisor.
drop function if exists admin_settle_order(text, uuid, text);
create or replace function admin_settle_order(
  p_order_id uuid, p_forma_pagamento text default 'Manual'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ord orders;
begin
  perform assert_papel(array['superadmin','admin']);
  select * into v_ord from orders where id = p_order_id for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ord.status <> 'pendente' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  perform _settle_order(p_order_id, 'manual-' || gen_random_uuid()::text,
    coalesce(p_forma_pagamento, 'Manual'));
  return jsonb_build_object('ok', true);
end $$;

-- ========== ESTOQUE BAIXO (visão geral) ==========
-- Produtos ativos com estoque total (todas as cores/tamanhos) <= 5; sem tamanhos conta 0.
drop function if exists admin_estoque_baixo();
create or replace function admin_estoque_baixo()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'estoque', t.estoque)
      order by t.estoque, t.nome)
    from (
      select p.id, p.nome, coalesce(sum(s.estoque), 0)::int as estoque
      from products p
      left join product_colors c on c.product_id = p.id
      left join product_sizes s on s.color_id = c.id
      where p.ativo
      group by p.id, p.nome
    ) t
    where t.estoque <= 5
  ), '[]'::jsonb);
end $$;

-- ========== VENDAS ==========
-- Supervisor acompanha vendas sem o financeiro: preco_unit e valor_total saem nulos
-- (mesmas chaves e mesma ordenação do retorno original).
drop function if exists admin_list_sales(text, text);
create or replace function admin_list_sales(p_filtro text default 'todos')
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare v_papel text;
begin
  v_papel := assert_papel(array['superadmin','admin','supervisor']);
  return coalesce((select jsonb_agg(
      case when v_papel = 'supervisor'
        then to_jsonb(s) || jsonb_build_object('preco_unit', null, 'valor_total', null)
        else to_jsonb(s) end
      order by s.created_at desc) from sales s
    where (coalesce(p_filtro,'todos') = 'todos')
       or (p_filtro = 'varejo'  and s.is_atacado = false)
       or (p_filtro = 'atacado' and s.is_atacado = true)), '[]'::jsonb);
end $$;

drop function if exists admin_insert_sale(text, uuid, text, int, numeric, numeric, text, text, text, text, uuid, boolean);
create or replace function admin_insert_sale(
  p_produto_id uuid, p_produto_nome text, p_quantidade int, p_preco_unit numeric,
  p_valor_total numeric, p_forma_pagamento text, p_cliente text, p_produto_cor text,
  p_produto_tamanho text, p_size_id uuid, p_is_atacado boolean
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  insert into sales(produto_id,produto_nome,quantidade,preco_unit,valor_total,forma_pagamento,
    cliente,origem,is_atacado,produto_cor,produto_tamanho,status)
  values (p_produto_id,p_produto_nome,p_quantidade,p_preco_unit,p_valor_total,p_forma_pagamento,
    p_cliente,'manual',coalesce(p_is_atacado,false),p_produto_cor,p_produto_tamanho,'aprovado');
  if p_size_id is not null then
    update product_sizes set estoque = greatest(0, estoque - p_quantidade) where id = p_size_id;
  end if;
end $$;

drop function if exists admin_delete_sale(text, uuid);
create or replace function admin_delete_sale(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  delete from sales where id = p_id;
end $$;

-- ========== CONFIG DO SISTEMA (só superadmin) ==========
drop function if exists admin_get_config(text);
create or replace function admin_get_config()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin']);
  return (select jsonb_build_object('taxa_entrega_local', taxa_entrega_local,
    'whatsapp', whatsapp, 'cidade_taxa', cidade_taxa) from admin_config where id = 1);
end $$;

drop function if exists admin_set_config(text, numeric, text, text);
create or replace function admin_set_config(p_taxa numeric, p_whatsapp text, p_cidade text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin']);
  update admin_config set taxa_entrega_local = coalesce(p_taxa,0),
    whatsapp = coalesce(p_whatsapp,''), cidade_taxa = coalesce(p_cidade,'') where id = 1;
end $$;

-- ========== LEGADO DA SENHA ÚNICA ==========
-- RPCs de revendedor com p_secret do release-unico.sql anterior (podem não existir;
-- a Task do atacado recria com assinatura nova). Derrubadas para que nenhuma
-- função remanescente dependa de assert_admin.
drop function if exists admin_list_revendedores(text, text);
drop function if exists admin_set_revendedor_status(text, uuid, revendedor_status);
drop function if exists admin_upsert_revendedor(text, uuid, text, text);

drop function if exists admin_set_secret(text, text);
drop function if exists assert_admin(text);

-- ========== PRIVILÉGIOS ==========
-- O Supabase concede EXECUTE a anon/authenticated por padrão; nada aqui é público.
revoke all on function
  admin_list_products(),
  admin_upsert_product(uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text),
  admin_delete_product(uuid),
  admin_set_ativo(uuid, boolean),
  admin_set_desconto(uuid, int),
  admin_set_surpresa(uuid, boolean),
  admin_set_destaque(uuid, boolean),
  admin_upsert_color(uuid, uuid, text, text, text[], int),
  admin_delete_color(uuid),
  admin_upsert_size(uuid, uuid, text, int),
  admin_delete_size(uuid),
  admin_list_categorias(),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int),
  admin_delete_categoria(uuid),
  admin_list_orders(text),
  admin_update_order_status(uuid, order_status),
  admin_settle_order(uuid, text),
  admin_estoque_baixo(),
  admin_list_sales(text),
  admin_insert_sale(uuid, text, int, numeric, numeric, text, text, text, text, uuid, boolean),
  admin_delete_sale(uuid),
  admin_get_config(),
  admin_set_config(numeric, text, text)
from public, anon, authenticated;

grant execute on function
  admin_list_products(),
  admin_upsert_product(uuid, text, uuid, text, numeric, int, numeric, text, text[], boolean, boolean, int, text),
  admin_delete_product(uuid),
  admin_set_ativo(uuid, boolean),
  admin_set_desconto(uuid, int),
  admin_set_surpresa(uuid, boolean),
  admin_set_destaque(uuid, boolean),
  admin_upsert_color(uuid, uuid, text, text, text[], int),
  admin_delete_color(uuid),
  admin_upsert_size(uuid, uuid, text, int),
  admin_delete_size(uuid),
  admin_list_categorias(),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int),
  admin_delete_categoria(uuid),
  admin_list_orders(text),
  admin_update_order_status(uuid, order_status),
  admin_settle_order(uuid, text),
  admin_estoque_baixo(),
  admin_list_sales(text),
  admin_insert_sale(uuid, text, int, numeric, numeric, text, text, text, text, uuid, boolean),
  admin_delete_sale(uuid),
  admin_get_config(),
  admin_set_config(numeric, text, text)
to authenticated;

-- Senha única do admin aposentada: hash legado zerado (coluna mantida, nada mais o lê).
update admin_config set secret_hash = '' where id = 1;

-- =====================================================================
-- >>> 0006_atacado.sql
-- =====================================================================

-- =====================================================================
-- 0006_atacado.sql — revendedores, carrinho de atacado persistente e RPCs
-- Autoridade: spec do release §7 (Revendedores), §8, §9; spec-mãe §5.4, §5.5,
-- §6.4, §7, §11.
-- Regras centrais:
--   * Acesso ao atacado = revendedores.status = 'aprovado' do auth.uid(),
--     NUNCA só o papel do perfil.
--   * Preço de atacado sempre calculado no servidor (_preco_atacado).
--   * Vínculo conta <-> revendedor por e-mail só com e-mail confirmado.
--   * Metadado do cliente nunca concede papel de equipe.
-- checkout_iniciar_pedido e _settle_order NÃO mudam aqui (Task 9 usa
-- atacado_cart_clear_for).
-- =====================================================================

set search_path = public, extensions;

-- ========== TABELA ANTIGA (release-unico.sql anterior: nome, cidade) ==========
-- Se a versão de duas colunas chegou a ser aplicada, é preservada como legado
-- em vez de apagada; a nova tabela nasce limpa.
-- Constraints e índices também são renomeados (o novo revendedores_pkey colidiria).
do $$
declare r record;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'revendedores' and c.relkind = 'r'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'revendedores'
      and column_name = 'razao_social'
  ) then
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'revendedores_legado'
    ) then
      raise exception 'revendedores antiga e revendedores_legado coexistem; resolver manualmente';
    end if;
    alter table public.revendedores rename to revendedores_legado;
    for r in
      select con.conname from pg_constraint con
      where con.conrelid = 'public.revendedores_legado'::regclass
        and con.conname like 'revendedores%'
    loop
      execute format('alter table public.revendedores_legado rename constraint %I to %I',
        r.conname, 'legado_' || r.conname);
    end loop;
    for r in
      select ic.relname from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      where i.indrelid = 'public.revendedores_legado'::regclass
        and ic.relname like 'revendedores%'
    loop
      execute format('alter index public.%I rename to %I', r.relname, 'legado_' || r.relname);
    end loop;
    alter table public.revendedores_legado enable row level security;
    revoke all on table public.revendedores_legado from anon, authenticated;
  end if;
end $$;

-- ========== TABELAS ==========
create table if not exists revendedores (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null,
  razao_social text not null check (razao_social <> ''),
  cnpj         text,
  responsavel  text not null default '',
  email        text not null check (email = lower(email) and email <> ''),
  whatsapp     text not null default '',
  cidade       text not null default '',
  uf           text not null default '',
  status       revendedor_status not null default 'pendente',
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid
);
create unique index if not exists revendedores_email_key on revendedores(email);
create index if not exists revendedores_status_idx on revendedores(status);

-- size_id obrigatório: SKU de atacado = produto + cor + tamanho (estoque vive no tamanho).
create table if not exists carrinho_atacado (
  id            uuid primary key default gen_random_uuid(),
  revendedor_id uuid not null references revendedores(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  color_id      uuid not null references product_colors(id) on delete cascade,
  size_id       uuid not null references product_sizes(id) on delete cascade,
  quantidade    int  not null check (quantidade > 0),
  updated_at    timestamptz not null default now(),
  unique (revendedor_id, product_id, color_id, size_id)
);
create index if not exists carrinho_atacado_product_idx on carrinho_atacado(product_id);
create index if not exists carrinho_atacado_color_idx   on carrinho_atacado(color_id);
create index if not exists carrinho_atacado_size_idx    on carrinho_atacado(size_id);
create index if not exists orders_customer_idx   on orders(customer_id);
create index if not exists orders_revendedor_idx on orders(revendedor_id);

alter table revendedores     enable row level security;
alter table carrinho_atacado enable row level security;

drop policy if exists revendedores_self_select on revendedores;
create policy revendedores_self_select on revendedores
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists carrinho_atacado_self_select on carrinho_atacado;
create policy carrinho_atacado_self_select on carrinho_atacado
  for select to authenticated using (
    exists (
      select 1 from revendedores r
      where r.id = carrinho_atacado.revendedor_id
        and r.user_id = (select auth.uid())
    ));
-- Sem policies de escrita: tudo via RPC.

revoke all on table revendedores     from anon, authenticated;
revoke all on table carrinho_atacado from anon, authenticated;
-- Sem reviewed_at/reviewed_by: o revendedor não vê quem o revisou.
grant select (id, user_id, razao_social, cnpj, responsavel, email, whatsapp,
              cidade, uf, status, created_at)
  on table revendedores to authenticated;
grant select on table carrinho_atacado to authenticated;

-- orders.revendedor_id existe desde 0001 como uuid solto. NOT VALID: não
-- revalida linhas antigas (que podem apontar para ids da tabela legada);
-- vale para toda escrita nova.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'revendedor_id'
  ) and not exists (
    select 1 from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    where con.conrelid = 'public.orders'::regclass
      and con.contype = 'f'
      and a.attname = 'revendedor_id'
  ) then
    alter table public.orders
      add constraint orders_revendedor_id_fkey
      foreign key (revendedor_id) references public.revendedores(id)
      on delete set null not valid;
  end if;
end $$;

-- ========== PEDIDOS DO PRÓPRIO CLIENTE (spec-mãe §5.5) ==========
-- customer_id nulo nunca casa (NULL = uid é NULL); só a própria linha.
drop policy if exists orders_customer_select on orders;
create policy orders_customer_select on orders
  for select to authenticated using (
    customer_id is not null and customer_id = (select auth.uid()));

drop policy if exists order_items_customer_select on order_items;
create policy order_items_customer_select on order_items
  for select to authenticated using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.customer_id is not null
        and o.customer_id = (select auth.uid())
    ));

-- ========== TRIGGER EM auth.users (estende 0004) ==========
-- Corpo de 0004 preservado (lock, convite de uso único só com e-mail
-- confirmado, nunca rebaixa equipe, metadado ignorado em linha existente).
-- Acréscimo (só com e-mail confirmado, sob o mesmo advisory lock):
--   1. conta ainda sem revendedor vinculado + revendedores com o mesmo e-mail
--      e user_id nulo (cadastro manual do admin) => vincula;
--   2. senão, metadado tipo='revendedor' e nenhum revendedor com o e-mail =>
--      cria linha 'pendente' com os metadados (truncados);
--   3. havendo vínculo, perfil 'cliente' passa a 'revendedor'. Nada mais muda
--      de papel aqui; equipe nunca vem de metadado.
-- Falha no bloco de revendedor vira warning: o cadastro/confirmação não quebra.
create or replace function public.handle_auth_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email      text := lower(coalesce(new.email, ''));
  v_nome       text := left(coalesce(trim(new.raw_user_meta_data->>'nome'), ''), 200);
  v_convite    papel_usuario;
  v_inicial    papel_usuario;
  v_tipo_rev   boolean := coalesce(new.raw_user_meta_data->>'tipo', '') = 'revendedor';
  v_vinculado  boolean := false;
  v_razao      text;
begin
  if new.email_confirmed_at is not null and v_email <> '' then
    perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
    -- Convite de equipe só vale para conta criada DEPOIS dele (anti pré-cadastro:
    -- conta anterior ao convite é promovida só por admin_set_user / bloco do dono).
    select c.papel into v_convite from convites_papel c
    where c.email = v_email
      and (c.papel not in ('superadmin','admin','supervisor')
           or new.created_at >= c.created_at);
  end if;

  v_inicial := coalesce(
    v_convite,
    case when v_tipo_rev
         then 'revendedor'::papel_usuario
         else 'cliente'::papel_usuario end);

  insert into profiles as p (id, email, nome, papel)
  values (new.id, v_email, v_nome, v_inicial)
  on conflict (id) do update set
    email = excluded.email,
    nome  = case when p.nome = '' then excluded.nome else p.nome end,
    papel = case
      when v_convite is null then p.papel
      when p.papel in ('superadmin','admin','supervisor')
       and (case v_convite when 'superadmin' then 3 when 'admin' then 2
                           when 'supervisor' then 1 else 0 end)
         < (case p.papel   when 'superadmin' then 3 when 'admin' then 2
                           when 'supervisor' then 1 else 0 end)
        then p.papel
      else v_convite
    end;

  if v_convite is not null then
    delete from convites_papel where email = v_email;
  end if;

  if new.email_confirmed_at is not null and v_email <> '' then
    begin
      v_vinculado := exists (select 1 from revendedores r where r.user_id = new.id);

      if not v_vinculado then
        update revendedores set user_id = new.id
        where email = v_email and user_id is null;
        v_vinculado := found;
      end if;

      if not v_vinculado and v_tipo_rev
         and not exists (select 1 from revendedores r where r.email = v_email) then
        v_razao := left(coalesce(
          nullif(trim(left(coalesce(new.raw_user_meta_data->>'razao_social', ''), 400)), ''),
          nullif(v_nome, ''),
          v_email), 200);
        insert into revendedores
          (user_id, razao_social, cnpj, responsavel, email, whatsapp, status)
        values (
          new.id,
          v_razao,
          nullif(left(regexp_replace(
            left(coalesce(new.raw_user_meta_data->>'cnpj', ''), 200), '\D', '', 'g'), 20), ''),
          v_nome,
          v_email,
          left(regexp_replace(
            left(coalesce(new.raw_user_meta_data->>'whatsapp', ''), 200), '\D', '', 'g'), 20),
          'pendente')
        on conflict (email) do nothing;
        v_vinculado := found;
      end if;

      if v_vinculado then
        update profiles set papel = 'revendedor'
        where id = new.id and papel = 'cliente';
      end if;
    exception when others then
      raise warning 'handle_auth_user: vínculo de revendedor ignorado para %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end $$;

drop trigger if exists lola_on_auth_user on auth.users;
create trigger lola_on_auth_user
  after insert or update of email_confirmed_at, email on auth.users
  for each row execute function public.handle_auth_user();

-- ========== HELPERS INTERNOS ==========
-- id do revendedor aprovado do chamador (perfil ativo), ou erro.
create or replace function _atacado_revendedor_aprovado()
returns uuid language plpgsql security definer set search_path = public, extensions stable as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'revendedor não aprovado' using errcode = '42501';
  end if;
  select r.id into v_id
  from revendedores r
  join profiles p on p.id = r.user_id
  where r.user_id = auth.uid() and r.status = 'aprovado' and p.ativo;
  if v_id is null then
    raise exception 'revendedor não aprovado' using errcode = '42501';
  end if;
  return v_id;
end $$;

-- Esvazia o carrinho de um revendedor. Só para uso interno (webhook /
-- _settle_order, Task 9): sem grant a ninguém, sem security definer (roda no
-- contexto da função definer que a chama, como _settle_order).
create or replace function atacado_cart_clear_for(p_revendedor uuid)
returns void language plpgsql set search_path = public, extensions as $$
begin
  if p_revendedor is null then return; end if;
  delete from carrinho_atacado where revendedor_id = p_revendedor;
end $$;

-- ========== RPCs DO REVENDEDOR (spec-mãe §6.4) ==========
create or replace function atacado_me()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  if auth.uid() is null then return null; end if;
  return (
    select jsonb_build_object('id', r.id, 'status', r.status, 'razao_social', r.razao_social)
    from revendedores r where r.user_id = auth.uid());
end $$;

-- Itens de produto inativo seguem listados (disponivel=false), fora de
-- sku_distintos e total.
-- Preço: _preco_atacado(preco, override do produto, % da categoria) —
-- override > % da categoria > preço de tabela; desconto de varejo nunca entra.
create or replace function atacado_cart_get()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare
  v_rev   uuid := _atacado_revendedor_aprovado();
  v_itens jsonb;
  v_skus  int;
  v_total numeric;
begin
  with linhas as (
    select
      ca.id, ca.product_id, ca.color_id, ca.size_id, ca.quantidade, ca.updated_at,
      p.nome, p.slug, p.ativo,
      col.nome as cor,
      s.tamanho,
      s.estoque,
      col.imagens[1] as imagem,
      _preco_atacado(p.preco, p.preco_atacado, c.desconto_atacado_percentual) as preco_unit
    from carrinho_atacado ca
    join products p        on p.id = ca.product_id
    join categorias c      on c.id = p.categoria_id
    join product_colors col on col.id = ca.color_id and col.product_id = p.id
    join product_sizes s    on s.id = ca.size_id and s.color_id = col.id
    where ca.revendedor_id = v_rev
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'product_id', l.product_id, 'color_id', l.color_id, 'size_id', l.size_id,
      'nome', l.nome, 'slug', l.slug, 'ativo', l.ativo, 'disponivel', l.ativo, 'cor', l.cor, 'tamanho', l.tamanho,
      'imagem', l.imagem, 'quantidade', l.quantidade,
      'preco_unit', l.preco_unit, 'preco_atacado', l.preco_unit,
      'estoque', l.estoque, 'subtotal', round(l.preco_unit * l.quantidade, 2))
      order by l.nome, l.cor, l.tamanho), '[]'::jsonb),
    (count(distinct (l.product_id, l.color_id, l.size_id)) filter (where l.ativo))::int,
    coalesce(sum(round(l.preco_unit * l.quantidade, 2)) filter (where l.ativo), 0)
  into v_itens, v_skus, v_total
  from linhas l;

  return jsonb_build_object('itens', v_itens, 'sku_distintos', v_skus, 'total', v_total);
end $$;

-- Quantidade absoluta; 0 remove. Não valida estoque (o aviso é na leitura).
create or replace function atacado_cart_set_item(
  p_product_id uuid, p_color_id uuid, p_size_id uuid, p_quantidade int
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_rev   uuid := _atacado_revendedor_aprovado();
  v_ativo boolean;
begin
  if p_product_id is null or p_color_id is null or p_size_id is null then
    raise exception 'item inválido';
  end if;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade > 999 then
    raise exception 'quantidade inválida';
  end if;

  if p_quantidade = 0 then
    delete from carrinho_atacado
    where revendedor_id = v_rev and product_id = p_product_id
      and color_id = p_color_id and size_id = p_size_id;
    return;
  end if;

  select p.ativo into v_ativo
  from product_sizes s
  join product_colors c on c.id = s.color_id
  join products p       on p.id = c.product_id
  where s.id = p_size_id and c.id = p_color_id and p.id = p_product_id;
  if not found then raise exception 'item inválido'; end if;
  if not v_ativo then raise exception 'produto indisponível'; end if;

  if not exists (
       select 1 from carrinho_atacado
       where revendedor_id = v_rev and product_id = p_product_id
         and color_id = p_color_id and size_id = p_size_id)
     and (select count(*) from carrinho_atacado where revendedor_id = v_rev) >= 300 then
    raise exception 'carrinho cheio';
  end if;

  insert into carrinho_atacado (revendedor_id, product_id, color_id, size_id, quantidade)
  values (v_rev, p_product_id, p_color_id, p_size_id, p_quantidade)
  on conflict (revendedor_id, product_id, color_id, size_id)
  do update set quantidade = excluded.quantidade, updated_at = now();
end $$;

create or replace function atacado_cart_remove_item(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_rev uuid := _atacado_revendedor_aprovado();
begin
  delete from carrinho_atacado where id = p_id and revendedor_id = v_rev;
end $$;

create or replace function atacado_cart_clear()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_rev uuid := _atacado_revendedor_aprovado();
begin
  delete from carrinho_atacado where revendedor_id = v_rev;
end $$;

-- Histórico vale para qualquer status (recusado depois ainda vê seus pedidos).
create or replace function atacado_my_orders()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
declare v_rev uuid;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select r.id into v_rev from revendedores r where r.user_id = auth.uid();
  if v_rev is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'created_at', o.created_at, 'status', o.status,
      'valor_total', o.valor_total,
      'skus', (select count(distinct (i.produto_id, i.color_id, i.size_id))::int
               from order_items i where i.order_id = o.id))
      order by o.created_at desc)
    from orders o
    where o.is_atacado and o.revendedor_id = v_rev
  ), '[]'::jsonb);
end $$;

-- ========== RPCs DE ADMIN (spec §4.4) ==========
-- Assinaturas antigas com p_secret (release-unico.sql anterior); 0005 já as
-- derruba, repetido aqui para re-paste idempotente.
drop function if exists admin_list_revendedores(text, text);
drop function if exists admin_set_revendedor_status(text, uuid, revendedor_status);
drop function if exists admin_upsert_revendedor(text, uuid, text, text);

create or replace function admin_list_revendedores(p_status text default 'todos')
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if p_status is not null
     and p_status not in ('todos','pendente','aprovado','recusado') then
    raise exception 'status inválido';
  end if;
  return coalesce((
    select jsonb_agg(
      (to_jsonb(r) - 'user_id') || jsonb_build_object('tem_conta', r.user_id is not null)
      order by case r.status when 'pendente' then 0 else 1 end, r.created_at desc)
    from revendedores r
    where coalesce(p_status, 'todos') = 'todos' or r.status::text = p_status
  ), '[]'::jsonb);
end $$;

-- Cria sempre 'pendente' (supervisor cadastra mas não aprova). Ao ficar sem
-- conta vinculada, vincula a conta de e-mail confirmado com o mesmo e-mail e
-- eleva 'cliente' -> 'revendedor' (papéis de equipe intocados).
-- Supervisor trocando o e-mail de revendedor aprovado devolve-o a 'pendente'
-- (recusado continua recusado, com reviewed_at/by intactos).
create or replace function admin_upsert_revendedor(
  p_id uuid, p_razao_social text, p_cnpj text, p_responsavel text, p_email text,
  p_whatsapp text, p_cidade text, p_uf text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meu      text;
  v_id       uuid;
  v_atual    revendedores;
  v_razao    text := left(trim(coalesce(p_razao_social, '')), 200);
  v_email    text := lower(trim(coalesce(p_email, '')));
  v_cnpj     text := nullif(left(regexp_replace(left(coalesce(p_cnpj, ''), 200), '\D', '', 'g'), 20), '');
  v_resp     text := left(trim(coalesce(p_responsavel, '')), 200);
  v_whats    text := left(regexp_replace(left(coalesce(p_whatsapp, ''), 200), '\D', '', 'g'), 20);
  v_cidade   text := left(trim(coalesce(p_cidade, '')), 200);
  v_uf       text := upper(left(trim(coalesce(p_uf, '')), 2));
  v_user     uuid;
begin
  perform assert_papel(array['superadmin','admin','supervisor']);
  if v_razao = '' then raise exception 'razão social obrigatória'; end if;
  if length(v_email) > 200
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'e-mail inválido';
  end if;

  perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));
  v_meu := assert_papel(array['superadmin','admin','supervisor']);

  if p_id is null then
    begin
      insert into revendedores (razao_social, cnpj, responsavel, email, whatsapp, cidade, uf)
      values (v_razao, v_cnpj, v_resp, v_email, v_whats, v_cidade, v_uf)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'e-mail já cadastrado';
    end;
  else
    select * into v_atual from revendedores where id = p_id for update;
    if not found then raise exception 'revendedor não encontrado'; end if;
    begin
      update revendedores set
        razao_social = v_razao, cnpj = v_cnpj, responsavel = v_resp, email = v_email,
        whatsapp = v_whats, cidade = v_cidade, uf = v_uf,
        status = case
          when v_meu = 'supervisor' and v_email <> v_atual.email and v_atual.status = 'aprovado'
            then 'pendente'::revendedor_status
          else status end,
        reviewed_at = case
          when v_meu = 'supervisor' and v_email <> v_atual.email and v_atual.status = 'aprovado'
            then null else reviewed_at end,
        reviewed_by = case
          when v_meu = 'supervisor' and v_email <> v_atual.email and v_atual.status = 'aprovado'
            then null else reviewed_by end
      where id = p_id
      returning id into v_id;
    exception when unique_violation then
      raise exception 'e-mail já cadastrado';
    end;
  end if;

  if not exists (select 1 from revendedores where id = v_id and user_id is not null) then
    select u.id into v_user
    from auth.users u
    join profiles p on p.id = u.id
    where lower(u.email) = v_email
      and u.email_confirmed_at is not null
      and not exists (select 1 from revendedores r where r.user_id = u.id)
    order by u.created_at
    limit 1;
    if v_user is not null then
      update revendedores set user_id = v_user where id = v_id;
      update profiles set papel = 'revendedor' where id = v_user and papel = 'cliente';
    end if;
  end if;

  return v_id;
end $$;

create or replace function admin_set_revendedor_status(p_id uuid, p_status revendedor_status)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  if p_status is null then raise exception 'status inválido'; end if;
  update revendedores
     set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'revendedor não encontrado'; end if;
end $$;

-- ========== PRIVILÉGIOS ==========
-- O Supabase concede EXECUTE a anon/authenticated por padrão; revogar tudo e
-- conceder só o necessário. Nada aqui é público (anon).
revoke all on function
  public.handle_auth_user(),
  _atacado_revendedor_aprovado(),
  atacado_cart_clear_for(uuid),
  atacado_me(),
  atacado_cart_get(),
  atacado_cart_set_item(uuid, uuid, uuid, int),
  atacado_cart_remove_item(uuid),
  atacado_cart_clear(),
  atacado_my_orders(),
  admin_list_revendedores(text),
  admin_upsert_revendedor(uuid, text, text, text, text, text, text, text),
  admin_set_revendedor_status(uuid, revendedor_status)
from public, anon, authenticated;

grant execute on function
  atacado_me(),
  atacado_cart_get(),
  atacado_cart_set_item(uuid, uuid, uuid, int),
  atacado_cart_remove_item(uuid),
  atacado_cart_clear(),
  atacado_my_orders(),
  admin_list_revendedores(text),
  admin_upsert_revendedor(uuid, text, text, text, text, text, text, text),
  admin_set_revendedor_status(uuid, revendedor_status)
to authenticated;

-- =====================================================================
-- >>> 0007_cms_textos_promos.sql
-- =====================================================================

-- =====================================================================
-- 0007_cms_textos_promos.sql — Textos da loja, Banner do hero, Promoções,
-- imagem de categoria e products.created_at (lançamentos).
-- Spec do release §3.1, §4.4, §6, §7, §8.1; regras de preço no spec-mãe §7.
-- Tabelas novas: RLS ligado e nenhuma policy (acesso só por RPC).
-- checkout_iniciar_pedido: corpo idêntico ao de 0002, exceto o preço de
-- varejo, que passa a usar _desconto_efetivo (produto x promoções vigentes).
-- =====================================================================

set search_path = public, extensions;

-- ========== TEXTOS DA LOJA ==========
create table if not exists textos_loja (
  chave text primary key,
  valor text not null
);
alter table textos_loja enable row level security;
revoke all on table textos_loja from anon, authenticated;

-- Links de Ajuda vazios = o front usa o WhatsApp da loja.
insert into textos_loja (chave, valor) values
  ('aviso.texto',               'FRETE GRÁTIS ACIMA DE R$ 299 · TROCA FÁCIL EM 30 DIAS'),
  ('aviso.ativo',               'true'),
  ('rodape.descricao',          'Calçados e acessórios.'),
  ('rodape.ajuda1_texto',       'Trocas e devoluções'),
  ('rodape.ajuda1_link',        ''),
  ('rodape.ajuda2_texto',       'Prazos de entrega'),
  ('rodape.ajuda2_link',        ''),
  ('rodape.ajuda3_texto',       'Fale com a gente'),
  ('rodape.ajuda3_link',        ''),
  ('revendedora.etiqueta',      'ATACADO LOLA'),
  ('revendedora.titulo',        'Seja revendedora LOLA.'),
  ('revendedora.texto',         'Preço de atacado a partir de 12 modelos diferentes. Cadastro com CNPJ, aprovação rápida.'),
  ('revendedora.botao',         'Quero ser revendedor'),
  ('home.categorias_etiqueta',  ''),
  ('home.categorias_titulo',    'Categorias'),
  ('home.lancamentos_etiqueta', 'ACABOU DE CHEGAR'),
  ('home.lancamentos_titulo',   'Lançamentos'),
  ('login.etiqueta',            'COLEÇÃO VERÃO 26'),
  ('login.titulo',              'Pisa confiante.')
on conflict (chave) do nothing;

create or replace function get_textos()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  return coalesce((select jsonb_object_agg(t.chave, t.valor) from textos_loja t), '{}'::jsonb);
end $$;

-- Só atualiza chaves já existentes; qualquer chave desconhecida aborta tudo.
create or replace function admin_set_textos(p_valores jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chave text;
  v_json  jsonb;
  v_valor text;
begin
  perform assert_papel(array['superadmin','admin']);
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then
    raise exception 'textos inválidos';
  end if;

  for v_chave, v_json in select e.key, e.value from jsonb_each(p_valores) as e loop
    if not exists (select 1 from textos_loja where chave = v_chave) then
      raise exception 'chave de texto desconhecida: %', left(v_chave, 80);
    end if;
    if jsonb_typeof(v_json) not in ('string','boolean','number') then
      raise exception 'valor inválido para %', v_chave;
    end if;
    v_valor := v_json #>> '{}';
    if length(v_valor) > 500 then
      raise exception 'texto muito longo em % (máximo 500 caracteres)', v_chave;
    end if;
    if v_chave = 'aviso.ativo' and v_valor not in ('true','false') then
      raise exception 'aviso.ativo deve ser true ou false';
    end if;
    if right(v_chave, 5) = '_link' and v_valor <> '' then
      if not ((left(v_valor, 1) = '/' and left(v_valor, 2) <> '//')
              or left(v_valor, 1) = '#'
              or left(v_valor, 8) = 'https://'
              or left(v_valor, 7) = 'mailto:'
              or left(v_valor, 4) = 'tel:')
         or v_valor ~ '[[:space:][:cntrl:]\\]' then
        raise exception 'link inválido em %: deve começar com /, #, https://, mailto: ou tel:, sem espaços', v_chave;
      end if;
    end if;
    update textos_loja set valor = v_valor where chave = v_chave;
  end loop;
end $$;

-- ========== BANNER DO HERO ==========
-- rascunho nulo = sem alterações pendentes. Só `publicado` é público (via RPC).
create table if not exists banner_hero (
  id int primary key default 1 check (id = 1),
  rascunho jsonb,
  publicado jsonb not null,
  publicado_em timestamptz
);
alter table banner_hero enable row level security;
revoke all on table banner_hero from anon, authenticated;

insert into banner_hero (id, publicado) values (1, jsonb_build_object(
  'etiqueta',     'COLEÇÃO VERÃO 26',
  'titulo',       'Pisa confiante.',
  'subtitulo',    'Tênis, sandálias e bolsas pra quem já sabe onde quer chegar.',
  'cta1_texto',   'Ver coleção',
  'cta1_link',    '#lancamentos',
  'cta2_texto',   'Comprar por categoria',
  'cta2_mostrar', true,
  'imagem',       null))
on conflict (id) do nothing;

create or replace function get_banner_hero()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  return (select b.publicado from banner_hero b where b.id = 1);
end $$;

create or replace function admin_get_banner_hero()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return (select jsonb_build_object('rascunho', b.rascunho, 'publicado', b.publicado,
    'publicado_em', b.publicado_em) from banner_hero b where b.id = 1);
end $$;

-- Textos: string ou null, até 300 caracteres. cta1_link: vazio/null ou começa
-- com '/', '#' ou 'https://' (sem '//', barra invertida, espaço ou controle).
-- imagem: null ou data URL de imagem (não SVG) com até 3.000.000 caracteres.
create or replace function admin_save_banner_rascunho(p_dados jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chave text;
  v_json  jsonb;
  v_tipo  text;
  v_valor text;
begin
  perform assert_papel(array['superadmin','admin']);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'dados do banner inválidos';
  end if;

  for v_chave, v_json in select e.key, e.value from jsonb_each(p_dados) as e loop
    v_tipo := jsonb_typeof(v_json);
    if v_chave not in ('etiqueta','titulo','subtitulo','cta1_texto','cta1_link',
                       'cta2_texto','cta2_mostrar','imagem') then
      raise exception 'campo desconhecido no banner: %', left(v_chave, 80);
    end if;

    if v_chave = 'cta2_mostrar' then
      if v_tipo <> 'boolean' then
        raise exception 'cta2_mostrar deve ser verdadeiro ou falso';
      end if;

    elsif v_chave = 'imagem' then
      if v_tipo <> 'null' then
        v_valor := v_json #>> '{}';
        if v_tipo <> 'string'
           or left(v_valor, 11) <> 'data:image/'
           or lower(left(v_valor, 14)) = 'data:image/svg' then
          raise exception 'imagem do banner inválida';
        end if;
        if length(v_valor) > 3000000 then
          raise exception 'imagem do banner muito grande';
        end if;
      end if;

    elsif v_tipo <> 'null' then
      if v_tipo <> 'string' then
        raise exception 'valor inválido para %', v_chave;
      end if;
      v_valor := v_json #>> '{}';
      if length(v_valor) > 300 then
        raise exception 'texto muito longo em % (máximo 300 caracteres)', v_chave;
      end if;
      if v_chave = 'cta1_link' and v_valor <> '' then
        if not ((left(v_valor, 1) = '/' and left(v_valor, 2) <> '//')
                or left(v_valor, 1) = '#'
                or left(v_valor, 8) = 'https://')
           or v_valor ~ '[[:space:][:cntrl:]\\]' then
          raise exception 'link do botão deve começar com /, # ou https://';
        end if;
      end if;
    end if;
  end loop;

  update banner_hero set rascunho = p_dados where id = 1;
  if not found then raise exception 'banner não encontrado'; end if;
end $$;

-- Rascunho é mesclado sobre o publicado (campos ausentes no rascunho mantêm o valor).
create or replace function admin_publish_banner()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_banner banner_hero;
begin
  perform assert_papel(array['superadmin','admin']);
  select * into v_banner from banner_hero where id = 1 for update;
  if not found then raise exception 'banner não encontrado'; end if;
  if v_banner.rascunho is null then
    raise exception 'não há alterações para publicar';
  end if;
  update banner_hero set publicado = v_banner.publicado || v_banner.rascunho,
    publicado_em = now(), rascunho = null
  where id = 1;
end $$;

create or replace function admin_discard_banner()
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  update banner_hero set rascunho = null where id = 1;
end $$;

-- ========== PROMOÇÕES ==========
-- aplica_a_categoria_id nulo = loja inteira. Cupom só é armazenado (spec §3.1):
-- promoção com cupom não entra no desconto automático.
create table if not exists promocoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  desconto_percentual int not null check (desconto_percentual between 1 and 90),
  aplica_a_categoria_id uuid references categorias(id) on delete cascade,
  inicio date,
  fim date,
  cupom text,
  ativa boolean not null default true,
  created_at timestamptz default now(),
  check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists promocoes_categoria_idx on promocoes(aplica_a_categoria_id);
create unique index if not exists promocoes_cupom_ativo_uniq
  on promocoes (upper(cupom)) where cupom is not null and ativa;
alter table promocoes enable row level security;
revoke all on table promocoes from anon, authenticated;

-- Regra única de vigência (usada por _desconto_efetivo e get_promocoes_ativas):
-- ativa, sem cupom, janela de datas inclui hoje em America/Fortaleza (nulos = aberto).
create or replace function _promocoes_vigentes()
returns setof promocoes language plpgsql security definer set search_path = public, extensions stable as $$
declare v_hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  return query
    select pr.* from promocoes pr
    where pr.ativa
      and pr.cupom is null
      and (pr.inicio is null or pr.inicio <= v_hoje)
      and (pr.fim is null or pr.fim >= v_hoje);
end $$;

-- Maior entre o desconto do produto e a maior promoção vigente da loja inteira
-- ou da categoria do produto; null quando nenhum.
create or replace function _desconto_efetivo(p_produto products)
returns int language plpgsql security definer set search_path = public, extensions stable as $$
declare v_promo int;
begin
  select max(pr.desconto_percentual) into v_promo
  from _promocoes_vigentes() pr
  where pr.aplica_a_categoria_id is null
     or pr.aplica_a_categoria_id = p_produto.categoria_id;
  return nullif(greatest(coalesce(p_produto.desconto_percentual, 0), coalesce(v_promo, 0)), 0);
end $$;

-- Pública: só o necessário para a vitrine calcular o preço de exibição
-- (o checkout recalcula no servidor com _desconto_efetivo).
create or replace function get_promocoes_ativas()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'desconto_percentual', pr.desconto_percentual,
      'aplica_a_categoria_id', pr.aplica_a_categoria_id)
      order by pr.desconto_percentual desc)
    from _promocoes_vigentes() pr
  ), '[]'::jsonb);
end $$;

create or replace function admin_list_promocoes()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin','admin']);
  return coalesce((
    select jsonb_agg(to_jsonb(pr) || jsonb_build_object('categoria_nome', c.nome)
      order by pr.created_at desc, pr.nome)
    from promocoes pr
    left join categorias c on c.id = pr.aplica_a_categoria_id
  ), '[]'::jsonb);
end $$;

create or replace function admin_upsert_promocao(
  p_id uuid, p_nome text, p_desconto int, p_categoria_id uuid,
  p_inicio date, p_fim date, p_cupom text, p_ativa boolean
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid;
  v_nome  text := trim(coalesce(p_nome, ''));
  v_cupom text := nullif(upper(trim(coalesce(p_cupom, ''))), '');
begin
  perform assert_papel(array['superadmin','admin']);
  if v_nome = '' then raise exception 'nome da promoção é obrigatório'; end if;
  if length(v_nome) > 120 then raise exception 'nome da promoção muito longo'; end if;
  if p_desconto is null or p_desconto < 1 or p_desconto > 90 then
    raise exception 'desconto deve estar entre 1%% e 90%%';
  end if;
  if p_inicio is not null and p_fim is not null and p_fim < p_inicio then
    raise exception 'data final anterior à inicial';
  end if;
  if v_cupom is not null and v_cupom !~ '^[A-Z0-9_-]{1,40}$' then
    raise exception 'cupom inválido (use até 40 letras, números, - ou _)';
  end if;
  if p_categoria_id is not null
     and not exists (select 1 from categorias where id = p_categoria_id) then
    raise exception 'categoria não encontrada';
  end if;

  begin
    if p_id is null then
      insert into promocoes(nome, desconto_percentual, aplica_a_categoria_id, inicio, fim, cupom, ativa)
      values (v_nome, p_desconto, p_categoria_id, p_inicio, p_fim, v_cupom, coalesce(p_ativa, true))
      returning id into v_id;
    else
      update promocoes set nome = v_nome, desconto_percentual = p_desconto,
        aplica_a_categoria_id = p_categoria_id, inicio = p_inicio, fim = p_fim,
        cupom = v_cupom, ativa = coalesce(p_ativa, true)
      where id = p_id returning id into v_id;
      if v_id is null then raise exception 'registro não encontrado'; end if;
    end if;
  exception when unique_violation then
    raise exception 'cupom já usado em outra promoção ativa';
  end;
  return v_id;
end $$;

create or replace function admin_delete_promocao(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin','admin']);
  delete from promocoes where id = p_id;
end $$;

-- ========== CATEGORIAS: IMAGEM ==========
alter table categorias add column if not exists imagem text;

-- imagem é gravada como enviada: null (ou vazio) remove a imagem.
drop function if exists admin_upsert_categoria(uuid, text, text, text, int, boolean, int);
create or replace function admin_upsert_categoria(
  p_id uuid, p_grupo text, p_nome text, p_slug text, p_ordem int,
  p_ativo boolean, p_desconto_atacado_percentual int, p_imagem text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_slug text; v_imagem text := nullif(trim(coalesce(p_imagem, '')), '');
begin
  perform assert_papel(array['superadmin','admin']);
  if v_imagem is not null and (left(v_imagem, 11) <> 'data:image/'
     or lower(left(v_imagem, 14)) = 'data:image/svg') then
    raise exception 'imagem da categoria inválida';
  end if;
  if length(v_imagem) > 1500000 then
    raise exception 'imagem da categoria muito grande';
  end if;
  v_slug := coalesce(nullif(trim(p_slug),''), _slugify(p_nome));
  if p_id is null then
    insert into categorias(grupo, nome, slug, ordem, ativo, desconto_atacado_percentual, imagem)
    values (p_grupo, p_nome, v_slug, coalesce(p_ordem,0), coalesce(p_ativo,true),
      p_desconto_atacado_percentual, v_imagem)
    returning id into v_id;
  else
    update categorias set grupo=p_grupo, nome=p_nome, slug=v_slug, ordem=coalesce(p_ordem,0),
      ativo=coalesce(p_ativo,true), desconto_atacado_percentual=p_desconto_atacado_percentual,
      imagem=v_imagem
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'registro não encontrado'; end if;
  end if;
  return v_id;
end $$;

-- ========== PRODUTOS: LANÇAMENTOS ==========
alter table products add column if not exists created_at timestamptz not null default now();
create index if not exists products_created_idx on products(created_at desc);

-- ========== _product_json ==========
-- Mesmos atributos de 0002. Acrescenta desconto_efetivo e created_at; a
-- categoria embutida sai sem `imagem` (base64 grande repetida por produto).
create or replace function _product_json(p products)
returns jsonb language sql set search_path = public stable as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.nome, 'categoria_id', p.categoria_id,
    'colecao', p.colecao, 'preco', p.preco, 'desconto_percentual', p.desconto_percentual,
    'desconto_efetivo', _desconto_efetivo(p), 'created_at', p.created_at,
    'preco_atacado', p.preco_atacado, 'descricao', p.descricao,
    'caracteristicas', to_jsonb(p.caracteristicas), 'ativo', p.ativo,
    'destaque', p.destaque, 'ordem', p.ordem, 'surpresa_ativo', p.surpresa_ativo,
    'categoria', (select to_jsonb(c) - 'imagem' from categorias c where c.id = p.categoria_id),
    'colors', coalesce((select jsonb_agg(jsonb_build_object(
        'id', col.id, 'product_id', col.product_id, 'nome', col.nome, 'hex', col.hex,
        'imagens', to_jsonb(col.imagens), 'ordem', col.ordem,
        'sizes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', s.id, 'color_id', s.color_id, 'tamanho', s.tamanho, 'estoque', s.estoque)
            order by s.tamanho) from product_sizes s where s.color_id = col.id), '[]'::jsonb))
      order by col.ordem) from product_colors col where col.product_id = p.id), '[]'::jsonb));
$$;

-- ========== CHECKOUT ==========
-- Cópia de 0002; única mudança: o desconto do preço de varejo é o efetivo.
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
  p_items jsonb,               -- [{produto_id,color_id,size_id,quantidade}]
  p_is_atacado boolean default false,
  p_customer_id uuid default null,
  p_revendedor_id uuid default null
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
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'carrinho vazio';
  end if;

  -- Atacado: exige revendedor aprovado (a tabela revendedores só existe na Fase 3;
  -- nesta fase p_is_atacado é sempre false, então o ramo não executa).
  if p_is_atacado then
    raise exception 'atacado indisponível nesta fase';
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
    false, p_customer_id, p_revendedor_id, 0, 0)
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

-- ========== PRIVILÉGIOS ==========
-- O Supabase concede EXECUTE a anon/authenticated por padrão. Públicas: só
-- get_textos, get_banner_hero e get_promocoes_ativas. checkout_iniciar_pedido e
-- _product_json mantêm os privilégios de 0002 (create or replace os preserva).
revoke all on function
  get_textos(),
  admin_set_textos(jsonb),
  get_banner_hero(),
  admin_get_banner_hero(),
  admin_save_banner_rascunho(jsonb),
  admin_publish_banner(),
  admin_discard_banner(),
  _promocoes_vigentes(),
  _desconto_efetivo(products),
  get_promocoes_ativas(),
  admin_list_promocoes(),
  admin_upsert_promocao(uuid, text, int, uuid, date, date, text, boolean),
  admin_delete_promocao(uuid),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int, text)
from public, anon, authenticated;

grant execute on function
  get_textos(),
  get_banner_hero(),
  get_promocoes_ativas()
to anon, authenticated;

grant execute on function
  admin_set_textos(jsonb),
  admin_get_banner_hero(),
  admin_save_banner_rascunho(jsonb),
  admin_publish_banner(),
  admin_discard_banner(),
  admin_list_promocoes(),
  admin_upsert_promocao(uuid, text, int, uuid, date, date, text, boolean),
  admin_delete_promocao(uuid),
  admin_upsert_categoria(uuid, text, text, text, int, boolean, int, text)
to authenticated;

-- =====================================================================
-- >>> 0008_checkout_atacado.sql
-- =====================================================================

-- =====================================================================
-- 0008_checkout_atacado.sql — checkout de atacado e identidade do pedido
-- vinda da sessão.
-- Autoridade: spec do release §8.2, §9; spec-mãe §8.4, §11.3-11.5, §12.
--
-- checkout_iniciar_pedido:
--   * Assinatura nova SEM p_customer_id e p_revendedor_id (antes o cliente
--     podia injetar pedidos na conta de outra pessoa). customer_id = auth.uid()
--     (nulo para convidado); revendedor_id vem de _atacado_revendedor_aprovado().
--   * Varejo: corpo de 0007 (preço com _desconto_efetivo), só muda a origem de
--     customer_id/revendedor_id.
--   * Atacado (p_is_atacado = true): exige revendedor aprovado com perfil ativo;
--     itens lidos de carrinho_atacado do servidor (p_items é ignorado); preço por
--     _preco_atacado (nunca desconto de varejo); estoque por linha; mínimo de 12
--     SKUs distintos. NÃO limpa o carrinho: isso acontece ao liquidar.
-- _settle_order: corpo de 0002 + remove do carrinho de atacado os SKUs do pedido
--   (itens adicionados depois do checkout ficam; mp_register_order_payment e admin_settle_order já chamam só com
--   o pedido 'pendente' e travado, então a liquidação continua única).
-- =====================================================================

set search_path = public, extensions;

-- ========== CHECKOUT ==========
-- Assinatura antiga (13 args) removida: create or replace com menos argumentos
-- criaria uma sobrecarga e manteria a porta aberta.
drop function if exists checkout_iniciar_pedido(
  text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean, uuid, uuid);

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
  v_skus int;
begin
  -- ===== ATACADO =====
  if coalesce(p_is_atacado, false) then
    -- Lança 'revendedor não aprovado' sem sessão, sem revendedor aprovado ou
    -- com perfil inativo. Nada do payload identifica o revendedor.
    v_rev := _atacado_revendedor_aprovado();

    if not exists (select 1 from carrinho_atacado where revendedor_id = v_rev) then
      raise exception 'carrinho vazio';
    end if;

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
    select count(distinct (i.produto_id, i.color_id, i.size_id))::int into v_skus
    from order_items i where i.order_id = v_order_id;
    if v_skus < 12 then
      raise exception 'mínimo de 12 SKUs distintos (carrinho tem %)', v_skus;
    end if;

    update orders set valor_produtos = v_prod_total,
                      valor_total = v_prod_total + coalesce(v_taxa,0)
    where id = v_order_id;

    return jsonb_build_object('id', v_order_id, 'entrega_taxa', coalesce(v_taxa, 0),
      'itens', coalesce(v_mp_itens, '[]'::jsonb));
  end if;

  -- ===== VAREJO (corpo de 0007; customer_id da sessão, revendedor_id nulo) =====
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

-- ========== LIQUIDAÇÃO ==========
-- Corpo de 0002; acréscimo: pedido de atacado tira do carrinho os SKUs pagos.
-- Continua sem security definer e sem grant (só as RPCs definer o chamam).
create or replace function _settle_order(
  p_order_id uuid, p_mp_payment_id text, p_forma_pagamento text
) returns void language plpgsql set search_path = public, extensions as $$
declare v_ord orders; v_it order_items;
begin
  select * into v_ord from orders where id = p_order_id;
  if not found then raise exception 'pedido não encontrado'; end if;

  update orders set status = 'pago', mp_payment_id = p_mp_payment_id,
    forma_pagamento = p_forma_pagamento where id = p_order_id;

  for v_it in select * from order_items where order_id = p_order_id loop
    if v_it.size_id is not null then
      update product_sizes set estoque = greatest(0, estoque - v_it.quantidade)
      where id = v_it.size_id;
    end if;
    insert into sales(produto_id, produto_nome, quantidade, preco_unit, valor_total,
      forma_pagamento, cliente, origem, is_atacado, produto_cor, produto_tamanho,
      mp_payment_id, status, order_id)
    values (v_it.produto_id, v_it.produto_nome, v_it.quantidade, v_it.preco_unit, v_it.subtotal,
      p_forma_pagamento, v_ord.cliente_nome,
      case when v_ord.is_atacado then 'atacado' else 'loja' end,
      v_ord.is_atacado, v_it.produto_cor, v_it.produto_tamanho,
      p_mp_payment_id, 'aprovado', p_order_id);
  end loop;

  -- Só os SKUs deste pedido: itens adicionados depois do checkout continuam.
  if v_ord.is_atacado and v_ord.revendedor_id is not null then
    delete from carrinho_atacado ca
    using order_items i
    where ca.revendedor_id = v_ord.revendedor_id
      and i.order_id = p_order_id
      and ca.size_id = i.size_id;
  end if;
end $$;

-- ========== PRIVILÉGIOS ==========
-- checkout_iniciar_pedido é público por design (compra de convidado). O ramo
-- de atacado se protege sozinho (_atacado_revendedor_aprovado exige sessão).
revoke all on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
from public;
grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to anon, authenticated;

-- create or replace preserva o ACL; repetido para re-paste idempotente.
revoke all on function
  _settle_order(uuid, text, text),
  atacado_cart_clear_for(uuid)
from public, anon, authenticated;

-- =====================================================================
-- >>> BLOCO FINAL DO DONO: convite de superadmin
-- TROQUE SEU_EMAIL_AQUI@exemplo.com pelo seu e-mail ANTES de rodar
-- (somente na linha v_email abaixo; é o único lugar).
-- =====================================================================
do $$
declare
  v_email text := 'SEU_EMAIL_AQUI@exemplo.com';
  v_uid   uuid;
begin
  if v_email = 'SEU_EMAIL_AQUI@exemplo.com' or position('@' in v_email) = 0 then
    raise exception 'Troque SEU_EMAIL_AQUI@exemplo.com pelo seu e-mail real (precisa conter @) no bloco final e rode de novo.';
  end if;
  v_email := lower(trim(v_email));

  -- Mesmo lock das regras de papel de 0004 (convites e perfis).
  perform pg_advisory_xact_lock(hashtext('lola:profiles:papel'));

  insert into public.convites_papel (email, papel)
  values (v_email, 'superadmin')
  on conflict (email) do update set papel = 'superadmin', created_at = now();

  -- Conta já existente e com e-mail confirmado: promove agora e consome o convite.
  select p.id into v_uid
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
  limit 1;

  if v_uid is not null then
    update public.profiles set papel = 'superadmin', ativo = true where id = v_uid;
    delete from public.convites_papel where email = v_email;
    raise notice 'Conta existente promovida a superadmin (convite aplicado e removido).';
  else
    raise notice 'Convite de superadmin gravado. A conta será superadmin ao criar/confirmar o e-mail %.', v_email;
  end if;
end $$;
