# STATUS — Lola (lolaonline.com.br)
Atualizado: 2026-10-26
Fase: Fase 1 (varejo) construída; repositório migrado para a conta nova do GitHub; domínio de volta no projeto antigo da Vercel (conta eduavb, Pro); recriação visual da Home planejada; login de cliente (Fase 2) começado
Progresso: 
Próximo passo: Decidir onde a loja vai rodar de forma definitiva (Pro na conta nova da Vercel ou continuar na conta antiga) e concluir a lista de pré-lançamento do README
Prazo do próximo passo: 
Trava: Deploy automático do projeto antigo pode não disparar, porque o repo agora é taniaelola/sistema-lola; reconectar o Git no projeto antigo ou migrar de vez para uma conta Pro

## Feito na última sessão
- Repositório transferido para taniaelola/sistema-lola (5 branches mantidas); remote local atualizado
- Projeto recriado na Vercel da conta nova (verceltaniaelola-2956, Hobby) e testado; a Vercel pausou o projeto em 26/10 por limite de uso justo do Hobby (pausa até 25/11)
- Domínio lolaonline.com.br e www voltaram para o projeto antigo (conta eduavb, Pro) via TXT de verificação no Registro.br; loja no ar de novo servindo a main (970df24)
- Domínios removidos do projeto novo (pausado)

## Para o conselheiro
- Decisão do Dudu: tentar o plano Hobby na conta nova falhou (pausa por uso justo). A loja roda hoje no projeto antigo (Pro). Falta decidir: assinar o Pro na conta nova e remigrar, ou ficar na conta antiga.
- Não apagar o projeto antigo da Vercel: ele serve a loja agora. O repo antigo redireciona para taniaelola/sistema-lola.
- DNS no Registro.br: CNAME do www ainda aponta para o valor do projeto novo (b33b7f...); a Vercel recomenda trocar pelo valor do projeto antigo (a0f02b96c5d4f885.vercel-dns-017.com). Funciona hoje.
- Conferir se a URL do webhook do Mercado Pago aponta para o domínio.
- Pendente do README: trocar os segredos que passaram pelo histórico do Git.
- Arquivo da fonte Bacony Script é "uso pessoal apenas"; não foi versionado. Precisa de licença comercial se for usada no site.
