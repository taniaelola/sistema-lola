# Loja LOLA — Site só atacado: LP de revendedores, bonificação de 15 peças e varejo em off

Data: 2026-10-27 · Branch: `feat/lp-atacado-bonus` (a partir de `origin/main`, 970df24)
Spec-base: `2026-10-02-loja-lola-release-home-login-atacado-design.md` (login com papéis, aprovação de revendedor e atacado, já no ar).

## 1. Objetivo

1. O site passa a ser **só para revendedores**. A Home vira uma LP que atrai e cadastra revendedores.
2. O **varejo fica desligado** por um interruptor no admin, para ser liberado depois.
3. Nova regra de incentivo: **a cada compra de atacado com 15 ou mais peças, o revendedor ganha uma bonificação** (produto do catálogo entregue de graça). Vale por compra, **não acumula**.

## 2. Decisões do dono (fechadas nesta conversa)

| Tema | Decisão |
|---|---|
| Aprovação de revendedor | Já existe (cadastro `pendente`, admin aprova/recusa). Não muda. |
| Bônus × mínimo atual | As duas regras valem juntas: 12 SKUs distintos para fechar o pedido **e** 15 ou mais peças (soma das quantidades) para ganhar o bônus. |
| Entrega do bônus | Produto do catálogo, adicionado ao pedido a R$ 0,00, baixando estoque. Cadastrado no admin ("cadastrar produto bônus"). |
| O que o visitante vê | Só a LP, com **fotos e preços de atacado de alguns produtos como exemplo**. Catálogo completo só após aprovação. |
| Quais produtos aparecem | Os marcados como **destaque** no admin (4 a 8). Sem nenhum destaque, a seção some. |
| Interruptor do varejo | No admin (aba Config), só `superadmin`. Padrão: **desligado**. |

## 3. Decisões propostas (aprovadas no desenho em chat)

- Bônus sem estoque **não bloqueia** o pedido: ele fecha sem o bônus e o admin vê um aviso no pedido.
- Nenhum código de varejo é apagado; só fica inacessível enquanto o interruptor estiver desligado.
- O produto bônus pode ser marcado `somente_bonus`, fica fora do catálogo, da LP e do varejo.

## 4. Banco (migração `0010_lp_atacado_bonus.sql`)

`0009_seguranca.sql` já existe; esta é a `0010`. Também entra no `supabase/release-unico.sql` consolidado e no `smoke.sql`.

- `admin_config` ganha: `varejo_ativo boolean not null default false`, `bonus_ativo boolean not null default false`, `bonus_min_pecas int not null default 15 check (>= 1)`, `bonus_produto_id uuid null references products(id) on delete set null`, `bonus_quantidade int not null default 1 check (>= 1)`.
- `products` ganha `somente_bonus boolean not null default false`.
- RPCs (todas `SECURITY DEFINER`, `search_path = public, extensions`, sem aceitar papel/uid do cliente):
  - `get_loja_flags()` pública: devolve `varejo_ativo`, `bonus_ativo`, `bonus_min_pecas`, `bonus_quantidade` e o **nome** do produto bônus. Nada além disso.
  - `admin_set_loja_config(p_varejo_ativo, p_bonus_ativo, p_bonus_min_pecas, p_bonus_produto_id, p_bonus_quantidade)`: só `superadmin` (padrão `assert_*` do `0005`). Valida que o produto bônus existe quando `bonus_ativo`.
  - `get_destaques_atacado()` pública: produtos `ativo` e `destaque` e não `somente_bonus`, com estoque, limitado a 8; devolve nome, slug, primeira imagem e **preço de atacado** calculado por `_preco_atacado` (nunca o custo/override bruto). Sem `select` público em tabela nova.
  - `admin_get_config()` passa a devolver os campos novos; `admin_set_config` não muda.
- Varejo off: `checkout_iniciar_pedido` com `p_is_atacado = false` lança `varejo desativado` quando `varejo_ativo = false`. Defesa no banco além do redirecionamento no app.
- Bônus: dentro de `checkout_iniciar_pedido`, ramo atacado, depois de validar o carrinho e antes de fechar os totais:
  - `pecas = sum(quantidade)` das linhas do carrinho (linhas do bônus não contam).
  - Se `bonus_ativo` e `bonus_produto_id` definido e `pecas >= bonus_min_pecas`: trava com `for update` o tamanho de maior estoque disponível do produto bônus (ordem de trava consistente com a do atacado para evitar deadlock), insere `order_items` com `preco_unit = 0`, `subtotal = 0`, `quantidade = bonus_quantidade`, e baixa o estoque.
  - Sem estoque suficiente ou produto inativo: não insere, não falha; registra o motivo em coluna nova `orders.bonus_aviso text null`.
  - `orders.bonus_aplicado boolean not null default false` marca o pedido. Não há saldo/contador por revendedor: a regra é recalculada em cada pedido, logo **não acumula**.
- `_settle_order`/estorno: o bônus é um `order_item` normal; cancelar o pedido devolve o estoque pelo mesmo caminho dos demais itens.

## 5. App (Next.js)

### 5.1 Varejo desligado
- Helper `lib/loja-flags.ts` (server): lê `get_loja_flags()` com fallback seguro (**se a leitura falhar, varejo = desligado**). Testável em Vitest.
- `/produto/[slug]`, `/carrinho`, `/surpresa` e `/checkout` quando não for atacado redirecionam para `/`. `/checkout` de atacado segue funcionando.
- `SiteHeader`/`HeaderClient`: sem sacola e sem navegação por categorias enquanto `varejo_ativo = false`; ficam “Entrar”/“Painel” e “Seja revendedor”.
- Cadastro de `cliente` (varejo) em `/entrar` fica oculto com o varejo off; o modo revendedor é o destaque.

### 5.2 Home = LP de revendedores (`app/page.tsx`)
Substitui a vitrine; reaproveita `SiteHeader`, `SiteFooterServer`, `PaymentsStrip`, `HeroRevendedora`/`BannerRevendedora` onde servir. Seções:
1. Aviso + header.
2. **Hero** para revendedor (título, subtítulo, botão “Quero ser revendedor” → `/entrar?modo=revendedor`).
3. **Regras**: 12 SKUs distintos por pedido; **bônus a partir de 15 peças** (texto vem de `get_loja_flags()`: mostra o nome do produto bônus e a quantidade; a seção do bônus some se `bonus_ativo` for falso); preço de atacado.
4. **Como funciona** em 3 passos: cadastre-se → aprovação → compre pelo painel.
5. **Amostra**: 4 a 8 produtos destaque com foto e preço de atacado (`get_destaques_atacado()`); se vazio, a seção não renderiza. Aviso curto “Catálogo completo após a aprovação”.
6. **Chamada final** com o mesmo botão.
7. Para revendedor aprovado logado, o botão principal vira “Ir para o painel” (`/atacado`); para pendente, leva à tela de espera.
- Todos os textos da LP vêm de `textos_loja` (aba “Textos da loja”), com valores padrão no código, como no resto do site. Chaves novas são acrescentadas ao seed.
- Saem da Home: categorias, lançamentos, grade de produtos e `TrustStrip` de varejo.

### 5.3 Carrinho de atacado
`/atacado/carrinho` ganha, ao lado do progresso “X de 12 SKUs”, um segundo indicador: “N de 15 peças — Faltam X para ganhar [nome do bônus]” / “Você ganhou [bônus]!”. A decisão de bônus vem de função pura em `lib/atacado.ts` (`progressoBonus(pecas, min)`), usada também nos testes. O banco continua sendo a autoridade; a UI só informa.

### 5.4 Pedido e admin
- Linha do bônus aparece no pedido (`/pedido/[id]`), no painel do revendedor e em Pedidos do admin com “Bônus” e preço R$ 0,00. `bonus_aviso` aparece em destaque no admin quando existir.
- **Config** (só `superadmin`): bloco “Bonificação” (ligar, peças mínimas, produto bônus, quantidade) e interruptor “Varejo ligado”. Leitura/gravação por `admin_get_config`/`admin_set_loja_config`.
- **Editor de produto**: checkbox “Somente bônus”. Produtos `somente_bonus` ficam fora de catálogo/LP/varejo e continuam editáveis no admin; entram na lista de escolha do produto bônus.
- **Destaque** já existente alimenta a LP; o admin mostra uma dica “aparece na LP” no marcador.

## 6. Segurança

- Nenhuma função nova aceita papel, uid ou preço do cliente. Bônus e preço de atacado calculados só no servidor.
- `get_destaques_atacado()` expõe apenas preço de atacado dos produtos destaque (decisão do dono); não expõe custo, override nem outros produtos.
- `get_loja_flags()` expõe só os campos listados.
- Varejo off é imposto no banco (checkout) e no app (rotas). Fallback de falha = desligado.
- Revisão obrigatória de SQL/segurança da `0010` antes de dar por pronto.

## 7. Testes e verificação

- Vitest (puro): `progressoBonus` (14 não ganha, 15 ganha, 30 ganha uma vez, bônus desativado), soma de peças ignorando linha de bônus, fallback de flags (falha → varejo off), seleção/formatação da amostra da LP (vazio → seção some), menu do header com varejo off.
- `npm run build`, `npm run lint`, `npm test` verdes a cada tarefa e no fim.
- `smoke.sql` ganha checagens da `0010` (colunas, funções, grants, `get_loja_flags` anônima funciona, `admin_set_loja_config` negada ao anônimo).
- O SQL não é executado por mim neste ambiente; o dono roda a `0010` no Supabase. Passo de QA manual no `docs/QA-fase1.md`: pedido com 14 e com 15 peças, bônus sem estoque, varejo off/on.
- Pelo `LIDER.md`: Code Reviewer na SQL e no checkout, Reality Checker dá o veredito final.

## 8. Ordem de execução (mesma branch, revisão por tarefa)

1. Migração `0010` + smoke + release-unico.
2. `lib/loja-flags.ts`, `lib/atacado.ts` (bônus) e testes.
3. Varejo off: rotas, header, `/entrar`.
4. Admin: Config (bônus e interruptor), editor de produto.
5. Carrinho de atacado, pedido e admin de pedidos exibindo o bônus.
6. LP (Home) e textos novos.
7. Docs: README, `docs/QA-fase1.md`, `STATUS.md` (incluindo “Para o conselheiro”).

## 9. Fora de escopo

Reativar o varejo (só o interruptor), bônus por faixa (30 peças e acima), bônus acumulativo, cupom no checkout, preço de atacado público de produtos que não são destaque, busca.

## 10. Riscos

1. Mexer em `checkout_iniciar_pedido` (dinheiro e estoque): mitigado por revisão dedicada, trava de linhas na mesma ordem e smoke.
2. Janela entre rodar o SQL e o deploy: com a `0010` aplicada antes do deploy, o app antigo continua funcionando (colunas novas com default, varejo passa a ser recusado pelo banco). O inverso, deploy antes do SQL, faz o app cair no fallback seguro (varejo off, sem bônus). Ordem recomendada: SQL primeiro, depois merge.
3. A loja hoje vende em varejo real (pedidos de teste e catálogo em cadastro): ligar o interruptor “off” derruba o varejo de imediato. Confirmar a data com o dono antes de aplicar em produção.
