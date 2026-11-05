# Loja LOLA — Site só atacado: auditoria de segurança, vitrine de revendedor e rastreamento

Data: 2026-11-05 · Branch: `feat/site-so-atacado` (a partir de `main`, 890f56d, já na Cloudflare)
Spec-base: `2026-10-27-loja-lola-lp-atacado-bonus-design.md` (LP de revendedores, bônus de 15 peças, varejo em off). Este documento **acrescenta e corrige** essa spec; onde houver diferença, vale este.
Spec-mãe de papéis e atacado: `2026-10-02-loja-lola-release-home-login-atacado-design.md`.

## 1. Objetivo

1. Site **só para revendedores**: sem vendas no varejo, vitrine completa só para revendedor **aprovado e logado**.
2. A vitrine mostra o **preço de varejo e o de atacado**; o varejo é a base de revenda do revendedor.
3. Garantir, **no banco**, que nenhum usuário acesse dados de outro, e conferir o que cada papel pode fazer.
4. Rastreamento e SEO para ter dados de visitas e de tráfego.

## 2. Decisões do dono (fechadas)

| Tema | Decisão |
|---|---|
| Spec de 27/10 | É a base. Mantém: interruptor do varejo (padrão desligado), bônus de 15 peças, LP de cadastro, 12 SKUs, aprovação manual por admin. |
| "Gerente" que cadastra produto | É o **supervisor**. Não existe papel novo. |
| Preços na LP pública | **Varejo e atacado** nos produtos de amostra (muda a spec de 27/10, que mostrava só atacado). |
| Ferramentas de rastreamento | Meta Pixel + API de Conversões, GA4, Google Tag Manager e Cloudflare Web Analytics. |
| Ordem de entrega | 1º auditoria (B0), 2º site só atacado (A), 3º rastreamento e SEO (C). |

## 3. Decisões propostas (assumidas neste desenho)

- Revendedor **pendente ou recusado** não vê vitrine nem preço: vê só a tela de espera/recusa em `/atacado`.
- Supervisor passa a **criar, editar e ativar/desativar** produtos e categorias. **Excluir** produto continua só para `admin` e `superadmin`. Promoções, Banner, Textos, Financeiro, Usuários e Config seguem fechados ao supervisor.
- O preço de varejo exibido ao revendedor é `products.preco` (com `desconto_percentual` aplicado, como na loja), rotulado "Preço de referência para revenda". O de atacado vem da função de preço já existente (`_preco_atacado`).
- Áreas logadas, checkout e pedido ficam `noindex` e fora do `sitemap`.

## 4. Parte B0 — Auditoria de segurança (somente leitura, primeiro)

Roda antes de qualquer mudança, contra o Supabase de produção, **sem alterar dado nem esquema**.

### 4.1 O que se inventaria
- **Tabelas:** RLS ligado? Políticas existentes. Privilégios (`SELECT/INSERT/UPDATE/DELETE`) concedidos a `anon` e `authenticated`, por tabela **e por coluna**.
- **Funções:** todas as `SECURITY DEFINER` e as públicas: valida papel com `assert_papel`/`assert_*`? Define `search_path = public, extensions`? Aceita `uid`, papel, preço ou `p_secret` do cliente? `EXECUTE` concedido a `anon`, `authenticated` ou `PUBLIC`?
- **Exposição por consulta direta:** hoje o catálogo tem `SELECT` anônimo (README). Verificar se `preco_atacado`, estoque por tamanho e produtos inativos ou futuros bônus vazam pela API REST.
- **Dados de pessoas:** `profiles`, `orders`, `order_items`, `sales`, `revendedores`, `convites` e qualquer tabela com CNPJ, telefone ou endereço.

### 4.2 Roteiro de isolamento versionado
Arquivo novo `supabase/rls-teste.sql`, repetível, que usa `set local role` e `request.jwt.claims` para agir como: visitante, cliente A, cliente B, revendedor pendente, revendedor aprovado A e B, supervisor, admin e superadmin. Cada caso afirma o resultado esperado:
- cliente A não lê pedido, perfil nem carrinho do cliente B (por tabela e por RPC);
- revendedor A não lê pedido, cadastro nem preço de outro revendedor;
- visitante não lê preço de atacado fora dos destaques da LP;
- pendente e recusado não leem vitrine (o caso de revendedor RECUSADO e os casos de leitura de catálogo por `authenticated` entram no roteiro);
- cada papel só executa as RPCs `admin_*` que a matriz permite.
Falha do roteiro = achado. O roteiro entra no `smoke.sql`/QA para rodar a cada migração.

### 4.3 Saída
Relatório `docs/auditoria-seguranca-2026-11.md` com achados por gravidade (crítico, alto, médio, baixo), evidência e correção proposta. **Correções não são aplicadas na B0**; entram na migração `0010` (parte A), revisadas.

## 5. Parte A — Site só atacado

Tudo da spec de 27/10 (§4 a §10) vale. Acréscimos e correções:

### 5.1 Catálogo só para quem pode ver (no banco)
- Revogar `SELECT` de `anon` **e de `authenticated`** nas tabelas de produto (`products`, `product_colors`, `product_sizes`, `categorias`) e dropar as políticas `prod_read`, `col_read`, `siz_read`, `cat_read` (achado S-01 da auditoria).
- As funções de catálogo nunca devolvem `desconto_atacado_percentual` nem o objeto `categoria` cru e não reutilizam `_product_json` (S-02). O único preço de atacado público é o já calculado dos até 8 destaques de `get_destaques_atacado()` (função a criar; não existe hoje).
- Revogar `EXECUTE` de `public_get_surpresa` para `anon` (ou removê-la) (S-03). Fechar o S-02 exige S-01 e S-03 juntos.
- Leitura passa a ser por funções `SECURITY DEFINER` com validação de sessão e papel:
  - `get_catalogo_revendedor(...)`: exige revendedor **aprovado** (ou equipe). Devolve nome, slug, imagens, cores, tamanhos, estoque, **preço de varejo** e **preço de atacado**. Nunca devolve custo, `preco_atacado` bruto nem campos internos.
  - `get_produto_revendedor(p_slug)`: idem, para a página do produto.
  - `get_destaques_atacado()` (pública, da spec de 27/10): agora devolve **também o preço de varejo** dos destaques. Só os destaques, no máximo 8.
- O app deixa de consultar tabelas de produto direto; usa essas funções. Cabeçalho e rodapé não dependem de produto.
- Estoque exposto só como o necessário à compra (disponível por tamanho), nunca de produto inativo ou `somente_bonus`.

### 5.2 Vitrine do revendedor (`/atacado/catalogo`, `/atacado/produto/[slug]`)
- Mostra **varejo (referência)** e **atacado (seu preço)**, e a margem implícita só como informação visual (diferença), sem cálculo gravado.
- Tela de espera para pendente/recusado; redireciona anônimo para `/entrar?modo=revendedor&next=...`.
- As rotas de varejo (`/produto/[slug]`, `/carrinho`, `/surpresa`, `/checkout` varejo, `/minha-conta`) redirecionam conforme a spec de 27/10 §5.1.

### 5.3 LP pública
Seção de amostra (`get_destaques_atacado()`) mostra **varejo riscado/referência e atacado em destaque**. Sem nenhum destaque, a seção some. Demais seções conforme a spec de 27/10 §5.2.

### 5.4 Papéis e permissões
- `lib/roles.ts`: `supervisor` ganha a tela `produtos` (cadastrar/editar). Sem `excluir`. `ACESSO`, `telasVisiveis`, `podeAcessar` e os testes de papéis atualizados.
- Banco: as RPCs de produto (`admin_list_products`, `admin_upsert_product`, `admin_upsert_color`, `admin_upsert_size`, `admin_set_ativo`, `admin_set_destaque`, `admin_list_categorias`, `admin_upsert_categoria`) passam a aceitar `supervisor`; `admin_delete_*` continua só `admin`/`superadmin`. O supervisor edita o **cadastro**, mas os **campos de preço** (`preco`, `preco_atacado`, `desconto_percentual` do produto e `desconto_atacado_percentual` da categoria) ficam só com `admin` e `superadmin` (decisão 4(b), §12). No banco, `admin_upsert_product` e `admin_upsert_categoria` **preservam** o valor atual desses campos quando o chamador é `supervisor` (ignoram o que vier do cliente); `admin_set_desconto` continua só `admin`/`superadmin`. Produto **criado por supervisor** nasce com `preco = 0` e `ativo = false`, e só vai para a vitrine depois que um admin define o preço e ativa (hipótese operacional a confirmar no plano). Na tela de Produtos, os campos de preço aparecem desabilitados para o supervisor.
- **Pedidos para o supervisor** (decisão 2(b)): `admin_list_orders` mascara `valor_produtos`, `valor_total`, `entrega_taxa` e `preco_unit`/`subtotal` dos itens para `supervisor`, como `admin_list_sales` já faz; telefone e endereço continuam visíveis (a operação precisa deles). A matriz do README e do `docs/QA.md` é atualizada.
- Revisão da matriz completa (todas as `admin_*`) feita na B0 e fechada aqui.

### 5.5 Migração e ordem de aplicação
`supabase/migrations/0010_lp_atacado_bonus.sql` (spec de 27/10) **mais** as funções de §5.1, as revogações de privilégio (incluindo `EXECUTE` de `checkout_iniciar_pedido` para `anon`, decisão 1(a): o checkout de atacado já exige login, `auth.uid()`, e o de varejo de convidado fica fechado até uma migração futura, quando o varejo for religado), a abertura de `supervisor` e as correções da B0, incluindo a higiene do S-08 (`set search_path` em `_slugify`, `_preco_atacado` e `_preco_varejo`). Entra no `release-unico.sql` e no `smoke.sql`/`rls-teste.sql`. Ordem: SQL primeiro, depois merge/deploy (spec de 27/10 §10). Como o app novo passa a ler catálogo por função e a revogação quebra o app antigo, aplicar SQL e deploy **na mesma janela**, em horário de pouco movimento. Antes da janela, ter o rollback do SQL pronto: reconceder o `SELECT` **e** recriar as políticas `*_read` (`create policy ... for select using (true)`), senão o catálogo fica vazio com a RLS ligada. Leitores diretos das tabelas de produto no app hoje, a migrar para as funções: `app/page.tsx`, `app/produto/[slug]/page.tsx`, `app/atacado/dados.ts`, `app/atacado/actions.ts`, `lib/header-dados.ts` (lê `categorias`), `app/api/categoria-img/[id]/route.ts` (lê `categorias`) e `app/admin/actions.ts` (confirmar se roda com sessão de equipe via RPC ou leitura direta).

## 6. Parte C — Rastreamento e SEO

### 6.1 Etiquetas
- **GTM** instalado em `app/layout.tsx` via `next/script` (`afterInteractive`). GA4 e Meta Pixel são configurados **dentro do GTM**; mudar tag não exige deploy.
- **Cloudflare Web Analytics** (beacon) para contagem sem cookies; remove `@vercel/analytics` do `layout.tsx` e do `package.json`, e `vitals.vercel-insights.com` do CSP em `next.config.ts`, que passa a liberar os domínios do GTM, GA4, Meta e Cloudflare.
- IDs e tokens por variável: `NEXT_PUBLIC_GTM_ID` e `NEXT_PUBLIC_META_PIXEL_ID` (públicas, também em `vars` do `wrangler.jsonc` e em Build); `META_CAPI_TOKEN` (Secret do Worker).

### 6.2 Consentimento (LGPD)
Aviso de cookies com Consent Mode v2: `analytics_storage` e `ad_storage` **negados** por padrão; liberados só após aceite. Sem aceite, o Pixel não dispara e o GA4 não guarda identificadores. Componente `components/ConsentimentoCookies.tsx` e texto na política de privacidade.

### 6.3 Eventos (`dataLayer`)
`cadastro_revendedor_iniciado`, `cadastro_revendedor_concluido`, `login`, `vitrine_vista`, `produto_visto`, `carrinho_atacado_item_adicionado`, `pedido_atacado_iniciado` e `compra` (pedido pago). Sem dado pessoal em claro no `dataLayer`; e-mail e telefone só em hash SHA-256 quando houver consentimento. O UUID do pedido (`/pedido/[id]`) não vai em `page_location` nem em URLs enviadas ao GA4/Meta (S-04); a Parte A reduz também o que `public_get_order` devolve (sem endereço).

### 6.4 API de Conversões (servidor)
No webhook do Mercado Pago (`app/api/webhook/mercadopago/route.ts`), após marcar o pedido como `pago`, envia `Purchase` à API de Conversões da Meta com `event_id = id do pedido` (mesmo `event_id` do evento do navegador, para deduplicar), valor e moeda. Falha da API de Conversões **nunca** falha o webhook nem o registro do pagamento (try/catch, log).

### 6.5 SEO
- `metadata` por página (título, descrição, canonical, Open Graph, `metadataBase = https://lolaonline.com.br`).
- `app/sitemap.ts` (só LP e páginas públicas) e `app/robots.ts` (disallow `/admin`, `/atacado`, `/checkout`, `/pedido`, `/minha-conta`, `/entrar`, `/api`).
- `noindex` nas áreas logadas. JSON-LD `Organization` na LP.
- Verificação: Search Console e GA4 conectados pelo dono; este passo é manual.

## 7. Segurança e riscos

1. A revogação de `SELECT` em tabelas de produto muda como o app lê dados: risco de quebrar telas. Mitigação: testes do `rls-teste.sql`, `npm run build`/`test`, QA manual de vitrine e janela única SQL+deploy.
2. Mexer em `checkout_iniciar_pedido` (dinheiro e estoque; bônus da spec de 27/10 e revogação de `EXECUTE` para `anon`): revisão dedicada obrigatória.
3. Hash de e-mail/telefone e consentimento: seguir LGPD; revisar texto com o agente `juridico-lgpd-brasil` antes de publicar o aviso.
4. O webhook do Mercado Pago continua chamando `mp_register_order_payment`, mas `p_transaction_amount` passa a ser obrigatório (S-06). A RPC **continua** chamável com a chave anon, protegida pelo segredo longo já rotacionado (decisão 3(a), §12); não se migra para a service role. A chamada à API de Conversões é isolada.
5. O catálogo atual é de demonstração; o cadastro real de produtos continua em andamento e não bloqueia esta spec.

## 8. Testes e verificação

- Vitest: matriz de papéis (supervisor com `produtos`, sem excluir), formatação de preços varejo/atacado, funções de evento do `dataLayer` (sem dado pessoal sem consentimento), montagem do payload da API de Conversões (hash, `event_id`).
- `supabase/rls-teste.sql` (B0) rodado antes e depois da `0010`; `smoke.sql` ampliado. Casos novos: `anon` sem `EXECUTE` em `checkout_iniciar_pedido`; `admin_list_orders` como supervisor sem `valor_*` nem `preco_unit`; supervisor que salva produto não altera `preco`/`preco_atacado` nem `desconto_atacado_percentual`; produto criado por supervisor nasce `ativo = false` e `preco = 0`; `mp_register_order_payment` sem `p_transaction_amount` falha.
- `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` verdes a cada tarefa.
- Manual (QA): login de cada papel, vitrine para aprovado/pendente/anônimo, evento no GTM Preview, evento de compra no Gerenciador de Eventos da Meta, sitemap e robots.
- Code Reviewer na SQL; Reality Checker dá o veredito final (`LIDER.md`).
- Pré-lançamento: verificar "secure email change" (confirmação na troca de e-mail) no Auth do Supabase. "Confirm email" já está ligado em produção (verificado em 2026-11-05).

## 9. Ordem de execução

1. **B0** Auditoria (somente leitura) + `rls-teste.sql` + relatório.
2. **A** Migração `0010` unificada (spec de 27/10 + §5 + correções da B0), `lib/roles.ts`, funções de catálogo, rotas e LP.
3. **C** GTM/Cloudflare/consentimento, eventos, API de Conversões, SEO.
4. Docs: README, `docs/QA.md`, `STATUS.md` ("Para o conselheiro").

## 10. Entradas que dependem do dono

GTM ID, GA4 Measurement ID, Meta Pixel ID e token da API de Conversões, token do Cloudflare Web Analytics, data para ligar o "varejo off" e data da janela SQL+deploy.

## 11. Fora de escopo

Reativar o varejo (exigirá uma migração futura que devolva `EXECUTE` do checkout de convidado, decisão 1(a); hoje só o interruptor), bônus por faixa e acumulativo, cupom no checkout, busca, GTM server-side, remarketing dinâmico por catálogo.

## 12. Decisões do dono (fechadas em 2026-11-05)

1. **S-05, checkout de convidado: (a) revogar.** `EXECUTE` de `checkout_iniciar_pedido` é revogado de `anon`. Motivo do dono: a vitrine só aparece para revendedor logado e a Home não terá botão de comprar, então o visitante nunca chega ao checkout; isso só muda quando existir venda no varejo. Consequência: religar o varejo de convidado exigirá uma migração futura.
2. **S-07, supervisor em Pedidos: (b) mascarar.** `valor_*`, `entrega_taxa` e `preco_unit`/`subtotal` ficam ocultos para o supervisor, como em Vendas; telefone e endereço continuam visíveis.
3. **S-06, webhook: (a) manter.** `mp_register_order_payment` continua com a chave anon e o segredo longo rotacionado, com `p_transaction_amount` obrigatório (comparado ao total do pedido). Sem migração para a service role.
4. **Supervisor e campos de preço: (b) só o cadastro.** O supervisor edita o cadastro; `preco`, `preco_atacado`, `desconto_percentual` e `desconto_atacado_percentual` são só de `admin`/`superadmin`. Hipótese operacional registrada em §5.4: produto criado por supervisor nasce inativo e com preço 0 até um admin definir o preço e ativar.
