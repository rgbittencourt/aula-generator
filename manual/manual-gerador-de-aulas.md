# Manual completo do Gerador de Aulas

## Da ideia inicial ao JSON semanal, guia do professor e publicação no Moodle

**Versão do manual:** 1.2  
**Data:** 30 de setembro de 2026  
**Aplicação:** Gerador de Aulas  
**URL pública:** <https://aula-generator.vercel.app/>  
**Repositório:** <https://github.com/rgbittencourt/aula-generator>

---

## Sumário

1. [Para que serve o Gerador de Aulas](#1-para-que-serve-o-gerador-de-aulas)
2. [O que é produzido](#2-o-que-é-produzido)
3. [Antes de começar](#3-antes-de-começar)
4. [Acesso à aplicação](#4-acesso-à-aplicação)
5. [Conhecendo a tela principal](#5-conhecendo-a-tela-principal)
6. [Fluxo completo de geração](#6-fluxo-completo-de-geração)
7. [Preenchendo o briefing](#7-preenchendo-o-briefing)
8. [Usando a IA para completar campos vazios](#8-usando-a-ia-para-completar-campos-vazios)
9. [Gerando as semanas com IA](#9-gerando-as-semanas-com-ia)
10. [Como a IA organiza cada semana](#10-como-a-ia-organiza-cada-semana)
10.1. [Perfil acadêmico e prompts do sistema](#101-perfil-acadêmico-e-prompts-do-sistema)
11. [Webpráticas](#11-webpráticas)
12. [Materiais de apoio e recursos multimídia](#12-materiais-de-apoio-e-recursos-multimídia)
13. [Cálculo da carga de estudo](#13-cálculo-da-carga-de-estudo)
14. [Lendo o Planejamento Geral](#14-lendo-o-planejamento-geral)
15. [Revisando as semanas geradas](#15-revisando-as-semanas-geradas)
16. [Baixando os arquivos](#16-baixando-os-arquivos)
17. [Abrindo o JSON no Aula Studio](#17-abrindo-o-json-no-aula-studio)
18. [Publicando no Moodle via SCORM](#18-publicando-no-moodle-via-scorm)
19. [Configuração da OpenAI](#19-configuração-da-openai)
20. [Pesquisa automática de vídeos, imagens e leituras](#20-pesquisa-automática-de-vídeos-imagens-e-leituras)
21. [Uso local e modo de exemplo](#21-uso-local-e-modo-de-exemplo)
22. [Problemas comuns e soluções](#22-problemas-comuns-e-soluções)
23. [Checklist de qualidade antes da publicação](#23-checklist-de-qualidade-antes-da-publicação)
24. [Estrutura técnica do JSON semanal](#24-estrutura-técnica-do-json-semanal)
25. [Perguntas frequentes](#25-perguntas-frequentes)
26. [Glossário](#26-glossário)

---

## 1. Para que serve o Gerador de Aulas

O Gerador de Aulas transforma um **tema geral de curso** em um planejamento semanal detalhado. A proposta não é simplesmente pedir à IA um texto genérico. O sistema combina briefing pedagógico, calendário, carga horária, materiais, webpráticas e pesquisa de recursos para produzir uma trilha que possa ser revisada e posteriormente aberta no Aula Studio.

O fluxo foi pensado para separar três funções que normalmente acabam misturadas:

- **Planejamento pedagógico:** objetivos, conteúdos, arco didático e sequência de aprendizagem.
- **Autoria da aula do aluno:** textos, blocos, vídeos, imagens, leituras, atividades, avaliação e síntese.
- **Mediação do professor:** intencionalidade, diagnóstico, perguntas, intervenções, diferenciação, acessibilidade e observações de condução.

A aplicação pode trabalhar com semanas numeradas ou com um calendário real. Também pode gerar um exemplo local sem consumir a IA, o que é útil para conhecer o formato antes de produzir um curso real.

> **Regra central:** a IA prepara uma primeira versão pedagógica; o professor continua responsável pela conferência das fontes, pela adequação ao público e pela publicação final.

---

## 2. O que é produzido

Ao concluir uma geração, o sistema disponibiliza três tipos de saída.

### 2.1 JSON do aluno

É um arquivo por semana, com a extensão `.aula.json`. Esse é o arquivo que deve ser aberto no Aula Studio.

Ele contém a experiência que será apresentada ao estudante, incluindo:

- abertura e título da semana;
- objetivos de aprendizagem;
- texto-base desenvolvido;
- seções e subseções;
- exemplos, casos e reflexões;
- vídeos, imagens, diagramas e leituras no ponto de uso;
- atividades;
- avaliação;
- síntese;
- referências;
- conexão com a próxima semana;
- cálculo e observações de carga.

O JSON do aluno **não deve conter o guia interno do professor**.

### 2.2 Guia do professor em PDF

O PDF é separado da aula do aluno. Ele foi pensado para leitura na tela e inclui, quando disponível:

- propósito da semana;
- arco didático escolhido;
- objetivos e matriz de alinhamento;
- diagnóstico inicial;
- checagens formativas;
- perguntas de mediação;
- equívocos comuns;
- intervenções possíveis;
- diferenciação para apoio, percurso padrão e extensão;
- acessibilidade;
- observações de avaliação;
- revisão espiral;
- conferência dos recursos;
- recomendações de carga e qualidade.

### 2.3 Pacote completo ZIP

O pacote reúne o curso inteiro em uma única estrutura:

```text
semanas/semana-01-titulo.aula.json
semanas/semana-02-titulo.aula.json
planejamento-geral.json
professor/guia-do-professor.pdf
webpraticas/01-tema/guia-e-roteiro.md
webpraticas/01-tema/pacote.json
webpraticas/01-tema/arquivos/*
```

---

## 3. Antes de começar

Antes da primeira geração real, tenha disponíveis quatro grupos de informações.

| Grupo | O que preparar |
|---|---|
| Identidade | Tema do curso, público, nível, autor e instituição |
| Organização | Número de semanas, horas por semana e data inicial, se houver |
| Conteúdo | Objetivos observáveis, conceitos, recortes, exemplos e abordagem desejada |
| Recursos | Referências, links conferidos, termos de busca, materiais e webpráticas |

Não é necessário que tudo esteja pronto. O botão **Preencher vazios com IA** ajuda a completar o briefing. Entretanto, quanto mais específico for o conteúdo fornecido pelo professor, mais útil será a geração.

### 3.1 O que torna um briefing bom

Um briefing forte informa não apenas o assunto, mas também o recorte pedagógico. Compare:

**Briefing fraco:**

> Gestão educacional.

**Briefing melhor:**

> Curso para gestores escolares em formação continuada. Trabalhar a relação entre políticas públicas, governo digital, sistemas de informação, indicadores acadêmicos e tomada de decisão. Usar exemplos brasileiros, estimular leitura crítica de dados e concluir com uma atividade aplicada.

A segunda versão oferece público, contexto, conceitos, recorte, finalidade e abordagem.

---

## 4. Acesso à aplicação

Abra a aplicação em:

<https://aula-generator.vercel.app/>

Na implantação atual, a IA está configurada e a aplicação pública exige um **código de acesso**. Esse código é o valor definido na variável `AULA_ACCESS_CODE` da Vercel. Ele não é:

- a chave da OpenAI;
- a senha do GitHub;
- a senha da conta ChatGPT;
- a chave `YOUTUBE_API_KEY`.

Digite o código no campo **Código de acesso da IA publicada**. Se o código estiver errado ou ausente, a geração protegida retornará erro de autorização.

### 4.2 Salvamento automático e recuperação

O Gerador salva automaticamente o briefing e, depois da geração, também salva as semanas, o Planejamento Geral, os guias do professor e o estado de revisão no navegador. Se houver queda de energia, atualização acidental ou fechamento inesperado, abra novamente a mesma URL no mesmo navegador e dispositivo.

Se existir um planejamento salvo, aparecerá a faixa:

> Encontramos um planejamento salvo neste navegador.

Clique em **Retomar planejamento** para restaurar o briefing e, quando disponível, as semanas já geradas. O campo do código de acesso não é salvo; informe-o novamente quando precisar gerar ou refazer uma semana.

Para maior segurança, clique em **Baixar backup** depois de uma geração importante. Guarde o arquivo `.json` em outro local. Em caso de perda do armazenamento do navegador, clique em **Restaurar backup** e selecione esse arquivo.

O autosave é local: ele não sincroniza entre computadores, perfis de navegador ou dispositivos. Para um planejamento importante, use os dois mecanismos: autosave e backup baixado.

### 4.1 Como interpretar o indicador do cabeçalho

O cabeçalho mostra o estado dos serviços. Exemplos:

| Indicador | Significado |
|---|---|
| **IA configurada · código necessário** | A OpenAI está disponível, mas é necessário informar o código privado |
| **IA configurada · vídeos aguardando chave** | A OpenAI está disponível; a busca de vídeos ainda não recebeu `YOUTUBE_API_KEY` naquele ambiente |
| **IA indisponível** | O backend não recebeu `OPENAI_API_KEY` ou houve falha na implantação |

Na versão pública atual, o ambiente de produção já foi validado com OpenAI e YouTube configurados. Ambientes locais podem mostrar outro estado porque usam variáveis próprias.

---

## 5. Conhecendo a tela principal

A tela principal é organizada como um ateliê de planejamento. No lado esquerdo ficam os campos do projeto; no lado direito aparece o resumo que acompanha as decisões.

![Tela inicial do Gerador de Aulas](assets/01-tela-inicial.png)

*Figura 1 — Tela inicial, ainda sem um curso preenchido.*

### 5.1 Cabeçalho

O cabeçalho apresenta a marca, o status da IA e, quando o usuário rola a página, uma barra de progresso visual do briefing.

### 5.2 Painel de resumo

O painel lateral mostra continuamente:

- nome do curso;
- número de semanas;
- horas de estudo por semana;
- carga total prevista;
- modo do calendário;
- existência ou não de webpráticas;
- estado geral do dimensionamento.

Esse resumo é preliminar. O cálculo mais preciso acontece depois que o conteúdo e os recursos são gerados.

### 5.3 Seções numeradas

A tela divide o briefing em cinco áreas:

1. **Identidade do curso**
2. **Tempo e calendário**
3. **Intenção pedagógica**
4. **Webpráticas**
5. **Materiais de apoio**

Ao final ficam as referências, os links e os botões de geração.

---

## 6. Fluxo completo de geração

O fluxo recomendado é o seguinte:

```text
Acessar a aplicação
        ↓
Informar o código de acesso
        ↓
Preencher identidade, calendário e objetivos
        ↓
Cadastrar webpráticas, se existirem
        ↓
Cadastrar materiais e sugestões de recursos
        ↓
Usar “Preencher vazios com IA”, se necessário
        ↓
Revisar o briefing preenchido
        ↓
Clicar em “Gerar com IA”
        ↓
IA escreve as semanas
        ↓
Sistema pesquisa candidatos de vídeos, imagens e leituras
        ↓
IA seleciona os candidatos mais adequados
        ↓
Sistema calcula a carga da semana e do curso
        ↓
Professor revisa Planejamento Geral e semanas
        ↓
Baixa JSON, PDF do professor ou ZIP
        ↓
Abre o JSON no Aula Studio
        ↓
Revisa e exporta SCORM para o Moodle
```

A etapa de geração não substitui a revisão. O produto ideal é uma **primeira versão consistente e editável**, não um material que deva ser publicado sem leitura humana.

---

## 7. Preenchendo o briefing

### 7.1 Identidade do curso

Preencha o tema geral com um nome que possa aparecer nos arquivos e no Aula Studio.

Exemplo:

```text
Gestão Educacional e Governo Digital
```

O campo **Público** deve informar quem estudará. Evite deixar apenas “alunos”. Prefira algo como:

```text
Professores e gestores em formação continuada
```

Em **Nível**, escolha Iniciante, Intermediário ou Avançado. O nível influencia o vocabulário, a profundidade e a quantidade de pré-requisitos.

**Autor(a)** e **Instituição** são úteis para identificação dos arquivos e para a abertura no Aula Studio. Não são obrigatórios para a lógica da IA.

![Briefing preenchido](assets/02-briefing-preenchido.png)

*Figura 2 — Exemplo de identidade, calendário e resumo preenchidos.*

### 7.2 Tempo e calendário

Informe:

- **Número de semanas:** de 1 a 52;
- **Horas por semana:** carga esperada de estudo do aluno;
- **Modo do calendário:** semanas numeradas ou data de início real;
- **Data inicial:** aparece quando o modo escolhido é calendário real.

No modo **Semana 1, Semana 2…**, o sistema não precisa de uma data de início.

No modo **Data de início real**, o sistema calcula cada semana em blocos de sete dias. Se a data inicial for 05/10/2026, a primeira semana será de 05/10 a 11/10, a segunda de 12/10 a 18/10 e assim por diante.

### 7.3 Objetivos de aprendizagem

Use verbos observáveis. Exemplos adequados:

```text
Analisar relações entre gestão educacional e políticas públicas.
Comparar dados e indicadores para apoiar decisões.
Aplicar conceitos em uma situação profissional.
Avaliar limites e possibilidades do uso de tecnologia na escola.
```

Evite objetivos vagos como:

```text
Conhecer gestão educacional.
Entender tecnologia.
Aprender sobre dados.
```

O objetivo deve indicar o que o estudante será capaz de fazer após estudar.

### 7.4 Conteúdos, recortes e orientações

Informe conceitos obrigatórios, exemplos que devem aparecer, região ou contexto, autores desejados e restrições.

Exemplo:

```text
Trabalhar gestão educacional, governo digital, sistemas de informação,
indicadores, learning analytics e dashboards. Usar exemplos brasileiros,
relacionar os conceitos à tomada de decisão de gestores e evitar uma
abordagem puramente técnica.
```

### 7.5 Preferência de arco didático

A opção padrão é **A IA escolhe em cada semana**. Essa é a recomendação para uma trilha variada.

Também é possível escolher uma preferência:

- Descoberta conceitual;
- Estudo de caso;
- Oficina aplicada;
- Análise de dados;
- Debate orientado;
- Revisão e síntese.

A preferência não é uma receita fixa. Mesmo que se escolha um arco, a IA pode adaptar a sequência quando outro percurso for pedagogicamente mais adequado.

### 7.6 Perfil acadêmico e metas de profundidade

O bloco **Perfil acadêmico do conteúdo** controla a exigência textual da geração. Ele não é apenas informativo: seus valores entram no planejamento da semana, no prompt de redação, na revisão crítica e no checklist antes da exportação.

| Campo | Como orientar o gerador |
|---|---|
| Disciplina/área | Define vocabulário, exemplos e fontes procuradas. |
| Nível acadêmico | Graduação, pós-graduação, formação profissional ou educação básica. |
| Profundidade | Ajusta densidade argumentativa, quantidade de exemplos e contrapontos. |
| Meta de palavras | Alvo aproximado de texto útil por semana; não é preenchimento artificial. |
| Mínimo de seções | Garante progressão em partes legíveis, com títulos específicos. |
| Mínimo de referências | Piso de referências estruturadas que deverão ser conferidas. |
| Fontes acadêmicas/oficiais | Quantidade mínima de fontes institucionais, acadêmicas ou oficiais. |
| Escopo histórico/geográfico | Impede que a IA use exemplos fora do recorte desejado. |
| Autores e quadros teóricos | Orienta a abordagem, sem permitir citações inventadas. |
| Tópicos a evitar | Restringe abordagens ou conteúdos indesejados. |
| Política de fontes | Define que toda pendência deve ser sinalizada para revisão humana. |

As três opções finais controlam regras de rigor: **exigir contrapontos e limites**, **comparar conceitos próximos** e **exigir exemplo ou estudo de caso**. Se o curso não comportar uma dessas exigências, desmarque-a conscientemente e registre a decisão no planejamento.

---

## 8. Usando a IA para completar campos vazios

O botão **Preencher vazios com IA** trabalha sobre o briefing, não sobre a geração final das aulas.

Ele pode sugerir ou completar:

- público;
- objetivos observáveis;
- conteúdo-base;
- referências para conferir;
- termos de busca de vídeos;
- termos de busca de imagens e diagramas;
- webpráticas, quando o conjunto ainda estiver vazio;
- materiais de apoio alinhados aos objetivos.

A aplicação deve preservar o que já foi escrito. Portanto, se um campo estiver preenchido com uma decisão do professor, a IA não deve substituí-lo indiscriminadamente.

### 8.1 Como usar com segurança

1. Preencha o tema e o público.
2. Escreva pelo menos uma intenção ou objetivo.
3. Clique em **Preencher vazios com IA**.
4. Aguarde o preenchimento.
5. Leia todos os campos alterados.
6. Apague sugestões que não correspondam ao curso.
7. Corrija termos, nomes, recortes e referências.
8. Só depois clique em **Gerar com IA**.

A IA pode sugerir uma referência ou um termo de busca, mas não se deve tratar uma sugestão como fonte conferida. Links, DOI, autores, licença e duração precisam ser verificados.

---

## 9. Gerando as semanas com IA

Depois de revisar o briefing:

1. Confira o código de acesso.
2. Verifique se o título, os objetivos e as horas estão corretos.
3. Confirme se a webprática está ligada somente quando necessário.
4. Confirme materiais obrigatórios e opcionais.
5. Clique em **Gerar com IA**.
6. Aguarde a escrita do conteúdo, a pesquisa de recursos e o cálculo.

A geração pode envolver mais de uma etapa do backend. O sistema primeiro redige a semana e depois pode consultar YouTube, Wikimedia Commons e Crossref para localizar candidatos de recursos.

### 9.1 Diferença entre exemplo local e geração com IA

**Gerar exemplo local**:

- não usa OpenAI;
- não exige código de acesso;
- serve para testar o fluxo e o formato;
- gera conteúdo estrutural de demonstração;
- não deve ser confundido com a versão final de uma aula.

**Gerar com IA**:

- usa a API configurada;
- exige o código de acesso quando a proteção estiver ativa;
- redige uma unidade didática mais completa;
- pode pesquisar e selecionar recursos;
- produz guia do professor e Planejamento Geral.

---

## 10. Como a IA organiza cada semana

Cada semana pode seguir um arco diferente, mas normalmente contém as seguintes camadas:

| Camada | Função |
|---|---|
| Abertura | Contextualiza o tema e orienta a leitura |
| Objetivos | Explicita o que o estudante deverá realizar |
| Conteúdo | Desenvolve conceitos, relações e exemplos |
| Recursos no ponto de uso | Apoia exatamente o conceito ou seção em que aparece |
| Aplicação | Propõe uma análise, prática, discussão ou produção |
| Reflexão | Faz o estudante relacionar teoria e contexto |
| Avaliação | Verifica objetivos por questões ou evidências |
| Síntese | Fecha a aprendizagem da semana |
| Próxima semana | Cria continuidade na trilha |

A ordem interessa. Um vídeo ou artigo não deveria aparecer apenas porque foi solicitado; ele deve estar relacionado a um conceito, pergunta ou atividade. Por isso, os recursos são associados à seção ou ao tópico que justificou seu uso.

A IA não deve impor vídeo, leitura, quiz ou webprática em todas as semanas. Uma semana conceitual pode precisar de leitura e síntese; outra pode exigir estudo de caso; uma terceira pode ser uma oficina aplicada.

### 10.1 Perfil acadêmico e prompts do sistema

**Sim. A versão atual do manual registra os prompts efetivos usados pelo sistema.** Eles ficam documentados aqui para que o professor entenda o processo e para que uma futura alteração possa ser comparada com o comportamento publicado. A implementação correspondente está em `src/academic.js` e `src/ai.js`.

#### Prompt-base de rigor acadêmico

Este é o prompt de sistema compartilhado pelo planejamento, redação, revisão e reparo:

```text
Você é um designer instrucional, autor acadêmico e revisor científico especializado em materiais educacionais de nível superior.

Prioridades, nesta ordem:
1. Correção conceitual e factual.
2. Coerência com o nível acadêmico e o público.
3. Profundidade explicativa.
4. Alinhamento entre objetivos, conteúdo, atividades, evidências e avaliação.
5. Clareza, progressão didática e legibilidade.
6. Rastreabilidade das fontes e transparência sobre incertezas.

Defina conceitos antes de aplicá-los. Diferencie conceitos próximos, correntes teóricas e interpretações divergentes. Explique relações de causa, consequência, condição e limite. Diferencie fato, interpretação, inferência, exemplo e recomendação. Inclua limites, controvérsias e contrapontos quando pertinentes.

Não invente autores, livros, artigos, DOI, URLs, números, instituições, resultados ou dados estatísticos. Use somente fontes fornecidas pelo usuário ou candidatos reais retornados pelos provedores. Quando algo não puder ser confirmado, marque verificationStatus como needs-human-review.

Recursos audiovisuais são complementares e devem aparecer no ponto de uso. Toda atividade deve produzir uma evidência. Toda avaliação deve verificar objetivos realmente trabalhados. Não force vídeo, leitura, quiz ou webprática sem função didática.

Responda somente JSON válido conforme o contrato solicitado. Nunca mostre sua verificação interna.
```

#### Etapa 1 — Planejamento acadêmico da semana

Antes de escrever o texto, o sistema chama o modelo com um prompt que pede somente o plano argumentativo. O retorno precisa conter:

```json
{
  "weekNumber": 1,
  "theme": "título específico",
  "centralQuestion": "pergunta orientadora",
  "centralConcepts": ["conceitos que serão definidos"],
  "relatedConcepts": ["conceitos próximos"],
  "objectives": ["objetivos observáveis"],
  "sectionSequence": [
    {
      "number": "1",
      "title": "...",
      "purpose": "...",
      "keyClaims": ["afirmação a sustentar"],
      "example": "...",
      "counterpoint": "..."
    }
  ],
  "requiredSources": [{"topic": "...", "sourceType": "...", "reason": "..."}],
  "claimsRequiringEvidence": [{"id": "claim-01", "claim": "...", "sectionNumber": "1", "sourceType": "..."}],
  "examples": ["exemplo contextualizado"],
  "controversies": ["limite ou interpretação alternativa"],
  "assessmentPlan": [{"objective": "...", "evidence": "...", "questionType": "..."}],
  "omissions": [{"phase": "...", "reason": "..."}]
}
```

O objetivo dessa etapa é impedir que o modelo comece por um resumo genérico. Ele precisa decidir quais conceitos serão definidos, quais afirmações exigem suporte, que exemplo será usado, onde entra a avaliação e que fases serão omitidas com justificativa.

#### Etapa 2 — Redação da aula do aluno e do guia do professor

O prompt de redação recebe o briefing, o perfil acadêmico e o plano da etapa anterior. Ele exige:

- título específico e informativo;
- abertura contextualizada;
- quatro a oito objetivos observáveis;
- pelo menos o número configurado de seções substanciais;
- explicação conceitual, exemplos, aplicação e crítica;
- recursos dentro da seção em que serão usados;
- referências estruturadas, sem bibliografia inventada;
- `claimEvidence` para rastrear afirmações centrais;
- avaliação com questões alinhadas;
- `teacherGuide` separado do JSON do estudante.

O trecho de contrato mais importante do prompt é:

```text
O texto é o produto principal. Não entregue resumo, tópicos telegráficos, frases soltas, uma lista de links ou apenas instruções para o professor. Escreva para o estudante ler e aprender.

Produza aproximadamente {targetWords} palavras e pelo menos {minimumSections} seções substanciais. Inclua pelo menos {minimumReferences} referências, sendo {primarySourcesRequired} acadêmica(s) ou oficial(is), sem inventar dados bibliográficos.

Cada afirmação central deve aparecer em claimEvidence com id, claim, sectionNumber, sourceIds, sourceType, supportLevel, verificationStatus e note. Afirmações sem fonte usam supportLevel "insufficient" e verificationStatus "needs-human-review".

{counterpointRule}; {comparisonRule}; {caseStudyRule}.

Não invente URLs, DOI, durações, autores, números ou referências verificadas. Para recurso ainda não conferido, use searchQuery e verificationStatus "suggested-no-url".
```

O JSON de saída desta etapa é reduzido pelo normalizador: os `blocks` do Aula Studio são montados no servidor e o conteúdo reservado ao professor é mantido no `teacherGuide`/PDF.

#### Pesquisa e curadoria de recursos

Depois da redação, a pesquisa consulta os provedores configurados. O prompt de curadoria instrui:

```text
Escolha somente entre os candidatos reais recebidos. Nunca invente URL, título, autor, duração, licença ou DOI. Avalie alinhamento a objetivo, confiabilidade, atualidade, acessibilidade, duração, licença/crédito, idioma e momento didático. Um vídeo sem legenda/transcrição deve ter alternativa textual. Uma imagem/diagrama deve ter altText ou alternativa descritiva. Escolha no máximo 2 vídeos, 3 imagens/diagramas e 3 leituras. O professor fará a aprovação final: marque selected-by-ai, nunca approved.
```

Cada candidato preserva provedor, fonte, licença, estado de seleção, justificativa e pendência humana. Isso permite trocar ou retirar mídia no Aula Studio sem reescrever a aula inteira.

#### Etapa 3 — Revisão crítica acadêmica

O revisor recebe a aula inteira e o planejamento. Ele não deve reescrever imediatamente; primeiro retorna um diagnóstico:

```json
{
  "status": "approved | approved-with-review | needs-revision",
  "strengths": ["..."],
  "issues": [
    {
      "severity": "high | medium | low",
      "type": "unsupported-claim | superficiality | misalignment | invented-source | repetition | weak-example | missing-counterpoint | accessibility | other",
      "sectionNumber": "...",
      "description": "...",
      "suggestedRepair": "..."
    }
  ],
  "unsupportedClaims": ["..."],
  "rewriteRequired": false
}
```

O revisor verifica definição de conceitos, sustentação de afirmações, distinção entre fato e interpretação, exemplos, contrapontos, alinhamento objetivo–evidência–avaliação, função dos recursos, repetição, síntese e continuidade curricular.

#### Reparo condicional

Se a qualidade estrutural ficar abaixo do piso ou o revisor indicar `rewriteRequired: true`, o sistema chama o prompt de reparo. Ele recebe os problemas encontrados e ordena:

```text
Reescreva a unidade inteira, não faça um resumo e não remova conteúdo que já esteja bom. Corrija os problemas estruturais e acadêmicos apontados. Não faça alongamento artificial. Preserve o mapa de evidências, marque pendências como needs-human-review e não invente fontes. Entregue novamente lessonPlan e teacherGuide, sem blocks.
```

Depois do reparo, uma nova revisão é executada. Uma semana com falha crítica permanece bloqueada e aparece na prévia para conferência humana.

#### Regeneração solicitada pelo professor

Quando o professor abre uma semana e escreve uma solicitação, o prompt recebe a instrução livre, a semana atual e um novo planejamento acadêmico. Ele deve preservar o que está bom e alterar somente o que foi pedido, mantendo título, objetivos, seções, evidências, fontes e avaliação. A revisão crítica também é executada após a regeneração.

#### Variáveis que controlam os prompts

| Variável | Padrão | Efeito |
|---|---:|---|
| `OPENAI_CONTENT_MODEL` | usa `OPENAI_MODEL` | Modelo usado para texto longo. |
| `OPENAI_MAX_TOKENS` | `16000` | Limite de saída por chamada; aumente apenas se o modelo/projeto aceitar. |
| `AULA_ACADEMIC_PIPELINE` | `true` | Liga planejamento, redação e revisão acadêmica. |
| `AULA_ACADEMIC_REVIEW` | `true` | Executa a revisão crítica e o relatório de pendências. |
| `AULA_AUTO_REPAIR` | `true` | Permite uma reescrita automática quando houver falha. |
| `AULA_RESOURCE_RESEARCH` | `true` | Pesquisa candidatos de vídeos, imagens e leituras. |

Essas variáveis não substituem a leitura do professor. Elas controlam o processo de geração; aprovação de fonte, adequação curricular e publicação continuam sendo decisões humanas.

---

## 11. Webpráticas

Webpráticas são projetos de investigação, produção ou aplicação que podem envolver a web, dados, curadoria, colaboração ou ferramentas digitais.

### 11.1 Quando criar uma webprática

Crie uma webprática quando houver um produto ou evidência que mereça um projeto próprio. Exemplos:

- construir um painel de indicadores;
- pesquisar fontes e produzir uma curadoria;
- analisar uma base de dados;
- elaborar um mapa ou diagrama;
- produzir uma síntese multimídia;
- realizar um debate ou seminário;
- comparar soluções em um estudo de caso.

Não crie uma webprática somente para preencher o formulário. É correto ter semanas sem webprática.

### 11.2 Como preencher uma prática

Ative a seção **Webpráticas** e mantenha pelo menos uma prática quando a opção estiver ligada. Para cada prática, informe:

| Campo | Orientação |
|---|---|
| Nome | Nome claro do projeto |
| Tipo | Pesquisa, produção, estudo de caso, curadoria, debate ou projeto aplicado |
| Momento | Ex.: `semana 3`, `após o texto-base` |
| Duração | Tempo previsto para o estudante concluir a prática |
| Objetivo | Aprendizagem específica da prática |
| Instruções | O que observar, fazer, comparar ou produzir |
| Produto/evidência | O que será entregue ou apresentado |
| Avaliação | Critérios para julgar a evidência |

Exemplo:

```text
Nome: Webprática: painel de indicadores
Momento: semana 3
Duração: 120 minutos
Objetivo: Construir uma leitura crítica de dados acadêmicos.
Produto: Painel comentado e breve justificativa.
Avaliação: Clareza da análise, evidências e coerência da interpretação.
```

### 11.3 O que a IA prepara

O projeto completo pode incluir:

- contexto;
- pré-requisitos;
- preparação do professor;
- preparação do estudante;
- materiais;
- etapas com duração;
- produto ou entrega;
- rubrica;
- prompts;
- roteiro audiovisual;
- plano B;
- acessibilidade;
- continuidade;
- arquivos-exemplo.

O aluno não recebe todo o guia interno do professor. Ele recebe apenas as orientações necessárias para participar da prática na semana correspondente.

---

## 12. Materiais de apoio e recursos multimídia

A seção **Materiais de apoio** permite cadastrar itens que sustentam o percurso. Cada cartão pode informar:

- título;
- tipo;
- momento de uso;
- link real;
- quantidade de páginas;
- duração em minutos;
- leitura obrigatória;
- objetivo;
- alinhamento com o conteúdo;
- modo de uso pelo estudante.

### 12.1 Tipos de material

Entre os tipos disponíveis estão:

- Texto-base;
- Artigo científico;
- Livro ou capítulo;
- Vídeo;
- Relatório ou dados;
- Infográfico;
- Exercício.

### 12.2 Link real ou termo de busca

Use **Link real** apenas quando a fonte já estiver conferida. Se ainda não souber qual fonte usar, preencha um termo de busca:

```text
Indicadores educacionais e desigualdade no Brasil
Diagrama de fluxo de dados educacionais
Learning analytics formação docente
```

O sistema deve pesquisar candidatos e registrar que eles precisam de revisão. A IA não deve inventar uma URL para preencher um campo.

### 12.3 Recursos no ponto de uso

O resultado final deve colocar o vídeo, a imagem ou o material dentro do tópico relacionado ao conceito. Isso facilita a leitura do aluno e mantém a aula editável no Aula Studio.

Os blocos principais são:

- `video` para vídeos do YouTube;
- `imagem` para imagens e diagramas;
- `materiais` para leituras e itens complementares.

### 12.4 Revisão dos recursos

Antes da publicação, confira:

1. Se o link abre.
2. Se o vídeo continua disponível.
3. Se a duração está correta.
4. Se a imagem possui licença e crédito adequados.
5. Se o texto está alinhado ao recurso.
6. Se o recurso é obrigatório ou complementar.
7. Se a fonte é adequada ao público e ao nível.

---

## 13. Cálculo da carga de estudo

O cálculo trabalha de forma isolada dentro da aplicação. Não é necessário manter a planilha original conectada ao sistema.

O valor inicial do curso é:

```text
número de semanas × horas por semana
```

Depois que o conteúdo é escrito, o sistema refina a estimativa com base em itens como:

- quantidade de palavras do conteúdo;
- leitura digital;
- páginas de artigo ou livro;
- tipo de leitura;
- duração de vídeos e áudios;
- fóruns e comunicações;
- atividades;
- avaliações;
- webpráticas;
- itens obrigatórios e opcionais.

### 13.1 Por que a carga calculada pode ficar abaixo da meta

Se o conteúdo gerado for curto, a carga calculada pode ficar muito abaixo das horas planejadas. Isso não deve ser mascarado. É um sinal para:

- aprofundar o texto-base;
- inserir exemplos e casos;
- acrescentar leituras adequadas;
- revisar a duração de práticas;
- conferir vídeos e atividades;
- reduzir a meta semanal, se ela não for realista.

O modo **Gerar exemplo local** é propositalmente estrutural. Portanto, sua carga pode ser menor que a meta; ele serve para testar a estrutura, não para representar a aula final.

### 13.2 Itens pendentes

Quando aparece uma mensagem como:

```text
4 recurso(s) precisam de conferência para fechar o cálculo
```

significa que ainda faltam dados confiáveis, como duração de vídeo, número de páginas ou confirmação do recurso. O professor deve revisar esses itens antes de considerar o dimensionamento fechado.

---

## 14. Lendo o Planejamento Geral

O Planejamento Geral aparece acima dos cartões de semana.

![Resultados e Planejamento Geral](assets/03-resultados-planejamento.png)

*Figura 3 — Planejamento Geral, métricas, arcos didáticos e botões de exportação.*

Ele apresenta, normalmente:

| Indicador | O que representa |
|---|---|
| Meta de estudo do aluno | Total previsto pelo briefing |
| Carga calculada | Tempo derivado do conteúdo e das atividades |
| Itens obrigatórios | Parte da carga considerada essencial |
| Atividade instrucional equivalente | Tempo de mediação ou condução associado |
| Categorias | Conteúdo, webpráticas, revisão e outras parcelas |
| Arcos | Percursos didáticos usados pelas semanas |
| Pendências | Itens que precisam de conferência |

O Planejamento Geral deve ser lido antes de baixar os arquivos. Ele permite detectar, por exemplo:

- uma semana muito mais curta que as demais;
- excesso de webpráticas;
- ausência de revisão;
- recursos ainda não conferidos;
- meta de horas incompatível com o conteúdo;
- repetição excessiva do mesmo arco.

---

## 15. Revisando as semanas geradas

Cada cartão mostra:

- número da semana;
- data ou período;
- arco didático;
- título;
- objetivo principal;
- minutos calculados;
- meta da semana;
- quantidade de blocos;
- tipos de bloco;
- indicador de qualidade textual;
- botão **Ver aula** para abrir a leitura completa;
- botão de download do JSON.

![Semanas geradas](assets/04-semanas-geradas.png)

*Figura 4 — Grade de semanas geradas e botão para baixar o JSON do aluno.*

### 15.1 O que conferir em cada semana

Leia cada semana como se você fosse o estudante. Pergunte:

1. A abertura explica por que o tema importa?
2. Os objetivos aparecem no conteúdo?
3. O texto explica, em vez de apenas listar tópicos?
4. Os recursos aparecem no momento adequado?
5. Há conexão entre teoria e aplicação?
6. A atividade realmente verifica o objetivo?
7. A avaliação pode ser respondida com base na aula?
8. A síntese fecha a aprendizagem?
9. A conexão com a próxima semana faz sentido?
10. O tempo estimado é plausível?

### 15.2 Abrir a prévia completa

Clique em **Ver aula** no card da semana. A janela de prévia apresenta, na ordem em que o estudante encontrará o material:

- arco didático e fases ativas;
- abertura e objetivos;
- diagnóstico inicial, quando previsto;
- seções e subseções de conteúdo;
- vídeos, imagens, diagramas e leituras no ponto de uso;
- atividades e evidências produzidas;
- projeto de webprática separado, somente se houver prática naquela semana;
- síntese, continuidade, trilhas de diferenciação, glossário, autoavaliação e avaliação.

O topo da janela mostra palavras, seções, objetivos e nota estrutural. Leia a aula inteira antes de baixar o JSON. Se aparecer **conteúdo insuficiente**, não abra essa versão no Aula Studio ainda.

### 15.3 Refazer somente uma semana

No final da prévia há o campo **Quer refazer esta semana?**. Escreva uma solicitação específica, por exemplo:

```text
Amplie a seção sobre o estudo de caso com um exemplo brasileiro, acrescente uma pergunta formativa durante o texto, retire o segundo vídeo e transforme a avaliação em uma decisão aplicada.
```

Clique em **Refazer esta semana com IA**. O sistema envia o briefing, a semana atual e a solicitação, reescreve apenas a semana aberta, pesquisa novamente os recursos dessa semana, recalcula sua carga e atualiza o Planejamento Geral. As outras semanas permanecem intactas.

Use pedidos que indiquem **o que mudar**, **onde mudar** e **por quê**. Depois da resposta, leia novamente a semana e compare a carga, os objetivos, a evidência e a avaliação.

### 15.4 Revisão pedagógica e revisão editorial

Faça duas leituras diferentes.

**Leitura pedagógica:** verifica objetivos, sequência, coerência, dificuldade, acessibilidade e evidências.

**Leitura editorial:** verifica ortografia, títulos, repetição, links, créditos, formatação e consistência dos nomes.

---

## 16. Baixando os arquivos

Depois da geração, existem três ações principais.

### 16.1 Baixar JSON do aluno

Cada cartão tem o botão **Baixar JSON do aluno**. Ele baixa somente a semana selecionada.

Use essa opção quando quiser:

- revisar uma semana isoladamente;
- abrir uma semana no Aula Studio;
- fazer uma correção manual;
- testar um conteúdo antes de exportar o curso inteiro.

### 16.2 Guia do professor PDF

O botão **Guia do professor PDF** baixa um documento separado para leitura e mediação. Ele não deve ser aberto como aula no Aula Studio.

### 16.3 Pacote completo ZIP

O botão **Pacote completo ZIP** reúne todas as semanas, o Planejamento Geral, o PDF e as webpráticas.

Use o ZIP para arquivar a versão gerada, transferir o projeto ou manter uma cópia antes da edição no Aula Studio.

---

## 17. Abrindo o JSON no Aula Studio

O botão **Abrir** do Aula Studio espera um arquivo JSON no contrato de aula do editor. O Gerador já cria a extensão correta:

```text
semana-01-gestao-educacional.aula.json
```

### 17.1 Procedimento

1. Gere o curso.
2. Baixe uma semana usando **Baixar JSON do aluno**.
3. Abra o Aula Studio.
4. Escolha **Abrir**.
5. Selecione o arquivo `.aula.json` baixado.
6. Aguarde o carregamento.
7. Navegue pelos tópicos e blocos.
8. Edite textos, imagens, vídeos ou materiais conforme necessário.
9. Salve ou exporte a versão revisada.

### 17.2 O que não selecionar no botão Abrir

Não selecione:

- o PDF do professor;
- o ZIP inteiro;
- `planejamento-geral.json`;
- `pacote.json` de uma webprática;
- arquivos Markdown;
- um JSON incompleto editado manualmente.

O arquivo correto é o JSON individual de uma semana.

### 17.3 Alterando recursos no Aula Studio

Como os recursos são blocos editáveis, é possível:

- trocar um vídeo;
- remover uma imagem;
- inserir uma nova imagem;
- modificar legenda e crédito;
- substituir uma leitura;
- mover um bloco dentro do tópico;
- corrigir textos;
- inserir uma atividade;
- reorganizar a sequência.

A revisão no Aula Studio é o momento adequado para adaptar a aula ao estilo visual, à identidade da instituição e às fontes efetivamente aprovadas.

---

## 18. Publicando no Moodle via SCORM

O Gerador prepara o conteúdo e o Aula Studio prepara a publicação.

### 18.1 Fluxo recomendado

```text
Gerador de Aulas
   ↓ baixa semana-01.aula.json
Aula Studio
   ↓ abre e revisa a semana
Aula Studio
   ↓ Exportar → Pacote SCORM (.zip)
Moodle
   ↓ adiciona atividade SCORM
```

### 18.2 No Aula Studio

1. Abra o JSON da semana.
2. Revise o conteúdo do aluno.
3. Confirme imagens, vídeos e créditos.
4. Teste links e elementos interativos.
5. Confira quiz e avaliação.
6. Use **Exportar**.
7. Selecione **Pacote SCORM (.zip)**.
8. Salve o pacote exportado.

### 18.3 No Moodle

A nomenclatura pode variar conforme a versão do Moodle, mas o fluxo normalmente é:

1. Abra o curso.
2. Ative a edição.
3. Adicione uma atividade ou recurso.
4. Escolha **Pacote SCORM**.
5. Envie o `.zip` exportado pelo Aula Studio.
6. Defina nome, descrição e disponibilidade.
7. Configure tentativas, nota e conclusão.
8. Salve.
9. Acesse como estudante e teste a navegação.

O Gerador não publica diretamente no Moodle. A publicação ocorre depois da revisão e exportação SCORM pelo Aula Studio.

---

## 19. Configuração da OpenAI

A assinatura do ChatGPT e a API da OpenAI são serviços distintos. Para o Gerador, é necessária uma chave de API.

### 19.1 Criar a chave

1. Acesse <https://platform.openai.com/>.
2. Entre na conta da OpenAI.
3. Selecione ou crie um projeto.
4. Abra a área **API keys**.
5. Clique em **Create new secret key**.
6. Dê um nome, por exemplo `aula-generator-vercel`.
7. Copie a chave no momento da criação.
8. Guarde a chave em um gerenciador de senhas.

A chave nunca deve ser colocada:

- no GitHub;
- no README;
- no JavaScript público;
- em capturas de tela;
- nesta conversa;
- no arquivo `.env` versionado.

### 19.2 Variáveis da Vercel

Na Vercel, em **Settings → Environment Variables**, configure:

| Variável | Valor |
|---|---|
| `OPENAI_API_KEY` | chave secreta da API OpenAI |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `AULA_ACCESS_CODE` | código privado para acessar a IA |
| `YOUTUBE_API_KEY` | chave opcional de pesquisa de vídeos |

Use o tipo **Secret** para as chaves. Depois de salvar alterações, faça **Redeploy**.

### 19.3 Diferença entre as credenciais

| Credencial | Serve para |
|---|---|
| `OPENAI_API_KEY` | gerar e completar conteúdos com IA |
| `YOUTUBE_API_KEY` | pesquisar candidatos de vídeos |
| `AULA_ACCESS_CODE` | proteger o endpoint público da aplicação |
| senha do ChatGPT | entrar na conta ChatGPT; não deve ser colocada no aplicativo |

---

## 20. Pesquisa automática de vídeos, imagens e leituras

Depois de escrever a semana, o sistema pode realizar uma segunda etapa de pesquisa.

### 20.1 YouTube

A aplicação usa a YouTube Data API v3 para localizar candidatos de vídeos. A chave é configurada no Google Cloud e cadastrada na Vercel com o nome `YOUTUBE_API_KEY`.

Para ativar:

1. Abra <https://console.cloud.google.com/>.
2. Crie ou selecione um projeto.
3. Acesse **APIs e serviços → Biblioteca**.
4. Ative **YouTube Data API v3**.
5. Acesse **Credenciais**.
6. Crie uma **Chave de API**.
7. Cadastre a chave na Vercel.
8. Faça Redeploy.
9. Consulte `/api/health` e verifique `youtubeConfigured: true`.

### 20.2 Wikimedia Commons

Imagens e diagramas podem ser pesquisados no Wikimedia Commons. O resultado deve preservar dados de fonte, crédito e licença quando disponíveis.

### 20.3 Crossref

Referências acadêmicas podem ser localizadas por meio do Crossref. O professor deve conferir título, autores, DOI e adequação ao conteúdo antes de publicar.

### 20.4 O sistema não deve inventar fontes

Quando não existe link conferido, o recurso deve ficar com termo de busca e indicação de revisão. O professor não deve publicar automaticamente uma referência apenas porque a IA a descreveu.

---

## 21. Uso local e modo de exemplo

O modo local é útil para testar a interface e o contrato sem depender do código da Vercel.

### 21.1 Instalação

No repositório:

```bash
npm install
npm run dev
```

Acesse:

```text
http://127.0.0.1:4310
```

### 21.2 Variáveis locais

Crie um arquivo `.env` local a partir do modelo:

```bash
cp .env.example .env
```

Exemplo de configuração:

```text
OPENAI_API_KEY=chave-local
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
AULA_ACCESS_CODE=um-codigo-privado
YOUTUBE_API_KEY=chave-do-youtube
AULA_RESOURCE_RESEARCH=true
HOST=127.0.0.1
PORT=4310
```

O `.env` não deve ser enviado ao GitHub.

### 21.3 Por que usar o exemplo local

Use **Gerar exemplo local** para conferir:

- se a interface está respondendo;
- se as semanas aparecem;
- se o Planejamento Geral é exibido;
- se o JSON é baixado;
- se o PDF é criado;
- se o ZIP contém as pastas esperadas.

Não use o conteúdo estrutural do fallback como versão final de uma disciplina sem enriquecer o briefing e gerar com IA.

---

## 22. Problemas comuns e soluções

| Problema | Causa provável | Solução |
|---|---|---|
| “Informe o código de acesso” | O código da Vercel não foi informado | Digite o valor de `AULA_ACCESS_CODE` no campo da tela |
| Erro 401 | Código incorreto ou ausente | Confirme a variável na Vercel e faça Redeploy |
| IA indisponível | `OPENAI_API_KEY` não chegou ao ambiente | Cadastre a chave como Secret e faça Redeploy |
| “vídeos aguardando chave” | `YOUTUBE_API_KEY` ausente no ambiente atual | Cadastre a chave no Production e faça Redeploy |
| IA funciona, mas não há vídeos | Busca do YouTube não configurada ou sem candidatos | Confira a chave, o healthcheck e os termos de busca |
| Página pública mostra IA desativada | Você abriu a versão GitHub Pages | Use a URL da Vercel para geração com IA |
| Tela local dá 404 | Servidor foi iniciado no diretório errado | Rode `npm run dev` na raiz de `aula-generator` |
| Aula Studio não abre o arquivo | Arquivo errado ou JSON alterado | Baixe o JSON individual da semana e não o ZIP/PDF |
| A carga calculada ficou baixa | Conteúdo estrutural ou poucos recursos | Desenvolva o texto, acrescente atividades e revise materiais |
| Muitos recursos aguardando conferência | Termos de busca ainda não viraram fontes verificadas | Revise links, duração, páginas, licença e crédito |
| Webprática aparece em semana indevida | Momento não foi preenchido claramente | Use formatos como `semana 3` ou `semana 4` |
| ZIP não é uma aula SCORM | O ZIP do Gerador é um pacote de autoria | Abra o JSON no Aula Studio e exporte SCORM depois |
| PDF abre, mas não no Aula Studio | PDF é o guia do professor | Use o JSON `.aula.json` para abrir no editor |

### 22.1 Erro 404 ao rodar localmente

Não abra apenas um diretório sem servidor ou com um servidor apontando para a pasta errada. O servidor precisa servir a pasta `public` pela aplicação Express.

O fluxo correto é:

```bash
cd /caminho/para/aula-generator
npm install
npm run dev
```

Depois abra `http://127.0.0.1:4310`.

### 22.2 Teste rápido do healthcheck

No terminal:

```bash
curl http://127.0.0.1:4310/api/health
```

Em produção:

```text
https://aula-generator.vercel.app/api/health
```

O resultado esperado é um JSON com campos como `aiConfigured`, `accessRequired`, `resourceResearch`, `youtubeConfigured` e `model`.

---

## 23. Checklist de qualidade antes da publicação

### Briefing

- [ ] O tema está específico.
- [ ] O público está identificado.
- [ ] O nível é adequado.
- [ ] Os objetivos usam verbos observáveis.
- [ ] O recorte e os conteúdos obrigatórios estão descritos.
- [ ] O calendário está correto.
- [ ] As horas por semana são realistas.

### Webpráticas

- [ ] Só há webprática quando ela possui função pedagógica.
- [ ] Cada prática tem momento definido.
- [ ] O produto ou evidência está claro.
- [ ] A avaliação tem critérios.
- [ ] O plano B está previsto no guia do professor.
- [ ] A prática não aparece repetida em todas as semanas.

### Recursos

- [ ] Links abrem.
- [ ] Vídeos estão disponíveis.
- [ ] Imagens têm crédito e licença.
- [ ] Leituras estão alinhadas ao conteúdo.
- [ ] Duração e páginas foram conferidas.
- [ ] Recursos obrigatórios estão identificados.
- [ ] Itens pendentes foram revisados.

### Aula do aluno

- [ ] A abertura contextualiza.
- [ ] O texto é suficiente para a meta da semana.
- [ ] A ordem da aula faz sentido.
- [ ] Os recursos aparecem no ponto de uso.
- [ ] A atividade verifica algum objetivo.
- [ ] A avaliação é respondível.
- [ ] A síntese fecha a semana.
- [ ] A próxima semana é anunciada sem repetir conteúdo.

### Professor e publicação

- [ ] O PDF do professor foi lido.
- [ ] O JSON foi aberto no Aula Studio.
- [ ] A aula foi revisada visualmente.
- [ ] O SCORM foi exportado pelo Aula Studio.
- [ ] O pacote foi testado como estudante no Moodle.
- [ ] Conclusão, nota e tentativas foram conferidas.

---

## 24. Estrutura técnica do JSON semanal

A estrutura é compatível com o formato esperado pelo Aula Studio. Um JSON resumido tem esta forma:

```json
{
  "meta": {
    "courseTitle": "Gestão Educacional e Governo Digital",
    "weekNumber": 1,
    "weekLabel": "Semana 1",
    "studyHours": 8
  },
  "lessonPlan": {
    "weekNumber": 1,
    "theme": "Fundamentos da gestão educacional",
    "didacticArc": {
      "id": "descoberta-conceitual",
      "label": "Descoberta conceitual",
      "sequence": ["ativar", "explicar", "relacionar", "sintetizar"]
    },
    "learningObjectives": [
      "Analisar relações entre gestão educacional e políticas públicas."
    ],
    "contentSections": [
      {
        "number": "1",
        "title": "Contexto e problema",
        "body": "Texto desenvolvido...",
        "resources": []
      }
    ],
    "resources": {
      "videos": [],
      "readingsRequired": [],
      "readingsExtra": [],
      "images": [],
      "podcasts": [],
      "datasets": []
    },
    "webPractices": [],
    "assessment": {
      "questions": []
    },
    "timePlan": {
      "calculatedMinutes": 0,
      "items": [],
      "calculationMethod": "derived-after-content"
    }
  },
  "blocks": [
    {
      "id": "b-topic-1-001",
      "type": "topic",
      "props": {
        "children": [
          {
            "id": "c-prose-1-001",
            "type": "prose",
            "props": {
              "body": "<p>Texto da aula.</p>"
            }
          },
          {
            "id": "c-video-1-001",
            "type": "video",
            "props": {
              "id": "youtube-video-id",
              "title": "Vídeo contextualizado"
            }
          }
        ]
      }
    }
  ]
}
```

O campo `teacherGuide` não deve ser incluído no JSON destinado ao Aula Studio. O guia é produzido separadamente em PDF.

### 24.1 Tipos de bloco mais frequentes

| Tipo | Uso |
|---|---|
| `hero` | Abertura da semana |
| `topic` | Container de conteúdo e recursos |
| `titulo` | Título de seção ou subseção |
| `prose` | Texto corrido |
| `destaque` | Ênfase em uma ideia |
| `reflexao` | Pergunta ou pausa reflexiva |
| `video` | Vídeo do YouTube |
| `imagem` | Imagem ou diagrama |
| `materiais` | Leitura e recursos complementares |
| `quiz` | Avaliação interativa |
| `sintese` | Fechamento da semana |
| `referencias` | Referências finais |

---

## 25. Perguntas frequentes

### A IA gera uma aula inteira ou apenas um resumo?

A geração foi desenhada para produzir uma unidade didática completa, com conteúdo, seções, recursos, reflexão, avaliação e síntese. A qualidade depende do briefing e ainda exige revisão docente.

### Toda semana terá webprática?

Não. Webpráticas são opcionais e independentes. Elas devem aparecer apenas quando programadas ou quando houver uma finalidade pedagógica clara.

### A ordem entre texto, vídeo, leitura e atividade importa?

Sim. O recurso deve aparecer no ponto em que ajuda a compreender, aplicar ou discutir o conceito. O sistema não precisa produzir uma seção final de “todos os vídeos” ou “todas as leituras”.

### Posso trocar uma imagem ou vídeo depois?

Sim. O JSON usa blocos editáveis do Aula Studio. Depois de abrir a semana, você pode remover, substituir, inserir e reorganizar recursos.

### Posso usar apenas o modo local?

Sim. O modo local permite testar a aplicação e gerar exemplos. Para geração com IA pela URL pública, use a implantação Vercel com as variáveis configuradas.

### A chave do ChatGPT funciona na aplicação?

Não. A aplicação precisa de uma chave de API da plataforma OpenAI. A senha da conta ChatGPT não deve ser usada como credencial do backend.

### O ZIP do Gerador já é o ZIP do Moodle?

Não. O ZIP do Gerador organiza JSONs, PDF, Planejamento Geral e webpráticas. Para criar um pacote SCORM, abra cada semana no Aula Studio e use a opção de exportação SCORM.

### A planilha precisa continuar conectada?

Não. As regras de dimensionamento foram internalizadas no código do Gerador. A aplicação não precisa consultar a planilha para calcular as semanas.

### Posso gerar o curso inteiro de uma vez?

Sim, informando o número de semanas. O sistema retorna um JSON por semana, guias correspondentes e o Planejamento Geral agregado.

### O professor pode definir um arco único para todo o curso?

Pode escolher uma preferência, mas a aplicação trata essa escolha como orientação. A IA pode variar a estrutura quando outro arco for mais adequado ao conteúdo da semana.

---

## 26. Glossário

| Termo | Definição |
|---|---|
| Aula Studio | Editor usado para abrir, revisar e exportar as aulas em formato compatível com SCORM |
| Aula do aluno | Camada de conteúdo que o estudante verá |
| Arco didático | Sequência pedagógica que organiza a aprendizagem de uma semana |
| Briefing | Conjunto de informações que orienta a geração |
| Crossref | Serviço de metadados bibliográficos usado para pesquisa de referências |
| JSON | Formato estruturado usado para transportar a aula |
| JSON do aluno | Arquivo semanal que deve ser aberto no Aula Studio |
| Guia do professor | Documento de mediação pedagógica exportado em PDF |
| Planejamento Geral | Resumo agregado das semanas, tempos, categorias e pendências |
| SCORM | Pacote de conteúdo rastreável usado pelo Moodle |
| Webprática | Projeto independente de investigação, produção ou aplicação |
| YouTube Data API | Serviço usado para localizar candidatos de vídeos |
| Wikimedia Commons | Repositório usado para pesquisa de imagens e diagramas com metadados |

---

## Referências operacionais

- Aplicação: <https://aula-generator.vercel.app/>
- Repositório do Gerador: <https://github.com/rgbittencourt/aula-generator>
- Plataforma OpenAI: <https://platform.openai.com/>
- Google Cloud Console: <https://console.cloud.google.com/>
- Aula Studio: <https://rgbittencourt.github.io/aula-studio/>

> **Última recomendação:** gere uma semana, abra-a no Aula Studio, revise o resultado e só depois gere ou publique o curso inteiro. Esse ciclo curto reduz retrabalho e permite ajustar o briefing antes de produzir todas as semanas.
