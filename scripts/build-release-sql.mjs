// Gera supabase/release-unico.sql concatenando as migrações 0004..0008.
// Uso: npm run release:sql. O arquivo gerado nunca é editado à mão.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirMigracoes = join(raiz, 'supabase', 'migrations')
const saida = join(raiz, 'supabase', 'release-unico.sql')

const ORDEM = [
  '0004_auth_perfis.sql',
  '0005_admin_por_sessao.sql',
  '0006_atacado.sql',
  '0007_cms_textos_promos.sql',
  '0008_checkout_atacado.sql',
]

function falhar(msg) {
  console.error(`release:sql ERRO: ${msg}`)
  process.exit(1)
}

const prefixo = (nome) => Number(nome.slice(0, 4))
for (let i = 1; i < ORDEM.length; i++) {
  if (prefixo(ORDEM[i]) <= prefixo(ORDEM[i - 1])) {
    falhar(`ordem inválida: ${ORDEM[i]} deve vir depois de ${ORDEM[i - 1]}`)
  }
}
if (ORDEM[ORDEM.length - 1] !== '0008_checkout_atacado.sql') {
  falhar('0008_checkout_atacado.sql precisa ser o ÚLTIMO arquivo do release')
}

const partes = ORDEM.map((nome) => {
  const caminho = join(dirMigracoes, nome)
  if (!existsSync(caminho)) falhar(`migração ausente: supabase/migrations/${nome}`)
  const conteudo = readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n').trim()
  if (!conteudo) falhar(`migração vazia: ${nome}`)
  return { nome, conteudo }
})

const cabecalho = `-- =====================================================================
-- release-unico.sql  (GERADO por scripts/build-release-sql.mjs; NÃO edite à mão)
-- Conteúdo: migrações ${ORDEM.join(', ')} nessa ordem + bloco final do dono.
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
`

const banner = (nome) =>
  `\n-- =====================================================================\n-- >>> ${nome}\n-- =====================================================================\n\n`

const blocoDono = `
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
`

const corpo = partes.map((p) => banner(p.nome) + p.conteudo + '\n').join('')
writeFileSync(saida, cabecalho + corpo + blocoDono, 'utf8')
console.log(`release:sql OK: ${saida} (${ORDEM.length} migrações + bloco do dono)`)
