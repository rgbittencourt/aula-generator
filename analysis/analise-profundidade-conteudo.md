# Análise de profundidade das aulas de referência

**Data:** 30/09/2026  
**Fonte analisada:** seis semanas de aula em DOCX, um roteiro de webprática e uma base XLSX enviados para calibrar o Gerador de Aulas.

## Diagnóstico executivo

A saída desejada não é uma semana com links, cards e um parágrafo-resumo. Os arquivos de referência são **unidades didáticas completas**, escritas para leitura do estudante. Cada semana tem identidade própria, progressão conceitual, exemplos concretos, contrapontos críticos, recursos inseridos no ponto em que são úteis, síntese, avaliação e conexão com a próxima semana.

O problema observado no gerador é estrutural: ele permitia que uma resposta JSON parcialmente preenchida passasse pela normalização. Se a IA retornasse `blocks` sem um `hero`, `lessonPlan` sem objetivos ou `contentSections` vazias, a aplicação considerava a semana válida porque havia algum bloco conhecido. A pesquisa de recursos podia ficar correta e, ainda assim, a aula continuar pedagogicamente incompleta.

A correção precisa ocorrer em três camadas:

1. **Prompt e geração:** pedir conteúdo longo, seção por seção, com orçamento de saída suficiente.
2. **Contrato e validação:** rejeitar ou reparar semanas que não tenham título, objetivos, abertura, texto desenvolvido, síntese e avaliação.
3. **Revisão pelo usuário:** permitir visualizar cada semana antes do download e solicitar a regeneração de uma semana específica com instruções próprias.

## Métricas extraídas dos documentos

| Documento | Palavras | Parágrafos não vazios | Títulos/seções | Imagens | Tabelas | Característica dominante |
|---|---:|---:|---:|---:|---:|---|
| Semana 1 — Fundamentos | 4.610 | 148 | 24 | 7 | 2 | Fundamentos conceituais, estudo de caso local, DIKW, governança, equidade e contraponto crítico |
| Semana 2 — Governo Digital | 8.831 | 217 | 34 | 8 | 0 | Unidade mais extensa; legislação, modelos de maturidade, história, X-Road, PNP, dados abertos e LGPD |
| Semana 3 — SIGE | 4.063 | 118 | 19 | 6 | 0 | Comparação SIGAA/SUAP, arquitetura, Software Público, integração e personalização versus padronização |
| Semana 4 — Learning Analytics | 3.902 | 116 | 18 | 6 | 0 | Conceito, evasão, modelos preditivos, vieses, FATE, xAPI e indicadores |
| Semana 5 — Dashboards | 4.199 | 141 | 23 | 5 | 2 | Princípios de visualização, erros, ferramentas, ETL, estudo de caso, acessibilidade e LGPD |
| Semana 6 — Vibe Coding | 4.280 | 129 | 27 | 0 | 0 | Definição, evolução, incidentes, riscos e framework de decisão |
| **Média das seis semanas** | **4.981** | **145** | **24** | **5,3** | — | — |

A mediana do tamanho das seções textuais ficou entre aproximadamente **160 e 240 palavras**, com seções principais chegando a mais de 600 palavras. Portanto, uma semana com apenas um `prose` curto ou três frases não se aproxima do material de referência.

## Padrão comum às seis semanas

Todos os materiais começam com uma estrutura explícita:

- título principal identificando número e tema da semana;
- disciplina e carga horária estimada;
- **Boas-vindas** contextualizadas, retomando a semana anterior e anunciando a atual;
- **Objetivos de aprendizagem** em verbos observáveis;
- texto-base dividido em seções numeradas e, quando necessário, subseções;
- exemplos, estudos de caso, dados, situações institucionais ou aplicações;
- pontos de reflexão e contrapontos críticos;
- recursos integrados ao texto — “veja mais”, leitura, vídeo, figura ou exercício no momento em que o conceito está sendo tratado;
- síntese conceitual;
- conexão com o que vem a seguir;
- glossário;
- referências;
- atividade avaliativa com questões alinhadas ao texto;
- em vários casos, versão para leitura/importação no Moodle.

Isso responde diretamente ao problema relatado: **título e objetivos não são opcionais nem decoração da interface; são partes mínimas do contrato da aula.**

## Leitura pedagógica de cada semana

### Semana 1 — Fundamentos: Gestão Educacional na Era Digital

A semana cumpre papel de fundação. Começa justificando por que o tema importa e usa o caso de São Miguel dos Campos para sair da abstração. Depois apresenta DIKW, TIC e Sistema de Informação, avança para governança, OCDE, dimensões da gestão, gestão gerencialista versus democrática, maturidade digital, políticas públicas, cautela com tecnologia e equidade digital.

O diferencial não é apenas quantidade: os conceitos são **encadeados**. DIKW prepara a discussão de dados; governança antecede dashboards; a crítica de Paro impede uma leitura tecnicista; a equidade recoloca o contexto social. A síntese final reconecta Simon, Rogers, DIKW, governança e equidade. O gerador deve aprender a produzir esse tipo de progressão e não uma coleção de tópicos independentes.

### Semana 2 — Governo Digital no Brasil

É a unidade mais desenvolvida, com 8.831 palavras e 34 seções/títulos. Parte de uma distinção conceitual, apresenta o modelo de Layne & Lee, faz uma história brasileira, entra na Lei nº 14.129/2021, ENGD/EFGD/IND, princípio once-only, X-Road, rankings, PNP, dados abertos, Inep, LGPD e uma crítica à neutralidade da interoperabilidade.

O texto alterna quatro movimentos que devem ser replicados pelo gerador quando fizerem sentido:

1. explicar o conceito;
2. concretizar com um caso brasileiro ou internacional;
3. inserir uma fonte ou recurso no ponto de uso;
4. problematizar limites, escalas e consequências.

### Semana 3 — Sistemas de Informação para Gestão Educacional

A semana abre o “capô” dos sistemas: define SIGE, aproxima o tema da realidade do IFSC pelo SIGAA, compara com SUAP, discute arquitetura modular, Software Público Brasileiro, mercado internacional, integração com Educacenso/PNP e termina com personalização versus padronização.

A qualidade vem do uso de **sistemas reais e do contexto institucional do estudante**. Uma geração genérica de “o que é um sistema de informação” não atende ao padrão; cada semana precisa selecionar exemplos concretos ligados ao recorte informado no briefing.

### Semana 4 — Dados, Indicadores e Learning Analytics

A unidade desenvolve um conceito, mostra sua aplicação problemática na evasão, apresenta modelos brasileiros, discute profecia autorrealizável, traz um alerta internacional, introduz FATE, xAPI e fecha com indicadores institucionais.

O modelo é particularmente importante para a IA: não basta descrever uma tecnologia; é necessário discutir **validade, ética, vieses, efeitos de classificação e consequências da decisão**. O estudante é levado do “o que é” ao “como funciona” e depois ao “quando pode causar dano”.

### Semana 5 — Ferramentas e Dashboards

A semana é prática, mas não começa pela ferramenta. Começa por princípios de visualização, pré-atenção, gráficos enganosos e um caso real de redesenho de painel. Só depois entra em BI, ETL, camada semântica e Power BI. Termina com dashboard vaidoso, acessibilidade, LGPD e uso em celular.

A lição para o gerador é clara: **não gerar uma lista de softwares**. Primeiro devem vir critérios de qualidade e uma situação de decisão; a ferramenta aparece como meio para resolver um problema.

### Semana 6 — Vibe Coding e o Futuro da Gestão Educacional

A unidade define o fenômeno, situa sua evolução, mostra divergências de definição, conecta vibe coding à engenharia agêntica, traz incidentes de segurança e termina com um framework prático de decisão: quando prototipar e quando envolver TI.

O texto usa casos de falha para ensinar limites e governança. Também inclui questões objetivas e versão GIFT. Uma aula gerada sobre IA ou tecnologia precisa conter essa camada de **uso responsável, riscos, segurança, privacidade e critérios de decisão**, não apenas entusiasmo com ferramentas.

## Webprática de referência

O roteiro “Vibe Coding na Gestão Educacional” é um projeto separado, não uma seção genérica repetida em todas as semanas. Ele contém:

- duração total de 90 minutos;
- preparação do professor;
- preparação dos estudantes;
- linha do tempo;
- sete blocos com minutos, objetivo e ação;
- prompts concretos para upload de CSV, dashboard, filtros, busca de estudante e alertas;
- discussão crítica conectando a prática às semanas anteriores;
- polimento, compartilhamento, fechamento e tarefa opcional;
- plano B para falha de upload, queda de internet ou atraso do grupo.

A planilha acompanha a prática como **dataset fictício**, com leia-me, dicionário de dados, 3.743 registros acadêmicos e resumo com fórmulas. Isso ensina o gerador a produzir, quando solicitado, não apenas uma descrição de webprática, mas um pacote executável com roteiro, prompts, dados, artefatos e plano alternativo.

## Regras de qualidade que passam a ser obrigatórias

Uma semana só deve ser considerada pronta para revisão quando tiver:

- `meta.title` específico e não genérico;
- `lessonPlan.theme` específico;
- `welcome` contextualizada;
- pelo menos 4 objetivos observáveis específicos da semana;
- pelo menos 5 seções de conteúdo com títulos e corpo textual;
- corpo textual mínimo proporcional à carga, com alerta quando ficar muito abaixo do padrão;
- síntese e conexão com a próxima semana;
- avaliação alinhada, preferencialmente com 6 questões;
- referências/glossário quando o tipo de unidade exigir;
- um `hero`, um bloco visível de objetivos, um tópico de conteúdo e a estrutura editável compatível com o Aula Studio;
- indicador de qualidade e pendências para o professor.

A validação não deve “maquiar” uma semana vazia com um título padrão. Se a IA falhar, o sistema deve tentar uma etapa de reparo; se ainda falhar, deve marcar a semana como **insuficiente — não enviar ao Aula Studio**.

## Mudança de fluxo necessária

O resultado não deve ir diretamente para download. Depois da geração, a interface precisa permitir:

1. clicar em cada semana;
2. ler a aula completa em uma prévia estruturada;
3. conferir título, objetivos, seções, recursos, síntese e avaliação;
4. informar “refazer esta semana” com uma instrução livre, por exemplo: “amplie a seção 3 com um caso brasileiro, retire o vídeo e inclua um quadro comparativo”;
5. regenerar somente a semana selecionada;
6. recalcular a carga geral;
7. baixar JSON e ZIP apenas depois da revisão.

Essa revisão por semana é essencial para preservar a autoria e permitir que o professor corrija foco, tom, exemplos, profundidade, recursos e atividades antes de abrir o arquivo no Aula Studio.
