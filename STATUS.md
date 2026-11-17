# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-17
Fase: Parte A (site só atacado) no ar; home nova no ar (PR #18); pedido sem pagamento no site, revendedora premium, novo cadastro de produto e convite de equipe por e-mail prontos no branch feat/pedido-sem-pagamento-premium, aguardando teste e merge; Parte C (GTM, Pixel, GA4, SEO) ainda não começou
Progresso: 
Próximo passo: Revisar o branch feat/pedido-sem-pagamento-premium, rodar supabase/release-0012.sql no Supabase e promover o app (nessa ordem), depois testar um pedido de atacado ponta a ponta
Prazo do próximo passo: 
Trava: Entradas do dono para a Parte C: GTM ID, GA4, Meta Pixel e token da API de Conversões, token do Cloudflare Web Analytics

## Feito na última sessão
- Home de atacado nova (PR #18, Claude Design, hero com vídeo) mergeada e no ar; build da Cloudflare ok
- Pedido de atacado SEM pagamento no site: nasce "Em separação"; a vendedora avisa no WhatsApp (botão no admin), manda o link de pagamento feito à mão no Mercado Pago e registra o pagamento no admin (baixa estoque e lança a venda); carrinho esvazia ao enviar o pedido (SQL 0012)
- Revendedora premium: caixa no admin (só admin/superadmin) que isenta do pedido mínimo (carrinho, checkout e banco)
- Cadastro de produto em passos: escolher cor (paleta), foto, grade 36–40 com botões − e +, estoque que grava sozinho
- Convite de equipe por e-mail (Supabase, sem chave extra): a pessoa abre o link, informa nome e senha e entra com o papel escolhido; reenvio na lista de pendentes
- Testes 722 passando, tsc/lint/build ok. Não verificado: telas do admin no navegador (sem login) e o SQL 0012 num Postgres real (Docker)

## Para o conselheiro
- Decisões do dono (17/11): atacado não paga no site; link de pagamento feito à mão pela vendedora (presencial e online); revendedora "premium" por caixa de marcar (privilégio atual: sem pedido mínimo); convite de equipe deve mandar e-mail com link para finalizar o cadastro.
- Ordem de lançamento do 0012: rodar release-0012.sql ANTES de promover o app novo; rollback em supabase/rollback-0012.sql.
- Pendências do dono: rodar release-0012.sql; conferir no Supabase (Authentication, Email Templates) que o modelo "Confirm signup" tem o link {{ .ConfirmationURL }}; confirmar NEXT_PUBLIC_SITE_URL como variável de build na Cloudflare; cadastrar produtos reais e desativar os 12 de exemplo e o "Sandalia teste"; cancelar pedidos de teste; apagar o projeto sistema-lola na Vercel; decidir repositório privado.
- Dívidas aceitas: 12 literal no SQL/textos; estoque só baixa no pagamento (duas revendedoras podem pedir a última peça); S-04 parcial (anon lê pedido de atacado por uuid); M-4; religar varejo via admin_set_loja_config; campos de texto da home sem efeito no admin; trocar o papel de um convite pendente exige apagar a conta não confirmada no Supabase.
- Fonte Bacony Script saiu do site (era de uso pessoal).
