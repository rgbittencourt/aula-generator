# Gerador de Aulas

Aplicação para transformar um briefing de curso em uma trilha semanal de aulas compatível com o **Aula Studio**. A interface combina uma área de planejamento editorial com uma prévia organizada por semanas. A linguagem visual se inspira na clareza do Aula Studio — papel, tipografia editorial, barra de progresso, blocos e sumário — sem copiar a aplicação.

## Identidade visual

Os assets de marca ficam versionados para uso no cabeçalho, favicon, capas e compartilhamento:

- `public/brand/gerador-de-aulas-mark.svg`: símbolo quadrado;
- `public/brand/gerador-de-aulas-mark.png`: símbolo raster de alta resolução;
- `public/brand/gerador-de-aulas-logo.svg`: logo horizontal;
- `public/brand/gerador-de-aulas-logo.png`: logo raster para documentos e apresentações;
- `public/brand/gerador-de-aulas-cover.svg`: capa editorial horizontal;
- `public/brand/gerador-de-aulas-cover.png`: capa PNG para redes sociais e compartilhamento;
- `public/favicon.svg` e `public/favicon-32.png`: favicons SVG e PNG;
- `public/apple-touch-icon.png`: ícone para iPhone/iPad;
- `public/site.webmanifest`: metadados de instalação como aplicativo.
- `public/brand/ifsc-institutional-mark.png`: marca institucional do IFSC usada na capa;
- `public/brand/inovalab-signature.png` e `public/brand/inovalab-symbol.png`: assinatura e símbolo do INOVALAB usados no crédito de desenvolvimento da capa.

O Aula Studio mantém sua identidade complementar em `assets/aula-mark.svg`, `assets/brand/aula-studio-logo.svg`, `assets/brand/aula-studio-cover.svg` e `assets/favicon.svg`.

## Situação atual

- **GitHub Pages:** versão pública estática em <https://rgbittencourt.github.io/aula-generator/>. Gera exemplos e ZIP diretamente no navegador, sem IA.
- **Vercel:** implantação recomendada para ativar IA, pesquisa de recursos, PDF do professor, DOCX individual e ZIP completo. O mesmo repositório executa o frontend e as funções serverless.
- **Segurança:** as chaves da OpenAI e do YouTube devem ser cadastradas somente como variáveis secretas da Vercel. Elas nunca devem entrar no GitHub, no arquivo `.env` versionado ou nesta conversa.

## Salvamento e recuperação contra queda de energia

O navegador salva automaticamente o briefing e, depois da geração, as semanas, o Planejamento Geral, o guia do professor e o estado de validação em `localStorage`. Ao reabrir a aplicação no mesmo navegador e dispositivo, aparecerá a opção **Retomar planejamento**.

Para uma proteção adicional, use **Baixar backup** antes de fechar o navegador ou depois de uma geração importante. O arquivo JSON baixado pode ser recuperado com **Restaurar backup**. Por segurança, o código de acesso da IA nunca é salvo no autosave nem no backup.

O autosave local protege contra atualização da página, fechamento acidental, queda de energia e reinício do navegador, desde que os dados do site não sejam apagados. Ele não substitui o backup manual quando o planejamento for importante, nem sincroniza automaticamente entre dispositivos ou navegadores diferentes.

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
| `OPENAI_REGEN_MAX_TOKENS` | `10000` para refazer uma semana | Production, Preview e Development |
| `AULA_SINGLE_PASS` | `true` | Production, Preview e Development |
| `AULA_RESEARCH_TIMEOUT_MS` | `8000` | Production, Preview e Development |
| `OPENAI_MAX_RETRIES` | `3` | Production, Preview e Development |
| `AULA_AI_BATCH_SIZE` | `1` | Production, Preview e Development |
| `AULA_ACADEMIC_PIPELINE` | `true` | Production, Preview e Development |
| `AULA_ACADEMIC_REVIEW` | `true` | Production, Preview e Development |
| `AULA_AUTO_REPAIR` | `true` | Production, Preview e Development |
| `AULA_ACCESS_CODE` | uma frase/código privado seu | Production, Preview e Development |
| `YOUTUBE_API_KEY` | chave opcional do YouTube Data API | Production e, se desejar, Preview |
| `AULA_OPENALEX_ENABLED` | `true` por padrão; use `false` para desativar o fallback acadêmico | Production, Preview e Development |

7. Clique em **Deploy**.
8. Abra a URL fornecida pela Vercel e confira o indicador no cabeçalho.
9. Se `AULA_ACCESS_CODE` estiver configurado, informe esse código no campo de acesso da interface. Ele não é a chave da OpenAI.
10. Preencha o briefing, use **Preencher vazios com IA** se quiser assistência e depois clique em **Gerar com IA**. A aplicação gera uma semana por requisição e consolida o curso ao final, evitando que uma geração longa seja interrompida pela hospedagem.
11. Abra cada card em **Ver aula**. Leia título, objetivos, conteúdo, atividades, recursos, síntese e avaliação antes de exportar.
12. Se uma semana estiver fraca ou precisar de outro foco, escreva a solicitação no final da prévia e clique em **Refazer esta semana com IA**. Somente a semana aberta será reescrita.

Depois de alterar qualquer variável, abra **Deployments**, escolha a implantação mais recente e faça **Redeploy** para que a função receba os valores novos.

### Erro 429: limite de tokens por minuto (TPM)

Se aparecer uma mensagem como `Limit 30000, Used 23843, Requested 8631`, a chave está funcionando, mas a organização atingiu temporariamente o limite de tokens por minuto do modelo. Não adianta criar outra chave dentro da mesma organização: o limite é aplicado à organização/projeto/modelo.

Para ampliar o limite:

1. Abra <https://platform.openai.com/settings/organization/limits>.
2. Confira a organização e o projeto associados à `OPENAI_API_KEY`.
3. Veja a seção **Usage Tiers / Rate limits**.
4. Use **Upgrade tier** quando a opção estiver disponível e conclua a etapa de créditos/uso solicitada pela OpenAI.
5. Confirme o novo limite específico do modelo `gpt-4.1`.
6. Faça **Redeploy** na Vercel somente se também tiver alterado variáveis de ambiente.

O código já reduz o pico usando uma semana por vez (`AULA_AI_BATCH_SIZE=1`) e faz até três novas tentativas em respostas 429/503, respeitando `Retry-After`. Se ainda houver muitos 429, aguarde alguns segundos antes de clicar novamente e evite abrir várias gerações simultâneas. A OpenAI também recomenda manter `OPENAI_MAX_TOKENS` próximo do tamanho realmente esperado da resposta; para uma unidade menor, `10000–12000` pode reduzir o consumo de TPM, mas pode cortar uma aula que precise de mais espaço.

Ao usar **Refazer esta semana com IA**, o sistema envia somente um briefing essencial e uma versão compacta da semana selecionada. Com `AULA_SINGLE_PASS=true`, a regeneração faz uma única chamada de redação e não dispara planejamento/revisão/reparo extras. O orçamento separado `OPENAI_REGEN_MAX_TOKENS` evita que uma regeneração ultrapasse o limite de tokens por minuto mesmo quando `OPENAI_MAX_TOKENS` está configurado para aulas novas mais longas.

## O que a IA faz

O fluxo começa pelo briefing, mas o resultado não é uma lista fixa de seções. A IA escolhe o arco didático que combina com o conteúdo: descoberta conceitual, estudo de caso, oficina aplicada, análise de dados, debate orientado, revisão e síntese, ou combinação justificada. Uma semana pode ter diagnóstico, vídeo, leitura, atividade ou quiz quando isso tiver função pedagógica; não é obrigatório repetir todos esses elementos em todas as semanas.

Na interface, a capa exige o preenchimento de **Nome**, **Instituição** e **Código de acesso de IA** antes de entrar no workspace. Em telas amplas, o workspace fica dividido em três colunas: **resumo e ações** à esquerda, **formulário e RESULTADO** no centro e **navegação do projeto** à direita. A introdução “Do tema geral...” também fica no alto da coluna central. Logo abaixo de **NAVEGAR PELO PROJETO** existe um segundo menu separado, **BACKUP E RECUPERAÇÃO**, com **Retomar planejamento**, **Baixar backup** e **Restaurar backup** quando aplicável. A rolagem global é bloqueada no desktop: o centro concentra a leitura e cada coluna só rola se o próprio conteúdo ultrapassar sua altura. Em tablets e telas menores, as áreas passam para uma disposição vertical e cada uma mantém sua própria rolagem quando necessário, sem arrastar as demais junto. O resumo compacto traz os comandos **Preencher vazios com IA**, **Gerar com IA**, **Recalcular qualidade**, **Guia do professor PDF** e **Pacote completo ZIP**. O menu superior fixo, que aparece somente depois da entrada pela capa, traz o atalho branded **Abrir Aula Studio** em nova aba. Apenas **Identidade do curso** começa expandida; os demais setores do briefing começam recolhidos. Ao apresentar uma geração, o bloco externo **RESULTADO** e as quatro seções internas — **Carga por atividade**, **Carga aberta por atividade**, **Checklists** e **Semanas planejadas** — começam recolhidos. Cada cabeçalho tem um símbolo no canto superior direito para expandir ou recolher. A navegação lateral leva diretamente aos setores dentro da coluna central.

Em monitores largos, o workspace amplia sua largura útil: os menus laterais permanecem com largura fixa e a coluna central recebe todo o espaço restante para leitura, formulários e resultados. Em tablets e telas menores, o layout passa para a disposição vertical responsiva.

Durante o uso, clicar no logo **Gerador de Aulas** inicia um **novo projeto de disciplina** sem voltar à capa: limpa somente os formulários e resultados em edição, mantém Nome, Instituição e código na sessão atual e preserva o planejamento salvo, o botão **Retomar planejamento** e as opções de backup. Para encerrar a sessão e pedir novos dados de acesso, use o botão **Trocar acesso** no cabeçalho; ele limpa o planejamento local e retorna à capa vazia.

A semana produzida é uma unidade completa: abertura, conteúdo desenvolvido, seções e subseções, exemplos, reflexões, recursos no ponto de uso, síntese, avaliação, conexão com a semana seguinte e cálculo posterior da carga. Vídeos, imagens, diagramas e leituras ficam associados ao trecho ou conceito que motivou seu uso. Cada recurso leva `sectionNumber` e um `bridgeParagraph`: um parágrafo que explica a ligação com o conceito naquele ponto, o que o estudante deve observar e por que o recurso é pertinente. A leitura do aluno não termina com uma galeria de links separada.

O botão de assistência completa somente campos vazios do briefing. A geração final trabalha sobre o briefing revisado, e o backend pesquisa candidatos reais de vídeo, imagem/diagrama e leitura antes da seleção pela IA.

### Controle de qualidade textual

Antes de considerar uma semana pronta, o gerador verifica título específico, abertura, pelo menos quatro objetivos, seções desenvolvidas, síntese, avaliação, blocos compatíveis com o Aula Studio e alinhamento entre objetivo, atividade, evidência e avaliação. A meta configurada no Perfil acadêmico é tratada como **piso de palavras úteis**: uma meta de 3.000 exige pelo menos 3.000 palavras na medição da aula. O prompt distribui esse volume por seções e a tela mostra palavras, seções, objetivos, nota estrutural e pendências. **Conteúdo insuficiente** fica reservado para texto realmente curto ou estrutura didática ausente; pendências de referências, recursos ou revisão pedagógica aparecem como **revisão recomendada**, não como se a aula tivesse poucas palavras.

Na seção **Webpráticas síncronas**, informe a quantidade desejada e clique em **Criar sessões**. Os cartões existentes são preservados; depois, use **Preencher vazios com IA** para completar cada item individualmente. A IA recebe a quantidade exata e não pode reduzir uma lista de duas ou mais práticas a apenas uma. No Planejamento geral, os recursos pendentes e os itens do checklist possuem caixas de seleção de **conferência manual**. Os itens que a IA já aprovou aparecem marcados inicialmente; desmarque um item aprovado quando quiser refazê-lo ou revisá-lo novamente. A marcação fica no salvamento local/backup e não substitui a correção de uma pendência pedagógica.

O checklist automático também verifica se cada vídeo, imagem ou leitura usado dentro de uma seção possui posição de uso e `bridgeParagraph` com ligação pedagógica suficiente. A aprovação automática significa que a estrutura e os metadados passaram pela checagem; ainda cabe ao professor abrir o recurso e confirmar se ele é realmente coerente, atual, acessível e adequado ao público.

Se um resultado antigo ainda exibir a classificação anterior, use **Recalcular qualidade** na área de resultados. Essa operação apenas reconsolida as semanas e não chama a IA. Depois de conferir uma semana, use **Liberar após conferência** no cartão; a prévia passa a indicar que ela foi liberada manualmente, enquanto as observações automáticas permanecem visíveis como informação.

O resultado agora organiza as conferências em quatro listas: **Checklist pedagógico** (diagnóstico, checagens formativas, avaliação somativa, webprática quando houver, diferenciação, acessibilidade, recursos contextualizados e autoavaliação), **Checklist acadêmico** (rigor, evidências, coerência conceitual e revisão crítica), **Checklist de recursos e acessibilidade** (links, duração/páginas, coerência, acessibilidade e licença) e **Checklist de qualidade e liberação** (suficiência textual, pendências críticas e situação de cada semana). Uma semana bloqueada deve ser refeita antes do uso no Aula Studio.

### Progressão longitudinal

As semanas não são mais geradas apenas contra a lista geral de objetivos do curso. O backend constrói um mapa longitudinal com tema, pergunta central, conceitos novos, objetivos específicos, sequência editorial, ponte entre semanas, marco de evidência e arco didático preferencial. Para o percurso de **Tecnologias para Gestão Educacional**, por exemplo, a sequência é: fundamentos; Governo Digital; SIGE; dados e Learning Analytics; dashboards; Vibe Coding e governança.

Cada nova chamada recebe um resumo das semanas anteriores e uma regra explícita do que não deve ser repetido. A validação também compara títulos e objetivos entre semanas. Se uma semana ficar curta, o modo `AULA_SINGLE_PASS=true` faz uma única reescrita textual: o reparo devolve somente `lessonPlan`, sem duplicar o guia do professor, usa quotas por seção e só aceita a versão se ela atingir o piso ou apresentar ganho substancial. Um acréscimo de 25, 45 ou 50 palavras não é tratado como correção; a semana permanece sinalizada para revisão em vez de gastar novas chamadas em melhorias marginais.

### Perfil acadêmico e pipeline de texto

O briefing possui um **Perfil acadêmico do conteúdo** com meta de palavras, mínimo de seções, referências, fontes acadêmicas/oficiais, escopo histórico, autores, quadros teóricos, tópicos a evitar e regras de contraponto, comparação e estudo de caso. Tema/área, público, nível da turma e profundidade são herdados automaticamente da **Identidade do curso**, sem preenchimento duplicado. Esses dados entram nos prompts e no checklist; não são apenas campos decorativos.

Para evitar a geração superficial, a IA possui um pipeline acadêmico completo:

1. **Planejamento acadêmico:** define conceitos, pergunta central, sequência argumentativa, afirmações que exigem evidência, exemplos, controvérsias e plano de avaliação.
2. **Redação:** escreve a semana completa para o aluno e o guia separado do professor, incluindo `claimEvidence` e referências estruturadas.
3. **Revisão crítica:** procura superficialidade, desalinhamento, repetição, fonte inventada, afirmação sem suporte, falta de contraponto e problemas de acessibilidade. Se necessário, executa um reparo e revisa novamente.

O manual contém os prompts efetivos e o contrato JSON de cada fase. A produção usa por padrão `AULA_SINGLE_PASS=true`: o prompt acadêmico completo é executado uma semana por vez, com mapa longitudinal e continuidade das semanas anteriores. Se o resultado for insuficiente, uma única regeneração compacta tenta ampliar a unidade sem duplicar o guia do professor. O pipeline de planejamento, revisão e reparo acadêmico adicionais pode ser ativado com `AULA_SINGLE_PASS=false`, quando houver margem de duração na hospedagem.

### Por que a geração agora é dividida por semana

Uma turma com várias semanas e revisão acadêmica pode gerar um volume grande de texto e chamar vários provedores externos. Fazer tudo em uma única função serverless aumenta o risco de a Vercel encerrar a requisição e o navegador receber apenas o texto genérico `An error occurred with this application.`. Por isso, **Gerar com IA** chama `POST /api/generate-week` para cada semana e, somente depois, chama `POST /api/assemble-course` para calcular os totais e montar o Planejamento Geral.

### Como a ordem funciona

Não existe uma sequência rígida para todas as semanas. A IA escolhe um arco adequado — descoberta conceitual, caso, oficina, análise de dados, debate ou síntese — e registra quais fases estão ativas: abertura, diagnóstico, explicação, exemplo, prática guiada, prática independente, reflexão, avaliação e síntese. Quando uma fase é omitida, a omissão recebe justificativa. Vídeos, imagens e leituras entram dentro do tópico/conceito que os torna úteis; não são despejados em uma galeria final.

### Metas de recursos por semana

O briefing possui um painel **Recursos e leituras por semana**. Nele, defina quantos vídeos, artigos acadêmicos e leituras obrigatórias devem ser procurados por semana, além do nível da leitura obrigatória. A tabela de distribuição permite substituir o padrão em semanas específicas: use `0` para não solicitar aquele recurso em uma semana e deixe `Padrão` para herdar a configuração geral. Artigos podem contar como leituras obrigatórias, evitando duplicação.

Essas metas entram no prompt semanal, na curadoria da IA e nas solicitações ao YouTube/Crossref. A pesquisa só insere URLs retornadas por provedores ou fornecidas no briefing; quando não há candidatos suficientes, a pendência fica marcada para revisão humana. Imagens continuam sendo pesquisadas como enriquecimento contextual, e todos os recursos selecionados viram blocos editáveis na prévia e no JSON do aluno.

No **Planejamento geral**, **Carga por atividade** resume as metas, o cálculo total, as categorias e o arco didático; já **Carga aberta por atividade** mostra, em minutos e horas, o que veio do texto-base, de artigos/leituras obrigatórios, de leituras complementares, de vídeos obrigatórios ou extras, de imagens, quiz, fórum, revisão, projeto e webprática. A mesma separação aparece ao abrir **Ver aula**. Assim, a carga não fica escondida em um único total.

### Composição editorial compatível com o Aula Studio

O painel **Composição da aula no Aula Studio** permite definir uma quantidade padrão de blocos por semana e alterar exceções semanais. A lista inclui destaques, atenção, reflexão, citações, imagens com legenda, casos, tabelas, acordeões, flashcards, sliders, linhas do tempo, colunas comparativas, quiz formativo e conteúdo externo. A política **Obrigatório** pede o bloco; **Preferir** trata a quantidade como orientação pedagógica; **Não usar** desativa o tipo.

Os blocos são contextualizados pela IA e posicionados na seção indicada, depois do texto que lhes dá sentido. O servidor materializa a propriedade `lessonPlan.composition` em blocos editáveis compatíveis com o Aula Studio; não são contados como texto-base. A prévia mostra cada bloco no ponto da seção e a carga aberta acrescenta o tempo estimado dos interativos.

Os quatro checklists exibem todos os itens disponíveis e iniciam marcados os que a análise automática aprovou. Clique no **texto do item** — pedagógico, acadêmico, de recursos/acessibilidade ou de qualidade/liberação — para abrir um painel com **o que verificar**, critérios de aceite e um **prompt estruturado** específico para refazer a semana. A **caixa de seleção** tem somente a função de marcar ou desmarcar o item. O prompt pode ser copiado ou carregado diretamente na prévia da semana pelo botão **Abrir refação da semana**. Ao desmarcar um item, ele passa a representar uma conferência/refação manual. As listas mantêm a posição de rolagem e o foco após cada marcação, inclusive quando o item está distante do início; as marcações de recursos, revisão acadêmica e qualidade também entram no salvamento local e no backup.

## Separação aluno e professor

A aplicação produz duas camadas diferentes:

- **Aula do aluno:** cada semana é um `.aula.json` compatível com o botão **Abrir** do Aula Studio. Ele contém apenas a experiência de aprendizagem do aluno: texto, objetivos, recursos contextualizados, atividades, avaliação, síntese e metadados de carga. `lessonPlan.webPractices` é sempre `[]`.
- **Guia do professor:** é mantido fora do JSON do aluno e exportado em PDF. Reúne intenção pedagógica, arco didático, matriz de alinhamento, diagnóstico, perguntas de mediação, equívocos comuns, intervenções, diferenciação, acessibilidade, avaliação, revisão espiral e checklist.
- **Roteiro de webprática:** cada sessão prática agendada é mantida em `teacherGuide.webPracticeProjects` e exportada como DOCX editável próprio, sem ser inserida no texto-base semanal.

Na tela de resultados, **Baixar JSON do aluno** baixa somente a semana selecionada. O painel separado **Webpráticas programadas** mostra a agenda e oferece **Baixar DOCX** para cada sessão. **Guia do professor PDF** baixa o documento de mediação. **Pacote completo ZIP** reúne os JSONs, o Planejamento Geral, o PDF do professor e os projetos de webprática em Markdown, JSON, arquivos auxiliares e DOCX.

## Webpráticas como projetos independentes

Webprática não é obrigatória em toda semana. Ela é uma **aula síncrona ou laboratório prático independente**, em que os estudantes usam uma ferramenta, constroem um artefato, testam uma hipótese ou resolvem uma situação-problema. No formulário, cada sessão precisa de título e de **semana ou data**; também pode receber dia, horário, plataforma, ferramenta, objetivo, contexto, preparação, materiais, etapas, produto, evidências, rubrica, prompts, acessibilidade e plano B. A IA só desenvolve o projeto na semana em que ele está agendado; não inventa uma webprática para completar a estrutura.

Nada da webprática entra na aula-base do aluno: não entra no texto, nos blocos, nas atividades ou no `.aula.json`. O projeto completo fica em `teacherGuide.webPracticeProjects`, é descrito no PDF do professor e vai para `webpraticas/` no ZIP como `roteiro-webpratica.docx`, Markdown, JSON e arquivos auxiliares.

## Cálculos isolados da aplicação

Os cálculos vivem no código, em `src/formula-profile.js` e `src/calculations.js`, sem leitura ou vínculo com planilhas externas. A carga é calculada depois que a semana foi escrita: conteúdo digital usa palavras, leituras usam páginas/palavras e o tipo de texto, vídeos usam duração conferida, fóruns usam a regra configurada de comunicação, e avaliações/práticas entram como itens próprios. Recursos sem dados suficientes ficam sinalizados para revisão.

O Planejamento Geral considera o total do curso, apresenta meta, carga calculada, diferença, categorias, itens obrigatórios/opcionais, arcos usados e pendências de conferência. Se as regras mudarem, a alteração será feita diretamente no código, acompanhada por testes e publicada como nova versão do perfil interno.

## Pesquisa automática de recursos

Após a geração textual, o sistema consulta **YouTube Data API v3** para vídeos, **Wikimedia Commons** para imagens e diagramas com metadados de crédito/licença e **Crossref** para referências acadêmicas. Quando o Crossref retorna poucos candidatos, o adaptador consulta automaticamente o **OpenAlex** como fallback público; nenhuma nova chave é necessária. A IA recebe os candidatos retornados pelos provedores, escolhe os mais adequados e registra justificativa pedagógica, fonte, URL, duração e licença quando disponíveis. As alternativas permanecem no campo `lessonPlan.resourceResearch` para conferência.

A arquitetura agora separa três responsabilidades: `src/ai-client.js` faz chamadas JSON, retries e recuperação de respostas inválidas; `src/resource-curator.js` pede à IA apenas a seleção entre candidatos reais; e `src/resource-providers.js` mantém o registro extensível de provedores. Assim, adicionar outro catálogo de vídeos, imagens ou referências não exige alterar o contrato semanal nem a redação da aula.

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
O fallback OpenAlex fica ligado por padrão e aparece como `openAlexFallback: true` em `/api/health`. Ele só é acionado quando o Crossref retorna menos de três candidatos para uma busca. Para desligá-lo, cadastre `AULA_OPENALEX_ENABLED=false` e faça Redeploy.

## Rotas do backend

| Rota | Função |
|---|---|
| `GET /api/health` | informa o estado das chaves e do modelo |
| `POST /api/assist-briefing` | preenche campos vazios do briefing |
| `POST /api/generate` | gera semanas do aluno, guias do professor e Planejamento Geral |
| `POST /api/generate-week` | gera uma semana isolada, com pesquisa de recursos e guia correspondente |
| `POST /api/assemble-course` | consolida semanas já geradas e calcula o Planejamento Geral |
| `POST /api/regenerate-week` | refaz somente uma semana com instrução do professor e recalcula o curso |
| `POST /api/teacher-pdf` | devolve somente o PDF do guia do professor |
| `POST /api/webpractice-docx` | devolve o DOCX editável de uma webprática por `practiceId` ou índice |
| `POST /api/zip` | devolve o pacote completo, incluindo PDF, DOCX e webpráticas |

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
AULA_SINGLE_PASS=true
AULA_RESEARCH_TIMEOUT_MS=8000
OPENAI_MAX_RETRIES=3
AULA_AI_BATCH_SIZE=1
AULA_ACADEMIC_PIPELINE=true
AULA_ACADEMIC_REVIEW=true
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
webpraticas/01-tema/roteiro-webpratica.docx
webpraticas/01-tema/arquivos/*
```

Depois de revisar o JSON no Aula Studio, use **Exportar → Pacote SCORM (.zip)** para enviar a aula ao Moodle. O Gerador de Aulas prepara a autoria e o planejamento; a publicação SCORM continua sendo feita no Aula Studio.

## Desenvolvimento e testes

```bash
npm install
npm test
```

A suíte cobre contrato do aluno, separação do guia do professor, arcos didáticos, recursos inseridos dentro do tópico, fórmulas internas, geração de PDF e conteúdo do ZIP.
É necessário informar primeiro o **Tema geral ou título do curso**, pois ele dá contexto para as sugestões; depois, a IA também pode completar objetivos, conteúdo, webpráticas, materiais e termos de busca. Durante qualquer chamada demorada — **Preencher vazios com IA**, **Gerar com IA**, **Recalcular qualidade** ou **Refazer esta semana com IA** — aparece um painel visual no topo com spinner, etapa atual e barra de progresso. O botão em execução fica desabilitado para evitar chamadas duplicadas; ao terminar, o painel confirma o sucesso ou mantém uma mensagem de erro legível. Se o provedor devolver um erro de modelo, limite ou autenticação, a mensagem técnica agora é mostrada em vez de aparecer apenas como “resposta vazia”.
