# Histórico de versões do ClassAuthor

Segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) (MAIOR.MENOR.CORREÇÃO):

- **MAIOR**: muda algo que quebra o que já existia (formato de arquivo que deixa de abrir, rota removida).
- **MENOR**: recurso novo que não quebra nada.
- **CORREÇÃO**: conserto sem recurso novo.

A versão aparece no rodapé do aplicativo, em `GET /api/health` (campo `version`), em `package.json` e em `src/version.js`. O teste `tests/version.test.mjs` garante que os quatro lugares dizem o mesmo número.

## 1.0.0 · 29/10/2026 · primeira versão de produção

Marca a passagem para produção em `classauthor.vercel.app`, com o nome ClassAuthor (antes, versão de desenvolvimento 0.1.0).

### O que o aplicativo faz nesta versão
- Planejamento do curso a partir de um briefing (identidade, calendário, objetivos, recursos, webpráticas) e geração **semana a semana**, com aprovação antes de gerar a seguinte; geração retomável quando falha no meio.
- Provedores de IA OpenAI e Anthropic, escolhidos por variável de ambiente; modo exemplo quando não há chave.
- Referências no padrão ABNT NBR 6023, conferência de citações e pontos a conferir antes de publicar.
- Cartões por semana com os arquivos `SemanaNN-título-ClassAtelier.json`, `…-ClassAuthor.json` e `…-Quiz.xml` (Moodle XML), pacote completo ZIP, Material de Mediação em PDF e roteiros de webprática em DOCX.
- Botão **Abrir ClassAtelier** e **Enviar de volta** entre abas, com conferência de origem.
- Rascunho e backup no navegador; instalável como aplicativo (manifesto, sem modo offline).

### Mudanças que quebram compatibilidade com a 0.1.0
- Nomes de arquivo, chaves de armazenamento (`classauthor:*`) e mensagens entre abas (`classatelier:*`) mudaram. **Não exige ação:** rascunhos, preferências e backups antigos são migrados ou aceitos na primeira abertura.

### Ainda não verificado
- Geração com IA real e a qualidade das referências (rodar `scripts/smoke-ai.mjs` com chave própria).
- Importação do quiz e do SCORM em um Moodle real.
