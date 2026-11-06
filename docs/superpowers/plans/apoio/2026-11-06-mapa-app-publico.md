# Mapa do app público e do atacado (base para o plano da Parte A: site só atacado)

Levantamento somente leitura em `C:\Users\VOOA\Desktop\LOLA`, branch `feat/site-so-atacado` (commit e50f11b). Next 16.4.5.
Specs lidas: §5 de `2026-10-27-...-lp-atacado-bonus-design.md` e §5 de `2026-11-05-...-site-so-atacado-seguranca-rastreamento-design.md`; auditoria `docs/auditoria-seguranca-2026-11.md` (S-01 a S-05).

## 0. Convenções confirmadas e fatos gerais

- **Clientes Supabase** (`lib/supabase.ts`): `supabase()` (anon, :13), `supabaseEfemero()` (:19, só para `auth.*`), `supabaseComToken(jwt)` (:26, PostgREST/RPC com o JWT do usuário). Em `lib/auth.ts`: `getSessao({renovar?})` (:40), `authedSupabase({renovar?})` (:85, devolve cliente com token se há sessão, senão `supabase()` anon), `getPerfil()` (:96), `perfilPorToken(jwt)` (:90, chama RPC `get_my_profile`), `exigirPapel(papeis, caminho)` (:106; sem sessão redireciona para `/entrar?next=...`, papel errado redireciona para `/`).
- **Importante:** "sessão" no app = role `authenticated` no PostgREST. Revogar `SELECT` de `authenticated` quebra também todo leitor que usa `authedSupabase`/`supabaseComToken` (item 7).
- **Next 16 (docs em `node_modules/next/dist/docs/01-app/...`)**: `redirect(path, type?)` de `next/navigation` funciona em Server Component, Route Handler e Server Action, lança erro (chamar fora de `try/catch`) e não tem efeito do `type` em Server Component (`04-functions/redirect.md`). `middleware` foi renomeado para **`proxy`**: arquivo `proxy.ts` na raiz exporta `proxy(request)` e `config.matcher` (`03-file-conventions/proxy.md`). Não existe `proxy.ts`/`middleware.ts` hoje no repo. Redirect antes do render pode ser por `next.config.ts` `redirects()` ou `proxy.ts`; mas o interruptor do varejo vem do banco, então o redirect por rota tem de ser feito no Server Component (ou no `proxy` lendo a flag, mais caro). `robots.md` e `sitemap.md` existem em `03-file-conventions/01-metadata/` (`app/robots.ts`, `app/sitemap.ts`) para a Parte C.
- **`next.config.ts`**: CSP fixa `connect-src 'self' https://vitals.vercel-insights.com` e `script-src 'self' 'unsafe-inline'`; GTM/Pixel/GA4 (Parte C) exigem ampliar a CSP. Não afeta a Parte A, mas anotar.
- **Deploy**: Cloudflare Workers via OpenNext (`open-next.config.ts`, `wrangler.jsonc`). `app/layout.tsx:3,30` ainda importa `@vercel/analytics` (resíduo da Vercel).
- **Modo DEMO**: `lib/demo-catalogo.ts:6` `DEMO = LOLA_DEMO==="1" && NODE_ENV!=="production"`; usado em `app/page.tsx`, `app/produto/[slug]/page.tsx`, `app/atacado/dados.ts|gate.tsx|layout.tsx`. As funções novas (RPC) devem manter o ramo DEMO ou ele deixa de funcionar localmente.
- **Páginas dinâmicas**: `app/page.tsx:21` e `app/produto/[slug]/page.tsx:14` têm `revalidate = 0`; `/minha-conta` usa `dynamic = "force-dynamic"`.

## 1. Home `app/page.tsx` (167 linhas) e componentes

**Hoje** (`export default async function Home()`, :97). Faz `Promise.all` de:
- `getProducts()` (:23-38): **consulta direta anon** `supabase().from("products").select("*, categoria:categorias(id,nome,slug,ordem,grupo,desconto_atacado_percentual,ativo), colors:product_colors(*, sizes:product_sizes(*))").eq("ativo",true)` (:25-31). Traz `preco_atacado` e `desconto_atacado_percentual` crus (S-01/S-02). Ramo DEMO :24.
- `getPromocoesAtivas()` (`lib/promocoes.ts:4`): RPC anon `get_promocoes_ativas`.
- `getTextos()` (`lib/textos.ts:38`): RPC anon `get_textos`, mesclada com `TEXTOS_PADRAO` por `mesclarTextos(doBanco)` (:22; chaves extras do banco são ignoradas, então **toda chave nova de texto precisa entrar em `TEXTOS_PADRAO`** `lib/textos.ts:3-24` e na tela do admin `GRUPOS_TEXTOS` em `lib/admin-textos.ts`).
- `getBanner()` (:40-53): RPC anon `get_banner_hero`, normalizada por `normalizarBanner` (`lib/home.ts:82`); imagem servida por `/api/banner-img`.
- `getCategoriasAtivas()` (:59-87): **consulta direta anon** `.from("categorias").select("id,nome,slug,ordem,imagem").eq("ativo",true)` (:69-72).
Depois: `comDescontoEfetivo` (`lib/pricing.ts:25`), filtro `totalEstoque>0`, separa `calcados`/`acessorios` por `categoria.grupo`, `categoriasVitrine` (:89), `selecionarLancamentos` + `paraCartaoLancamento` (`lib/home.ts:30,120`).

**Renderiza** (:117-165): `SiteHeader` -> `HeroCarrossel` com 2 slides (`Hero` loja + `HeroRevendedora`) -> `Categorias` -> `Lancamentos` -> `BannerRevendedora` -> título "Todos os produtos" -> 2x `GrupoSection` (Calçados/Acessórios, usa `ProductCard`) -> `PaymentsStrip` -> `SiteFooterServer`.

**Componentes (`components/home/`)**
- `Hero.tsx` (63 l.): `Hero({banner: BannerHero, imagemSrc})`; CTAs do banner (`cta1_link` default `#lancamentos`, `cta2` aponta `#categorias`). Sai na LP.
- `HeroCarrossel.tsx` (56 l.): carrossel de slides (client). Sai ou fica só com 1 slide.
- `HeroRevendedora.tsx` (25 l.): `HeroRevendedora({textos})`; usa `revendedora.etiqueta|titulo|texto|botao`, lista fixa `BENEFICIOS` (:3), CTA `/entrar?modo=revendedor`. **Base direta do hero da LP.**
- `BannerRevendedora.tsx` (21 l.): `BannerRevendedora({textos})`, mesmas chaves; CTA final reaproveitável.
- `Categorias.tsx` (48 l.): `Categorias({categorias: CategoriaVitrine[], titulo, etiqueta})`, links `/#cat-${slug}`. Sai.
- `Lancamentos.tsx` (165 l., client): carrossel de `CartaoLancamento[]` (favoritos em localStorage `lola:favoritos`), links `/produto/${slug}` (:111). **Cartão de amostra da LP pode derivar dele** (precisaria de preço varejo riscado + atacado).
- `GrupoSection.tsx` (106 l.) + `components/ProductCard.tsx` (102 l.): grade de varejo, link `/produto/${slug}` (ProductCard:22). Saem. `ProductCard` tem prop `modo?: "varejo"|"atacado"` (:12-15, usa `precoAtacado(product, product.categoria)` :29) mas **nenhum chamador passa `atacado`** (grep) e o link continua para a rota de varejo.
- `AvisoBar.tsx` (4 l.): barra de aviso (fica).
- Outros: `SwingTag.tsx` (etiqueta de preço), `PaymentsFooter.tsx` (`PaymentsStrip` texto fixo "Pix / Cartão / Checkout Mercado Pago" :9-19 e `SiteFooter` client :23).

**LP de revendedores: sai** categorias, lançamentos, GrupoSection, "Todos os produtos", Hero de banner, o slide de loja. **Fica/reaproveita** `SiteHeader`, `AvisoBar`, `HeroRevendedora`, `BannerRevendedora`, `SiteFooterServer`, textos `revendedora.*`. **Novo**: seção Regras (12 SKUs/bônus), "Como funciona", Amostra (4 a 8 destaques), CTA por papel (aprovado -> `/atacado`; pendente -> espera). Para o CTA por papel a Home precisa de `getPerfil()` (já há `getPerfilNav` em `lib/header-dados.ts:42`) e do status do cadastro (`atacado_me`, hoje só em `app/atacado/dados.ts:47`).
`get_loja_flags()`/`lib/loja-flags.ts` e `get_destaques_atacado()` **não existem** hoje (grep sem resultado).

## 2. Rotas de varejo

Carrinho de varejo: `lib/cart.tsx` (117 l.). `CartProvider` (:44) montado em `app/layout.tsx:29`; estado em `localStorage` chave `lola_cart_v1` (:19); exports `useCart()` (:113), `makeCartKey` (:21), `calcTotais` (:25), tipo `CartItem` (:5; guarda `precoUnit`, `maxEstoque`, `imagem`). Consumidores: `components/HeaderClient.tsx:33` (badge), `components/ProductDetail.tsx:31`, `components/SurpresaOffer.tsx:34`, `app/carrinho/page.tsx:10`, `app/checkout/CheckoutVarejo.tsx:13`. Teste existente: `__tests__/cart-helpers.test.ts`.

| Rota | Arquivo | Como lê dados | Ação na Parte A |
|---|---|---|---|
| `/produto/[slug]` | `app/produto/[slug]/page.tsx` (69 l.) | **consulta direta anon** `.from("products")... .eq("slug").eq("ativo")` (:18-25, com `categorias(... desconto_atacado_percentual ...)`); `getProduct` é usado também em `generateMetadata` (:31-45); promoções via RPC `get_promocoes_ativas` | Redirecionar `/` com varejo off (spec 27/10 §5.1). Para revendedor existe só `/atacado/catalogo`; **`/atacado/produto/[slug]` não existe** e precisa ser criada (spec 05/11 §5.2) com `get_produto_revendedor`. Renderiza `ProductDetail` (client, varejo; `components/ProductDetail.tsx`, 255 l., `useCart`, botão comprar que vai para `/carrinho`). |
| `/carrinho` | `app/carrinho/page.tsx` (207 l., **client**) | Só `useCart()` (localStorage). Usa `Header` client (`components/Header.tsx`) e `SiteFooter` client | Client Component não pode fazer `redirect` do servidor com a flag. Opções: `layout.tsx` server por rota que lê `lib/loja-flags` e redireciona (convertendo a página em filho), ou mover a lógica para um componente e deixar `page.tsx` server. |
| `/surpresa` | `app/surpresa/page.tsx` (92 l.) | RPC anon `public_get_surpresa` (:19) (S-03: devolve `_product_json` com `preco_atacado` e `categoria` cru). `metadata.robots noindex` já existe (:12-16) | Redirecionar/removida; no banco revogar `EXECUTE` (S-03). Renderiza `SurpresaOffer` (384 l., client, `useCart`). Admin ainda tem `admin_set_surpresa` (`app/admin/actions.ts:171`) e UI em `AdminApp.tsx`/`ProdutosTab.tsx`. |
| `/checkout` | `app/checkout/page.tsx` (56 l.) | `modo!=="atacado"` devolve `<CheckoutVarejo/>` (:17); atacado: `exigirPapel(["revendedor"], "/checkout?modo=atacado")` (:19), `authedSupabase()` + RPC `atacado_cart_get` (:21), repassa a `CheckoutAtacado({itens,total})` | Trocar o ramo `:17` por `redirect("/")` (ou `/atacado`) com varejo off. `CheckoutVarejo.tsx` (208 l., client) fica inacessível. `actions.ts`: `criarPedido(itens, dados)` (:29, varejo, `p_is_atacado:false`), `criarPedidoAtacado(dados)` (:50, itens vazios + `true`), `iniciarPedido` (:56) usa `authedSupabase({renovar:true})` e, se o JWT falhar no varejo, refaz como **anon** via `deveTentarComoConvidado` (:83-85, `lib/checkout.ts:84`). S-05/spec 05/11 §5.5: revogar `EXECUTE` de `checkout_iniciar_pedido` para `anon`; então o fallback convidado (:83-85) passa a falhar e deve ser removido junto com `criarPedido`. |
| `/minha-conta` | `app/minha-conta/page.tsx` (87 l.) | `exigirPapel(["cliente","revendedor","supervisor","admin","superadmin"], "/minha-conta")` (:19) + RPC `meus_pedidos` (:13, sessão) | Sem varejo o papel `cliente` não tem o que fazer aqui. Decidir: redirecionar para `/` (LP) ou manter só lista de pedidos antigos. Revendedor tem `/atacado/pedidos`. |
| `/pedido/[id]` | `app/pedido/[id]/page.tsx` (244 l.) | RPC **anon** `public_get_order` (:38) (nome, endereço, itens por UUID, S-04). `SiteHeader`/`SiteFooterServer`. Sem `robots` noindex | Continua necessária (retorno do Mercado Pago `successPath: /pedido/${id}`, `checkout/actions.ts:116`). Spec 05/11: marcar `noindex`, tirar do sitemap; S-04 sugere exigir sessão para atacado. Bônus (linha R$ 0,00) precisa ser exibido em `order.items` (:139-145); `OrderItem` (types) não tem flag de bônus. |

Redirecionamento aplicável: `exigirPapel` já redireciona para `/` se papel errado (`lib/auth.ts:111`); `/` passa a ser a LP.

## 3. Cabeçalho e rodapé

- `components/SiteHeader.tsx` (13 l., server): `carregarDadosHeader()` -> `AvisoBar` + `HeaderClient({categorias, perfil})`.
- `lib/header-dados.ts` (72 l., `server-only`): `getCategoriasNav()` (:21-40) é **consulta direta anon** `.from("categorias").select("id,nome,slug,ordem, products!inner(id, colors:product_colors(sizes:product_sizes(estoque)))").eq("ativo").eq("products.ativo")` (:23-29), com swallow de erro (catch -> `[]`). Também `getPerfilNav` (:42, sessão via `getPerfil` -> RPC `get_my_profile`), `carregarDadosHeader` (:52), `carregarDadosRodape` (:66, mesma consulta de categorias). Tipos: `DadosHeader`, `DadosRodape`.
- `components/HeaderClient.tsx` (183 l., client): `HeaderClient({categorias, perfil})`. Menu de categorias via `linksCategorias(categorias)` (:34) (links `/#cat-slug` + "Lançamentos" `/#lancamentos`), ícone de conta (`itensMenuConta`), **link `/carrinho` com badge `totalItens` de `useCart`** (:157-160). `sair()` redireciona `/` (:73).
- `lib/header-menu.ts` (53 l., puro): `itensMenuConta(perfil)` (:9; equipe->`/admin`, revendedor->`/atacado`, cliente->`/minha-conta`), `linksCategorias` (:19), `destinoAjuda` (:28), `dadosPublicosHeader` (:45), `primeiroNome`. Tipos `CategoriaNav`, `PerfilNav`, `ItemMenuConta`.
- `components/Header.tsx` (43 l., client): usa server action `buscarDadosHeader` (`components/loja-actions.ts`) + cache (`components/loja-cache.ts`). Usado por `app/carrinho/page.tsx` e `app/checkout/CheckoutAtacado.tsx`.
- Rodapé: `SiteFooterServer.tsx` (server) e `PaymentsFooter.tsx` `SiteFooter` (client) -> `RodapeView` (89 l.): coluna **LOJA** com categorias + Lançamentos (:51-59), AJUDA (textos `rodape.*`), CONTA (Entrar / Seja revendedor :80-84), selo "Compra segura / Parceria oficial mercadopago" (:27-48).
- Ponto crítico: a **única leitura de produto no cabeçalho/rodapé é `getCategoriasNav`** (categorias com produtos `!inner`). Spec 05/11 §5.1 diz que cabeçalho e rodapé não devem depender de produto; com varejo off remover categorias e sacola (`flags`) de `HeaderClient`, `RodapeView` e `Header.tsx`, e passar uma prop (ex.: `varejoAtivo`) ou ocultar o conjunto. `linksCategorias` tem teste (`__tests__/header-menu.test.ts`); ajustar o teste.
- O badge do carrinho só some sem o `Link /carrinho`; `CartProvider` pode permanecer no layout (inofensivo).

## 4. Login: `app/entrar`, `lib/auth.ts`, `lib/auth-cookies.ts`, `destinoPosLogin`

- `app/entrar/page.tsx` (40 l.): lê `searchParams` (`modo`, `next`); `nextSeguro` (`lib/validators.ts:44`); se `getPerfil()` ativo, `redirect(destinoPosLogin(perfil.papel, next))` (:26); senão `LoginView({modoInicial: normalizarModo(sp.modo), next, etiqueta, titulo, renovar})`, textos `login.etiqueta|titulo`. `metadata.robots index:false` já presente.
- Modos (`components/auth/form.ts`): `type Modo = "entrar"|"cadastro"|"revendedor"|"esqueci"` (:3), `CAMPOS`, `COPY` (revendedor: "Preço de atacado a partir de 12 modelos diferentes." :45), `normalizarModo` (:57). **O modo "cadastro" é o de cliente** (varejo, `COPY.cadastro` fala em "salve seus favoritos").
- `components/auth/LoginView.tsx`: abas Entrar/Criar conta mostradas quando `modo==="entrar"||"cadastro"` (`mostraAbas` :70, botões :114,117); botão "Quero ser revendedor" (:135-137, `ir("revendedor")`). Com varejo off (spec 27/10 §5.1): ocultar a aba "Criar conta" e `normalizarModo("cadastro")` deve cair em `entrar`/`revendedor`; `cadastrarAction` pode ser recusada no servidor.
- `app/entrar/actions.ts` (192 l.): `entrarAction` (:38, `supabaseEfemero().auth.signInWithPassword`, `perfilPorToken`, `gravarSessao`, RPC `touch_ultimo_acesso`, `destinoPosLogin`), `cadastrarAction` (:62, cliente, `signUp` com metadata `{nome}`), `cadastrarRevendedorAction` (:79, valida razão social/CNPJ/WhatsApp, metadata `tipo:"revendedor"`), `esqueciAction` (:117), `redefinirAction` (:132), `sairAction` (:171), `renovarSessaoAction(next)` (:184). `redefinir/page.tsx` (8 l.) renderiza `RedefinirView`, noindex.
- `lib/auth-cookies.ts` (200 l., puro): cookies `lola_at`/`lola_rt` (:3-4), `analisarToken`, `opcoesCookie`, `origemSite`, `resultadoCadastro(error, tipo)`, `mensagemErroAuth`, `perfilDeJson`. Testado em `__tests__/auth-cookies.test.ts`.
- `lib/roles.ts` (75 l., puro): `Papel`, `ACESSO` (:37; supervisor hoje `["visao-geral","pedidos","vendas","revendedores"]`, sem `produtos`), `podeAcessar`, `telasVisiveis`, `ehEquipe`, `destinoPosLogin(papel, next)` (:71: equipe->`/admin`, revendedor->`/atacado`, outros->`nextSeguro(next)`). Para a Parte A: `supervisor` ganha `produtos` (spec 05/11 §5.4); `cliente` pós-login hoje volta para `next` ou `/`. Teste: `__tests__/roles.test.ts`.
- Pendente/recusado: já vão para `/atacado` (revendedor) e o gate mostra espera (item 5).

## 5. Atacado `app/atacado/*`

- `layout.tsx` (31 l.): `exigirPapel(["revendedor"], "/atacado")` (:17), `carregarCadastro(db)`, retorna `GateStatus` para `sem-cadastro|pendente|recusado` (:21-23) **antes de renderizar o shell**, depois `carregarCarrinho` para contar SKUs, `AtacadoShell({nome, skus})`. `robots noindex` (:10-13).
- `gate.tsx` (27 l.): `exigirRevendedorAprovado(caminho): Promise<ResultadoGate>` (`{ok:true, db, perfil}` ou `{ok:false, gate}`), usa `decisaoGate` (`lib/atacado.ts:232`; uso em `gate.tsx:22`). Cada página chama isso de novo (defesa em profundidade).
- `dados.ts` (206 l., `server-only`): RPCs `atacado_me` (:48, `carregarCadastro`), `atacado_cart_get` (:65, `carregarCarrinho` -> `normalizarCarrinho`), `atacado_my_orders` (:75, `carregarPedidos`). **Leitores diretos de tabela (sessão authenticated):** `carregarCatalogo` (:108, `.from("products")` :127 com `SELECT_CATALOGO` :85-86 que seleciona `preco`, `preco_atacado`, `categoria:categorias!inner(... desconto_atacado_percentual ...)`, cores e tamanhos/estoque; o preço de atacado é calculado no TS por `precoAtacado(p, p.categoria)` :143), `carregarNovidades` (:150, `.from("products")` :162, janela 12 e `selecionarLancamentos(...,4)`), `carregarDescontoMaximo` (:193, `.from("categorias").select("desconto_atacado_percentual")` :196). Tipos: `ProdutoCatalogo {id,nome,categoria,preco,cores[]}` (dados.ts:29), `CorCatalogo`, `Novidade`, `CadastroRevendedor`. Todos têm ramo DEMO.
- `actions.ts` (136 l., `"use server"`): `addAoCarrinho(productId,colorId,sizeId)` (:51), `alterarQuantidade(itemId,quantidade)` (:97), `removerItem(itemId)` (:125). `preparar()` (:33) renova sessão, usa `supabaseComToken` e `cadastroAprovado`. **Leitor direto:** `addAoCarrinho` consulta `.from("product_sizes").select("estoque")` (:70-75) quando o item ainda não está no carrinho. Escrita via RPC `atacado_cart_set_item` (:84, :112), `atacado_cart_remove_item` (:130). `ok()` (:24) faz `revalidatePath("/atacado","layout")`.
- `page.tsx` (163 l., painel): `exigirRevendedorAprovado("/atacado")`; `Promise.all([carregarCarrinho, carregarPedidos, carregarNovidades, carregarDescontoMaximo])`; mostra **progresso de SKUs** (`progressoSkus(carrinho?.sku_distintos)` :31, cartão "Pedido mínimo: N produtos distintos" :37-64), KPIs (`calcularKpis`), últimos pedidos, novidades (link fixo `/atacado/catalogo`, preço `formatarReais(p.preco)` = atacado).
- `catalogo/page.tsx` (23 l.): `carregarCatalogo` + `carregarCarrinho`; `CatalogoGrid({produtos, noCarrinho})`. `components/atacado/CatalogoGrid.tsx` (171 l., client): `type ProdutoGrade {id,nome,categoria,preco,cores}` (:10) mostra **um só preço** (`formatarReais(produto.preco)` :83); chama `addAoCarrinho`. **Aqui entra o preço de varejo (referência) + atacado**: precisa de novo campo `precoVarejo` em `ProdutoCatalogo`/`ProdutoGrade`.
- `carrinho/page.tsx` (14 l.): `CarrinhoView({itens, skus, total})` (`components/atacado/CarrinhoView.tsx`, 162 l., client). Já calcula **peças totais** (`pecas` :29 = soma `quantidade` de itens `disponivel`) e mostra "Peças totais" (:146-149) e barra de SKUs (:133-141). **O indicador de bônus entra aqui**, ao lado do `progresso` (:26) e usa `progressoBonus(pecas, min)` a criar em `lib/atacado.ts`. O botão finalizar vai para `/checkout?modo=atacado` (:151) via `decisaoFinalizar(itens)` (`lib/atacado.ts:64`).
- `pedidos/page.tsx` (57 l.): tabela; `PedidoAtacado {id,created_at,status,valor_total,skus}` (`lib/atacado.ts:18`) não tem bônus nem itens.
- `components/atacado/AtacadoShell.tsx` (197 l.): navegação (`ITENS`), pill do carrinho com `progressoSkus(skus)` (:159, :187); links `Link href="/"` "voltar para a loja" (:144, :155). `GateStatus.tsx` (67 l.): `GateStatus({estado: "pendente"|"recusado"|"sem-cadastro"})` com link "Voltar para a loja" (:58) e `Sair`.
- **Regra de 12 SKUs**: `MIN_SKUS_ATACADO = 12` (`lib/pricing.ts:5`). Aplicada em `avaliarCarrinhoAtacado(itens)` (`lib/checkout.ts:122`; SKU = `skusDistintos` de linhas `disponivel`, `lib/pricing.ts:57`), `progressoSkus` e `textoFaltam` (`lib/atacado.ts:40,51`), `decisaoFinalizar`, `CheckoutAtacado.tsx` e (autoridade) no SQL.

**`lib/atacado.ts` (253 l., puro)** assinaturas: `ehUuid(v): v is string`; `quantidadeValida(v): v is number`; `progressoSkus(skus): {atual, minimo, pct, label, completo}`; `textoFaltam(skus): string|null`; `alertaLinha(i)`; `decisaoFinalizar(itens): {habilitado, texto}`; `badgeEstoque(estoque)`; `proximaQuantidade(atual, estoque): number|null`; `rotuloStatusPedido(status)`; `descontoMaximo(percentuais)`; `calcularKpis({pedidos, descontoMaximo, agora})`; `mensagemErroAtacado(erro)`; `normalizarCarrinho(data): CarrinhoAtacado`; `normalizarPedidos(data): PedidoAtacado[]|null`; `decisaoGate({papel, ativo, status}): DecisaoGate`; `pedidoIdCurto(id)`; `dataPtBr(iso)`. Tipos `ItemCarrinho`, `CarrinhoAtacado {itens, sku_distintos, total}`, `PedidoAtacado`. **`progressoBonus` não existe.**
**`lib/pricing.ts` (61 l.)**: `MIN_SKUS_ATACADO`, re-export `precoAtacado`; `descontoEfetivo(p, promos)`, `comDescontoEfetivo(produtos, promos)`, `precoVarejoEfetivo(p): {final, original, pct}`, `skusDistintos(itens)`; tipo `PromocaoAtiva`.
**`lib/types.ts`**: `precoVarejo(p)` (:159, centavos inteiros, espelha `_preco_varejo`), `precoAtacado(p, categoria)` (:171, override `preco_atacado` > % da categoria > preço de tabela; espelha `_preco_atacado`). **Hoje a regra de preço de atacado está duplicada em TS e SQL**; com as RPCs novas o TS só exibe o número calculado pelo banco (a spec manda nunca devolver `preco_atacado` bruto nem percentual).

## 6. `app/api/*`

- `categoria-img/[id]/route.ts` (19 l.): `GET`; **consulta direta anon** `supabase().from("categorias").select("imagem").eq("id").eq("ativo",true).maybeSingle()` (:9-13), responde com `respostaImagem` (`lib/imagem.ts:33`, cache público 300s + ETag). Alimentada por `app/page.tsx:81`. Com a LP sem categorias pode ser removida, ou migrada para RPC se a imagem de categoria for mantida.
- `banner-img/route.ts` (15 l.): RPC anon `get_banner_hero`. Só mexe se a imagem do banner sair da Home (hoje `Hero.tsx`).
- `webhook/mercadopago/route.ts` (154 l.): RPCs `public_get_order` (:41) e `mp_register_order_payment` (:117, anon com `p_secret` do webhook); **não lê tabela de produto**. Fica como está (S-06 é só endurecimento no SQL).

## 7. LISTA CONSOLIDADA: leitores diretos de tabelas de produto

(Grep `.from(` em `app/ lib/ components/`; só 10 ocorrências no app inteiro, nenhuma em `components/`.)

| # | Arquivo:linha | Tabela(s) | Cliente | O que quebra se `SELECT` de anon/authenticated for revogado |
|---|---|---|---|---|
| 1 | `app/page.tsx:26` (`getProducts`) | `products` + embed `categorias`, `product_colors`, `product_sizes` | **anon** (`supabase()`) | Retorna `[]` (erro engolido :33-36): vitrine vazia sem erro visível. Sai da Home de qualquer forma. |
| 2 | `app/page.tsx:70` (`getCategoriasAtivas`) | `categorias` (inclui `imagem` base64) | **anon** | Retorna `[]`. Sai da Home. |
| 3 | `app/produto/[slug]/page.tsx:19` (`getProduct`) | `products` + embed 3 tabelas | **anon** | `notFound()` (também em `generateMetadata`). Rota some (varejo off). |
| 4 | `lib/header-dados.ts:24` (`getCategoriasNav`) | `categorias` + `products!inner` + `product_colors` + `product_sizes` | **anon** | `catch -> []`: **menu e rodapé perdem as categorias em TODAS as páginas** (Home, pedido, minha-conta, checkout, carrinho). Não derruba nada; só some a navegação. |
| 5 | `app/api/categoria-img/[id]/route.ts:9` | `categorias` (`imagem`) | **anon** | 404 nas imagens de categoria. |
| 6 | `app/atacado/dados.ts:127` (`carregarCatalogo`) | `products` + `categorias!inner` + `product_colors` + `product_sizes` | **sessão (authenticated)** via `authedSupabase()` em `gate.tsx:20` e `layout.tsx:18` | `registrarErro("catalogo")` e `null`: **"Não foi possível carregar o catálogo"** em `/atacado/catalogo`. É o caminho central da vitrine do revendedor. |
| 7 | `app/atacado/dados.ts:162` (`carregarNovidades`) | idem | sessão | Cartão "Novidades" do painel `/atacado` mostra erro. |
| 8 | `app/atacado/dados.ts:196` (`carregarDescontoMaximo`) | `categorias` (`desconto_atacado_percentual`) | sessão | KPI "Desconto atacado" vira "—". Observação: lê o percentual cru de todas as categorias (S-02); trocar por valor calculado/RPC. |
| 9 | `app/atacado/actions.ts:71` (`addAoCarrinho`) | `product_sizes` (`estoque`) | sessão | **Adicionar ao carrinho falha** quando o item ainda não está no carrinho (retorna erro via `falhaRpc("addAoCarrinho/estoque")`). Não é óbvio: não está no catálogo; o estoque deveria vir de uma RPC (ou `atacado_cart_set_item` validar). |
| 10 | `app/admin/actions.ts:268` (`salvarCategoria`) | `categorias` (`imagem`) | **sessão da equipe** (`g.sb = supabaseComToken`) | Ao salvar categoria sem enviar `imagem`, falha "Não foi possível ler a imagem atual da categoria." (:272). **Revogar `SELECT` de `authenticated` quebra o admin**; trocar por RPC (`admin_list_categorias` já existe, `consultas.ts:30`; checar se devolve `imagem`). A spec 05/11 §5.5 manda "confirmar" este item; confirmado: é leitura direta com sessão de equipe. |

Leituras de produto fora de `.from(`: RPC `public_get_surpresa` (`app/surpresa/page.tsx:19`, anon, S-03) e RPCs admin `admin_list_products`/`admin_list_categorias` (`app/admin/consultas.ts:26,30`, via sessão; essas não dependem do `SELECT` direto).
Dependências indiretas que não usam `.from` mas dependem do catálogo: `Header.tsx`/`SiteFooter` (client -> server actions `buscarDadosHeader/Rodape` -> item 4), `ProductCard`/`GrupoSection`/`Lancamentos` (recebem dados da Home), `lib/demo-catalogo.ts` (só dev).

## 8. Tipos em `lib/types.ts` (214 l.)

- `Categoria` (:1): `desconto_atacado_percentual`, `imagem?`. **Não deve mais chegar ao cliente** (S-02); criar tipo público sem o percentual.
- `ProductSize` (:12), `ProductColor` (:19), `Product` (:29): tem `preco`, `desconto_percentual`, `desconto_efetivo?`, `preco_atacado`, `destaque`, `surpresa_ativo`, `colors[]`. **Faltam**: `somente_bonus` (spec 27/10 §4), preço de varejo calculado e preço de atacado calculado para a vitrine (hoje o atacado é calculado no TS a partir de `preco_atacado`/`categoria`).
- `OrderStatus` (:49), `OrderItem` (:59: `produto_nome`, `preco_unit`, `subtotal`; **falta `bonus: boolean`**), `Order` (:75: `is_atacado`, `items`; **faltam `bonus_aplicado` e `bonus_aviso`**).
- Em `lib/atacado.ts`: `PedidoAtacado` precisa de `bonus`/peças opcionais; `CarrinhoAtacado` talvez `pecas`.
- `lib/atacado.ts`/`app/atacado/dados.ts`: `ProdutoCatalogo` e `ProdutoGrade` (`components/atacado/CatalogoGrid.tsx:10`) ganham `precoVarejo: number` (ex. `precoVarejoEfetivo`/`products.preco` com `desconto_percentual`, conforme spec 05/11 §3 "Preço de referência para revenda") além de `preco` (atacado).
- Novos tipos a criar (não existem): flags da loja (`varejo_ativo`, `bonus_ativo`, `bonus_min_pecas`, `bonus_quantidade`, nome do bônus) -> `lib/loja-flags.ts`; item de destaque da LP (`nome`, `slug`, `imagem`, `preco_varejo`, `preco_atacado`).

## 9. Convenções de teste

- `vitest.config.ts` (10 l.): `environment: "node"`, `include: ["__tests__/**/*.test.ts"]`, alias `"@"` -> raiz. **Só `.test.ts`, sem jsdom e sem React Testing Library**: componentes `.tsx` não são testados; toda regra testável precisa estar em função pura em `lib/`. Scripts: `npm test` = `vitest run`, `npm run lint` = `eslint`, `npm run build` = `next build`.
- 25 arquivos em `__tests__/` (~3.000 linhas). Padrão: `import { describe, it, expect } from "vitest"`, imports `@/lib/...`, `describe` por função, casos pequenos com dados inline.
- Cinco exemplos relevantes:
  1. `__tests__/atacado.test.ts` (alvo do `progressoBonus`): `progressoSkus`, `textoFaltam`, `decisaoFinalizar`, `normalizarCarrinho`, `decisaoGate` etc. (puras de `lib/atacado.ts`).
  2. `__tests__/pricing.test.ts`: `MIN_SKUS_ATACADO` = 12, `descontoEfetivo`, `comDescontoEfetivo`, `precoVarejoEfetivo`, `skusDistintos`.
  3. `__tests__/home.test.ts`: `selecionarLancamentos` (ordem/limite 8/inativos), `ctaLinkSeguro`, `normalizarBanner`, `corBlocoCategoria`; modelo para testar a seleção/formatação da amostra da LP.
  4. `__tests__/header-menu.test.ts`: `itensMenuConta` por papel, `linksCategorias`, `destinoAjuda`, `dadosPublicosHeader` (a ajustar quando categorias saírem do menu).
  5. `__tests__/roles.test.ts`: matriz `podeAcessar`/`telasVisiveis` por papel (tabela de casos `esperado`), `destinoPosLogin` (a ajustar para `supervisor` + `produtos`).
  Outros úteis: `textos.test.ts` (`TEXTOS_PADRAO` contém as chaves do seed; `mesclarTextos`), `checkout.test.ts` (`avaliarCarrinhoAtacado`, `deveTentarComoConvidado`), `types.test.ts` (`precoVarejo`/`precoAtacado` em centavos), `cart-helpers.test.ts`, `auth-cookies.test.ts`, `admin-acesso.test.ts`.

## 10. Observações adicionais para o plano

- Textos: o admin de textos (`lib/admin-textos.ts`, `GRUPOS_TEXTOS`) e `TEXTOS_PADRAO` precisam receber as chaves novas da LP (regras, como funciona, amostra, CTA final). `__tests__/textos.test.ts:5` verifica "contém as chaves do seed" e `admin-textos.test.ts` verifica o admin; atualizar juntos.
- `app/layout.tsx` tem `metadata` global com `title: "<marca> — Loja"` (:7-10); a LP deve ter metadata própria (descrição de atacado); áreas logadas já têm `robots noindex` apenas em `/atacado`, `/entrar`, `/surpresa`. Faltam `noindex` em `/checkout`, `/pedido/[id]`, `/minha-conta`, `/carrinho` (spec 05/11 §3).
- Ordem de fallback exigida pela spec 27/10: se `get_loja_flags()` falhar, varejo = desligado. Home/rotas devem tratar erro como "off".
- `AtacadoShell.tsx:144,155` e `GateStatus.tsx:58` chamam `/` de "voltar para a loja": passa a ser a LP; ajustar rótulo.
- Redirecionamento anônimo de `/atacado/catalogo` para `/entrar?modo=revendedor&next=...`: `exigirPapel` hoje redireciona para `/entrar?next=...` sem `modo=revendedor` (`lib/auth.ts:109`); o pedido da spec 05/11 §5.2 exige o `modo`, então `exigirPapel` (ou um wrapper) precisa de um parâmetro de modo.
