# Handoff: LOLA — Vitrine, Login, Admin e Revendedor

## Overview
Loja LOLA (calçados e acessórios, público 20–30 anos). Quatro arquivos:
- **Vitrine (home)**: hero, categorias, lançamentos, banner "Seja revendedor".
- **Login**: entrada única para cliente, revendedor e admin.
- **Admin** (dona da loja, estilo CMS/WordPress): Visão geral, Pedidos, Financeiro, Produtos, Promoções, Banner do hero, Revendedores, Usuários.
- **Revendedor** (atacado): Painel, Carrinho (mínimo 12 SKUs distintos), Catálogo com preço de atacado, Meus pedidos, telas de cadastro pendente/recusado.
Desktop + mobile: vitrine e login inteiros; visão geral de Admin e Revendedor.

## About the Design Files
Os arquivos `.dc.html` são **referências de design em HTML** — protótipos que mostram visual e comportamento, **não código de produção**. A tarefa é **recriar essas telas no ambiente existente do projeto** (React/Next, Vue etc.), usando os padrões, componentes e bibliotecas já estabelecidos. Dados são mockados em constantes no fim de cada arquivo (`PRODUTOS_SEED`, `PEDIDOS_SEED`, `REVENDEDORES_SEED`, `FINANCEIRO_SEED`, `CATALOGO_SEED`, `MEUS_PEDIDOS_SEED`) — substituir por dados reais da API.

Para abrir: sirva a pasta com um servidor estático (ex.: `npx serve .`) e abra os `.dc.html` — `support.js` e `image-slot.js` precisam estar na mesma pasta.

## Fidelity
**High-fidelity.** Cores, tipografia, espaçamentos e interações são finais. Recriar fielmente.

## Design Tokens
Cores
- Fundo `#FDF6F3` · Superfície `#FFFFFF` · Texto `#2B2420` · Texto secundário `#8A7A70` · Linhas `#EFE0DB`
- Rosa `#FF8FAB` · Menta `#8FE3C8` · Lilás `#C7A8FF` · Pêssego/CTA `#FFA45C`
- Tints de status (fundo / texto):
  - Sucesso (Entregue, Pago, Aprovado): `#EAFBF4` / `#2E7D63`
  - Enviado / Atacado: `#F2ECFF` / `#6E56B8`
  - Em preparação / Pendente / Desconto: `#FFF3E8` / `#C46A1F`
  - Cancelado / Recusado / Varejo / alerta de estoque: `#FFF0F4` / `#C4416F`
- Tendência positiva: `#3FA383`

Tipografia
- **Hanken Grotesk** (400/500/600/700) — texto, labels, títulos de UI
- **Martian Mono** (400/500/600) — números, preços, IDs, cabeçalhos de tabela (11px, letter-spacing .04em, uppercase)
- **Logo**: imagem (placeholder `lola-logo`). Script bold só no logo e títulos pontuais — nunca em tabelas/dados.
- Escala: título de tela 20/600 · título de card 15/600 · corpo 13 · meta 11–12 · KPI 28 (mono 600) · KPI mobile 22

Raios: cards 16px · inputs/botões 8–10px · linhas de carrinho 14px · mockup mobile 28px
Sombra: modal/mobile `0 12px 32px rgba(43,36,32,.10)`
Espaçamento: padding de página 28×32 · gap entre cards 16 · padding de card 20–24 · linha de tabela 14–16 vertical, 20 horizontal (densidade confortável)

## Elemento-assinatura: swing tag (etiqueta de calçado)
Usado **só nos badges de status**. CSS:
```
display:inline-flex; position:relative; padding:5px 12px 5px 18px;
font-size:12px; font-weight:600; background:<tint>; color:<texto>;
clip-path:polygon(10px 0,100% 0,100% 100%,10px 100%,0 50%);
```
+ furo: círculo 4×4px `#FDF6F3` absoluto em `left:5px; top:50%`.

## Layout geral (desktop)
- Sidebar fixa 232px, branca, borda direita `#EFE0DB`, padding 24/16. Logo no topo (96×36) + rótulo mono "ADMIN"/"ATACADO". Itens: ícone 20px + label 14/500, padding 10/12, raio 10. Ativo: fundo `#FFF3E8`, texto `#C46A1F`. Card do usuário no rodapé.
- Header branco: título + subtítulo à esquerda; à direita busca (Admin) / progresso do carrinho (Revendedor) + sino.
- Conteúdo: grids com `repeat(auto-fit, minmax(…,1fr))` para reflow. Tabelas com `overflow-x:auto` e `min-width`.

## Vitrine — Home
Botão flutuante Desktop/Mobile é só para demo (remover). Mobile = 390px.
1. **Barra de aviso** (fundo #2B2420, Martian Mono 11px): "Frete grátis acima de R$ 299 · Troca fácil em 30 dias".
2. **Header** sticky branco: logo (imagem), nav Tênis/Sandálias/Botas/Bolsas/Acessórios/Lançamentos (Lançamentos em #C4416F), ícones busca, conta (→ login), sacola com contador pêssego. Mobile: hambúrguer + logo + ícones.
3. **Hero full-bleed** claro (fundo #FFE4EC + foto pastel), altura min(78vh,720px) / 560px mobile. Texto escuro embaixo à esquerda: etiqueta mono, título 84px/700 (40px mobile), subtítulo, CTAs "Ver coleção" (pêssego) e "Comprar por categoria" (branco com borda). **Conteúdo editável pelo Admin → Banner do hero.**
4. **Categorias**: grid auto-fill (min 180px; 140px mobile), cards 4:5 raio 16 com foto + nome + →.
5. **Lançamentos**: carrossel horizontal com scroll-snap, setas ←/→ (rolam 80% da largura). Card: foto 3:4, swing tag "NOVO" (menta), favorito ♡/♥, categoria, nome, preço mono + "ou 3x", swatches de cor.
6. **Banner Seja revendedor**: bloco menta raio 24, texto + CTA escuro "Quero ser revendedor" (→ login, modo revendedor) + foto.
7. **Footer** branco: logo, colunas Loja / Ajuda / Conta.

## Login (entrada única)
Desktop: split — foto editorial à esquerda, formulário (max 400px) à direita. Mobile: só formulário.
- Abas **Entrar / Criar conta** (segmentado, ativo pêssego).
- **Entrar com Google** (botão branco) + divisor "OU".
- Entrar: e-mail, senha, link **Esqueci a senha** → tela com e-mail + "Enviar link" → mensagem de sucesso menta.
- Criar conta: nome, e-mail, senha.
- Card tracejado lilás **Quero ser revendedor** → formulário: razão social, CNPJ (máscara), nome, e-mail, WhatsApp (máscara), senha → "Solicitação enviada. Seu cadastro está pendente de aprovação." (cria revendedor com status pendente).
- Validação inline (#C4416F). Inputs 48px raio 12, foco com borda pêssego + halo #FFE4CC.
- **Roteamento pós-login por papel**: admin/editor → Admin; revendedor → painel Revendedor (gate por status); cliente → vitrine. (No protótipo simulado pelo e-mail conter "admin"/"revenda" — substituir por auth real.)

## Telas — Admin
1. **Visão geral**: segmentado Todos/Varejo/Atacado (ativo = pêssego). 3 KPIs (Vendas totais, Vendas do mês, Nº de vendas) que respondem ao recorte. Gráfico de linha rosa (área com gradiente 22%→0) 12 meses. Card "Revendedores pendentes" com ✓/✕. Cards "Pedidos aguardando ação" (status Em preparação) e "Estoque baixo" (≤5 un., número em rosa).
2. **Pedidos**: filtro Todos/Varejo/Atacado. Colunas: Pedido, Cliente/Revendedor (atacado mostra "Revendedor" abaixo do nome), Tipo (chip), Itens, Valor, Entrega (swing tag), Data.
3. **Produtos**: botão "+ Cadastrar produto" (pêssego). Colunas: Produto (foto 44px + nome), Categoria, Varejo, Atacado (lilás escuro), Estoque (vermelho se ≤5), Visível (toggle), Destaque (toggle), Desconto (chip).
   - **Modal de cadastro**: foto (quadrada), Nome*, Categoria (select: Tênis, Sandália, Bota, Chinelo, Bolsa, Mochila, Acessório), Preço varejo*, Preço atacado (default 50% do varejo se vazio), Estoque, Desconto %, toggles Visível/Destaque. Salvar desabilitado até Nome e Preço preenchidos. Produto novo entra no topo.
   - Toggle: 36×20, off `#EFE0DB`, on `#8FE3C8`, knob branco 16px.
4. **Financeiro**: 4 cards (Receita total, A receber atacado, Ticket médio, Repasses pendentes). Tabela de lançamentos + "Lançamento manual" (modal: descrição, valor).
5. **Revendedores**: "+ Cadastrar revendedor". Colunas Loja, Cidade, Solicitado, Status, Ações, Editar. **Status só aparece como swing tag "Cadastro pendente" enquanto pendente**, com Aprovar/Recusar; após decisão somem e fica texto discreto "Aprovado"/"Recusado". Campos: loja/razão social*, CNPJ, responsável, e-mail, WhatsApp, cidade/UF, status (pendente/aprovado/recusado).
6. **Usuários**: filtro por papel (Todos/Admins/Equipe/Clientes/Revendedores), "+ Adicionar usuário". Colunas Nome (avatar inicial), E-mail, Papel (chip), Último acesso, Status (Ativo/Inativo), Editar. Campos: nome*, e-mail*, papel (Administrador, Editor, Cliente, Revendedor), conta ativa. Papéis: chip admin pêssego, editor lilás, cliente rosa, revendedor menta.
7. **Promoções**: "+ Criar promoção". Colunas Promoção (+ cupom mono lilás), Desconto (chip), Aplica a, Período (dd/mm → dd/mm), Ativa (toggle inline), Editar. Campos: nome*, desconto %*, aplica a (Toda a loja ou categoria), início, fim, cupom, ativa.
8. **Banner do hero**: formulário à esquerda (etiqueta, título, subtítulo, texto + link do botão principal, texto do segundo botão, toggle mostrar segundo botão) e pré-visualização 16:10 ao vivo à direita (foto arrastável). Status "Alterações não publicadas" / "Publicado na vitrine"; botões Descartar / **Publicar na vitrine**. Alimenta o hero da home.

### Padrão CMS (estilo WordPress)
- Sidebar agrupada: **Geral** (Visão geral, Pedidos, Financeiro) · **Catálogo** (Produtos, Promoções) · **Aparência** (Banner do hero) · **Pessoas** (Revendedores, Usuários). Rótulos de grupo em Martian Mono 10px.
- **Editor em drawer lateral** (460px, direita, overlay 35%) compartilhado por produto, revendedor, usuário e promoção: kicker "NOVO/EDITAR X", título, campos do schema, erro de obrigatório, rodapé Excluir (só edição) · Cancelar · Salvar. Toast escuro centralizado após salvar/excluir/publicar.
- Produtos: "+ Cadastrar produto" e "Editar" abrem o mesmo drawer (foto, nome*, categoria, preço varejo*, atacado — default 50%, estoque, desconto, visível, destaque).

## Telas — Revendedor
- **Gate de cadastro** (`accountStatus`): `pendente` → tela centrada com logo + swing tag "Cadastro pendente" + texto curto. `recusado` → idem com "Cadastro não aprovado". `aprovado` → app completo (sem selo de status). No protótipo há um seletor flutuante "Simular cadastro" (só para demo — remover em produção).
1. **Painel**: card de progresso "X de 12 SKUs" (barra gradiente pêssego→rosa) + botão Ver carrinho; KPIs (Pedidos no mês, Total comprado, Desconto atacado); Últimos pedidos; Novidades do catálogo.
2. **Carrinho (persistente)**: linhas com foto, nome, preço/un., alerta por linha ("Só restam N" em `#C4416F`), −/qtd/+ (+ desabilita ao atingir o estoque), subtotal, remover. Resumo: progresso SKUs distintos, peças, total. Botão "Finalizar pedido" desabilitado com texto "Faltam N SKUs para finalizar" enquanto < 12 SKUs distintos. **Persistir no backend/localStorage.**
3. **Catálogo**: grid 4 colunas, foto 160px, badge "Sem estoque"/"Só restam N" sobre a foto, preço de atacado em mono. Botão: Adicionar (pêssego) → "No carrinho (n)" (menta) → "Sem estoque" (desabilitado).
4. **Meus pedidos**: Pedido, SKUs, Data, Valor, Status (swing tag).

## Mobile (visão geral de cada frente)
Largura 360px, cards empilhados, logo 72×26 + menu ☰. Admin: KPI do mês em destaque, Total + Nº vendas lado a lado, mini-gráfico, contadores de pedidos aguardando e estoque baixo. Revendedor: card do carrinho (progresso), pedidos no mês, últimos pedidos, novidades (thumbs 56px).

## State Management
- Vitrine: banner (vem do Admin), favoritos, carrinho/sacola.
- Login: modo (entrar | cadastro | revendedor | esqueci), valores do form, erro, mensagem de sucesso.
- Admin CMS: `usuarios[]`, `promocoes[]`, `banner` (rascunho) vs `bannerSaved` (publicado), `editor {entity, isNew, form}`.
- Admin: `screen`, `salesFilter`, `pedidosFilter`, `produtos[]` (visivel, destaque, desconto), `revendedores[]` (status: pendente|aprovado|recusado), modais (`lancamentoOpen`, `novoOpen`, `novo` form).
- Revendedor: `accountStatus`, `screen`, `carrinho {productId: qtd}` (persistente), estoque por produto.
- Regra: pedido mínimo = 12 SKUs **distintos** (não peças).

## Assets
- **Logo LOLA**: placeholder — substituir pelo arquivo final (SVG/PNG) em todos os pontos (header/footer da vitrine, login, sidebars, mobile, telas de status).
- **Fotos de campanha**: hero (`hero-campanha`), login (`login-foto`), categorias (`cat-{slug}`), banner revendedor (`banner-revendedor`).
- **Fotos de produto**: placeholders por ID de produto (`produto-{id}`) — usar as imagens reais do catálogo. Mesma foto no Admin e no Catálogo do revendedor.
- Ícones da sidebar são glifos provisórios (◆ ▤ ◇ ◈ ◎) — trocar pela biblioteca de ícones do projeto.

## Files
- `LOLA Vitrine Home.dc.html` — home da loja (desktop + mobile)
- `LOLA Login.dc.html` — login/cadastro/revendedor/esqueci a senha (desktop + mobile)
- `LOLA Admin Dashboard.dc.html` — todas as telas do Admin (CMS) + mobile
- `LOLA Revendedor Dashboard.dc.html` — todas as telas do Revendedor + mobile
- `support.js`, `image-slot.js` — runtime só para visualizar os protótipos (não portar)
