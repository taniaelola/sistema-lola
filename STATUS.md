# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-06
Fase: Parte A (site só atacado) com o código pronto na branch feat/parte-a-site-so-atacado, aguardando a revisão final e a janela única de SQL + deploy; Parte C (GTM, Pixel, GA4, SEO) ainda não começou
Progresso: 
Próximo passo: Revisão final da Parte A (Reality Checker) e marcar a janela única: rodar supabase/release-0010.sql e mergear/deployar na sequência
Prazo do próximo passo: 
Trava: Data da janela SQL + deploy (decisão do dono, horário de pouco movimento); entradas do dono para a Parte C: GTM ID, GA4, Meta Pixel e token da API de Conversões, token do Cloudflare Web Analytics

## Feito na última sessão
- Parte A (site só atacado) implementada: migração 0010 (catálogo fechado, checkout de convidado revogado, bônus, papéis), varejo desligado no app, landing page de revendedoras, vitrine do revendedor com preço de varejo e de atacado, telas de espera (pendente/recusado) e indicador de bonificação no carrinho
- Painel /admin: Config (só superadmin) com interruptor do varejo e bonificação (peças mínimas, quantidade, produto do brinde); editor de produto com "Somente bônus" e preço desabilitado para o supervisor; Pedidos e Visão geral sem valores para o supervisor; categorias sem desconto de atacado e sem excluir para o supervisor
- Webhook do Mercado Pago: envia sempre o valor pago (obrigatório no banco) e, sem valor válido, não chama o RPC
- README (janela da 0010, varejo e bonificação, matriz de papéis), docs/QA.md (LP, pendente/recusado, bônus 14 e 15 peças, supervisor sem preço e sem valores) e testes atualizados

## Para o conselheiro
- Decisões do dono (05/11): (1) revogar o checkout de convidado para visitante; religar o varejo exigirá migração futura; (2) supervisor vê Pedidos sem valores; (3) webhook do Mercado Pago mantido com segredo rotacionado e valor pago obrigatório; (4) supervisor cadastra produto mas preço só admin/superadmin (produto novo do supervisor nasce inativo e com preço 0; hipótese a confirmar).
- Regras do dono para o site: sem venda no varejo, vitrine só para revendedor aprovado e logado, vitrine com preço de varejo e de atacado, cadastro de produto por admin ou supervisor (o "gerente"), RLS sem acesso entre usuários, SEO/Pixel/GA4/GTM/Cloudflare Web Analytics.
- O que o dono precisa fazer na janela (nesta ordem): conferir Auth > Email com "Confirm email" ligado; colar supabase/release-0010.sql inteiro no SQL Editor e rodar uma vez; rodar supabase/smoke.sql; mergear o PR e deixar o deploy terminar logo em seguida; durante o build, rodar supabase/rls-teste.sql; fazer a passada de docs/QA.md. Rollback: supabase/rollback-0010.sql + deploy anterior (o rollback também religa o varejo).
- Notas operacionais novas: o supervisor não consegue excluir produto, categoria, cor nem tamanho (só admin e superadmin); produto "Somente bônus" precisa de preço nominal maior que zero para poder ser ativado e escolhido como brinde; após a janela o varejo e a bonificação ficam desligados até o superadmin configurar em Config.
- Pendências de infraestrutura: trocar a Production branch do Worker de cloudflare para main (o merge já foi feito); apagar o projeto sistema-lola na Vercel depois de alguns dias estável; cancelar pedidos de teste pendentes no admin; considerar tornar o repositório privado; trocar o par segredo do webhook + SQL, pois o valor apareceu em texto no chat; verificar "secure email change" no Auth do Supabase (Confirm email já está ligado).
- O webhook do Mercado Pago dispensa cadastro no painel do cliente (o checkout envia notification_url); o Dudu não tem acesso à conta do Mercado Pago do cliente.
- Arquivo da fonte Bacony Script é "uso pessoal apenas"; não foi versionado. Precisa de licença comercial se for usada no site.
