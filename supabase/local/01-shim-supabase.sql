-- Complementos SÓ do ambiente de teste local (a imagem não roda o GoTrue).
-- Rodar como supabase_admin (dono de auth.users). NÃO vai para produção.
alter table auth.users add column if not exists email_confirmed_at timestamptz;

-- Definição atual do Supabase: lê o JSON de request.jwt.claims (a imagem traz a antiga).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

drop trigger if exists lola_on_auth_user on auth.users;
