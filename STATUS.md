# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-11-05
Fase: Loja rodando na Cloudflare Workers (venda Pix validada ponta a ponta); auditoria de segurança B0 concluída; spec do "site só atacado" aprovada, plano da Parte A ainda não escrito
Progresso: 
Próximo passo: Escrever o plano da Parte A (migração 0010: catálogo só por função, papéis, LP) e depois a Parte C (GTM, Pixel, GA4, SEO)
Prazo do próximo passo: 
Trava: Entradas do dono para a Parte C: GTM ID, GA4, Meta Pixel e token da API de Conversões, token do Cloudflare Web Analytics; data para ligar o "varejo off" e da janela SQL+deploy

## Feito na última sessão
- Migração para Cloudflare concluída: PR #10 mergeado na main; variáveis e secrets no Worker; novo segredo do webhook + hash no Supabase; checkout real testado (Pix R$ 1,00: pedido pago, venda registrada, estoque baixou, ntfy chegou); preço do produto de teste restaurado para R$ 19,90
- Auditoria de segurança B0 (somente leitura, produção): 8 achados (0 crítico incondicional, 2 alto, 3 médio, 3 baixo); roteiro de isolamento 60/62 (falhas esperadas: visitante lê products e product_sizes); nada persistiu. Relatório em docs/auditoria-seguranca-2026-11.md; roteiro em supabase/rls-teste.sql
- Spec do site só atacado, segurança e rastreamento (docs/superpowers/specs/2026-11-05-...) com as 4 decisões do dono na §12; PR #11 aberto (só documentação e SQL de leitura)

## Para o conselheiro
- Decisões do dono (05/11): (1) revogar o checkout de convidado para visitante; religar o varejo exigirá migração futura; (2) supervisor vê Pedidos sem valores; (3) webhook do Mercado Pago mantido com segredo rotacionado e valor pago obrigatório; (4) supervisor cadastra produto mas preço só admin/superadmin (produto novo do supervisor nasce inativo e com preço 0; hipótese a confirmar).
- Regras do dono para o site: sem venda no varejo, vitrine só para revendedor aprovado e logado, vitrine com preço de varejo e de atacado, cadastro de produto por admin ou supervisor (o "gerente"), RLS sem acesso entre usuários, SEO/Pixel/GA4/GTM/Cloudflare Web Analytics.
- Pendências de infraestrutura: trocar a Production branch do Worker de cloudflare para main (o merge já foi feito); apagar o projeto sistema-lola na Vercel depois de alguns dias estável; cancelar pedidos de teste pendentes no admin; considerar tornar o repositório privado; trocar o par segredo do webhook + SQL, pois o valor apareceu em texto no chat; verificar "secure email change" no Auth do Supabase (Confirm email já está ligado).
- O webhook do Mercado Pago dispensa cadastro no painel do cliente (o checkout envia notification_url); o Dudu não tem acesso à conta do Mercado Pago do cliente.
- Arquivo da fonte Bacony Script é "uso pessoal apenas"; não foi versionado. Precisa de licença comercial se for usada no site.
