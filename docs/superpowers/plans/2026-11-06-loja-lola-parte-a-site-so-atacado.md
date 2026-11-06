# Parte A — Site só atacado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a LOLA em site só para revendedores: varejo desligado por interruptor, vitrine completa só para revendedor aprovado e logado (com preço de varejo e de atacado), bônus de 15 peças, LP de cadastro, catálogo fechado a visitantes **no banco**, e papéis ajustados (supervisor cadastra produto sem mexer em preço e vê Pedidos sem valores).

**Architecture:** Uma única migração `supabase/migrations/0010_site_so_atacado.sql` (um SQL, uma janela, decisão do dono), construída por seções e validada num Postgres local do Supabase (Docker) com o roteiro de isolamento e testes funcionais; depois o app Next.js passa a ler catálogo só por funções `SECURITY DEFINER`, com regras testáveis em funções puras de `lib/` (o vitest roda só em ambiente node). O SQL **não** é aplicado em produção por este plano: isso exige o OK do dono, numa janela única junto com o deploy.

**Tech Stack:** PostgreSQL 17 (imagem `public.ecr.aws/supabase/postgres:17.11.0.004`), Next.js 16.4.5 (App Router) + React 19 + TypeScript, Vitest (ambiente node), Supabase JS, Cloudflare Workers/OpenNext.

**Spec:** `docs/superpowers/specs/2026-11-05-loja-lola-site-so-atacado-seguranca-rastreamento-design.md` (§5, §12). Base: `docs/superpowers/specs/2026-10-27-loja-lola-lp-atacado-bonus-design.md` (§4, §5, §8, §10). Auditoria: `docs/auditoria-seguranca-2026-11.md`. Material de apoio (mapas do código com arquivo:linha, gerados em 2026-11-06): `docs/superpowers/plans/apoio/2026-11-06-mapa-app-publico.md` e `docs/superpowers/plans/apoio/2026-11-06-mapa-admin-sql.md` — **as linhas podem estar defasadas; confirme no arquivo antes de editar**.

## Global Constraints

- **AGENTS.md:** esta versão do Next.js tem mudanças incompatíveis; antes de escrever código de rota, redirect, metadata, `proxy`, `robots` ou `sitemap`, leia o guia relevante em `node_modules/next/dist/docs/` e respeite avisos de depreciação.
- Tudo em **português do Brasil** (UI, mensagens de erro, commits, docs).
- **Nada de segredos** em commits, logs ou docs. Sem e-mail ou dado pessoal real em testes (usar `*.invalid`).
- **Nunca aplicar SQL em produção** neste plano. Testes de SQL rodam só no banco local (Task 1). Aplicar a `0010` em produção é decisão do dono (janela única SQL + deploy) e fica **fora** deste plano.
- Funções SQL novas: `SECURITY DEFINER`, `set search_path = public, extensions`, nunca aceitam papel, uid ou preço do cliente; `revoke all ... from public` e `grant execute` só a quem precisa.
- Decisões do dono (spec §12): checkout de convidado **revogado** para `anon`; supervisor vê Pedidos **sem** `valor_*`/`preco_unit`; webhook mantém a chave anon com `p_transaction_amount` obrigatório; supervisor edita o cadastro mas **não** preço (`preco`, `preco_atacado`, `desconto_percentual`, `desconto_atacado_percentual`); produto criado por supervisor nasce `ativo = false` e `preco = 0`.
- LP pública mostra preço de **varejo e de atacado** dos até 8 destaques (decisão do dono); nunca `preco_atacado` bruto, `desconto_atacado_percentual`, custo nem estoque por tamanho.
- Vitest só roda `__tests__/**/*.test.ts` em ambiente node (sem jsdom): toda regra testável é função pura em `lib/`.
- Chave nova de texto da LP entra em `TEXTOS_PADRAO` (`lib/textos.ts`) **e** em `GRUPOS_TEXTOS` (`lib/admin-textos.ts`); `mesclarTextos` ignora chave desconhecida.
- Existe um ramo `DEMO` (`LOLA_DEMO=1`) nos leitores de dados; as funções novas devem mantê-lo.
- Gates verdes ao fim de cada tarefa de app: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Ao fim de cada tarefa de SQL: `npm run db:test` (Task 1).
- Commits pequenos, mensagem convencional em português, trailer `Co-Authored-By` do modelo que escreveu.

---

## File Structure

SQL / testes de banco:
- Create `supabase/local/00-reset.sql`, `supabase/local/01-shim-supabase.sql` — complementos só do ambiente de teste local (não vão para produção).
- Create `scripts/db-local.mjs` — sobe o Postgres do Supabase em Docker, aplica `0001..0010`, roda testes.
- Create `supabase/migrations/0010_site_so_atacado.sql` — migração única, por seções (A flags/config, B catálogo, C checkout+bônus+webhook, D papéis/pedidos/produtos, E higiene).
- Create `supabase/testes/0010-*.sql` — testes funcionais do banco (um arquivo por seção).
- Modify `supabase/rls-teste.sql` — casos novos (spec §4.2/§8).
- Modify `supabase/smoke.sql`; Create `supabase/rollback-0010.sql`; Modify `scripts/build-release-sql.mjs` (gera `supabase/release-0010.sql`).

App (`lib/`, `app/`, `components/`):
- Create `lib/loja-flags.ts`, `lib/lp.ts`; Modify `lib/atacado.ts`, `lib/types.ts`, `lib/roles.ts`, `lib/admin-acesso.ts`, `lib/header-menu.ts`, `lib/header-dados.ts`, `lib/textos.ts`, `lib/admin-textos.ts`, `lib/auth.ts`.
- Modify `app/page.tsx` (LP), `app/atacado/**`, `app/produto/**`, `app/carrinho/**`, `app/surpresa/**`, `app/checkout/**`, `app/minha-conta/**`, `app/entrar/**`, `app/admin/**`, `app/api/categoria-img/[id]/route.ts`, `components/**`.
- Tests: `__tests__/loja-flags.test.ts`, `__tests__/atacado-bonus.test.ts`, `__tests__/lp.test.ts` (novos); atualizar `roles.test.ts`, `admin-acesso.test.ts`, `header-menu.test.ts`, `types.test.ts`, `textos.test.ts`, `admin-textos.test.ts`.

---

### Task 1: Banco local de teste (Docker) e `npm run db:test`

**Files:**
- Create: `supabase/local/00-reset.sql`, `supabase/local/01-shim-supabase.sql`
- Create: `scripts/db-local.mjs`
- Modify: `package.json` (scripts `db:up`, `db:test`, `db:down`)
- Modify: `.gitignore` não precisa; nada de dados em disco.

**Interfaces:**
- Produces: `npm run db:test` — recria o schema `public`, aplica `supabase/migrations/*.sql` em ordem (todas as que existirem), roda `supabase/rls-teste.sql` e todos os `supabase/testes/*.sql`, e **termina com código ≠ 0** se algum caso do roteiro falhar além dos esperados ou se qualquer teste funcional levantar exceção. Consumido por todas as tarefas de SQL.
- Produces: contêiner `lola-pg` (porta 54329) reutilizável.

Fatos verificados em 2026-11-06 (sessão do plano): a imagem `public.ecr.aws/supabase/postgres:17.11.0.004` já existe localmente; com os dois complementos abaixo, `0001..0009` aplicam sem erro e `rls-teste.sql` dá **60/62** com falhas só nos casos 19 e 21, igual à produção.

- [ ] **Step 1: Criar `supabase/local/01-shim-supabase.sql`**

```sql
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
```

- [ ] **Step 2: Criar `supabase/local/00-reset.sql`**

```sql
-- Recria o schema public como o Supabase entrega (rodar como postgres).
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
```

- [ ] **Step 3: Criar `scripts/db-local.mjs`**

```javascript
// Banco local de teste: Postgres do Supabase em Docker.
// Uso: node scripts/db-local.mjs up|test|down
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NOME = "lola-pg";
const IMAGEM = "public.ecr.aws/supabase/postgres:17.11.0.004";
const raiz = process.cwd();

function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
}

function psql(usuario, sql, { transacaoUnica = false } = {}) {
  const args = ["exec", "-i", NOME, "psql", "-U", usuario, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-A", "-F", "|"];
  if (transacaoUnica) args.push("-1");
  const r = spawnSync("docker", args, { input: sql, encoding: "utf8" });
  return { codigo: r.status, saida: (r.stdout || "") + (r.stderr || "") };
}

function subir() {
  const existe = docker(["ps", "-a", "--filter", `name=^${NOME}$`, "--format", "{{.Names}}"]).trim();
  if (!existe) {
    docker(["run", "-d", "--name", NOME, "-e", "POSTGRES_PASSWORD=postgres", "-p", "54329:5432", IMAGEM]);
  } else {
    spawnSync("docker", ["start", NOME]);
  }
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", NOME, "pg_isready", "-U", "supabase_admin", "-h", "localhost"]);
    if (r.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error("Postgres não ficou pronto");
}

function aplicarSql(usuario, arquivo, opts) {
  const r = psql(usuario, readFileSync(arquivo, "utf8"), opts);
  if (r.codigo !== 0) {
    console.error(`FALHOU ${arquivo}\n${r.saida}`);
    process.exit(1);
  }
  return r.saida;
}

function testar() {
  subir();
  // shim exige dono de auth.users; reset e migrações rodam como postgres
  aplicarSql("supabase_admin", join(raiz, "supabase/local/01-shim-supabase.sql"));
  aplicarSql("postgres", join(raiz, "supabase/local/00-reset.sql"));
  const migracoes = readdirSync(join(raiz, "supabase/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const m of migracoes) {
    aplicarSql("postgres", join(raiz, "supabase/migrations", m));
    console.log(`ok  ${m}`);
  }
  // Roteiro de isolamento: linhas "ok = f" que não estejam na lista esperada falham o teste.
  const esperadas = new Set((process.env.RLS_FALHAS_ESPERADAS ?? "").split(",").filter(Boolean).map(Number));
  const saida = aplicarSql("postgres", join(raiz, "supabase/rls-teste.sql"), { transacaoUnica: true });
  const linhas = saida.split("\n").filter((l) => /\|(t|f)$/.test(l));
  const falhas = linhas.filter((l) => l.endsWith("|f")).map((l) => Number(l.split("|")[0]));
  const inesperadas = falhas.filter((n) => !esperadas.has(n));
  console.log(`rls-teste: ${linhas.length - falhas.length}/${linhas.length} ok; falhas: [${falhas.join(",")}]`);
  if (inesperadas.length) {
    console.error(`FALHAS INESPERADAS: [${inesperadas.join(",")}]`);
    process.exit(1);
  }
  // Testes funcionais: cada arquivo levanta exceção se algo falhar.
  const dirTestes = join(raiz, "supabase/testes");
  if (existsSync(dirTestes)) {
    for (const t of readdirSync(dirTestes).filter((f) => f.endsWith(".sql")).sort()) {
      aplicarSql("postgres", join(dirTestes, t), { transacaoUnica: true });
      console.log(`ok  testes/${t}`);
    }
  }
}

const cmd = process.argv[2];
if (cmd === "up") subir();
else if (cmd === "down") spawnSync("docker", ["rm", "-f", NOME], { stdio: "inherit" });
else if (cmd === "test") testar();
else {
  console.error("uso: node scripts/db-local.mjs up|test|down");
  process.exit(2);
}
```

- [ ] **Step 4: Adicionar os scripts em `package.json`**

Em `"scripts"` acrescente: `"db:up": "node scripts/db-local.mjs up"`, `"db:test": "node scripts/db-local.mjs test"`, `"db:down": "node scripts/db-local.mjs down"`.

- [ ] **Step 5: Rodar e confirmar o baseline**

Run: `RLS_FALHAS_ESPERADAS=19,21 npm run db:test`
Expected: `ok  0001..0009`, `rls-teste: 60/62 ok; falhas: [19,21]`, exit 0. Sem `RLS_FALHAS_ESPERADAS`, o mesmo comando termina com `FALHAS INESPERADAS: [19,21]` e exit 1 (prova de que o gate funciona).

- [ ] **Step 6: Commit**

```bash
git add supabase/local scripts/db-local.mjs package.json
git commit -m "chore: banco local de teste (Docker) e npm run db:test"
```

---

### Task 2: `0010` seção A — flags, config e bônus nas tabelas

**Files:**
- Create: `supabase/migrations/0010_site_so_atacado.sql` (cabeçalho + seção A)
- Create: `supabase/testes/0010-a-flags.sql`

**Interfaces:**
- Produces (SQL): colunas `admin_config.varejo_ativo` (default `false`), `bonus_ativo` (default `false`), `bonus_min_pecas` (default `15`), `bonus_produto_id`, `bonus_quantidade` (default `1`); `products.somente_bonus`; `orders.bonus_aplicado`, `orders.bonus_aviso`; funções `get_loja_flags() returns jsonb` (anon + authenticated), `admin_set_loja_config(boolean, boolean, int, uuid, int) returns void` (superadmin), `admin_get_config()` com os campos novos (superadmin). Consumidas pelas Tasks 4, 6, 8, 9, 10.
- JSON de `get_loja_flags()`: `{"varejo_ativo": bool, "bonus_ativo": bool, "bonus_min_pecas": int, "bonus_quantidade": int, "bonus_produto_nome": text|null}`.

- [ ] **Step 1: Escrever o teste que falha — `supabase/testes/0010-a-flags.sql`**

```sql
-- Seção A: flags e config. Levanta exceção se algo falhar. Roda em transação única.
do $t$
declare r jsonb; u uuid := '00000000-0000-4000-8000-0000000000c3'; v_obt text;
begin
  -- padrão seguro: varejo desligado, bônus desligado
  r := get_loja_flags();
  if (r->>'varejo_ativo')::boolean is distinct from false then raise exception 'FALHOU: varejo_ativo deve começar false (%)', r; end if;
  if (r->>'bonus_ativo')::boolean is distinct from false then raise exception 'FALHOU: bonus_ativo deve começar false'; end if;
  if (r->>'bonus_min_pecas')::int <> 15 then raise exception 'FALHOU: bonus_min_pecas padrão 15'; end if;

  -- anon lê as flags; só superadmin grava
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't-sa@teste.invalid', now(), now(), now());
  update profiles set papel = 'superadmin' where id = u;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform get_loja_flags();                                   -- anon pode
  begin
    perform admin_set_loja_config(true, false, 15, null, 1);   -- anon não pode
    raise exception 'FALHOU: anon gravou config';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform admin_set_loja_config(true, false, 20, null, 2);
  r := admin_get_config();
  if (r->>'varejo_ativo')::boolean is distinct from true or (r->>'bonus_min_pecas')::int <> 20 then
    raise exception 'FALHOU: admin_get_config não reflete a gravação (%)', r;
  end if;
  begin
    perform admin_set_loja_config(false, true, 15, null, 1);   -- bônus ligado sem produto
    raise exception 'FALHOU: aceitou bônus ligado sem produto';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  reset role;
  raise exception 'TESTE_A_OK';   -- desfaz tudo; capturado pelo runner? ver Step 4
end $t$;
```

Nota de convenção para **todos** os arquivos em `supabase/testes/`: o `db-local.mjs` roda cada arquivo em transação única (`-1`); o arquivo **termina** com `raise exception 'TESTE_..._OK'` e o runner trata a mensagem `TESTE_*_OK` como sucesso (Step 4 ajusta o runner). Qualquer outra exceção é falha.

- [ ] **Step 2: Ajustar o runner para aceitar `TESTE_*_OK`**

Em `scripts/db-local.mjs`, na função que roda `supabase/testes/*.sql`, trate assim: se `psql` retornar código ≠ 0 **e** a saída contiver `TESTE_` seguido de `_OK`, considere sucesso; caso contrário, falha como hoje.

```javascript
for (const t of readdirSync(dirTestes).filter((f) => f.endsWith(".sql")).sort()) {
  const r = psql("postgres", readFileSync(join(dirTestes, t), "utf8"), { transacaoUnica: true });
  const ok = /TESTE_[A-Z0-9_]+_OK/.test(r.saida);
  if (!ok) { console.error(`FALHOU testes/${t}\n${r.saida}`); process.exit(1); }
  console.log(`ok  testes/${t}`);
}
```

- [ ] **Step 3: Rodar e ver o teste falhar**

Run: `RLS_FALHAS_ESPERADAS=19,21 npm run db:test`
Expected: FAIL em `testes/0010-a-flags.sql` com "function get_loja_flags() does not exist".

- [ ] **Step 4: Criar a migração com o cabeçalho e a seção A**

`supabase/migrations/0010_site_so_atacado.sql`:

```sql
-- =====================================================================
-- 0010_site_so_atacado.sql — site só atacado, catálogo fechado, bônus, papéis
-- Autoridade: specs 2026-10-27 (§4) e 2026-11-05 (§5, §12); auditoria S-01..S-08.
-- Aplicar em UMA janela junto com o deploy (a revogação do SELECT quebra o app antigo).
-- Rollback: supabase/rollback-0010.sql
-- =====================================================================
set search_path = public, extensions;

-- ========== A. FLAGS, CONFIG E COLUNAS DO BÔNUS ==========
alter table admin_config
  add column if not exists varejo_ativo boolean not null default false,
  add column if not exists bonus_ativo boolean not null default false,
  add column if not exists bonus_min_pecas int not null default 15 check (bonus_min_pecas >= 1),
  add column if not exists bonus_produto_id uuid null references products(id) on delete set null,
  add column if not exists bonus_quantidade int not null default 1 check (bonus_quantidade >= 1);

alter table products add column if not exists somente_bonus boolean not null default false;

alter table orders
  add column if not exists bonus_aplicado boolean not null default false,
  add column if not exists bonus_aviso text null;

create or replace function get_loja_flags()
returns jsonb language sql security definer stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'varejo_ativo', c.varejo_ativo,
    'bonus_ativo', c.bonus_ativo,
    'bonus_min_pecas', c.bonus_min_pecas,
    'bonus_quantidade', c.bonus_quantidade,
    'bonus_produto_nome', (select p.nome from products p where p.id = c.bonus_produto_id and p.ativo))
  from admin_config c where c.id = 1
$$;
revoke all on function get_loja_flags() from public;
grant execute on function get_loja_flags() to anon, authenticated;

create or replace function admin_get_config()
returns jsonb language plpgsql security definer set search_path = public, extensions stable as $$
begin
  perform assert_papel(array['superadmin']);
  return (select jsonb_build_object(
    'taxa_entrega_local', taxa_entrega_local, 'whatsapp', whatsapp, 'cidade_taxa', cidade_taxa,
    'varejo_ativo', varejo_ativo, 'bonus_ativo', bonus_ativo, 'bonus_min_pecas', bonus_min_pecas,
    'bonus_produto_id', bonus_produto_id, 'bonus_quantidade', bonus_quantidade)
  from admin_config where id = 1);
end $$;

create or replace function admin_set_loja_config(
  p_varejo_ativo boolean, p_bonus_ativo boolean, p_bonus_min_pecas int,
  p_bonus_produto_id uuid, p_bonus_quantidade int
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform assert_papel(array['superadmin']);
  if coalesce(p_bonus_min_pecas, 0) < 1 or coalesce(p_bonus_quantidade, 0) < 1 then
    raise exception 'valores do bônus inválidos';
  end if;
  if coalesce(p_bonus_ativo, false)
     and (p_bonus_produto_id is null or not exists (select 1 from products where id = p_bonus_produto_id)) then
    raise exception 'produto do bônus obrigatório para ligar a bonificação';
  end if;
  update admin_config set varejo_ativo = coalesce(p_varejo_ativo, false),
    bonus_ativo = coalesce(p_bonus_ativo, false), bonus_min_pecas = p_bonus_min_pecas,
    bonus_produto_id = p_bonus_produto_id, bonus_quantidade = p_bonus_quantidade
  where id = 1;
end $$;
revoke all on function admin_set_loja_config(boolean, boolean, int, uuid, int) from public, anon;
grant execute on function admin_set_loja_config(boolean, boolean, int, uuid, int) to authenticated;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `RLS_FALHAS_ESPERADAS=19,21 npm run db:test`
Expected: `ok  0010_site_so_atacado.sql`, `ok  testes/0010-a-flags.sql`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_site_so_atacado.sql supabase/testes scripts/db-local.mjs
git commit -m "feat(db): flags de varejo e bônus, config do superadmin (0010 seção A)"
```

---

### Task 3: `0010` seção B — catálogo fechado e funções de leitura

**Files:**
- Modify: `supabase/migrations/0010_site_so_atacado.sql` (seção B)
- Create: `supabase/testes/0010-b-catalogo.sql`
- Modify: `supabase/rls-teste.sql` (casos 19, 21 viram aprovados; novos casos — ver Step 5)

**Interfaces:**
- Produces (SQL): `get_destaques_atacado() returns jsonb` (anon+authenticated; array ≤ 8: `{id, slug, nome, imagem, preco_varejo, preco_atacado}`), `get_catalogo_revendedor(p_categoria text default null) returns jsonb` (revendedor aprovado ou equipe; `{categorias:[{id,nome,slug,grupo}], produtos:[Produto]}`), `get_produto_revendedor(p_slug text) returns jsonb` (um `Produto` ou `null`), onde `Produto = {id, slug, nome, descricao, caracteristicas[], categoria:{id,nome,slug,grupo}, destaque, preco_varejo, preco_atacado, cores:[{id,nome,hex,imagens[],tamanhos:[{id,tamanho,estoque}]}]}`. Consumidas pelas Tasks 7, 8, 9, 10. `_assert_catalogo_acesso()` (interna, sem grant).
- Produces (SQL): `get_categoria_imagem(p_id uuid) returns text` (anon + authenticated): devolve só `categorias.imagem` (data URL) de categoria `ativo = true`, ou `null`; usada por `app/api/categoria-img/[id]/route.ts` (Task 8). Teste: anon obtém a imagem de categoria ativa e `null` de inativa; nada além da imagem.
- Regras: nenhuma devolve `desconto_atacado_percentual`, `preco_atacado` bruto, custo nem o objeto `categoria` cru; nenhuma reutiliza `_product_json`; excluem `ativo = false` e `somente_bonus = true`; estoque só de tamanhos do produto ativo.

- [ ] **Step 1: Escrever o teste que falha — `supabase/testes/0010-b-catalogo.sql`**

O teste cria fixtures com UUIDs fixos (como `rls-teste.sql`): uma categoria com `desconto_atacado_percentual = 40`, três produtos (`destaque` ativo; inativo; `somente_bonus`), cores/tamanhos, usuários: revendedor aprovado, revendedor pendente, supervisor, cliente. Asserções (cada uma com `raise exception 'FALHOU: ...'`):

1. `anon` chamando `get_catalogo_revendedor()` e `get_produto_revendedor('x')` → erro (`insufficient_privilege`/`sem permissão`).
2. Revendedor **pendente** chamando `get_catalogo_revendedor()` → erro; cliente → erro.
3. Revendedor aprovado: `produtos` contém só o produto ativo (não o inativo nem o `somente_bonus`); `preco_varejo` = `_preco_varejo(preco, _desconto_efetivo(p))`; `preco_atacado` = `_preco_atacado(preco, preco_atacado, 40)`; o JSON **não** contém as chaves `desconto_atacado_percentual`, `preco_atacado` com valor bruto de override diferente do calculado, nem `custo`; `categoria` não contém `desconto_atacado_percentual` (`(r::text) not like '%desconto_atacado_percentual%'`).
4. Supervisor: consegue chamar `get_catalogo_revendedor()`.
5. `anon`: `get_destaques_atacado()` retorna só o destaque ativo com estoque, ≤ 8 itens, com `preco_varejo` e `preco_atacado` calculados e **sem** `estoque`, `cores` nem `desconto_atacado_percentual`.
6. `anon`: `select count(*) from products` → `insufficient_privilege`; idem `product_sizes`, `product_colors`, `categorias`; `authenticated` também.
7. `anon` e `authenticated` **sem** `EXECUTE` em `public_get_surpresa`: `select public_get_surpresa()` → `insufficient_privilege`.
8. Termina com `raise exception 'TESTE_B_OK'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `RLS_FALHAS_ESPERADAS=19,21 npm run db:test`
Expected: FAIL em `testes/0010-b-catalogo.sql` ("function get_catalogo_revendedor() does not exist").

- [ ] **Step 3: Implementar a seção B na migração**

Acrescente a `0010_site_so_atacado.sql`:

```sql
-- ========== B. CATÁLOGO FECHADO ==========
-- Acesso: equipe ou revendedor aprovado e ativo. Interna: nenhum papel a executa direto.
create or replace function _assert_catalogo_acesso()
returns void language plpgsql security definer stable set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_papel papel_usuario; v_ativo boolean;
begin
  if v_uid is null then raise exception 'sem permissão' using errcode = '42501'; end if;
  select p.papel, p.ativo into v_papel, v_ativo from profiles p where p.id = v_uid;
  if not coalesce(v_ativo, false) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if v_papel in ('superadmin', 'admin', 'supervisor') then return; end if;
  perform _atacado_revendedor_aprovado();   -- lança se não aprovado
end $$;
revoke all on function _assert_catalogo_acesso() from public, anon, authenticated;

-- Um produto no formato público, sem campos internos (nunca reutiliza _product_json).
create or replace function _catalogo_produto(p products, p_com_estoque boolean)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'nome', p.nome, 'descricao', p.descricao,
    'caracteristicas', to_jsonb(p.caracteristicas), 'destaque', p.destaque,
    'categoria', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'slug', c.slug, 'grupo', c.grupo)
                  from categorias c where c.id = p.categoria_id),
    'preco_varejo', _preco_varejo(p.preco, _desconto_efetivo(p)),
    'preco_atacado', _preco_atacado(p.preco, p.preco_atacado,
      (select c.desconto_atacado_percentual from categorias c where c.id = p.categoria_id)),
    'cores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id, 'nome', pc.nome, 'hex', pc.hex, 'imagens', to_jsonb(pc.imagens),
        'tamanhos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ps.id, 'tamanho', ps.tamanho, 'estoque', ps.estoque)
                           order by ps.tamanho)
          from product_sizes ps where ps.color_id = pc.id and p_com_estoque), '[]'::jsonb))
        order by pc.ordem)
      from product_colors pc where pc.product_id = p.id), '[]'::jsonb))
$$;
revoke all on function _catalogo_produto(products, boolean) from public, anon, authenticated;

create or replace function get_catalogo_revendedor(p_categoria text default null)
returns jsonb language plpgsql security definer stable set search_path = public, extensions as $$
begin
  perform _assert_catalogo_acesso();
  return jsonb_build_object(
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'slug', c.slug, 'grupo', c.grupo)
                                             order by c.ordem) from categorias c), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(_catalogo_produto(p, true) order by p.ordem, p.nome)
      from products p
      where p.ativo and not p.somente_bonus
        and (p_categoria is null or exists (select 1 from categorias c where c.id = p.categoria_id and c.slug = p_categoria))
    ), '[]'::jsonb));
end $$;

create or replace function get_produto_revendedor(p_slug text)
returns jsonb language plpgsql security definer stable set search_path = public, extensions as $$
declare v_p products;
begin
  perform _assert_catalogo_acesso();
  select * into v_p from products where slug = p_slug and ativo and not somente_bonus;
  if not found then return null; end if;
  return _catalogo_produto(v_p, true);
end $$;

-- Pública por decisão do dono (spec §2/§5.3): até 8 destaques, preços já calculados.
create or replace function get_destaques_atacado()
returns jsonb language sql security definer stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'nome', p.nome,
      'imagem', (select pc.imagens[1] from product_colors pc where p.id = pc.product_id order by pc.ordem limit 1),
      'preco_varejo', _preco_varejo(p.preco, _desconto_efetivo(p)),
      'preco_atacado', _preco_atacado(p.preco, p.preco_atacado,
        (select c.desconto_atacado_percentual from categorias c where c.id = p.categoria_id))) as j
    from products p
    where p.ativo and p.destaque and not p.somente_bonus
      and exists (select 1 from product_colors pc join product_sizes ps on ps.color_id = pc.id
                  where pc.product_id = p.id and ps.estoque > 0)
    order by p.ordem, p.nome
    limit 8) x
$$;

revoke all on function get_catalogo_revendedor(text), get_produto_revendedor(text), get_destaques_atacado() from public, anon;
grant execute on function get_catalogo_revendedor(text), get_produto_revendedor(text) to authenticated;
grant execute on function get_destaques_atacado() to anon, authenticated;

-- Imagem de categoria para a rota /api/categoria-img (só a imagem; categoria ativa).
create or replace function get_categoria_imagem(p_id uuid)
returns text language sql security definer stable set search_path = public, extensions as $$
  select c.imagem from categorias c where c.id = p_id and c.ativo
$$;
revoke all on function get_categoria_imagem(uuid) from public;
grant execute on function get_categoria_imagem(uuid) to anon, authenticated;

-- Fecha a leitura direta (achados S-01/S-02) e dropa as políticas abertas.
drop policy if exists prod_read on products;
drop policy if exists col_read on product_colors;
drop policy if exists siz_read on product_sizes;
drop policy if exists cat_read on categorias;
revoke select on products, product_colors, product_sizes, categorias from anon, authenticated;

-- S-03: a vitrine "surpresa" é de varejo e devolvia preço de atacado e estoque.
revoke all on function public_get_surpresa() from public, anon, authenticated;
```

Confirme a assinatura real de `public_get_surpresa` com `grep -n "function public_get_surpresa" supabase/migrations/*.sql` e ajuste o `revoke` se tiver argumentos; confirme os tipos de `p.caracteristicas` (`text[]`), `pc.imagens` (`text[]`) e a existência de `categorias.ordem`, `product_colors.ordem` em `0001_schema.sql`.

- [ ] **Step 4: Rodar e ver passar**

Run: `RLS_FALHAS_ESPERADAS= npm run db:test`  (agora sem falhas esperadas: o gap 19/21 fechou)
Expected: `rls-teste: 62/62 ok`, `ok testes/0010-a-flags.sql`, `ok testes/0010-b-catalogo.sql`, exit 0. Se os casos 19/21 ainda falharem, a revogação não pegou: verifique `has_table_privilege('anon','products','select')`.

- [ ] **Step 5: Ampliar `supabase/rls-teste.sql` (spec §4.2/§8)**

Acrescente casos (ids 100+): `authenticated` (cliente e revendedor pendente) sem `SELECT` em `products`, `product_colors`, `product_sizes`, `categorias`; `anon` sem `EXECUTE` em `public_get_surpresa`; `anon` e `authenticated` **sem** acesso direto, mas `get_destaques_atacado()` OK para `anon`; revendedor **recusado** (`status = 'recusado'`, novo fixture `u_rev_r`/`r_r`) sem `get_catalogo_revendedor()` e sem `atacado_cart_get()`. Atualize a contagem nos comentários e na lista de falhas esperadas do `db:test` (`RLS_FALHAS_ESPERADAS` fica vazia).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_site_so_atacado.sql supabase/testes supabase/rls-teste.sql
git commit -m "feat(db): catálogo fechado e funções de leitura por papel (0010 seção B)"
```

---

### Task 4: `0010` seção C — checkout (varejo off, bônus), convidado revogado e webhook

**Files:**
- Modify: `supabase/migrations/0010_site_so_atacado.sql` (seção C)
- Create: `supabase/testes/0010-c-checkout.sql`

**Interfaces:**
- Consumes: `admin_config` flags (Task 2); `_atacado_revendedor_aprovado()`, `_preco_atacado()`.
- Produces (SQL): `checkout_iniciar_pedido(...)` com a **mesma assinatura** de 0008 (11 argumentos), agora: varejo lança `varejo desativado` quando `admin_config.varejo_ativo = false`; atacado aplica o bônus; `EXECUTE` **só** para `authenticated` (decisão 1(a)); `mp_register_order_payment(...)` com `p_transaction_amount` **obrigatório** (sem `default null`) e comparado ao total do pedido; `public_get_order(uuid)` sem endereço.
- Regras do bônus (spec 27/10 §4): `pecas = sum(quantidade)` das linhas do carrinho (o bônus não conta); se `bonus_ativo` e `bonus_produto_id` definido e `pecas >= bonus_min_pecas`, insere um `order_item` com `preco_unit = 0`, `subtotal = 0`, `quantidade = bonus_quantidade` do tamanho de **maior estoque** do produto bônus, com `for update skip locked` (evita deadlock); sem estoque/inativo/travado: não falha, grava `orders.bonus_aviso`; marca `orders.bonus_aplicado = true` quando aplicado; o item de bônus **não** entra em `v_mp_itens` (Mercado Pago só vê itens pagos) nem na contagem de 12 SKUs; o estoque do bônus baixa pela liquidação normal (`_settle_order` já baixa todo `order_items.size_id`).

- [ ] **Step 1: Escrever o teste que falha — `supabase/testes/0010-c-checkout.sql`**

Fixtures: revendedor aprovado; 12+ SKUs (produtos/cores/tamanhos com estoque suficiente); produto bônus (`somente_bonus = true`) com estoque; `admin_config` com `bonus_ativo = true`, `bonus_min_pecas = 15`, `bonus_produto_id`, `bonus_quantidade = 1`, `varejo_ativo = false`. Executar `checkout_iniciar_pedido(..., true)` como o revendedor (`set local role authenticated` + `request.jwt.claims`). Asserções:

1. **14 peças** (12 SKUs, quantidades somando 14): pedido criado, `bonus_aplicado = false`, nenhum `order_item` com `preco_unit = 0`.
2. **15 peças**: `bonus_aplicado = true`, 1 `order_item` com `preco_unit = 0`, `quantidade = 1`, do produto bônus; `valor_produtos` **igual** à soma dos itens pagos (o bônus não soma); o JSON de retorno `itens` **não** contém o item de bônus.
3. **30 peças**: ainda **1** bônus (não acumula).
4. **Bônus sem estoque**: pedido criado, `bonus_aplicado = false`, `bonus_aviso` não nulo.
5. **Bônus desativado** (`bonus_ativo = false`) com 15 peças: sem bônus e sem aviso.
6. **Varejo off**: `checkout_iniciar_pedido(..., false)` como cliente autenticado → exceção `varejo desativado`.
7. **Convidado**: `set local role anon` e chamar `checkout_iniciar_pedido(...)` → `insufficient_privilege`.
8. **Liquidação**: após `_settle_order` (chamado como `postgres`) do pedido de 15 peças, o estoque do tamanho do bônus caiu 1 e há 1 linha em `sales` com `valor_total = 0` para o bônus.
9. **Webhook**: `mp_register_order_payment` sem `p_transaction_amount` (chamada com 3 args) → erro de função inexistente; com valor diferente de `valor_total` → exceção `valor divergente`; com valor igual → pedido `pago`.
10. Termina com `raise exception 'TESTE_C_OK'`.

- [ ] **Step 2: Rodar e ver falhar** — `npm run db:test`; Expected: FAIL (bônus não aplica / checkout ainda executável por anon).

- [ ] **Step 3: Implementar — checkout**

Copie o corpo **inteiro** de `checkout_iniciar_pedido` de `supabase/migrations/0008_checkout_atacado.sql` (linhas 33–209) para a seção C como `create or replace function checkout_iniciar_pedido(<mesmos 11 args>)`, com **exatamente** estas mudanças:

(a) Declarações novas: `v_cfg admin_config; v_pecas int; v_bsize product_sizes; v_bcolor product_colors; v_bprod products;`.

(b) No início do ramo varejo (logo após o comentário `-- ===== VAREJO`, antes de `if jsonb_array_length(...)`):

```sql
  if not coalesce((select c.varejo_ativo from admin_config c where c.id = 1), false) then
    raise exception 'varejo desativado';
  end if;
```

(c) No ramo atacado, **depois** do bloco `if v_skus < 12 then raise exception ... end if;` e **antes** do `update orders set valor_produtos = ...`:

```sql
    -- ===== BÔNUS (spec 27/10 §4): não acumula, recalculado a cada pedido =====
    select coalesce(sum(i.quantidade), 0)::int into v_pecas from order_items i where i.order_id = v_order_id;
    select * into v_cfg from admin_config where id = 1;
    if v_cfg.bonus_ativo and v_cfg.bonus_produto_id is not null and v_pecas >= v_cfg.bonus_min_pecas then
      select ps.* into v_bsize
      from product_sizes ps
      join product_colors pc on pc.id = ps.color_id
      join products p on p.id = pc.product_id
      where p.id = v_cfg.bonus_produto_id and p.ativo and ps.estoque >= v_cfg.bonus_quantidade
      order by ps.estoque desc, ps.id
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
```

O `v_mp_itens` **não** recebe o bônus (não adicione nada a ele). Em seguida mantenha o `update orders set valor_produtos = v_prod_total, valor_total = ...` (o total já exclui o bônus porque `v_prod_total` só acumulou as linhas do carrinho).

(d) Privilégios, ao fim da função:

```sql
revoke all on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
from public, anon;
grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to authenticated;
```

- [ ] **Step 4: Implementar — webhook e `public_get_order`**

1. `mp_register_order_payment`: leia a definição mais recente em `supabase/migrations/0002_functions.sql` (por volta da linha 524) e confirme se `0005`+ a redefiniram (`grep -n "mp_register_order_payment" supabase/migrations/*.sql`). Faça `drop function if exists mp_register_order_payment(<assinatura atual>)` e recrie **com a mesma lógica** mudando só: `p_transaction_amount numeric` **sem `default null`** (último argumento obrigatório) e, depois de achar o pedido e **antes** de `_settle_order`, `if abs(v_ord.valor_total - p_transaction_amount) > 0.01 then raise exception 'valor divergente'; end if;`. Reponha `revoke all ... from public; grant execute ... to anon, authenticated;` exatamente como estava (a RPC continua chamável com a chave anon + segredo, decisão 3(a)). Em `app/api/webhook/mercadopago/route.ts` o argumento passa a ser sempre enviado (ver Task 10, Step 6).
2. `public_get_order(p_id uuid)`: leia `_order_json` (0002:155-172) e recrie `public_get_order` como `select _order_json(p_id) - 'endereco_rua' - 'endereco_numero' - 'endereco_bairro' - 'endereco_complemento' - 'endereco_cep' - 'endereco_cidade'` (use os **nomes reais** das chaves do `_order_json`), mantendo `language sql security definer stable set search_path = public, extensions` e os grants atuais.

- [ ] **Step 5: Rodar e ver passar** — `npm run db:test`; Expected: `ok testes/0010-c-checkout.sql`, `rls-teste` 62/62 (+ casos novos), exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_site_so_atacado.sql supabase/testes
git commit -m "feat(db): varejo off, bônus de 15 peças, convidado revogado e webhook com valor (0010 seção C)"
```

---

### Task 5: `0010` seção D — papéis, Pedidos sem valores, produto do supervisor, higiene

**Files:**
- Modify: `supabase/migrations/0010_site_so_atacado.sql` (seções D e E)
- Create: `supabase/testes/0010-d-papeis.sql`

**Interfaces:**
- Produces (SQL): `admin_list_orders(text)` mascarando `valor_produtos`, `valor_total`, `entrega_taxa` e `items[].preco_unit/subtotal` (viram `null`) para `supervisor`; `admin_list_products`, `admin_upsert_product` (com `p_somente_bonus boolean default false` no fim), `admin_upsert_color`, `admin_upsert_size`, `admin_set_ativo`, `admin_set_destaque`, `admin_list_categorias`, `admin_upsert_categoria` aceitando `supervisor`; `admin_set_desconto`, `admin_delete_*`, `admin_set_surpresa` continuam só `admin`/`superadmin`; `set search_path` em `_slugify`, `_preco_atacado`, `_preco_varejo`.
- Regras de preço do supervisor: em `admin_upsert_product`, se o papel é `supervisor`: **update** preserva `preco`, `preco_atacado`, `desconto_percentual` atuais (ignora os argumentos); **insert** grava `preco = 0`, `preco_atacado = null`, `desconto_percentual = null` e `ativo = false`. Em `admin_upsert_categoria`, supervisor preserva `desconto_atacado_percentual`. Regra para todos os papéis: `admin_set_ativo`/`admin_upsert_product` com `ativo = true` e `preco = 0` lança `defina o preço antes de ativar`.

- [ ] **Step 1: Escrever o teste que falha — `supabase/testes/0010-d-papeis.sql`**

Fixtures: usuários supervisor, admin, superadmin; pedido de varejo com itens (valores > 0); produto com preço 100 e `preco_atacado` 60; categoria com `desconto_atacado_percentual` 40. Asserções:

1. Supervisor: `admin_list_orders()` → todo pedido tem `valor_total`, `valor_produtos`, `entrega_taxa` = JSON `null` e cada item com `preco_unit`/`subtotal` = JSON `null`; `cliente_telefone`/`telefone` continua presente.
2. Admin: `admin_list_orders()` mantém os valores.
3. Supervisor: `admin_upsert_product(null, ..., p_preco => 999, ..., p_ativo => true, ...)` cria produto com `preco = 0` e `ativo = false` (ignora 999 e `ativo`).
4. Supervisor edita (`p_id` do produto de preço 100) mudando nome e passando `p_preco => 1`, `p_preco_atacado => 1`, `p_desconto_percentual => 99`: nome muda; `preco = 100`, `preco_atacado = 60`, `desconto_percentual` inalterado.
5. Supervisor: `admin_upsert_categoria` não altera `desconto_atacado_percentual` (40 continua 40).
6. Supervisor: `admin_delete_product(...)`, `admin_set_desconto(...)`, `admin_set_surpresa(...)` → erro de permissão.
7. Qualquer papel: `admin_set_ativo(<produto com preco 0>, true)` → exceção `defina o preço antes de ativar`.
8. Visitante e cliente: `admin_list_products()` → erro.
9. `_slugify`, `_preco_atacado`, `_preco_varejo` com `proconfig` contendo `search_path`: `select count(*) from pg_proc where proname in ('_slugify','_preco_atacado','_preco_varejo') and proconfig is null` = 0.
10. Termina com `raise exception 'TESTE_D_OK'`.

Use o mapa admin/SQL (`apoio/2026-11-06-mapa-admin-sql.md` §6) para as **assinaturas exatas** (por exemplo `admin_set_ativo`, `admin_set_desconto`, `admin_set_surpresa`, `admin_upsert_categoria`, `admin_upsert_color`, `admin_upsert_size`) — o teste deve usar os nomes de argumento reais.

- [ ] **Step 2: Rodar e ver falhar** — `npm run db:test`; Expected: FAIL (supervisor ainda vê valores / recebe erro em produtos).

- [ ] **Step 3: Implementar a seção D**

Para **cada** função da lista de Interfaces: abra a definição mais recente (mapa §6 informa o arquivo:linha), copie o corpo para a `0010` como `create or replace function` (ou `drop function if exists <assinatura antiga>` + `create`, no caso de `admin_upsert_product` por causa do argumento novo), e mude **somente**:

- `assert_papel(array['superadmin','admin'])` → `v_papel := assert_papel(array['superadmin','admin','supervisor'])` nas funções de cadastro (declare `v_papel text;`).
- `admin_upsert_product`: dentro do `insert`/`update`, para `v_papel = 'supervisor'` use `case` conforme as regras de preço acima, e acrescente a coluna `somente_bonus = coalesce(p_somente_bonus, false)`. Antes de gravar com `ativo = true` valide `v_preco_final > 0` senão `raise exception 'defina o preço antes de ativar'`.
- `admin_set_ativo`: antes do `update`, se o novo valor é `true` e o produto tem `preco = 0`, `raise exception 'defina o preço antes de ativar'`.
- `admin_upsert_categoria`: se `v_papel = 'supervisor'`, o `update` não toca `desconto_atacado_percentual`; no `insert` por supervisor, `desconto_atacado_percentual = null`.
- `admin_list_orders(p_filtro text default 'todos')`: depois de montar o jsonb de cada pedido, se `v_papel = 'supervisor'` aplique a máscara (modelo: `admin_list_sales`, `0005:285-298`):

```sql
-- dentro do select que monta cada pedido (o) já com v_papel := assert_papel(array['superadmin','admin','supervisor'])
case when v_papel = 'supervisor' then
  (o_json || jsonb_build_object('valor_produtos', null, 'valor_total', null, 'entrega_taxa', null,
     'items', coalesce((select jsonb_agg(it || jsonb_build_object('preco_unit', null, 'subtotal', null))
                        from jsonb_array_elements(o_json->'items') it), '[]'::jsonb)))
else o_json end
```

(onde `o_json` é `_order_json(o.id) || {telefone, mp_payment_id, forma_pagamento, revendedor_id}` como hoje). Confirme os nomes reais das chaves (`items`, `valor_total`...) lendo `_order_json` (0002:155-172).

Seção E (higiene, S-08): `alter function _slugify(text) set search_path = public, extensions;` e idem para `_preco_atacado(numeric, numeric, int)` e `_preco_varejo(numeric, int)`.

- [ ] **Step 4: Rodar e ver passar** — `npm run db:test`; Expected: `ok testes/0010-d-papeis.sql`, `rls-teste` todos ok (os casos 84 e similares continuam INFO), exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_site_so_atacado.sql supabase/testes
git commit -m "feat(db): supervisor sem valores em Pedidos e sem preço em produtos (0010 seções D/E)"
```

---

### Task 6: Pacote de lançamento do SQL (`release-0010.sql`, rollback e smoke)

**Files:**
- Modify: `scripts/build-release-sql.mjs`
- Create (gerados): `supabase/release-0010.sql`, `supabase/rollback-0010.sql` (este escrito à mão)
- Modify: `supabase/smoke.sql`

**Interfaces:**
- Produces: `supabase/release-0010.sql` = cabeçalho de instruções + conteúdo de `0010_site_so_atacado.sql`; `npm run release:sql` regenera os dois pacotes (o antigo `release-unico.sql` fica como está e não é regenerado; leia `scripts/build-release-sql.mjs` antes de mexer e **não** quebre o modo atual).
- `supabase/rollback-0010.sql`: devolve `SELECT` e recria as quatro políticas `*_read`, devolve `EXECUTE` do checkout a `anon`, `public_get_surpresa` a `anon, authenticated`, e restaura `mp_register_order_payment`/`admin_*` ao estado de 0009 **não é necessário** (rollback de dados/colunas não é feito: as colunas novas têm default seguro). Só o necessário para o app **antigo** voltar a funcionar.

- [ ] **Step 1: Escrever `supabase/rollback-0010.sql`**

```sql
-- Rollback do que quebra o app ANTIGO (use junto com o rollback do deploy).
set search_path = public, extensions;
grant select on products, product_colors, product_sizes, categorias to anon, authenticated;
create policy prod_read on products for select using (true);
create policy col_read on product_colors for select using (true);
create policy siz_read on product_sizes for select using (true);
create policy cat_read on categorias for select using (true);
grant execute on function
  checkout_iniciar_pedido(text, text, entrega_tipo, text, text, text, text, text, text, jsonb, boolean)
to anon, authenticated;
grant execute on function public_get_surpresa() to anon, authenticated;
```

(ajuste a assinatura de `public_get_surpresa` como na Task 3). **Teste o rollback localmente:** aplique `0010`, depois `rollback-0010.sql`, e confirme que `anon` volta a ler `products` e a executar o checkout.

- [ ] **Step 2: Gerar `release-0010.sql`**

Em `scripts/build-release-sql.mjs`, acrescente uma função que concatena o cabeçalho abaixo + `supabase/migrations/0010_site_so_atacado.sql` e grava `supabase/release-0010.sql`; chame-a em `npm run release:sql` sem alterar a geração existente.

```
-- release-0010.sql — APLICAR NA MESMA JANELA DO DEPLOY (SQL primeiro, merge em seguida).
--   0. Antes: confira Authentication > Providers > Email: "Confirm email" LIGADO e troca segura de e-mail.
--   1. Cole o arquivo inteiro no SQL Editor do projeto LOLA e rode uma vez.
--   2. Rode supabase/smoke.sql (todas as linhas ok = true) e supabase/rls-teste.sql.
--   3. Mergeie/deploye o app imediatamente (o app antigo perde o catálogo e o checkout de convidado).
--   Rollback: supabase/rollback-0010.sql + rollback do deploy.
```

- [ ] **Step 3: Atualizar `supabase/smoke.sql`**

Mapa admin/SQL §7: as linhas que esperam `checkout_iniciar_pedido` executável por `anon` (≈ linha 70) e `get_textos` com 19 chaves (≈ linha 80) vão falhar. Ajuste: `checkout_iniciar_pedido` **sem** `EXECUTE` para `anon` e com para `authenticated`; `get_textos` com o novo total de chaves (Task 8); acrescente linhas: colunas novas existem, `get_loja_flags()` existe, `get_destaques_atacado()` é executável por `anon`, `get_catalogo_revendedor(text)` **não** é executável por `anon`, políticas `prod_read/col_read/siz_read/cat_read` **ausentes**, `public_get_surpresa` sem `EXECUTE` para `anon`, `has_table_privilege('anon','products','select') = false`. Mantenha somente leitura.

- [ ] **Step 4: Verificar**

Run: `npm run release:sql && npm run db:test`
Expected: arquivos gerados sem erro; `db:test` verde. Rode também `smoke.sql` no banco local (aplique `0010`, depois `docker exec -i lola-pg psql -U postgres -d postgres -A -F '|' < supabase/smoke.sql`) e confirme que toda linha tem `ok = t` (exceto "superadmin ativo", que pode ser `f` no banco local vazio).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-release-sql.mjs supabase/release-0010.sql supabase/rollback-0010.sql supabase/smoke.sql
git commit -m "chore(db): pacote de lançamento da 0010, rollback e smoke"
```

---

### Task 7: Núcleo em TypeScript: flags, bônus, tipos e papéis (funções puras + testes)

**Files:**
- Create: `lib/loja-flags.ts`, `__tests__/loja-flags.test.ts`
- Modify: `lib/atacado.ts`, `__tests__/atacado-bonus.test.ts` (novo)
- Modify: `lib/types.ts`, `__tests__/types.test.ts`
- Modify: `lib/roles.ts`, `lib/admin-acesso.ts`, `__tests__/roles.test.ts`, `__tests__/admin-acesso.test.ts`

**Interfaces:**
- Produces (`lib/loja-flags.ts`):

```typescript
export type LojaFlags = {
  varejoAtivo: boolean;
  bonusAtivo: boolean;
  bonusMinPecas: number;
  bonusQuantidade: number;
  bonusProdutoNome: string | null;
};
export const FLAGS_SEGURAS: LojaFlags = {
  varejoAtivo: false, bonusAtivo: false, bonusMinPecas: 15, bonusQuantidade: 1, bonusProdutoNome: null,
};
/** Converte o JSON de get_loja_flags(); qualquer coisa inválida cai em FLAGS_SEGURAS (varejo desligado). */
export function parseLojaFlags(raw: unknown): LojaFlags;
/** Server-only: chama o RPC get_loja_flags com o cliente anônimo; falha => FLAGS_SEGURAS. */
export async function getLojaFlags(): Promise<LojaFlags>;
```

- Produces (`lib/atacado.ts`): `progressoBonus(pecas: number, min: number, ativo: boolean): { ativo: boolean; ganhou: boolean; faltam: number; pecas: number; min: number }` e `somarPecas(linhas: { quantidade: number }[]): number` (ignora quantidades inválidas/negativas).
- Produces (`lib/types.ts`): `ProdutoCatalogo` e `ProdutoGrade` ganham `precoVarejo: number`; `precoAtacado: number` passa a ser o valor **já calculado pelo banco** (não mais derivado em TS); `Order`/`OrderItem` aceitam `null` em `valor_produtos`, `valor_total`, `entrega_taxa`, `preco_unit`, `subtotal`; `OrderItem`/`Order` ganham `bonus_aplicado?: boolean`, `bonus_aviso?: string | null`.
- Produces (`lib/admin-acesso.ts`/`lib/roles.ts`): `supervisor` ganha a tela `produtos`; a ação única `catalogo` é dividida em `cadastro` (superadmin, admin, supervisor) e `preco` (superadmin, admin) e `exclusao` (superadmin, admin); `cargasIniciais` e a `MATRIZ` de testes atualizadas; helper puro `camposPrecoEditaveis(papel: Papel): boolean` (`true` só para `superadmin`/`admin`).
- Consumes: nada de tarefas anteriores de TS.

- [ ] **Step 1: Testes que falham**

`__tests__/loja-flags.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseLojaFlags, FLAGS_SEGURAS } from "@/lib/loja-flags";

describe("parseLojaFlags", () => {
  it("converte o JSON do banco", () => {
    expect(parseLojaFlags({ varejo_ativo: true, bonus_ativo: true, bonus_min_pecas: 20, bonus_quantidade: 2, bonus_produto_nome: "Chaveiro" }))
      .toEqual({ varejoAtivo: true, bonusAtivo: true, bonusMinPecas: 20, bonusQuantidade: 2, bonusProdutoNome: "Chaveiro" });
  });
  it("falha segura: null, lixo ou tipos errados => varejo desligado", () => {
    expect(parseLojaFlags(null)).toEqual(FLAGS_SEGURAS);
    expect(parseLojaFlags("x")).toEqual(FLAGS_SEGURAS);
    expect(parseLojaFlags({ varejo_ativo: "true" }).varejoAtivo).toBe(false);
  });
  it("mínimo de peças inválido volta ao padrão 15", () => {
    expect(parseLojaFlags({ bonus_min_pecas: 0 }).bonusMinPecas).toBe(15);
    expect(parseLojaFlags({ bonus_min_pecas: "abc" }).bonusMinPecas).toBe(15);
  });
});
```

`__tests__/atacado-bonus.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { progressoBonus, somarPecas } from "@/lib/atacado";

describe("progressoBonus", () => {
  it("14 peças não ganha e faltam 1", () => {
    expect(progressoBonus(14, 15, true)).toEqual({ ativo: true, ganhou: false, faltam: 1, pecas: 14, min: 15 });
  });
  it("15 ganha; 30 também (uma vez, não acumula)", () => {
    expect(progressoBonus(15, 15, true).ganhou).toBe(true);
    expect(progressoBonus(30, 15, true)).toMatchObject({ ganhou: true, faltam: 0 });
  });
  it("bônus desativado nunca ganha", () => {
    expect(progressoBonus(99, 15, false)).toMatchObject({ ativo: false, ganhou: false });
  });
});
describe("somarPecas", () => {
  it("soma e ignora lixo", () => {
    expect(somarPecas([{ quantidade: 3 }, { quantidade: 12 }])).toBe(15);
    expect(somarPecas([{ quantidade: -2 }, { quantidade: Number.NaN }, { quantidade: 4 }])).toBe(4);
  });
});
```

Para `roles`/`admin-acesso`: atualize os 3 trechos de `__tests__/admin-acesso.test.ts` e a `MATRIZ` de `__tests__/roles.test.ts` apontados no mapa admin/SQL §0 (itens 1–2): supervisor com `produtos`; `cadastro` permitido ao supervisor; `preco` e `exclusao` negados; `cargasIniciais` do supervisor passa a incluir `products` **sem** perder o `estoqueBaixo`. Acrescente teste de `camposPrecoEditaveis`.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run __tests__/loja-flags.test.ts __tests__/atacado-bonus.test.ts __tests__/roles.test.ts __tests__/admin-acesso.test.ts`; Expected: FAIL (módulos/exports inexistentes).

- [ ] **Step 3: Implementar**

`lib/loja-flags.ts`:

```typescript
import "server-only";
import { supabase } from "@/lib/supabase";

export type LojaFlags = {
  varejoAtivo: boolean;
  bonusAtivo: boolean;
  bonusMinPecas: number;
  bonusQuantidade: number;
  bonusProdutoNome: string | null;
};

export const FLAGS_SEGURAS: LojaFlags = {
  varejoAtivo: false, bonusAtivo: false, bonusMinPecas: 15, bonusQuantidade: 1, bonusProdutoNome: null,
};

function inteiroPositivo(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : padrao;
}

export function parseLojaFlags(raw: unknown): LojaFlags {
  if (!raw || typeof raw !== "object") return FLAGS_SEGURAS;
  const r = raw as Record<string, unknown>;
  return {
    varejoAtivo: r.varejo_ativo === true,
    bonusAtivo: r.bonus_ativo === true,
    bonusMinPecas: inteiroPositivo(r.bonus_min_pecas, 15),
    bonusQuantidade: inteiroPositivo(r.bonus_quantidade, 1),
    bonusProdutoNome: typeof r.bonus_produto_nome === "string" ? r.bonus_produto_nome : null,
  };
}

export async function getLojaFlags(): Promise<LojaFlags> {
  try {
    const { data, error } = await supabase.rpc("get_loja_flags");
    if (error) return FLAGS_SEGURAS;
    return parseLojaFlags(data);
  } catch {
    return FLAGS_SEGURAS;
  }
}
```

Atenção: `import "server-only"` faz o vitest falhar ao importar o módulo; **separe** em dois arquivos se necessário: `lib/loja-flags.ts` (puro: tipos, `FLAGS_SEGURAS`, `parseLojaFlags`, sem imports de servidor) e `lib/loja-flags-server.ts` (`getLojaFlags` com `server-only` e `supabase`). Os testes importam só o puro. Confirme como `lib/supabase.ts` exporta o cliente anônimo antes de importar.

`lib/atacado.ts` (acrescente):

```typescript
export function somarPecas(linhas: { quantidade: number }[]): number {
  return linhas.reduce((t, l) => (Number.isFinite(l.quantidade) && l.quantidade > 0 ? t + l.quantidade : t), 0);
}

export function progressoBonus(pecas: number, min: number, ativo: boolean) {
  const ganhou = ativo && pecas >= min;
  return { ativo, ganhou, faltam: ativo ? Math.max(0, min - pecas) : 0, pecas, min };
}
```

`lib/types.ts`, `lib/roles.ts`, `lib/admin-acesso.ts`: aplique as mudanças da seção Interfaces; siga o mapa admin/SQL §0.1–0.2 e `__tests__/admin-acesso.test.ts`. Rode `npx tsc --noEmit` e corrija **todos** os usos de `valor_*` que passam a aceitar `null` (`PedidosTab.tsx:148`, `VisaoGeralTab.tsx:193`: use um formatador `brlOuTraco(n: number | null)` que devolve `"—"` para `null`; adicione-o em `lib/types.ts` ou `lib/format.ts`, com teste).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: tudo verde (testes novos e atualizados passam, sem regressão).

- [ ] **Step 5: Commit**

```bash
git add lib __tests__
git commit -m "feat: flags do varejo, bônus, tipos e permissões do supervisor (núcleo testável)"
```

---

### Task 8: Varejo desligado no app, leituras migradas e LP

**Files (confirme linhas no mapa público §1–§7):**
- Modify: `app/page.tsx`; Create: `lib/lp.ts`, `__tests__/lp.test.ts`; `lib/textos.ts`, `lib/admin-textos.ts`, `__tests__/textos.test.ts`, `__tests__/admin-textos.test.ts`
- Modify: `app/produto/[slug]/page.tsx`, `app/carrinho/**` (wrapper de servidor), `app/surpresa/page.tsx`, `app/checkout/page.tsx`, `app/checkout/actions.ts`, `app/minha-conta/**`, `app/entrar/**` (modo cadastro de cliente oculto), `lib/auth.ts` (`exigirPapel` com `modo=revendedor`)
- Modify: `components/SiteHeader*`, `HeaderClient.tsx`, `RodapeView.tsx`, `lib/header-dados.ts`, `lib/header-menu.ts`, `__tests__/header-menu.test.ts`
- Modify: `app/api/categoria-img/[id]/route.ts`, `app/admin/actions.ts:268` (`saveCategoria`)

**Interfaces:**
- Consumes: `getLojaFlags()` / `FLAGS_SEGURAS` (Task 7); `get_destaques_atacado()` (Task 3).
- Produces (`lib/lp.ts`): `type AmostraLP = { id: string; slug: string; nome: string; imagem: string | null; precoVarejo: number; precoAtacado: number }`; `selecionarAmostra(raw: unknown): AmostraLP[]` (valida, descarta itens inválidos, no máximo 8, **vazio => seção some**); `economiaPercentual(precoVarejo: number, precoAtacado: number): number` (arredondado, 0 se inválido).
- Produces (`lib/header-menu.ts`): função pura `itensMenu({ varejoAtivo, logado, papel })` que, com `varejoAtivo = false`, **nunca** devolve sacola nem categorias, e devolve "Entrar"/"Painel"/"Seja revendedor" conforme o caso.
- Chaves de texto novas da LP (grupo "Landing de revendedores" em `GRUPOS_TEXTOS`, padrões em `TEXTOS_PADRAO`): `lp_hero_titulo`, `lp_hero_subtitulo`, `lp_hero_botao`, `lp_regras_titulo`, `lp_regra_skus`, `lp_regra_bonus`, `lp_regra_preco`, `lp_passos_titulo`, `lp_passo_1`, `lp_passo_2`, `lp_passo_3`, `lp_amostra_titulo`, `lp_amostra_aviso`, `lp_final_titulo`, `lp_final_botao`. Atualize os testes de `textos`/`admin-textos` e o total de chaves em `supabase/smoke.sql` (Task 6, Step 3) — **o `get_textos` do banco só devolve chaves que o seed/migração conhece: confirme em `0007_cms_textos_promos.sql` como `textos_loja` é semeada e acrescente a semeadura das 15 chaves na seção F da `0010`** (`insert into textos_loja(chave, valor) values (...) on conflict do nothing`, copiando o formato do seed existente).

- [ ] **Step 1: Testes que falham** — `__tests__/lp.test.ts` (seleção/validação/limite/vazio/economia) e atualização de `header-menu.test.ts` (varejo off sem sacola e sem categorias), `textos.test.ts` e `admin-textos.test.ts` (15 chaves novas presentes e agrupadas). Escreva os casos concretos seguindo o padrão dos testes existentes (mapa público §9): `selecionarAmostra` com 0, 3, 9 itens (limite 8) e itens inválidos; `economiaPercentual(100, 60) === 40`, `economiaPercentual(0, 10) === 0`.

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run __tests__/lp.test.ts __tests__/header-menu.test.ts __tests__/textos.test.ts __tests__/admin-textos.test.ts`; Expected: FAIL.

- [ ] **Step 3: Implementar o núcleo (puro)** — `lib/lp.ts`, `lib/header-menu.ts`, `lib/textos.ts`, `lib/admin-textos.ts`. Rode os testes: Expected PASS.

- [ ] **Step 4: Varejo desligado nas rotas**

Para cada rota de varejo (`/produto/[slug]`, `/carrinho`, `/surpresa`, `/checkout` ramo varejo, `/minha-conta`): quando `!flags.varejoAtivo`, `redirect("/")` (use `redirect` de `next/navigation` — confirme a convenção em `node_modules/next/dist/docs/`). `/carrinho` é Client Component: crie um `app/carrinho/layout.tsx` (Server Component) que lê `getLojaFlags()` e redireciona, sem mexer no componente cliente. `/checkout` mantém o ramo de atacado (`app/checkout/page.tsx:17`); remova o fallback de convidado de `app/checkout/actions.ts:83-85` (agora o RPC recusa `anon`) e responda com redirecionamento para `/entrar?modo=revendedor&next=/atacado` quando não houver sessão. Em `/entrar` oculte o cadastro de `cliente` (modo cadastro) quando `!varejoAtivo`, deixando "revendedor" como destaque (`LoginView.tsx:70`, `form.ts:57`). `exigirPapel` (`lib/auth.ts:109`) passa `modo=revendedor` quando o papel exigido é `revendedor`.

- [ ] **Step 5: Migrar os leitores diretos de produto**

Mapa público §7 lista os leitores. Para cada um troque a consulta direta pela função nova: `app/page.tsx:26,70` → `get_destaques_atacado()` (Home vira LP, Step 6); `app/produto/[slug]/page.tsx:19` → remover a página de varejo (redirect do Step 4) e criar `/atacado/produto/[slug]` na Task 9; `lib/header-dados.ts:24` → sem categorias quando varejo off (`getCategoriasNav` deixa de consultar); `app/api/categoria-img/[id]/route.ts:9` → trocar `.from("categorias").select("imagem")...` por `supabase().rpc("get_categoria_imagem", { p_id: id })` (função criada na Task 3; devolve o data URL ou `null`; `null` => 404), mantendo `idCategoriaValido` e `respostaImagem(data, ...)`; `app/admin/actions.ts:268` (`saveCategoria`) → usar `admin_list_categorias()` (RPC de equipe) para obter a categoria atual em vez de `.from("categorias")`. Os leitores do atacado (`app/atacado/dados.ts:127,162,196` e `app/atacado/actions.ts:71`) ficam para a Task 9 (dependem das funções de catálogo). Em todos mantenha o ramo `DEMO`.

- [ ] **Step 6: Home vira LP**

Reescreva `app/page.tsx` (Server Component) com as seções: aviso + header, hero (`lp_hero_*`, botão para `/entrar?modo=revendedor`), regras (12 SKUs; bônus só se `flags.bonusAtivo`, usando `flags.bonusProdutoNome` e `flags.bonusMinPecas`), "como funciona" (3 passos), **amostra** (`selecionarAmostra(await get_destaques_atacado())`: mostra varejo riscado/referência e atacado em destaque; sem itens a seção não renderiza; aviso `lp_amostra_aviso`), chamada final. Para o botão principal: revendedor aprovado logado → "Ir para o painel" (`/atacado`); pendente → tela de espera. Saem da Home: categorias, lançamentos, grade, `TrustStrip` de varejo. Estilo e componentes: reaproveite `SiteHeader`, `SiteFooterServer`, `PaymentsStrip`, `HeroRevendedora`/`BannerRevendedora` onde servirem (mapa público §1). Use a skill `frontend-design` para a composição visual, mantendo os tokens de `app/globals.css`.

- [ ] **Step 7: Gates** — `npm run lint && npx tsc --noEmit && npm test && npm run build`; Expected: tudo verde. Confira manualmente (preview local com `LOLA_DEMO=1`) que `/`, `/entrar`, `/carrinho` (redireciona), `/produto/x` (redireciona) respondem como esperado.

- [ ] **Step 8: Commit**

```bash
git add app lib components __tests__ supabase
git commit -m "feat: varejo desligado, Home vira LP de revendedores e leituras migradas"
```

---

### Task 9: Vitrine do revendedor (varejo + atacado), tela de espera e carrinho com bônus

**Files (mapa público §5):**
- Modify: `app/atacado/dados.ts`, `app/atacado/actions.ts`, `app/atacado/page.tsx`, `app/atacado/catalogo/**`, `app/atacado/carrinho/**`
- Create: `app/atacado/produto/[slug]/page.tsx`
- Modify: `components/atacado/CatalogoGrid.tsx` (mostrar varejo e atacado), `components/atacado/CarrinhoView.tsx` (indicador de bônus), `components/atacado/GateStatus.tsx`, `AtacadoShell.tsx`
- Modify: `lib/types.ts` (`ProdutoCatalogo`, `ProdutoGrade`), `lib/atacado.ts`; tests em `__tests__/`

**Interfaces:**
- Consumes: `get_catalogo_revendedor(p_categoria)`, `get_produto_revendedor(p_slug)` (Task 3); `progressoBonus`, `somarPecas` (Task 7); `getLojaFlags()`.
- Produces: `/atacado/catalogo` lista `produtos` com **dois preços**: "Preço de referência para revenda" (`precoVarejo`) e "Seu preço" (`precoAtacado`); `/atacado/produto/[slug]` (grade de cores/tamanhos com estoque); a margem exibida é só informativa (`precoVarejo - precoAtacado`, formatada), nunca gravada; o carrinho mostra "N de 15 peças — faltam X para ganhar <produto>" ou "Você ganhou <produto>!" ao lado do "X de 12 SKUs" (sem o indicador quando `!bonusAtivo`).
- O catálogo de equipe (`admin`) continua lendo por RPC de equipe e não muda aqui.

- [ ] **Step 1: Testes que falham** — funções puras em `lib/atacado.ts` para a UI: `margemRevenda(precoVarejo: number, precoAtacado: number): { valor: number; percentual: number }` (0 quando inválido ou atacado ≥ varejo), com testes (`margemRevenda(100, 60)` → `{ valor: 40, percentual: 40 }`; `(60, 100)` → `{ valor: 0, percentual: 0 }`); `textoBonus(p: ReturnType<typeof progressoBonus>, nomeBonus: string | null, qtd: number): string` (casos: não ganhou, ganhou, desativado → `""`). Adicione ao `__tests__/atacado-bonus.test.ts`.

- [ ] **Step 2: Rodar e ver falhar; implementar `margemRevenda` e `textoBonus`; rodar e ver passar.**

- [ ] **Step 3: Migrar as leituras do atacado** — `app/atacado/dados.ts:127,162` passam a chamar `get_catalogo_revendedor` (com a sessão do revendedor: use o cliente com cookie de sessão que o arquivo já usa para as RPCs do atacado; confirme em `lib/auth-cookies.ts`/`app/atacado/dados.ts`) e mapeiam `preco_varejo`/`preco_atacado` para `precoVarejo`/`precoAtacado` (o preço de atacado deixa de ser calculado em TS; remova a derivação de `lib/types.ts:171` e ajuste `__tests__/types.test.ts`); `dados.ts:196` (KPI de desconto) passa a derivar de `produtos` (maior diferença percentual) em vez de ler `categorias`; `actions.ts:71` (estoque para `addAoCarrinho`) usa o estoque que já vem em `get_produto_revendedor`/catálogo, ou uma consulta por RPC existente do carrinho (`atacado_cart_set_item` já valida estoque no servidor: a pré-checagem local pode ser removida se a RPC rejeitar com mensagem clara — confirme lendo a RPC em `0006`).

- [ ] **Step 4: Telas** — `CatalogoGrid.tsx:83` exibe os dois preços e a margem (`margemRevenda`); crie `/atacado/produto/[slug]`; `GateStatus.tsx` ganha a tela de espera para **pendente** e de recusa para **recusado** (texto de `textos_loja` com padrão no código); "Voltar para a loja" (`GateStatus.tsx:58`, `AtacadoShell.tsx:144,155`) aponta para `/`; `CarrinhoView.tsx` mostra o indicador com `progressoBonus(somarPecas(linhas), flags.bonusMinPecas, flags.bonusAtivo)` e `textoBonus`; o resumo do pedido (`/pedido/[id]`) e `atacado_my_orders` exibem a linha de bônus com "Bônus" e R$ 0,00 quando `bonus_aplicado`.

- [ ] **Step 5: Gates** — `npm run lint && npx tsc --noEmit && npm test && npm run build`; Expected: verde. Confira em `LOLA_DEMO=1` o catálogo com dois preços.

- [ ] **Step 6: Commit**

```bash
git add app components lib __tests__
git commit -m "feat: vitrine do revendedor com preço de varejo e atacado e indicador de bônus"
```

---

### Task 10: Painel admin (Config, Produtos, Pedidos), webhook e documentação

**Files (mapa admin/SQL §1–§5):**
- Modify: `app/admin/**` — `ConfigTab` (cards "Varejo ligado" e "Bonificação", só superadmin), `ProductEditor.tsx` (checkbox "Somente bônus"; campos de preço desabilitados para supervisor; `ativo` default `false` para novo produto do supervisor; remover a validação `!preco` que trava o supervisor), `PedidosTab.tsx`/`VisaoGeralTab.tsx` (valores `null` → "—"), `AdminApp.tsx` (acoplamento `supervisor ? estoqueBaixo` / `semReceita`), `app/admin/actions.ts` (novas ações: `salvarLojaConfig`, `somenteBonus` no `upsert`)
- Modify: `app/api/webhook/mercadopago/route.ts` (envia sempre `p_transaction_amount`)
- Modify: `README.md`, `docs/QA.md`, `AGENTS.md` (hospedagem já atualizada; acrescente a nova matriz de papéis), `STATUS.md`
- Modify: `lib/admin-acesso.ts` (já dividido na Task 7: ligar as novas ações)

**Interfaces:**
- Consumes: `admin_set_loja_config`, `admin_get_config` (Task 2); `admin_upsert_product(..., p_somente_bonus)` (Task 5); `camposPrecoEditaveis` (Task 7).
- Produces: superadmin liga/desliga o varejo e configura bônus (peças mínimas, produto, quantidade); supervisor cadastra produto sem editar preço e vê Pedidos sem valores; admin vê tudo como hoje.

- [ ] **Step 1: Teste puro** — em `__tests__/admin-acesso.test.ts` garanta que `cargasIniciais(supervisor)` contém `products` e `estoqueBaixo`, e que a ação `salvarLojaConfig` só passa para `superadmin` (use o padrão do arquivo). Rode e veja falhar.

- [ ] **Step 2: Implementar as ações e a UI do admin** conforme as Interfaces; siga o mapa admin/SQL §2 (ProductEditor), §3 (ConfigTab) e §4 (PedidosTab). Use `camposPrecoEditaveis(papel)` para `disabled` nos 3 campos de preço (`ProductEditor.tsx:216-247`) e para ocultar "desconto de atacado" da categoria para o supervisor.

- [ ] **Step 3: Webhook** — em `app/api/webhook/mercadopago/route.ts` (≈ linha 122) passe `p_transaction_amount: <transaction_amount do pagamento consultado>` sempre; se ausente, responda `{ ok: false }` e **não** chame o RPC (log). Teste puro do helper que monta os argumentos, se existir (`lib/mp-webhook.ts`, `__tests__/mp-webhook.test.ts`).

- [ ] **Step 4: Documentação** — `README.md` (seção Lançamento: passos da janela única; nova seção "Papéis e acessos" com a matriz atual; interruptor do varejo; bônus), `docs/QA.md` (itens: LP, vitrine só logado aprovado, pendente/recusado, 14 e 15 peças, varejo off, supervisor sem preço e sem valores, convidado barrado no checkout), `STATUS.md` ("Para o conselheiro": lista do que o dono precisa fazer na janela).

- [ ] **Step 5: Gates finais** — `npm run lint && npx tsc --noEmit && npm test && npm run build && RLS_FALHAS_ESPERADAS= npm run db:test`; Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add app lib __tests__ README.md docs STATUS.md
git commit -m "feat: admin com interruptor do varejo, bônus e permissões do supervisor; docs da janela"
```

---

## Self-Review (feito na escrita)

- **Cobertura da spec 05/11 §5:** §5.1 catálogo fechado e funções (Tasks 3, 8, 9), §5.2 vitrine e rotas de varejo (Tasks 8, 9), §5.3 LP com varejo+atacado dos destaques (Task 8), §5.4 papéis e supervisor (Tasks 5, 7, 10), §5.5 migração única, rollback, janela única, leitores migrados (Tasks 3, 6, 8). §12: decisão 1(a) (Task 4 Step 3d), 2(b) (Task 5), 3(a) (Task 4 Step 4 e Task 10 Step 3), 4(b) e produto nasce inativo/preço 0 (Task 5). Spec 27/10: flags, bônus e `somente_bonus` (Tasks 2, 4, 5, 9, 10).
- **Fora deste plano (Parte C, plano próprio):** GTM, consentimento, Pixel/CAPI, Cloudflare Web Analytics, SEO. **Fora também:** aplicar a `0010` em produção (decisão do dono, janela única).
- **Coerência de nomes:** `get_loja_flags`, `admin_set_loja_config`, `get_destaques_atacado`, `get_catalogo_revendedor`, `get_produto_revendedor`, `get_categoria_imagem` (criada na Task 8, Step 5 — acrescentar à seção B da migração), `LojaFlags`/`parseLojaFlags`/`FLAGS_SEGURAS`, `progressoBonus`/`somarPecas`/`margemRevenda`/`textoBonus`, `selecionarAmostra`/`economiaPercentual`, `camposPrecoEditaveis`, `itensMenu` usados de forma consistente entre tarefas.
- **Pontos que o implementador deve confirmar lendo o código (declarados, não adivinhados):** assinatura de `public_get_surpresa` e `mp_register_order_payment`; nomes das chaves de `_order_json`; formato do `admin_upsert_categoria`; como `lib/supabase.ts` exporta o cliente; como `textos_loja` é semeada.
- **Risco conhecido:** o SQL das seções C e D reescreve funções longas copiando o corpo atual; o gate é o `db:test` (62+ casos de isolamento e testes funcionais) rodando em Postgres local fiel à produção.
