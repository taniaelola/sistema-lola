# Checklist de QA manual

Cobre a loja de varejo (spec-mãe `docs/superpowers/specs/2026-09-09-loja-lola-design.md`,
§16), o release de Home, Login, Admin CMS e Atacado
(`docs/superpowers/specs/2026-10-02-loja-lola-release-home-login-atacado-design.md`)
e o **site só atacado** (migração 0010,
`docs/superpowers/specs/2026-11-05-loja-lola-site-so-atacado-seguranca-rastreamento-design.md`).
Com a 0010 o varejo fica desligado: os itens da seção "Varejo (fluxo existente)"
só valem se o varejo for religado por uma migração futura.

## Como rodar

Estes itens rodam contra um **deploy de preview do Worker na Cloudflare** (build
de branch via `npx opennextjs-cloudflare upload`) ou contra produção
(`https://lolaonline.com.br`), ligado ao **Supabase real** e a um
**`MP_ACCESS_TOKEN`**. As variáveis do Worker (inclusive as `NEXT_PUBLIC_*` em
Build > Variables) precisam estar coladas, senão login, checkout, admin e webhook
dão erro; ver "Deploy (Cloudflare Workers)" no `README.md`. Como o token é
de **produção**, os itens de pagamento (Pix / cartão) exigem um pagamento real de
valor pequeno; não há sandbox. Registre o resultado de cada item no PR.
Qualquer falha vira correção antes de liberar a loja.

Antes de começar: `supabase/release-unico.sql` (primeiro lançamento) e
`supabase/release-0010.sql` (janela da 0010) aplicados, `supabase/smoke.sql` com
tudo `ok = true` e a conta do dono criada (ver "Lançamento" e "Janela da migração
0010" no `README.md`).

## Bloqueante

- [ ] **Confirm email = ON** em Supabase > Authentication > Providers > Email.
      Prova: cadastrar-se em `/entrar` com um e-mail novo NÃO permite entrar
      antes de clicar no link recebido. Se entrar sem confirmar, pare o
      lançamento.
- [ ] Redirect URLs do Auth são exatamente `<domínio>/entrar` e
      `<domínio>/entrar/redefinir` (sem curinga) e `NEXT_PUBLIC_SITE_URL` está
      definida no Worker (Settings > Variables and secrets **e** Build > Variables).
- [ ] Webhook do Mercado Pago: o checkout envia `notification_url` apontando para
      `https://lolaonline.com.br/api/webhook/mercadopago` (não exige cadastro no
      painel; se houver cadastro, sem endereço `.vercel.app`), e o
      `ADMIN_WEBHOOK_SECRET` do Worker bate com o hash em
      `admin_config.webhook_secret_hash`. Prova: um pagamento de teste vira `pago`;
      se o log do Worker mostrar "mp_register_order_payment falhou", repita o par
      Secret + SQL.

## Já coberto pelo build automatizado

Exercitados por `npm run build`, `npm test` e inspeção de código; ainda vale
confirmar em produção, mas não são o foco da passada manual:

- Render das telas de estado vazio (vitrine sem produto, `/surpresa` sem produto
  ativo, `/minha-conta` sem resultado).
- 404 em rota inexistente e em `/pedido/<id>` inválido.
- Resposta `{skipped}` do webhook para eventos que não são de pagamento.
- Regras de preço de varejo/atacado, preço efetivo com promoção, regra de 12 SKUs,
  filtro de menu por papel, chave de carrinho e totais (testes Vitest em `__tests__/`).

## Site só atacado (migração 0010)

Visitante (sem login):

- [ ] `/` mostra só a landing page de revendedoras: destaques (até 8) com preço de
      **varejo e de atacado**, textos editáveis, CTA para entrar. Sem carrinho de
      varejo, sem estoque e sem `preco_atacado` cru no HTML ou nas respostas de rede.
- [ ] `/produto/<slug>`, `/carrinho`, `/surpresa`, `/minha-conta` e o checkout de
      varejo não vendem nada ao visitante com o varejo desligado (a rota
      redireciona; `/produto/<slug>` volta para `/`).
- [ ] `/atacado`, `/atacado/catalogo` e `/atacado/produto/<slug>` pedem login
      (`/entrar?next=...`), inclusive por endereço direto.
- [ ] No navegador (aba Rede), uma consulta direta à tabela `products`,
      `product_colors`, `product_sizes` ou `categorias` com a chave anon retorna
      erro de permissão/vazio.
- [ ] Checkout de convidado: chamar `checkout_iniciar_pedido` sem sessão falha
      (`anon` sem EXECUTE).
- [ ] `/pedido/<id>` de um pedido real não mostra endereço.

Revendedor:

- [ ] **Pendente**: o login leva à tela "Cadastro pendente"; nenhum produto nem
      preço aparece, nem por endereço direto.
- [ ] **Recusado**: o login leva à tela "Cadastro não aprovado"; nenhum produto nem
      preço aparece.
- [ ] **Aprovado**: vitrine com preço de **varejo e de atacado** por produto e
      página de produto; produtos "Somente bônus" **não** aparecem na vitrine.
- [ ] Carrinho de atacado com **14 peças** (bonificação ligada, mínimo 15): o
      indicador diz quantas peças faltam e o pedido sai sem brinde. Com **15
      peças** (produto de brinde ativo e com estoque): o indicador diz
      "Bonificação garantida" e o brinde entra no pedido com preço zero.
- [ ] Brinde indisponível (sem estoque ou inativo): o pedido é criado sem o brinde,
      com aviso no pedido (`bonus_aviso`); nada quebra.
- [ ] Revendedor aprovado não ativa o varejo: o botão de checkout só cria pedido
      de atacado (`is_atacado = true`).

Config e bônus (superadmin):

- [ ] Config mostra os cards "Varejo e bonificação"; **varejo vem desligado** e o
      aviso de que religar exige migração está visível; admin e supervisor não veem
      a engrenagem de Config.
- [ ] Ligar a bonificação sem escolher o produto do brinde é recusado com mensagem
      clara; peças mínimas 0 ou quantidade 0 também.
- [ ] O produto do brinde só pode ser escolhido entre os marcados "Somente bônus";
      um produto de bônus com preço zero não consegue ser ativado.
- [ ] Editar um produto "Somente bônus" e salvar **não** desmarca "Somente bônus".

Supervisor (sem preço e sem valores):

- [ ] Pedidos: sem coluna **VALOR**; total, frete e preços dos itens não aparecem
      (nem na resposta de rede de `admin_list_orders`: vêm `null`); telefone e
      endereço continuam visíveis. A Visão geral não mostra valores de pedido.
- [ ] Produtos: vê a lista sem colunas de preço, desconto e Live; cadastra produto,
      cores, tamanhos e estoque; o **produto novo nasce inativo e com preço zero**.
- [ ] Editor de produto: Preço, Preço de atacado e Desconto aparecem desabilitados
      com a explicação; salvar uma edição não altera o preço gravado (conferir com
      um admin).
- [ ] Não consegue ativar produto com preço zero ("defina o preço antes de
      ativar").
- [ ] Não vê "Excluir" em produto, categoria, cor ou tamanho; o RPC também recusa.
- [ ] Categorias: o campo de desconto de atacado fica oculto e o valor existente é
      preservado ao salvar; mudar a categoria de um produto cujo preço de atacado
      depende do desconto da categoria é recusado pelo banco.
- [ ] Admin: vê todas as colunas e campos de preço, define o preço do produto
      criado pelo supervisor e consegue ativá-lo.

Estoque e ativação:

- [ ] **Dois pedidos, mesmo estoque**: com um tamanho de estoque 12, criar dois
      pedidos pendentes de 12 un. desse tamanho (duas revendedoras, ou o mesmo
      carrinho em sequência). Pagar o primeiro (sem aviso, estoque 0) e depois o
      segundo: o segundo **também liquida**, o estoque fica 0 (nunca negativo) e o
      pedido mostra em Pedidos o aviso vermelho "Faltaram 12 un. de Produto / Cor /
      Tamanho" (e o ícone ⚠ na linha). O aviso **não** aparece em `/pedido/<id>`
      nem em "meus pedidos" da revendedora.
- [ ] Ativar produto com preço de atacado (override) **0**, ou em categoria com
      desconto de atacado 100%, é recusado: "Defina um preço de atacado maior que
      zero antes de ativar". Produto "Somente bônus" segue só a regra do preço.

Webhook:

- [ ] Pagamento aprovado liquida o pedido com o valor pago conferido; valor
      diferente do total (abaixo ou acima) **não** liquida: o webhook responde
      `200` com `ok:false` e o pedido segue pendente (veja o log do Worker).
- [ ] Segundo pagamento aprovado para um pedido já pago (ou aprovado para pedido
      cancelado) responde `200` e deixa `ALERTA_PAGAMENTO_REVISAR` no log do
      Worker; a retentativa do **mesmo** pagamento não gera alerta.

## Login e contas

- [ ] Cadastro de cliente em `/entrar` (modo cadastro) → mensagem "Confirme seu
      e-mail para entrar" → após confirmar, login por e-mail e senha leva ao `next` ou à Home.
- [ ] Login do dono (superadmin) por e-mail e senha → vai para `/admin`.
- [ ] Senha errada mostra mensagem genérica; conta desativada é encerrada com aviso.
- [ ] Reset de senha: "Esqueci minha senha" → e-mail → link abre
      `/entrar/redefinir` → nova senha → login com a nova senha; a antiga deixa de valer.
- [ ] Sair encerra a sessão; `/admin` sem sessão redireciona para `/entrar?next=/admin`.
- [ ] Links do rodapé (Ajuda 1 a 3, Instagram, WhatsApp) abrem o destino certo;
      Ajuda sem link usa o WhatsApp da loja.

## Revendedor e atacado

- [ ] Cadastro de revendedor em `/entrar?modo=revendedor` (razão social, CNPJ com
      máscara e 14 dígitos, nome, WhatsApp) → confirmar e-mail → login mostra a
      tela "cadastro pendente de aprovação" em `/atacado`.
- [ ] No `/admin` > Revendedores, o admin aprova o cadastro → `/atacado` libera o painel.
- [ ] Recusado/pendente não acessa `/atacado/catalogo`, nem pelo endereço direto.
- [ ] Catálogo de atacado mostra preço de atacado e estoque por SKU.
- [ ] Carrinho de atacado com 11 SKUs distintos: "Finalizar" bloqueado, progresso "11 de 12".
- [ ] Carrinho com 12 SKUs distintos: "Finalizar" liberado → `/checkout` com preço de atacado.
- [ ] Pagamento (Pix, valor pequeno) → pedido de atacado `pago` → carrinho de
      atacado limpo **apenas dos SKUs do pedido** (itens adicionados depois permanecem).
- [ ] `/atacado/pedidos` lista o pedido com o status certo.

## Admin: usuários e permissões por papel

- [ ] **Supervisor**: vê Visão geral só com contagens e estoque baixo (sem valores
      de receita), Pedidos **sem valores**, Vendas sem totais financeiros,
      **Produtos** (cadastro sem preço e sem excluir; ver a seção "Site só
      atacado") e Revendedores (cadastrar/editar, sem aprovar/recusar). Tem a
      tela **Vendas** (somente leitura, **sem valores**) no menu; **sem
      Financeiro**, Promoções, Banner, Textos, Usuários e Config; o RPC também
      recusa se chamado direto.
- [ ] **Admin**: tudo de cadastro e conteúdo (inclui Financeiro, Usuários não
      superadmin, aprovar/recusar revendedor); **sem Config** (ícone do rodapé ausente).
- [ ] **Superadmin**: acessa tudo, inclusive Config; cria/edita outros superadmins.
- [ ] Ninguém consegue rebaixar ou desativar a si mesmo; o último superadmin
      ativo não pode ser rebaixado.
- [ ] Convite de papel: "+ Adicionar usuário" grava convite de **uso único**; ao
      a pessoa confirmar o e-mail o papel é aplicado e o convite some da lista.
      Cancelar convite só vale para convites pendentes.
- [ ] **Conta não confirmada com e-mail convidado não vira equipe**: cadastre
      (sem confirmar) um e-mail, depois convide-o como admin/supervisor e confirme
      o e-mail; o papel continua `cliente` e o convite segue pendente. A promoção
      só acontece por "Usuários" (superadmin/admin) ou apagando a conta e
      recriando-a depois do convite.
- [ ] Conta do dono: criada por Add user + Auto Confirm ANTES do SQL; se o e-mail
      já existir, apagar e recriar; nunca enviar magic link/recuperação a conta
      não confirmada.
- [ ] Funcionário que criou a conta antes do re-convite: a confirmação não
      promove; promover em Usuários. Revendedor cadastrado manualmente: conferir
      e apagar contas não confirmadas com o e-mail antes (vínculo sem regra de data).
- [ ] Revogar atacado: recusar o cadastro em Revendedores corta o acesso; mudar o
      papel em Usuários não corta.

## Admin: conteúdo

- [ ] Banner do hero: editar rascunho, **publicar** → Home mostra o banner novo;
      **descartar** rascunho volta ao publicado; trocar a foto do banner funciona.
- [ ] Textos da loja: alterar o aviso do topo, rodapé, bloco de revendedora e
      títulos da Home; a Home e o rodapé refletem a mudança.
- [ ] Categorias aceitam imagem e a Home exibe o bloco com a foto.
- [ ] Promoção **automática** (sem cupom): reduz o preço na vitrine, no produto
      e no total do checkout (o servidor recalcula; nunca confia no preço do cliente).
- [ ] Promoção **com cupom** fica "guardada" e **sem efeito** no preço da loja.
- [ ] Pedido **pendente** só pode ser cancelado ou liquidado (admin_settle_order);
      o select de status não oferece "pago"/"pendente".

## Varejo (fluxo existente)

- [ ] Cadastrar categoria, produto com 2 cores e numerações, imagens base64.
- [ ] Produto sem estoque some da vitrine, continua no admin.
- [ ] Checkout `retirada` sem endereço → preferência MP sem linha de taxa.
- [ ] Checkout `entrega` → linha "Taxa de entrega" com o valor de `admin_config`.
- [ ] Checkout `entrega_fora` → sem taxa no MP.
- [ ] Pagar com Pix (produção, valor pequeno) → volta para `/pedido/<id>?pagamento=sucesso`.
- [ ] Webhook marca `pago`, baixa estoque, cria linhas em `sales`, dispara ntfy.
- [ ] Reenvio do mesmo webhook não duplica baixa nem venda (idempotência).
- [ ] Pagamento recusado/pendente → volta para `/pedido/<id>` com status certo.
- [ ] Pedido feito por cliente logado fica associado à própria conta (a identidade vem da sessão, não do formulário).
- [ ] `/minha-conta` acha pedidos por telefone.
- [ ] `/surpresa`: sem produto ativo → tela vazia; com produto → "Comprar agora" vai direto ao checkout.
