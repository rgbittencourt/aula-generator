# Regras externas usadas no Gerador de Aulas

**Fonte principal:** https://docs.google.com/spreadsheets/d/12kzs-xcGGGz7_nv9nr3cf8Hgpmr_Z6p09ihmspXZnoA/edit?usp=sharing

## Estrutura confirmada

- Aba `Aplicativo`: 118 linhas × 27 colunas.
- Aba `Material`: 74 linhas × 89 colunas.
- A planilha distingue `Atividade Instrucional Equivalente (EIA)` e `Atividade de Aprendizagem Equivalente (ELA)`.
- A aba Material calcula uma semana/capítulo com conteúdo digital, vídeos, fóruns e leituras obrigatórias/indicadas.

## Regras transcritas

- Conteúdo digital: `número de palavras / 273 × 5` minutos (`Material!N:O`).
- Leitura acadêmica/científica: `páginas × 5` minutos; sem páginas, `palavras / 273 × 5`.
- Leitura popular/indicada: `páginas × 3` minutos; sem páginas, `palavras / 273 × 3`.
- Vídeos: soma das durações informadas; vídeos sem duração ficam pendentes de conferência.
- Fóruns/discussões: `número de posts × 2 horas` (`Aplicativo`, coluna de fóruns e tempo estimado).
- Capítulo obrigatório: conteúdo digital + vídeos obrigatórios + fóruns + leituras obrigatórias.
- Avaliação: as fórmulas da aba Aplicativo usam quantidade × duração informada; a implementação oferece um padrão configurável quando não houver duração.
- EIA/ELA: o perfil padrão usa a relação instrucional/aluno indicada na planilha (`EIA = 0,5 × ELA`) para produzir uma métrica equivalente sem misturar a meta de estudo do estudante com o esforço instrucional.

## Exemplo de webprática usado como referência

Arquivo enviado: `webpratica_vibe_coding_roteiro.md.docx`.

- Webprática: Vibe Coding na Gestão Educacional.
- Sessão síncrona de 90 minutos.
- Inclui visão geral, pré-requisitos, preparação do professor, preparação dos alunos, linha do tempo por blocos, prompts passo a passo, produto final, discussão, plano B e continuidade.
- Usa arquivo de dados (`dados_academicos_webpratica.xlsx`) e prompts incrementais para construir dashboard, filtros, busca de aluno, alertas, polimento e compartilhamento.
- O pacote do gerador foi ampliado para preservar esse padrão em `context`, `prerequisites`, `teacherPreparation`, `studentPreparation`, `roteiro`, `steps`, `prompts`, `artifacts`, `criteria`, `fallbackPlan` e `continuation`.

## Arquivos brutos consultados

- `analysis/google-aplicativo-values.json`
- `analysis/google-aplicativo-formulas.json`
- `analysis/google-material-values.json`
- `analysis/google-material-formulas.json`
