# Gerador de Aulas

Aplicação para transformar um briefing de curso em uma trilha semanal de aulas compatível com o **Aula Studio**. A interface combina uma área de planejamento editorial com uma prévia organizada por semanas. A linguagem visual se inspira na clareza do Aula Studio — papel, tipografia editorial, barra de progresso, blocos e sumário — sem copiar a aplicação.

## Situação atual

- **GitHub Pages:** versão pública estática em <https://rgbittencourt.github.io/aula-generator/>. Gera exemplos e ZIP diretamente no navegador, sem IA.
- **Vercel:** implantação recomendada para ativar IA, pesquisa de recursos, PDF do professor e ZIP completo. O mesmo repositório executa o frontend e as funções serverless.
- **Segurança:** as chaves da OpenAI e do YouTube devem ser cadastradas somente como variáveis secretas da Vercel. Elas nunca devem entrar no GitHub, no arquivo `.env` versionado ou nesta conversa.

## Passo a passo: criar a chave da API OpenAI

A assinatura do ChatGPT e o uso da API são gerenciados em áreas diferentes da OpenAI. Para o gerador, é necessária uma **API key** da plataforma de desenvolvedores.

1. Abra <https://platform.openai.com/> e entre na sua conta.
2. Selecione ou crie o projeto que usará o gerador.
3. Abra **API keys** — normalmente em <https://platform.openai.com/api-keys>.
4. Clique em **Create new secret key**.
5. Dê um nome identificável, como `aula-generator-vercel`.
6. Crie a chave e copie-a imediatamente. A chave completa normalmente só é exibida nessa criação.
7. Guarde-a em um gerenciador de senhas. **Não cole a chave no GitHub, no README, no navegador público ou no chat.**

Se a plataforma solicitar configuração de cobrança ou limites de uso, faça essa configuração diretamente no painel da OpenAI. O código da aplicação não configura cobrança.

## Passo a passo: publicar a versão com IA na Vercel

1. Abra <https://vercel.com/>.
2. Escolha **Continue with GitHub** e autorize a Vercel a acessar `rgbittencourt/aula-generator`.
3. No painel da Vercel, clique em **Add New… → Project**.
4. Em **Import Git Repository**, localize `rgbittencourt/aula-generator` e clique em **Import**.
5. Mantenha a raiz do repositório como **Root Directory**. Deixe **Build Command** e **Output Directory** vazios; use `npm install` como instalação automática.
6. Em **Environment Variables**, adicione:

| Nome | Valor | Ambiente recomendado |
|---|---|---|
| `OPENAI_API_KEY` | a chave criada na etapa anterior | Production, Preview e Development |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Production, Preview e Development |
| `OPENAI_MODEL` | `gpt-4o-mini` | Production, Preview e Development |
| `OPENAI_CONTENT_MODEL` | opcional; modelo mais capaz para texto longo | Production, Preview e Development |
| `OPENAI_MAX_TOKENS` | `16000` | Production, Preview e Development |
| `AULA_AUTO_REPAIR` | `true` | Production, Preview e Development |
| `AULA_ACCESS_CODE` | uma frase/código privado seu | Production, Preview e Development |
| `YOUTUBE_API_KEY` | chave opcional do YouTube Data API | Production e, se desejar, Preview |

7. Clique em **Deploy**.
8. Abra a URL fornecida pela Vercel e confira o indicador no cabeçalho.
9. Se `AULA_ACCESS_CODE` estiver configurado, informe esse código no campo de acesso da interface. Ele não é a chave da OpenAI.
10. Preencha o briefing, use **Preencher vazios com IA** se quiser assistência e depois clique em **Gerar com IA**.
11. Abra cada card em **Ver aula**. Leia título, objetivos, conteúdo, atividades, recursos, síntese e avaliação antes de exportar.
12. Se uma semana estiver fraca ou precisar de outro foco, escreva a solicitação no final da prévia e clique em **Refazer esta semana com IA**. Somente a semana aberta será reescrita.

Depois de alterar qualquer variável, abra **Deployments**, escolha a implantação mais recente e faça **Redeploy** para que a função receba os valores novos.

## O que a IA faz

O fluxo começa pelo briefing, mas o resultado não é uma lista fixa de seções. A IA escolhe o arco didático que combina com o conteúdo: descoberta conceitual, estudo de caso, oficina aplicada, análise de dados, debate orientado, revisão e síntese, ou combinação justificada. Uma semana pode ter diagnóstico, vídeo, leitura, atividade ou quiz quando isso tiver função pedagógica; não é obrigatório repetir todos esses elementos em todas as semanas.

A semana produzida é uma unidade completa: abertura, conteúdo desenvolvido, seções e subseções, exemplos, reflexões, recursos no ponto de uso, síntese, avaliação, conexão com a semana seguinte e cálculo posterior da carga. Vídeos, imagens, diagramas e leituras ficam associados ao trecho ou conceito que motivou seu uso. A leitura do aluno não termina com uma galeria de links separada.

O botão de assistência completa somente campos vazios do briefing. A geração final trabalha sobre o briefing revisado, e o backend pesquisa candidatos reais de vídeo, imagem/diagrama e leitura antes da seleção pela IA.

### Controle de qualidade textual

Antes de considerar uma semana pronta, o gerador verifica título específico, abertura, pelo menos quatro objetivos, cinco ou mais seções desenvolvidas, síntese, avaliação, blocos compatíveis com o Aula Studio e alinhamento entre objetivo, atividade, evidência e avaliação. A IA recebe uma exigência de texto longo e, se a primeira resposta ficar curta, executa uma segunda etapa de reparo editorial. A tela mostra palavras, seções, objetivos, nota estrutural e pendências.

O resultado também traz um checklist pedagógico: diagnóstico, checagens formativas, avaliação somativa com feedback, webprática completa quando houver, diferenciação, acessibilidade, recursos contextualizados e autoavaliação. Uma semana bloqueada deve ser refeita antes do uso no Aula Studio.

### Como a ordem funciona

Não existe uma sequência rígida para todas as semanas. A IA escolhe um arco adequado — descoberta conceitual, caso, oficina, análise de dados, debate ou síntese — e registra quais fases estão ativas: abertura, diagnóstico, explicação, exemplo, prática guiada, prática independente, reflexão, avaliação e síntese. Quando uma fase é omitida, a omissão recebe justificativa. Vídeos, imagens e leituras entram dentro do tópico/conceito que os torna úteis; não são despejados em uma galeria final.

## Separação aluno e professor

A aplicação produz duas camadas diferentes:

- **Aula do aluno:** cada semana é um `.aula.json` compatível com o botão **Abrir** do Aula Studio. Ele contém apenas a experiência de aprendizagem do aluno: texto, objetivos, recursos contextualizados, atividades, avaliação, síntese e metadados de carga.
- **Guia do professor:** é mantido fora do JSON do aluno e exportado em PDF. Reúne intenção pedagógica, arco didático, matriz de alinhamento, diagnóstico, perguntas de mediação, equívocos comuns, intervenções, diferenciação, acessibilidade, avaliação, revisão espiral e checklist.

Na tela de resultados, **Baixar JSON do aluno** baixa somente a semana selecionada. **Guia do professor PDF** baixa o documento de mediação. **Pacote completo ZIP** reúne os JSONs, o Planejamento Geral, o PDF do professor e os projetos de webprática.

## Webpráticas como projetos independentes

Webprática não é obrigatória em toda semana. No formulário, ela é cadastrada como um projeto independente, com tema, momento, objetivo, preparação, materiais, etapas, produto, evidências, rubrica, prompts, arquivos-exemplo, acessibilidade e plano B. A IA só associa uma prática às semanas em que ela estiver programada ou fizer sentido segundo o briefing; não inventa uma webprática para completar a estrutura.

A aula do aluno recebe apenas uma orientação curta de participação quando a prática estiver ativa. O projeto completo vai para `webpraticas/` no ZIP e também é descrito no guia do professor.

## Cálculos isolados da aplicação

Os cálculos vivem no código, em `src/formula-profile.js` e `src/calculations.js`, sem leitura ou vínculo com planilhas externas. A carga é calculada depois que a semana foi escrita: conteúdo digital usa palavras, leituras usam páginas/palavras e o tipo de texto, vídeos usam duração conferida, fóruns usam a regra configurada de comunicação, e avaliações/práticas entram como itens próprios. Recursos sem dados suficientes ficam sinalizados para revisão.

O Planejamento Geral considera o total do curso, apresenta meta, carga calculada, diferença, categorias, itens obrigatórios/opcionais, arcos usados e pendências de conferência. Se as regras mudarem, a alteração será feita diretamente no código, acompanhada por testes e publicada como nova versão do perfil interno.

## Pesquisa automática de recursos

Após a geração textual, o sistema consulta **YouTube Data API v3** para vídeos, **Wikimedia Commons** para imagens e diagramas com metadados de crédito/licença e **Crossref** para referências acadêmicas. A IA recebe os candidatos retornados pelos provedores, escolhe os mais adequados e registra justificativa pedagógica, fonte, URL, duração e licença quando disponíveis. As alternativas permanecem no campo `lessonPlan.resourceResearch` para conferência.

Os recursos selecionados viram blocos editáveis do Aula Studio: `video`, `imagem` ou `materiais`. Isso permite abrir a aula e **editar o texto, trocar/remover uma imagem ou vídeo, inserir outro bloco e reorganizar a leitura** sem transformar o conteúdo em HTML achatado. Cada recurso possui estado `candidate-found`, `selected-by-ai` ou `approved`, além de pendências de licença, atualidade, acessibilidade, duração e adequação ao idioma. A aprovação final continua humana.

### Configurar a pesquisa de vídeos

1. Abra <https://console.cloud.google.com/>.
2. Crie ou selecione um projeto.
3. Acesse **APIs e serviços → Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar**.
4. Acesse **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
5. Na Vercel, abra **Settings → Environment Variables → Add Environment Variable**.
6. Cadastre a chave com o nome `YOUTUBE_API_KEY`, tipo **Secret**, em Production.
7. Faça **Redeploy**.
8. Confira `/api/health`: o campo `youtubeConfigured` deve aparecer como `true`.

Sem `YOUTUBE_API_KEY`, o gerador continua pesquisando imagens/diagramas e leituras; vídeos sem dados ficam pendentes e não são inventados. `AULA_RESOURCE_RESEARCH=false` desativa o enriquecimento para diagnóstico.

## Rotas do backend

| Rota | Função |
|---|---|
| `GET /api/health` | informa o estado das chaves e do modelo |
| `POST /api/assist-briefing` | preenche campos vazios do briefing |
| `POST /api/generate` | gera semanas do aluno, guias do professor e Planejamento Geral |
| `POST /api/regenerate-week` | refaz somente uma semana com instrução do professor e recalcula o curso |
| `POST /api/teacher-pdf` | devolve somente o PDF do guia do professor |
| `POST /api/zip` | devolve o pacote completo, incluindo PDF e webpráticas |

## Uso local com IA

```bash
cp .env.example .env
# edite .env e preencha OPENAI_API_KEY, YOUTUBE_API_KEY e AULA_ACCESS_CODE, se desejar
npm install
npm run dev
```

Abra <http://127.0.0.1:4310>.

Variáveis principais:

```text
OPENAI_API_KEY=chave-local-nunca-commitada
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_CONTENT_MODEL=
OPENAI_MAX_TOKENS=16000
AULA_AUTO_REPAIR=true
AULA_ACCESS_CODE=um-codigo-privado-opcional
YOUTUBE_API_KEY=chave-do-youtube-opcional
AULA_RESOURCE_RESEARCH=true
HOST=127.0.0.1
PORT=4310
```

A chave é usada apenas pelo backend e nunca é enviada ao navegador.

## Saída do ZIP

```text
semanas/semana-01-titulo.aula.json
semanas/semana-02-titulo.aula.json
planejamento-geral.json
professor/guia-do-professor.pdf
webpraticas/01-tema/guia-e-roteiro.md
webpraticas/01-tema/pacote.json
webpraticas/01-tema/arquivos/*
```

Depois de revisar o JSON no Aula Studio, use **Exportar → Pacote SCORM (.zip)** para enviar a aula ao Moodle. O Gerador de Aulas prepara a autoria e o planejamento; a publicação SCORM continua sendo feita no Aula Studio.

## Desenvolvimento e testes

```bash
npm install
npm test
```

A suíte cobre contrato do aluno, separação do guia do professor, arcos didáticos, recursos inseridos dentro do tópico, fórmulas internas, geração de PDF e conteúdo do ZIP.
