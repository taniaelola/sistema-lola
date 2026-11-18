# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-18
Fase: Atacado no ar e testado (pedido sem pagamento, premium, convite de equipe, cadastro de produto novo); banco limpo (só o superadmin); falta cadastrar os produtos reais; Parte C (GTM, Pixel, GA4, SEO) ainda não começou
Progresso: 
Próximo passo: Cadastrar os produtos reais (com fotos e estoque) no admin e fazer um pedido de teste de ponta a ponta com uma revendedora
Prazo do próximo passo: 
Trava: Fotos e dados dos produtos reais; entradas do dono para a Parte C: GTM ID, GA4, Meta Pixel e token da API de Conversões, token do Cloudflare Web Analytics

## Feito na última sessão
- Home de atacado nova (PR #18) no ar
- Pedido de atacado SEM pagamento no site (PR #19, SQL 0012 rodado): nasce "Em separação"; a vendedora avisa no WhatsApp, manda o link de pagamento feito à mão e registra o pagamento no admin (supervisora, admin e superadmin); carrinho esvazia ao enviar; estoque baixa no pagamento
- Revendedora premium: caixa no admin (só admin/superadmin), sem pedido mínimo
- Convite de equipe por e-mail testado de ponta a ponta (PRs #19, #20, #22): link abre "Finalize seu cadastro" (nome e senha); revendedora que se cadastra sozinha segue o fluxo normal (confirma e volta ao login)
- Cadastro de produto em janela centralizada (PR #21): só preço cheio (atacado é calculado pelo desconto da categoria), sem características, tamanhos 34 a 40 com botões − e +
- Banco de produção limpo a pedido do dono: removidos contas de teste, pedidos, vendas e produtos; ficou só o superadmin

## Para o conselheiro
- Decisões do dono (17-18/11): atacado não paga no site; link de pagamento feito à mão pela vendedora; revendedora "premium" por caixa (privilégio atual: sem pedido mínimo); convite de equipe por e-mail; cadastro de produto só com preço cheio.
- Pendências do dono: cadastrar os produtos reais; confirmar NEXT_PUBLIC_SITE_URL como variável de build na Cloudflare (o código já usa o domínio da loja como padrão); apagar o projeto sistema-lola na Vercel (dá check vermelho nos PRs); decidir repositório privado.
- Dívidas aceitas: 12 literal no SQL/textos; estoque só baixa no pagamento (duas revendedoras podem pedir a última peça); S-04 parcial (anon lê pedido de atacado por uuid); M-4; religar varejo via admin_set_loja_config; campos de texto da home sem efeito no admin; trocar o papel de um convite pendente exige apagar a conta não confirmada no Supabase; produtos antigos com desconto de varejo mostram o preço riscado já com esse desconto.
- Fonte Bacony Script saiu do site (era de uso pessoal).
