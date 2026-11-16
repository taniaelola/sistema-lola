# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-16
Fase: Parte A (site só atacado) no ar desde 16/11; cadastro de produtos e primeiros revendedores em andamento; Parte C (GTM, Pixel, GA4, SEO) ainda não começou
Progresso: 
Próximo passo: Rodar supabase/release-0011.sql no Supabase (mínimo de 12 peças no banco) e testar o carrinho do revendedor com 10 e 12 peças
Prazo do próximo passo: 
Trava: Entradas do dono para a Parte C: GTM ID, GA4, Meta Pixel e token da API de Conversões, token do Cloudflare Web Analytics

## Feito na última sessão
- Parte A em produção (PR #12): migração 0010 aplicada, segredo do webhook trocado, smoke e RLS (87/87) ok
- Atacado só com retirada na loja (#13); admin mostra o preço de atacado efetivo (#14)
- Mínimo do pedido passa a ser 12 PEÇAS no total, não modelos distintos (#15, migração 0011; SQL ainda não aplicado)
- Botão "Avisar no WhatsApp" ao aprovar revendedora e tela de espera mais clara (#16); o build desse merge não disparou na Cloudflare, por isso este commit

## Para o conselheiro
- Decisões do dono (16/11): sem custos por ora; só retirada na loja; mínimo de 12 peças; aviso de aprovação só por WhatsApp (e-mail fica para depois); preço de atacado = preço próprio do produto > desconto da categoria (hoje 30%) > varejo; lista de cidades/frete adiada.
- Pendências do dono: rodar release-0011.sql; confirmar NEXT_PUBLIC_SITE_URL como variável de build na Cloudflare; cadastrar produtos reais e desativar os 12 de exemplo e o "Sandalia teste"; cancelar pedidos de teste; apagar o projeto sistema-lola na Vercel; decidir repositório privado.
- Dívidas aceitas: 12 literal no SQL/textos; reserva completa de estoque; S-04 parcial (anon lê pedido de atacado por uuid); M-4; religar varejo via admin_set_loja_config; menores do botão de WhatsApp (DDD/fixo, regex do site, texto inválido no nome).
- Fonte Bacony Script é de uso pessoal: precisa de licença comercial se for usada no site.
