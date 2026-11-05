## Sobre este projeto

Loja LOLA: varejo, login por Supabase Auth e área de atacado. A arquitetura tem
como referência a loja anterior da operação (não versionada aqui; o zip fica em
`reference/`, ignorado pelo lint).
Acesso aos dados: catálogo e textos públicos por query/RPC anônima (RLS libera
`SELECT` anônimo no catálogo; `get_textos`, `get_banner_hero` e
`get_promocoes_ativas` são RPCs públicas); todo o resto por RPCs
`SECURITY DEFINER` que validam o papel do usuário logado via Supabase Auth
(`assert_papel`). Papéis: `superadmin`, `admin`, `supervisor`, `revendedor`,
`cliente` (matriz em `lib/roles.ts` e na spec §4.4). Não existe mais senha única
de admin nem `p_secret` (exceto o webhook do Mercado Pago).
Hospedagem: Cloudflare Workers via OpenNext (Worker `sistema-lola`, build pelo
Git; saiu da Vercel em nov/2026). Variáveis e segredos vivem no Worker, não na
Vercel; detalhes, limites do plano gratuito e pendências no `README.md`
("Deploy (Cloudflare Workers)"). `ADMIN_WEBHOOK_SECRET` e
`admin_config.webhook_secret_hash` sempre mudam juntos.
Specs e planos: `docs/superpowers/specs/2026-10-02-loja-lola-release-home-login-atacado-design.md`
e `docs/superpowers/plans/2026-10-02-loja-lola-release-home-login-atacado.md`
(spec-mãe em `docs/superpowers/specs/2026-09-09-loja-lola-design.md`). Setup,
lançamento e QA em `README.md` e `docs/QA.md`; SQL de lançamento gerado por
`npm run release:sql`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
