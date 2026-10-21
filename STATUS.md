# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-10-21
Fase: Fase 1 (varejo) construída e migrada para as contas novas (GitHub e Vercel); recriação visual da Home planejada; login de cliente (Fase 2) começado
Progresso: 
Próximo passo: Concluir a lista de pré-lançamento do README
Prazo do próximo passo: 
Trava: Projeto novo na Vercel está no plano Hobby, que proíbe uso comercial; decisão do Dudu de manter por enquanto

## Feito na última sessão
- Migração concluída em 21/10/2026: repositório transferido para taniaelola/sistema-lola (5 branches mantidas); projeto recriado na Vercel da conta nova com as 6 variáveis de ambiente
- Domínio lolaonline.com.br e www verificados no projeto novo (TXT _vercel no Registro.br); NEXT_PUBLIC_SITE_URL aponta para https://www.lolaonline.com.br
- Testado no domínio real: catálogo, checkout até o QR do Pix e login do /admin
- Remote local atualizado para a conta nova

## Para o conselheiro
- Decisão do Dudu: seguir no plano Hobby da Vercel por enquanto, assumindo o risco de suspensão por uso comercial. Rever antes de tráfego real.
- Projeto e repositório antigos continuam existindo; apagar só depois de alguns dias de operação estável.
- Conferir se a URL do webhook do Mercado Pago aponta para o domínio e não para *.vercel.app antigo.
- Pendente do README: trocar os segredos que passaram pelo histórico do Git.
- Arquivo da fonte Bacony Script é "uso pessoal apenas"; não foi versionado. Precisa de licença comercial se for usada no site.
