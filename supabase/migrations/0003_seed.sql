-- =====================================================================
-- 0003_seed.sql — linha única admin_config (senha + webhook secret) + categorias-semente
-- Substitua <ADMIN_PASSWORD> e <ADMIN_WEBHOOK_SECRET> pelos valores reais antes de rodar. Nao commite os valores reais.
-- Entregar a senha do /admin ao cliente e configurar ADMIN_WEBHOOK_SECRET como variável (Secret) do Worker na Cloudflare.
-- =====================================================================

set search_path = public, extensions;

insert into admin_config (id, secret_hash, webhook_secret_hash, taxa_entrega_local, whatsapp, cidade_taxa)
values (
  1,
  crypt('<ADMIN_PASSWORD>', gen_salt('bf', 10)),
  crypt('<ADMIN_WEBHOOK_SECRET>', gen_salt('bf', 10)),
  0, '', ''
)
on conflict (id) do nothing;

insert into categorias (grupo, nome, slug, ordem) values
  ('calcados','Tênis','tenis',1),
  ('calcados','Sandália','sandalia',2),
  ('calcados','Sapatilha','sapatilha',3),
  ('acessorios','Bolsas','bolsas',10)
on conflict (slug) do nothing;
