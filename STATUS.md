# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-05
Fase: Fase 1 (varejo) migrada da Vercel para Cloudflare Workers (OpenNext); só as páginas públicas carregam, faltam variáveis secretas, webhook e checkout de teste; cadastro de produtos e login de cliente (Fase 2) em andamento
Progresso: 
Próximo passo: Colar as variáveis no Worker (e em Build > Variables), gerar o novo ADMIN_WEBHOOK_SECRET com o SQL do hash no Supabase e testar um checkout real no Pix
Prazo do próximo passo: 
Trava: Login, checkout, painel admin e webhook dão erro até as variáveis secretas serem coladas no Worker (ação do Dudu)

## Feito na última sessão
- Loja saiu da Vercel (Pro gerava cobrança; time rebaixado para Hobby em 03/11/2026) e roda no Worker "sistema-lola" na Cloudflare, build pelo Git (repo taniaelola/sistema-lola, branch cloudflare, ainda sem merge na main)
- lolaonline.com.br com nameservers da Cloudflare e domínio personalizado do Worker; DNS do Resend (send, rsend) preservado como DNS only; lojatania, consultoriaalmar e komissao migraram para a mesma conta
- Documentação atualizada (README, docs/QA.md, AGENTS.md) e textos de erro do código trocados de Vercel para Cloudflare; lint, tsc, 526 testes e build passam

## Para o conselheiro
- Hospedagem: Cloudflare Workers (plano gratuito: bundle de 3 MB gzip e 10 ms de CPU por requisição). Se estourar, Workers Paid custa cerca de US$ 5/mês. Decisão de assinar fica com o Dudu.
- ADMIN_WEBHOOK_SECRET novo precisa andar junto com o SQL de admin_config.webhook_secret_hash; um lado sem o outro quebra o webhook.
- Pendentes: colar variáveis; trocar segredo + SQL; webhook do Mercado Pago para https://lolaonline.com.br/api/webhook/mercadopago; checkout real de teste; merge da cloudflare na main e voltar a branch de produção para main; apagar o projeto sistema-lola na Vercel só depois de validar.
- Repositório é público: revisar o histórico do git atrás de segredos expostos e considerar torná-lo privado.
- Arquivo da fonte Bacony Script é "uso pessoal apenas"; não foi versionado. Precisa de licença comercial se for usada no site.
