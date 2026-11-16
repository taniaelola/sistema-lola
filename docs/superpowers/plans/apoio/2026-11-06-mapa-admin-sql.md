# Mapa: admin, papéis, testes e SQL (Parte A, site só atacado)

Somente leitura. Branch `feat/site-so-atacado`. Migração mais alta que existe: `0009_seguranca.sql`. `0010` não existe ainda.
Specs lidas: 27/10 (bônus/varejo off) e 05/11 (§5.4, §12).

## 0. Achados que mais afetam o plano
1. `AcaoAdmin "catalogo"` (lib/admin-acesso.ts:74-88) é uma ação única só de `ADMINS`. Ela protege produtos, cores, tamanhos, categorias, destaque, ativo, desconto, surpresa e excluir. Para o supervisor, é preciso dividir em pelo menos 2 ações: cadastro (supervisor entra) e preço/exclusão (só admins). Isso muda `cargasIniciais`, a rota de `/admin` e 3 testes.
2. `cargasIniciais` (lib/admin-acesso.ts:142-152) define `estoqueBaixo: !catalogo && ...`. Se o supervisor ganhar `catalogo`, ele passa a receber `products` e `estoqueBaixo` vira `false`. Mas AdminApp.tsx:272-273 e :292 usam `supervisor ? estoqueBaixo : ...` e `semReceita={supervisor}`. Esse acoplamento precisa ser reescrito, senão o KPI "estoque baixo" do supervisor quebra.
3. `admin_list_orders` (0005:199-214) devolve `_order_json(o.id) || {telefone, mp_payment_id, forma_pagamento, revendedor_id}`. Os campos de valor vêm de `_order_json` (0002:155-172), que é compartilhada com `public_get_order` e `meus_pedidos`. O mascaramento do supervisor tem que ficar dentro de `admin_list_orders` (o padrão está em `admin_list_sales`, 0005:285-298: `v_papel := assert_papel(...)` e `to_jsonb(s) || jsonb_build_object(... null)`). Para `items[].preco_unit/subtotal` é preciso reescrever o array `items` (jsonb_set ou rebuild). A tela PedidosTab (PedidosTab.tsx:148) e VisaoGeralTab (:193) fazem `brl(o.valor_total)`, e `brl(null)` quebra.
4. `saveCategoria` (app/admin/actions.ts:265-274) lê `categorias` direto com `g.sb.from("categorias").select("imagem")`. Isso usa o `SELECT` que a spec manda revogar de `authenticated` (§5.1). Precisa trocar por RPC, ou por incluir `imagem` em `admin_list_categorias` (que já devolve `to_jsonb(c)`, ou seja, já inclui `imagem`). Outros 8 leitores diretos de tabela de produto estão em §2.
5. `scripts/build-release-sql.mjs:30-32` exige que `0008_checkout_atacado.sql` seja o ÚLTIMO arquivo (`falhar(...)`), e o cabeçalho (:46-48) diz "NUNCA reaplique 0002/0007 depois do 0008". Além disso `0009` hoje diz "NÃO entra no release-unico.sql" (0009:9). Para incluir 0009 e 0010 é preciso mudar `ORDEM`, remover/atualizar a trava do 0008 e ajustar o cabeçalho. O `release-unico.sql` gerado tem 2273 linhas e lista só 0004..0008.
6. `smoke.sql:70-72` afirma que `checkout_iniciar_pedido` é executável por `anon`, e o :80 afirma `get_textos()` com 19 chaves. Os dois quebram na 0010 (revoke de anon; chaves novas da LP). Ver §7.
7. `admin_upsert_product` e `admin_upsert_categoria` hoje são "gravar tudo como veio" (UPDATE incondicional de preco, preco_atacado, desconto). Para preservar preço quando o chamador é supervisor, o ramo de update precisa de `case when v_papel='supervisor' then preco else p_preco end`. A assinatura de `admin_upsert_product` (13 args) ainda não tem `somente_bonus` (novo argumento = nova sobrecarga; precisa de `drop function if exists` da antiga, como 0005 fez).

---
## 1. app/admin/** (painel)

Não há subrotas: `/admin` é uma página só.
| Arquivo | Linhas | Função |
|---|---|---|
| `app/admin/page.tsx` | 42 | Server Component. `exigirPapel(EQUIPE, "/admin")` (:18) -> `cargasIniciais(perfil.papel)` (:19) -> carrega em paralelo `listarProdutos/Categorias/Pedidos/Vendas/lerConfig/EstoqueBaixo` conforme as cargas (:22-29). Renderiza `<AdminApp ...>` (:32). `revalidate = 0`. |
| `app/admin/consultas.ts` | 53 | `import "server-only"`. Wrappers de RPC de leitura: `listarProdutos`->`admin_list_products` (:26), `listarCategorias`->`admin_list_categorias` (:30), `listarPedidos(sb,p_filtro)`->`admin_list_orders` (:34), `listarVendas`->`admin_list_sales` (:38), `listarRevendedores`->`admin_list_revendedores` (:42), `listarEstoqueBaixo`->`admin_estoque_baixo` (:46), `lerConfig`->`admin_get_config` (:49-53). Erro devolve `[]` ou `null`. Tipo `ConfigAdmin = {taxa_entrega_local:number; whatsapp:string; cidade_taxa:string}` (:13-17). |
| `app/admin/actions.ts` | 609 | `"use server"`. Ver tabela de actions abaixo. |
| `app/admin/admin-cms.css` | 21 | Estilos do CMS. |

### Sessão e papel (como é verificado)
- `autorizar(acao: AcaoAdmin)` (actions.ts:49-66): `getSessao({renovar:true})` (cookies, lib/auth.ts:40) -> `perfilPorToken` (lib/auth.ts:90, chama RPC `get_my_profile`) -> `decidirAcesso(perfil, acao)` (lib/admin-acesso.ts:103) -> `{sb: supabaseComToken(token), perfil}` ou `{error}`. Conta inativa encerra a sessão. `cliente(acao)` (:68) devolve só o `sb`.
- Páginas: `exigirPapel(papeis, caminho)` (lib/auth.ts:106-113); redireciona para `/entrar?next=` sem perfil/inativo, e para `/` se o papel não está na lista.
- Matriz de ações no app: `PAPEIS_DA_ACAO` (lib/admin-acesso.ts:74-88). O banco decide de fato com `assert_papel`.
- `lib/auth.ts`: `getSessao`:40, `perfilPorToken`:90, `getPerfil`:96, `exigirPapel`:106, `authedSupabase`:85.

### Menu por papel
- `lib/roles.ts` `ACESSO` (:37-43) -> `telasVisiveis`/`podeAcessar` (:45-51).
- `lib/admin-acesso.ts` `ADMIN_SCREENS` (:16-27), `TELA_DA_SCREEN` (:29-40), `screensVisiveis(papel)` (:42-44), `screenPermitida(papel, atual)` (:46-50). NOTA: `"config"` não é `AdminScreen`; é um modal.
- `AdminApp.tsx` calcula `screens = screensVisiveis(papel)` (:~82) e passa a `AdminSidebar` (`GRUPOS` em AdminSidebar.tsx:25-52; filtro `screens.includes(key)` em :109). Config: botão de engrenagem no rodapé da sidebar, só se `onOpenConfig` for passado (AdminSidebar.tsx:209-213); `AdminApp.tsx:83` `ehSuperadmin = podeExecutar(papel,"config")`, :241 passa `onOpenConfig`, :410-416 renderiza `<ConfigTab>` como modal.
- Títulos de tela: `SCREEN_TITLES` (AdminApp.tsx:49-60). `produtos`: "Gerencie visibilidade, destaque e desconto".

### Server actions (app/admin/actions.ts), ação de autorização -> RPC -> argumentos
| Action (linha) | `autorizar(...)` | RPC | Argumentos |
|---|---|---|---|
| `fetchProducts` (:73) | catalogo | admin_list_products | (sem args, via consultas) |
| `fetchCategorias` (:78) | catalogo | admin_list_categorias | — |
| `fetchOrders(p_filtro)` (:83) | pedidos | admin_list_orders | p_filtro |
| `fetchSales(p_filtro)` (:88) | vendas-leitura | admin_list_sales | p_filtro |
| `fetchEstoqueBaixo` (:93) | estoque-baixo | admin_estoque_baixo | — |
| `saveProduct(payload)` (:100-134) | catalogo | admin_upsert_product | p_id, p_nome, p_categoria_id, p_colecao (`||null`), p_preco, p_desconto_percentual, p_preco_atacado, p_descricao, p_caracteristicas, p_ativo, p_destaque, p_ordem, p_slug. Retorna uuid. |
| `deleteProduct` (:136) | catalogo | admin_delete_product | p_id |
| `setAtivo` (:144) | catalogo | admin_set_ativo | p_id, p_ativo |
| `setDesconto` (:153) | catalogo | admin_set_desconto | p_id, p_desconto_percentual (null remove) |
| `setSurpresa` (:168) | catalogo | admin_set_surpresa | p_id, p_ativo |
| `setDestaque` (:176) | catalogo | admin_set_destaque | p_id, p_destaque |
| `saveColor` (:187) | catalogo | admin_upsert_color | p_id, p_product_id, p_nome, p_hex, p_imagens, p_ordem |
| `deleteColor` (:209) | catalogo | admin_delete_color | p_id |
| `saveSize` (:217) | catalogo | admin_upsert_size | p_id, p_color_id, p_tamanho, p_estoque |
| `deleteSize` (:235) | catalogo | admin_delete_size | p_id |
| `saveCategoria` (:247-288) | catalogo | admin_upsert_categoria | p_id, p_grupo, p_nome, p_slug, p_ordem, p_ativo, p_desconto_atacado_percentual, p_imagem. ATENÇÃO: antes lê `categorias.imagem` direto (:265-274). |
| `deleteCategoria` (:290) | catalogo | admin_delete_categoria | p_id |
| `updateOrderStatus` (:300) | pedidos | admin_update_order_status | p_id, p_status |
| `settleOrder` (:313) | liquidar | admin_settle_order | p_order_id |
| `insertSale` (:323) | vendas-escrita | admin_insert_sale | 11 args p_* |
| `deleteSale` (:355) | vendas-escrita | admin_delete_sale | p_id |
| `fetchConfig` (:365) | config | admin_get_config | — |
| `saveConfig(payload: ConfigAdmin)` (:370-380) | config | admin_set_config | p_taxa, p_whatsapp, p_cidade |
| `fetchRevendedores` (:384) | revendedores | admin_list_revendedores | p_status |
| `setRevendedorStatus` (:389) | revendedores-status | admin_set_revendedor_status | p_id, p_status |
| `saveRevendedor` (:400) | revendedores | admin_upsert_revendedor | 8 args |
| `fetchPromocoes/savePromocao/deletePromocao` (:430-476) | promocoes | admin_list_promocoes / admin_upsert_promocao / admin_delete_promocao | — |
| `fetchUsuarios/saveUsuario/inviteUsuario/fetchConvites/deleteConvite` (:482-552) | usuarios | admin_list_users / admin_set_user / admin_invite_user / admin_list_convites / admin_delete_convite | — |
| `fetchTextos/saveTextos` (:574-585) | textos | get_textos / admin_set_textos | via `chamarRpc` (:558) |
| `fetchBanner/saveBannerRascunho/publishBanner/discardBanner` (:587-609) | banner | admin_get_banner_hero / admin_save_banner_rascunho / admin_publish_banner / admin_discard_banner | — |

Para a Parte A: nova action `saveLojaConfig` (-> `admin_set_loja_config`, autorizar "config") e `saveProduct` ganha `somente_bonus`.

## 2. Editor de produto

Arquivos: `components/admin/ProductEditor.tsx` (868 linhas, Drawer largo), `components/admin/ProdutosTab.tsx` (129), `components/admin/CategoriasTab.tsx` (563). Orquestração em `AdminApp.tsx` (:176-215 handlers; :296-368 telas; :370-380 `<ProductEditor>`).

### ProductEditor.tsx (props: `product: Product|null`, `categorias`, `onChange(list?)`, `onDone`; :41-51)
- Estados (:53-72): `nome`, `categoriaId`, `preco` (:57), `precoAtacado` (:58), `descricao`, `caracteristicas`, `desconto` (:65), `ativo` (:68, default `true`), `destaque` (:69, default `false`). Objeto `atual` (:73) alimenta a detecção de alterações do Drawer (:157).
- Falta: estado e campo `somente_bonus`.
- `handleSaveProduct` (:88-148): valida `!nome.trim() || !preco || !categoriaId` (:89, mensagem "Preencha ao menos nome, categoria e preço." :90); converte preço/desconto/atacado; chama `saveProduct({...})` (:121-138). `colecao: product?.colecao ?? ""`, `ordem: product?.ordem ?? 0`, `slug: product?.slug || slugify(nome)`.
- Campos de PREÇO na UI: "Preço (R$)" (~:216-224, input `value={preco}`), "Preço de atacado (R$, opcional)" (:226-235), "Desconto de varejo (%, opcional)" (:241-247) + prévia (:250-280). Onde desabilitar para supervisor: esses 3 `<input>` (adicionar prop `somentePreco`/`podeEditarPreco` ao componente e `disabled`), e relaxar a validação `!preco` (:89), pois o supervisor não preenche preço.
- Checkboxes (:296-318): "Ativo no site" (:305, `ativo`) e "Marcar como destaque" (:315, `destaque`). **"Somente bônus" cabe como terceiro `<label>` no mesmo `<div style={{display:"flex",gap:24}}>` (:296-317)**, logo depois de destaque.
- Para supervisor: o produto novo deve nascer `ativo=false`; hoje o default é `true` (:68). O ideal é o banco forçar (`p_ativo := false` quando papel=supervisor e `p_id is null`), mas o `ativo` também precisa ficar desabilitado ou fixo para supervisor na UI. Decidir se supervisor pode ativar (spec: "só vai para a vitrine depois que um admin define o preço e ativa").
- `reloadColors` (:79-86) chama `fetchProducts()` (action "catalogo"), então o supervisor precisa de `catalogo`-cadastro para as cores/tamanhos funcionarem.
- Cores/tamanhos: `ColorsManager` (:348), `ColorRow` (:409), `ColorForm` (:679) chamam `saveColor/deleteColor/saveSize/deleteSize` (:421-455, :501, :576, :723).

### ProdutosTab.tsx
- Grade `1.6fr 1fr 100px 100px 80px 70px 70px 60px 90px` (:57, :71): PRODUTO, CATEGORIA, VAREJO, ATACADO, ESTOQUE, VISÍVEL, DESTAQUE, LIVE, DESCONTO.
- Mostra `p.preco` (:84) e `p.preco_atacado ?? Math.round(p.preco*0.5)` (:85). Mascarar/ocultar para supervisor se for esconder preço.
- Switch de visível (:87, `onToggleAtivo`), destaque (:88), live/surpresa (:89), botão de desconto (:91-93) e linha de desconto/"Excluir produto" (:97-120). **Para supervisor**: ocultar/desabilitar a coluna DESCONTO e `onDescontoToggle`, o botão "Excluir produto" (:117) e provavelmente o switch LIVE (surpresa não está na matriz da spec; `admin_set_surpresa` é admins hoje).
- Props: `onNovoProduto/onEditar/onToggleAtivo/onToggleDestaque/onToggleSurpresa/onDescontoToggle/onDescontoChange/onDescontoSalvar/onDescontoRemover/onExcluir/subTab/onSubTab` (:8-42).
- Coluna/indicador "Somente bônus": caberia entre CATEGORIA e VAREJO ou como tag no nome.

### CategoriasTab.tsx
- Campo "Desconto de atacado (%, opcional)" (:341-355); `fromCategoria` (:107-118); `handleSave` (:~160-205) chama `saveCategoria` (:189-198) com `desconto_atacado_percentual: desconto`. Botão "Excluir" (:551) e `handleDelete` (:208). Para supervisor: desabilitar o campo de desconto de atacado e "Excluir"; exibição do valor (:518).
- Dependência: no banco, `admin_upsert_categoria` preserva `desconto_atacado_percentual` quando supervisor.

### AdminApp.tsx pontos de edição
- `ehSuperadmin`/`supervisor` (:83-84); `podeAprovar` (:81); `screens` (:~82).
- Subabas produtos/categorias (:299-368). Handlers `handleToggleAtivo` (:~157), `handleToggleSurpresa` (:~165), `handleDelete` (:178), desconto (:~190-215).
- `onToggleDestaque` inline (:~320-325).

## 3. Tela CONFIG
- `components/admin/ConfigTab.tsx` (194 linhas). **Modal** (position fixed) aberto pela engrenagem da sidebar, só `superadmin`. Props: `config: Config`, `onSaved`, `onClose` (:43-51). `Config = {taxa_entrega_local, whatsapp, cidade_taxa} | null` (:6-10), tipo duplicado em AdminApp.tsx:43-47 e `ConfigAdmin` em consultas.ts:13-17.
- Estados `taxa/cidade/whatsapp` (:54-56). `handleSaveConfig` (:60-82) chama `saveConfig({taxa_entrega_local, whatsapp, cidade_taxa})`.
- UI: um único card "Entrega e contato" (:140-189) dentro do modal (:97-191). Há `cardStyle` (:31) já pensado para vários cards (`marginBottom: 28`).
- Onde caber:
  - Novo card "Loja" com checkbox/toggle "Varejo ligado" e card "Bonificação" (ligar, peças mínimas, produto bônus (select), quantidade), inseridos como irmãos do card existente (após :189, antes do fechamento de :191), cada um com botão salvar próprio -> nova action `saveLojaConfig` -> `admin_set_loja_config`.
  - O select do produto bônus precisa de lista de produtos `somente_bonus`/ativos: `ConfigTab` não recebe `products` hoje; passar de AdminApp (`products` já está no estado) ou criar RPC.
  - Estender `ConfigAdmin`/`Config` com `varejo_ativo, bonus_ativo, bonus_min_pecas, bonus_produto_id, bonus_quantidade` (3 lugares) e `admin_get_config` (SQL).
  - Atenção: a spec de 27/10 diz que `admin_set_config` "não muda". Hoje `admin_set_config(numeric,text,text)` faz update de 3 colunas (0005:336-342), então é compatível.

## 4. Pedidos e vendas
### Pedidos
- `components/admin/PedidosTab.tsx` (241 linhas). Props: `orders, filtro, onFiltro, onChange, podeLiquidar` (:37-49). Tipo `Order` em lib/types.ts:75-97; `OrderItem` :59-71.
- Consumo de valores:
  - `brl(o.valor_total)` na linha (:148) e coluna "VALOR" (:109).
  - No detalhe expandido (:195-232): itens sem preço (`item.quantidade × produto_nome — cor / tamanho`, :202-208), endereço (:219-227). **`preco_unit`/`subtotal`/`valor_produtos`/`entrega_taxa` não são exibidos hoje** em PedidosTab. O único campo de valor mostrado é `valor_total` (:148). `VisaoGeralTab.tsx:193` também usa `brl(o.valor_total)` e `VisaoGeralTab.tsx:81-83`, `:112` etc. usam sales.
  - Para o supervisor: o banco devolve `valor_total`, `valor_produtos`, `entrega_taxa`, itens `preco_unit`/`subtotal` como `null`; na UI esconder coluna VALOR (ajustar `COLS` :32 e cabeçalho :104) e o `brl(o.valor_total)` em :148 e VisaoGeralTab:193. Prop nova tipo `semValores`. Tipos `Order`/`OrderItem` precisam aceitar `number | null` (hoje `number`).
  - Bônus: nova linha "Bônus" no detalhe (itens com `preco_unit = 0`) e `bonus_aviso` (campo novo de `orders`; `_order_json` não devolve; `admin_list_orders` precisa acrescentar `bonus_aplicado`, `bonus_aviso`).
- `liquidar` (botão "Marcar como pago", :161-178) só `podeLiquidar` (admins). Mudança de status: `<select>` com `opcoesStatusPedido` (:121, :180-191; lógica em lib/admin-acesso.ts:164-169).
### Vendas
- `components/admin/VendasLeituraTab.tsx` (85 linhas): tela do supervisor, sem colunas de valor (:42-48); comentário :15-19 "O banco devolve preco_unit e valor_total nulos para esse papel". É o modelo de mascaramento. Mascaramento no banco: `admin_list_sales` 0005:285-298.
- `components/admin/SalesTab.tsx` (285): Financeiro (admins).
- `VisaoGeralTab`: `semReceita` (:22, :34, :112, :127) e `estoqueBaixoServidor` (:23, :35, :81-85).

## 5. lib/roles.ts e testes
### lib/roles.ts (75 linhas)
- `Papel` (:3), `PAPEIS` (:5), `EQUIPE` (:6), `Tela` (:8-19, 11 telas), `MENU` (:21-33), `ACESSO` (:37-43), `podeAcessar` (:45), `telasVisiveis` (:49), `ehEquipe` (:53), `podeAprovarRevendedor` (:57), `podeEditarRevendedor` (:61), `podeGerirPapel` (:65), `destinoPosLogin` (:71).
- `ACESSO.supervisor = ["visao-geral","pedidos","vendas","revendedores"]` (:40). Para dar `produtos`: inserir `"produtos"` (`telasVisiveis` segue a ordem de `MENU`, então a posição certa é entre `pedidos`/`vendas` e `revendedores`: `visao-geral, pedidos, vendas, produtos, revendedores`).
- Os papéis consumidores: `lib/header-menu.ts`, `lib/auth-cookies.ts`, `lib/admin-usuarios.ts`, `lib/admin-revendedores.ts`, `app/entrar/*`.

### Testes que cobrem (vitest, `__tests__/`)
| Arquivo | O que asserta hoje | O que muda |
|---|---|---|
| `__tests__/roles.test.ts` (106) | `MATRIZ` (:32-38) com `supervisor: ["visao-geral","pedidos","vendas","revendedores"]` (:35); um `it` por papel x tela (:51-63) e `telasVisiveis(papel)` igual à matriz (:59-61); `podeAprovarRevendedor/Editar/Gerir/destinoPosLogin`. | Trocar linha :35 para incluir `"produtos"` na ordem do MENU (`["visao-geral","pedidos","vendas","produtos","revendedores"]`). Se criar nova `Tela`, atualizar `TODAS` (:16-28). |
| `__tests__/admin-acesso.test.ts` (298) | `ACOES` (:19-33) lista todas as `AcaoAdmin`; `permitidas()`. `it` :41-49 (superadmin tudo; admin menos config). **:50-57** supervisor só `["pedidos","vendas-leitura","estoque-baixo","revendedores"]`. **:101-108** `screensVisiveis("supervisor")` = `["visao-geral","pedidos","vendas","revendedores"]`. **:122-128** supervisor sem promoções/usuários e `podeExecutar("supervisor","catalogo")` = false (:127). **:147-150** `screenPermitida("supervisor","produtos")` = "visao-geral". **:157-201** `cargasIniciais` (superadmin, admin, **supervisor :180-189** `produtos:false, categorias:false, estoqueBaixo:true`; cliente). **:85-99** superadmin/admin veem a lista `todas` na ordem. | Atualizar: `ACOES` com as novas ações (ex.: `catalogo-cadastro`, `catalogo-preco`), :50-57 e :101-108 (incluir `produtos`), :127, :147-150 (agora `produtos` é permitido), :180-189 (cargas do supervisor) e o teste de admin "menos config" (:46-48). |
| Outros úteis | `decidirAcesso` (:251-285), `opcoesStatusPedido` (:203-249), `dicaRevogarAtacado` (:287-298). | sem mudança |

Novos testes sugeridos: matriz `catalogo-preco` só admins; função pura de "campos de preço desabilitados" (ex.: `camposPrecoEditaveis(papel)`); função que mascara/formata valor nulo no admin; `progressoBonus` (`lib/atacado.ts`, ver `__tests__/atacado.test.ts`).

## 6. SQL, definição mais recente por função

Legenda de ACL: "Supabase concede EXECUTE a anon/authenticated por padrão"; os arquivos revogam explicitamente. `create or replace` preserva o ACL (comentário em 0007:507-509 e 0008:264).

| Função | Definição mais recente (arquivo:linha) | Assinatura exata vigente | Papel / assert | GRANT/REVOKE |
|---|---|---|---|---|
| admin_get_config | 0005:327 | `admin_get_config() returns jsonb` (stable, definer). Devolve `taxa_entrega_local, whatsapp, cidade_taxa` de `admin_config where id=1`. | `assert_papel(array['superadmin'])` | revoke all from public, anon, authenticated (0005:357-381); grant execute to authenticated (0005:383-407). |
| admin_set_config | 0005:336 | `admin_set_config(p_taxa numeric, p_whatsapp text, p_cidade text) returns void` | `['superadmin']` | idem (0005:380, :406). |
| admin_list_orders | 0005:199 | `admin_list_orders(p_filtro text default 'todos') returns jsonb` (stable, definer). Chama `_order_json(o.id) || {cliente_telefone, mp_payment_id, forma_pagamento, revendedor_id}`. Não captura o papel (`perform assert_papel`). | `['superadmin','admin','supervisor']` | revoke all + grant authenticated (0005:372, :398). |
| admin_list_products | 0005:18 | `admin_list_products() returns jsonb` (stable). `jsonb_agg(_product_json(p) order by ordem, nome)` | `['superadmin','admin']` | idem. |
| admin_upsert_product | 0005:26 | `admin_upsert_product(p_id uuid, p_nome text, p_categoria_id uuid, p_colecao text, p_preco numeric, p_desconto_percentual int, p_preco_atacado numeric, p_descricao text, p_caracteristicas text[], p_ativo boolean, p_destaque boolean, p_ordem int, p_slug text) returns uuid`. Insert ou update incondicional de todos os campos (inclui preços). Não tem `somente_bonus`. | `['superadmin','admin']` | idem (assinatura em 0005:359 e :385). |
| admin_upsert_categoria | **0007:343** (8 args). Antes 0005:164 (7 args) e 0002:350 (com p_secret) | `admin_upsert_categoria(p_id uuid, p_grupo text, p_nome text, p_slug text, p_ordem int, p_ativo boolean, p_desconto_atacado_percentual int, p_imagem text default null) returns uuid`. A 0007 dropa a de 7 args (0007:342). Atualiza `desconto_atacado_percentual` e `imagem` sem condição. | `['superadmin','admin']` | revoke all from public, anon, authenticated (0007:510-525) e grant to authenticated (0007:533-542). ATENÇÃO: o revoke da 0005:370 e grant :396 eram da assinatura de 7 args (dropada). |
| admin_upsert_color | 0005:97 | `admin_upsert_color(p_id uuid, p_product_id uuid, p_nome text, p_hex text, p_imagens text[], p_ordem int) returns uuid` | `['superadmin','admin']` | 0005:365, :391. |
| admin_upsert_size | 0005:126 | `admin_upsert_size(p_id uuid, p_color_id uuid, p_tamanho text, p_estoque int) returns uuid`. Valida estoque >= 0. | `['superadmin','admin']` | 0005:367, :393. |
| admin_set_ativo | 0005:61 | `admin_set_ativo(p_id uuid, p_ativo boolean) returns void` | `['superadmin','admin']` | 0005:361, :387. |
| admin_set_destaque | 0005:88 | `admin_set_destaque(p_id uuid, p_destaque boolean) returns void` | `['superadmin','admin']` | 0005:364, :390. |
| admin_set_desconto | 0005:69 | `admin_set_desconto(p_id uuid, p_desconto_percentual int) returns void` | `['superadmin','admin']` | 0005:362, :388. |
| admin_set_surpresa | 0005:77 | `admin_set_surpresa(p_id uuid, p_ativo boolean) returns void` | `['superadmin','admin']` | 0005:363, :389. |
| admin_delete_product | 0005:53 | `admin_delete_product(p_id uuid) returns void` | `['superadmin','admin']` | 0005:360, :386. |
| checkout_iniciar_pedido | **0008:29** (0007:401 e 0002:49 são antigas) | `checkout_iniciar_pedido(p_cliente_nome text, p_cliente_telefone text, p_entrega_tipo entrega_tipo, p_endereco_rua text, p_endereco_numero text, p_endereco_bairro text, p_endereco_complemento text, p_endereco_cep text, p_endereco_cidade text, p_items jsonb, p_is_atacado boolean default false) returns jsonb` (11 args; definer). Atacado: ramo 0008:62-142 (`_atacado_revendedor_aprovado()` :65; trava `for update` por `size_id` crescente :86-101; mínimo 12 SKUs :132; atualiza totais :136-138). Varejo: 0008:144-213. | Atacado: sessão + revendedor aprovado (via `_atacado_revendedor_aprovado`). Varejo: sem exigir login (anon pode). | `revoke all ... from public; grant execute ... to anon, authenticated` (0008:257-262). Para a spec: `revoke execute ... from anon` (smoke :70 e :115-117 assumem anon com EXECUTE). |
| mp_register_order_payment | **0002:524** (única; a anterior de 4 args é dropada em 0002:~522) | `mp_register_order_payment(p_secret text, p_order_id uuid, p_mp_payment_id text, p_forma_pagamento text, p_transaction_amount numeric default null) returns jsonb`. Corpo: `assert_webhook(p_secret)` (:530); idempotência (status<>'pendente' ou mesmo payment id -> `already`); `if p_transaction_amount is not null and < valor_total - 0.01` -> `ok:false`; `_settle_order`. | Segredo do webhook (`admin_config.webhook_secret_hash`), não `assert_papel`. | Sem revoke/grant: mantém EXECUTE padrão para anon (0002:560-562 diz "NÃO revogar ... mp_register_order_payment"). Para tornar `p_transaction_amount` obrigatório: remover o `default null` exige `drop function` da assinatura de 5 args antes (mesma assinatura de tipos, então `create or replace` até funciona, mas retirar default não é permitido com `create or replace`; usar `drop function if exists` + recriar + repor grants). |
| public_get_order | 0002:174 | `public_get_order(p_id uuid) returns jsonb` (sql, definer, stable) = `_order_json(p_id)` | nenhum (público) | Sem revoke: EXECUTE padrão a anon. Sem revoke em 0004..0009. |
| public_get_surpresa | 0002:206 | `public_get_surpresa() returns jsonb` = `_product_json(p)` do `surpresa_ativo and ativo limit 1` | nenhum (público) | Sem revoke (anon tem EXECUTE). |
| _product_json | **0007:380** (0002:188 antiga) | `_product_json(p products) returns jsonb` (sql, stable, `set search_path = public`, NÃO definer). Inclui `preco_atacado` bruto e `categoria` (`to_jsonb(c) - 'imagem'`, logo com `desconto_atacado_percentual`), `desconto_efetivo`, `created_at`, cores e tamanhos com `estoque`. Chama `_desconto_efetivo(p)`. | n/a | `revoke execute ... _product_json(products) ... from public, anon, authenticated` (0002:565-570). Preservado por `create or replace`. |
| _order_json | 0002:155 | `_order_json(p_id uuid) returns jsonb` (sql, stable, `set search_path = public`, NÃO definer). Devolve nome, endereço completo, `valor_produtos`, `valor_total`, `entrega_taxa`, `is_atacado`, `items[{id, produto_nome, produto_cor, produto_tamanho, quantidade, preco_unit, subtotal}]`. Sem `bonus_*`. | n/a | revoke execute from public, anon, authenticated (0002:566). Usada por `public_get_order`, `admin_list_orders`, `meus_pedidos` (0009:15-24). |
| _preco_atacado | 0002:40 | `_preco_atacado(p_preco numeric, p_override numeric, p_pct int) returns numeric` (sql, immutable, **sem search_path**) | n/a | revoke execute (0002:567-568). |
| _preco_varejo | 0002:34 | `_preco_varejo(p_preco numeric, p_desc int) returns numeric` (sql, immutable, sem search_path) | n/a | idem. |
| _slugify | 0002:24 | `_slugify(txt text) returns text` (sql, immutable, sem search_path) | n/a | idem (0002:566). |
| assert_papel | 0004:132 | `assert_papel(p_papeis text[]) returns text` (definer). Lança `sem permissão` 42501 sem sessão, perfil ausente/inativo, ou papel fora da lista. Retorna o papel do chamador (permite `v_papel := assert_papel(...)`). | é o próprio assert | `revoke all ... assert_papel(text[]) from public, anon, authenticated` (0004:340-350), sem grant. |
| atacado_cart_get | 0006:313 | `atacado_cart_get() returns jsonb` (definer, stable). Usa `_atacado_revendedor_aprovado()` e `_preco_atacado(p.preco, p.preco_atacado, c.desconto_atacado_percentual)`. Itens inativos aparecem `disponivel=false`. | revendedor aprovado | revoke all (0006:551-564); grant execute to authenticated (0006:566-...). |
| atacado_cart_set_item | 0006:354 | `atacado_cart_set_item(p_product_id uuid, p_color_id uuid, p_size_id uuid, p_quantidade int) returns void` (definer). Valida produto ativo; limite 300 linhas; qtd 0..999. Não filtra `somente_bonus`. | revendedor aprovado | idem. |

Funções auxiliares relevantes à Parte A:
- `admin_list_categorias()` 0005:156 (`to_jsonb(c)`, inclui `imagem`), `['superadmin','admin']`. `admin_delete_categoria(uuid)` 0005:187 (admins; exceção `categoria tem produtos`). `admin_delete_color(uuid)` 0005:118, `admin_delete_size(uuid)` 0005:147.
- `admin_estoque_baixo()` 0005:262, `['superadmin','admin','supervisor']`. `admin_update_order_status(uuid, order_status)` 0005:220, `['superadmin','admin','supervisor']`. `admin_settle_order(uuid,text)` 0005:243, admins. `admin_list_sales(text)` 0005:285 (supervisor mascarado).
- `_settle_order(uuid,text,text)` 0008:218 (sem definer, sem grant). Bônus herdará via `order_items`.
- `_desconto_efetivo(products)` 0007:250. `_atacado_revendedor_aprovado()` 0006:272.
- `meus_pedidos()` 0009:15 (authenticated). `public_lookup_orders(text)` revogado em 0009:29.
- `get_my_profile()` 0004 (authenticated).

### RLS e privilégios de tabela (estado pós-0009)
- Policies de leitura pública: `cat_read`, `prod_read`, `col_read`, `siz_read` (`for select using (true)`), 0001:142-145. Nomes e `drop policy if exists` ainda não existem nas migrações (a 0010 precisa dropar e, para rollback, recriar).
- 0009:37-38 revoga `insert, update, delete, truncate, references, trigger` de anon/authenticated em categorias/products/product_colors/product_sizes. `SELECT` continua concedido (default Supabase).
- Leitores diretos que a 0010 vai quebrar: `app/page.tsx:26,70`, `app/produto/[slug]/page.tsx:19`, `app/atacado/dados.ts:127,162,196`, `app/atacado/actions.ts:71` (product_sizes), `lib/header-dados.ts:24`, `app/api/categoria-img/[id]/route.ts:9`, **`app/admin/actions.ts:268`** (lista da spec §5.5 diz "confirmar": confirmado, lê direto).
- `public_get_order` é lido por `app/pedido/[id]/page.tsx:38` e `app/api/webhook/mercadopago/route.ts:41` (com anon).

## 7. supabase/smoke.sql, release-unico.sql e build-release-sql.mjs
### smoke.sql (215 linhas, somente leitura, retorna `(nome, ok, detalhe)`)
- Blocos: tabelas (ord 10, :16-20), RLS (20, :25-30), funções-chave por assinatura (30, :35-50), sem `p_secret` fora do webhook (40, :55-64), sem `assert_admin` (41, :68-75), `admin_*` sem EXECUTE para anon (50, :80-92), internas fechadas (60/61, :97-109), **checkout (70/71/72, :114-133)**, conteúdo público (80-86, :138-188), trigger (90), superadmin/convites (100/101).
- Itens que a 0010 quebra ou exige reescrever: **70** (anon com EXECUTE no checkout; vira "anon SEM EXECUTE"), **80** (`get_textos()` = 19 chaves, :139), **86** (mp_register ainda com anon, ok).
- Acrescentar: colunas novas (`admin_config.varejo_ativo`..., `products.somente_bonus`, `orders.bonus_aplicado/bonus_aviso`), funções `get_loja_flags()`, `get_destaques_atacado()`, `admin_set_loja_config(...)`, `get_catalogo_revendedor`, `get_produto_revendedor`, `anon` sem SELECT em `products/product_colors/product_sizes/categorias`, `anon` sem EXECUTE em `public_get_surpresa`, search_path fixo em `_slugify/_preco_*`. O padrão `has_function_privilege('anon', to_regprocedure(...), 'EXECUTE')` já existe.
- `supabase/rls-teste.sql` (207 linhas) é o roteiro de isolamento (B0): 60/62 casos, duas falhas esperadas (visitante lê `products` e `product_sizes`) que a 0010 deve fechar. Auditoria completa em `docs/auditoria-seguranca-2026-11.md` (S-01..S-08).

### scripts/build-release-sql.mjs (142 linhas) e release-unico.sql (2273 linhas)
- `ORDEM` (:11-17) = `['0004_auth_perfis.sql','0005_admin_por_sessao.sql','0006_atacado.sql','0007_cms_textos_promos.sql','0008_checkout_atacado.sql']`. Valida prefixos crescentes (:24-29) e **exige que 0008 seja o último** (:30-32). Concatena com banner `>>> nome` (:96-97), normaliza CRLF (:37), anexa `blocoDono` (:99-138, convite de superadmin com `SEU_EMAIL_AQUI@exemplo.com`) e escreve em `supabase/release-unico.sql` (:141). Script npm: `npm run release:sql`. Não há teste automatizado dele.
- O cabeçalho (:42-94) cita "migrações ${ORDEM}", pré-requisitos, AVISOS (:87-89 "NUNCA reaplique 0002 nem 0007 depois do 0008"). `release-unico.sql` comentário :3 lista só 0004..0008.
- Para incluir 0009 e 0010:
  1. Acrescentar `'0009_seguranca.sql'` e `'0010_...sql'` ao fim de `ORDEM` (:11-17).
  2. Trocar a trava de :30-32 (0008 último) pela do novo último arquivo, ou removê-la.
  3. Reescrever o aviso :87-89 (agora reaplicar 0008/0009 após a 0010 também reabriria o que a 0010 fecha).
  4. 0009 hoje se declara "NÃO entra no release-unico" (0009:9); ajustar o comentário (e decidir se produção já a aplicou: não há evidência em STATUS/README; a auditoria cita 0009 como "fonte da verdade" mas não confirma que rodou em produção).
  5. O nome do arquivo 0010 está escrito na spec como `0010_lp_atacado_bonus.sql`.
  6. Regerar `release-unico.sql` (`npm run release:sql`).
  7. O `blocoDono` e os pré-requisitos já supõem fresh install; como produção já tem 0004-0008, avaliar se vale entregar só `0009+0010` como SQL de janela (o release-unico atual recria tudo).

## 8. package.json, vitest e convenções de teste
- Scripts (`package.json`): `dev`, `build` (next build), `start`, `lint` (eslint), **`test` = `vitest run`**, `test:watch` = `vitest`, `release:sql` = `node scripts/build-release-sql.mjs`, `emails`, `demo:sql`, `preview/deploy/upload` (opennextjs-cloudflare), `cf-typegen`. Não há script `tsc`; usar `npx tsc --noEmit`. Dependência: `@vercel/analytics` (Parte C remove).
- `vitest.config.ts` (9 linhas): alias `@` -> raiz do repo; `environment: "node"`; `include: ["__tests__/**/*.test.ts"]`. Testes só `.ts` (não há teste de componente/React); lógica testável fica em `lib/*.ts` puro.
- Convenção: um arquivo `__tests__/<modulo>.test.ts` por módulo de `lib/`; `describe` por função e `it` em PT-BR; import via `@/lib/...`. 25 arquivos de teste.
- 5 exemplos de lib:
  1. `__tests__/roles.test.ts`: matriz papel x tela completa, gerada com loops (`for papel/tela -> it`), `podeGerirPapel`, `destinoPosLogin` com `it.each` de `next` malicioso.
  2. `__tests__/admin-acesso.test.ts`: `podeExecutar`, `screensVisiveis`, `cargasIniciais`, `opcoesStatusPedido`, `decidirAcesso`.
  3. `__tests__/atacado.test.ts`: `progressoSkus` (atual, percentual, completo, valores inválidos), `textoFaltam` (plural/singular). **Aqui entra `progressoBonus`**.
  4. `__tests__/pricing.test.ts`: `MIN_SKUS_ATACADO` (12), `descontoEfetivo` (produto, promoção da loja, de categoria, maior vence).
  5. `__tests__/checkout.test.ts`: `mensagemErroCheckout` varejo/atacado (estoque, mínimo de 12 SKUs, revendedor não aprovado). **Aqui entra mensagem `varejo desativado`/`bonus`**.
  Outros: `header-menu.test.ts` (`itensMenuConta`, `linksCategorias`), `admin-usuarios.test.ts`, `admin-textos.test.ts`, `home.test.ts`, `webhook-extrair.test.ts`.

## 9. Avisos adicionais
- A spec de 27/10 §4 diz que `0009_seguranca.sql` já existe; a spec de 05/11 manda a `0010` unificada. Ambas as specs concordam em 0010.
- `Order`/`OrderItem` (lib/types.ts:59-97) e `Product`/`Categoria` (:1-47) precisam dos campos novos (`somente_bonus`, `bonus_aplicado`, `bonus_aviso`) e de `number | null` nos valores mascarados.
- `Product` não tem `somente_bonus`; `_product_json` (0007:380) também não, então o editor não recebe o valor atual até o SQL acrescentar.
- A matriz em README.md:89-99 e `docs/QA.md` precisa ser atualizada (linha "Produtos, Categorias, Promoções | não" para supervisor).
- O texto da tela de produtos para o supervisor em AdminApp `SCREEN_TITLES.produtos` (:49-60) segue "visibilidade, destaque e desconto", e o supervisor não mexe em desconto.
