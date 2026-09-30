# Plano — Gerador de Aulas

## Objetivo

Construir um planejador pedagógico assistido por IA que gere semanas completas, coerentes e editáveis no Aula Studio, sem impor a mesma estrutura didática a todas as semanas. A experiência do estudante será exportada em `.aula.json`; o material de apoio ao professor será produzido separadamente em PDF.

## Decisões confirmadas

- Repositório separado: `rgbittencourt/aula-generator`.
- Backend server-side com chave própria em ambiente seguro.
- Calendário por numeração ou por data real.
- Uma semana pode ter webprática ou não. Webpráticas são projetos independentes, podem receber um tema próprio e só entram na semana quando estiverem programadas.
- Recursos audiovisuais, imagens, diagramas e leituras devem aparecer misturados ao texto no ponto didático em que serão usados, e não como uma seção obrigatoriamente separada.
- O `.aula.json` contém somente a experiência do aluno e permanece compatível com o botão **Abrir** do Aula Studio.
- O guia do professor fica fora do JSON do aluno e é exportado como PDF para leitura na tela.
- Os cálculos permanecem no código da aplicação, em perfil interno versionado, sem dependência de fonte externa.

## Arquitetura de produção

A aplicação usa frontend estático e backend serverless no mesmo domínio Vercel. Os arquivos estáticos vivem em `public/`; as funções dinâmicas vivem em `api/`; os módulos compartilhados vivem em `src/`. O frontend público do GitHub Pages continua funcionando em modo exemplo, sem IA e sem segredos.

Rotas dinâmicas:

- `GET /api/health` — estado do backend e dos provedores de pesquisa;
- `POST /api/assist-briefing` — completa campos vazios do briefing;
- `POST /api/generate` — gera semanas do aluno, guias do professor e projetos de webprática em estruturas separadas;
- `POST /api/teacher-pdf` — devolve o PDF do guia do professor;
- `POST /api/zip` — devolve o pacote com JSONs do aluno, planejamento geral, PDF do professor e projetos de webprática.

O frontend é servido sem cache compartilhado para o HTML mutável; APIs usam `no-store`. O ZIP e o PDF são respostas sob demanda e não são armazenados pelo servidor.

## Modelo pedagógico

A IA escolhe o arco didático adequado ao tema, aos objetivos, ao momento do curso e à carga disponível. Arcos possíveis incluem: descoberta conceitual, estudo de caso, oficina aplicada, análise de dados, debate orientado, revisão e síntese, ou uma combinação justificada. Não existe uma sequência obrigatória para todas as semanas.

Cada semana pode conter, quando fizer sentido:

- abertura e contextualização;
- diagnóstico inicial;
- explicação conceitual;
- exemplo ou estudo de caso;
- perguntas de checagem;
- recurso audiovisual, imagem, diagrama ou leitura inserido no ponto de uso;
- atividade guiada;
- webprática somente quando programada;
- avaliação formativa e/ou somativa;
- síntese e conexão com a próxima semana.

O gerador valida alinhamento entre objetivos, seções, atividades, evidências e avaliação. Também produz diferenciação essencial/padrão/aprofundamento, acessibilidade, revisão espiral e sugestões de ajuste quando a carga estimada ultrapassa a meta.

## Separação aluno/professor

`src/aula-schema.js` normaliza o documento do aluno e projeta a webprática apenas como uma orientação curta quando ela aparece na aula. `src/teacher-guide.js` normaliza o guia completo do professor, incluindo intenção didática, matriz de alinhamento, diagnóstico, mediação, equívocos comuns, diferenciação, acessibilidade, rubrica e checklist de qualidade.

O módulo `src/pdf.js` converte o guia em PDF legível na tela. O PDF geral contém a visão do curso, uma seção por semana, carga calculada e os projetos de webprática em anexos de planejamento. Nenhum `teacherGuide` ou pacote interno da webprática é inserido nos JSONs destinados ao Aula Studio.

## Webpráticas independentes

Webpráticas são cadastradas como projetos separados. Cada projeto possui tema, problema, papel do estudante, pré-requisitos, preparação do professor, preparação do estudante, materiais, roteiro, etapas, produto, rubrica, prompts, plano B, acessibilidade, continuidade e arquivos auxiliares. O pacote fica em `webpraticas/` dentro do ZIP e não é confundido com uma semana comum.

## Recursos no ponto de uso

A IA deve indicar `sectionNumber`, `moment`, `objective`, `guidingQuestion` e `pedagogicalUse` para cada vídeo, imagem, diagrama ou leitura. O transformador de blocos insere esses recursos dentro do tópico/seção correspondente do Aula Studio. Recursos globais sem seção explícita são inseridos após a primeira seção pertinente, nunca como uma lista isolada obrigatória.

## Contratos e exportação

Cada semana do aluno segue o contrato de blocos do Aula Studio: `id`, `type`, `bg`, `pad` e `props`, usando somente tipos conhecidos. O JSON semanal contém conteúdo, objetivos do aluno, recursos contextualizados, atividades, avaliação, síntese e metadados de carga necessários ao planejamento, mas não contém o guia do professor.

O ZIP contém:

```text
semanas/semana-01-titulo.aula.json
semanas/semana-02-titulo.aula.json
planejamento-geral.json
professor/guia-do-professor.pdf
webpraticas/01-tema/guia-e-roteiro.md
webpraticas/01-tema/pacote.json
webpraticas/01-tema/arquivos/*
```

## Validação

A aplicação será validada por testes de contrato, separação aluno/professor, recursos incorporados, ausência de webprática quando não programada, geração de PDF, ZIP, fórmulas internas e sintaxe. O resultado do backend será inspecionado por código e smoke tests locais; a publicação Vercel será conferida somente após o push.
