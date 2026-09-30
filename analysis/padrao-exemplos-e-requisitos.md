# Padrão dos exemplos e requisitos do Gerador de Aulas

**Data da análise:** 30/09/2026  
**Arquivos analisados:** seis semanas em DOCX, um roteiro de webprática em DOCX e a planilha `dados_academicos_webpratica.xlsx`.

## 1. Decisão principal de produto

O Gerador de Aulas não deve começar pela divisão automática de horas. O fluxo correto será:

1. **Construir a semana didaticamente completa**, com densidade e acabamento próximos aos DOCX enviados.
2. **Validar a coerência pedagógica** entre objetivos, conteúdos, recursos, prática, avaliação e referências.
3. **Só depois dimensionar o tempo**, distribuindo as horas entre leitura principal, vídeos, leituras extras, reflexão, prática, avaliação e revisão.
4. Gerar **um arquivo JSON por semana**, compatível com o Aula Studio, e um ZIP com todos os JSONs.

A estimativa de tempo passa a ser uma etapa derivada do conteúdo, e não uma restrição que empobrece o conteúdo.

## 2. Padrão observado nas semanas

Todos os documentos semanais têm uma estrutura editorial consistente:

- título da semana e tema;
- disciplina, carga horária estimada e identificação do curso;
- seção de boas-vindas/contextualização;
- 6 a 8 objetivos de aprendizagem observáveis;
- desenvolvimento extenso em seções numeradas, com subseções e estudos de caso;
- caixas de reflexão conectadas à realidade profissional do estudante;
- chamadas **“Veja mais aqui”** inseridas no ponto exato em que o recurso ajuda a compreender o conceito;
- vídeos, artigos, documentos oficiais, podcasts, bases de dados ou páginas institucionais;
- contraponto crítico, limites e riscos do tema;
- síntese conceitual;
- seção **“O que vem por aí”** conectando a semana seguinte à atual;
- glossário rápido;
- referências da semana;
- atividade avaliativa com 6 questões objetivas, normalmente 4 de múltipla escolha e 2 de verdadeiro/falso;
- em alguns materiais, versão para importação no Moodle em GIFT.

### Métricas do corpus

| Arquivo | Parágrafos não vazios | Tabelas | Imagens incorporadas | Carga indicada |
|---|---:|---:|---:|---:|
| Semana 1 | 148 | 2 | 7 | 10 h |
| Semana 2 | 217 | 0 | 8 | 10 h |
| Semana 3 | 118 | 0 | 6 | 10 h |
| Semana 4 | 116 | 0 | 6 | 10 h |
| Semana 5 | 141 | 2 | 5 | 10 h |
| Semana 6 | 129 | 0 | 0 | 10 h |

A densidade varia por tema, mas o padrão não é um texto curto com alguns links: é uma **unidade didática completa**, com narrativa, aprofundamento, aplicação e avaliação.

## 3. Padrão da webprática

O roteiro `webpratica_vibe_coding_roteiro.md.docx` apresenta uma atividade independente e detalhada:

- objetivo e visão geral;
- ferramenta recomendada e alternativas;
- preparação do professor;
- materiais necessários;
- sessão síncrona de 90 minutos;
- 7 blocos cronológicos;
- tarefa de continuidade opcional;
- plano B para falhas técnicas ou atraso da turma;
- produto final esperado.

Os blocos da prática são:

1. abertura e contextualização — 10 min;
2. setup técnico — 10 min;
3. construção do dashboard básico — 15 min;
4. filtros interativos — 15 min;
5. busca de estudante e painel de alerta — 15 min;
6. polimento visual e dúvidas — 15 min;
7. compartilhamento e fechamento — 10 min.

O gerador deve permitir **uma ou várias webpráticas**, porque cada prática pode ter objetivo, produto, materiais, duração, modalidade e critérios de avaliação próprios.

## 4. Recursos didáticos que a IA deverá produzir

Cada recurso deve aparecer com função pedagógica explícita, não como uma lista solta no fim:

- vídeo: título, URL, duração estimada, ponto de inserção, objetivo de assistir e pergunta-guia;
- artigo ou documento: título, autoria/instituição, URL, leitura obrigatória ou extra, seção/páginas sugeridas e finalidade;
- podcast/áudio: episódio, URL, duração e relação com o conceito;
- imagem/diagrama: finalidade, legenda, texto alternativo, crédito/licença, local de uso e sugestão de busca ou prompt;
- base de dados: arquivo, dicionário de dados, objetivo da exploração e cuidados de privacidade;
- referência bibliográfica: formato ABNT e URL quando houver.

**Regra de qualidade:** a IA não deve inventar URLs. Quando não houver uma fonte verificável, ela deve retornar uma sugestão de busca ou um recurso marcado como `requiresVerification: true`. URLs fornecidas pelo usuário ou validadas por uma etapa própria de pesquisa poderão ser marcadas como verificadas.

## 5. Contrato pedagógico proposto para cada semana

O JSON semanal deverá manter os blocos que o Aula Studio já entende e acrescentar metadados ricos em `lessonPlan` ou campo equivalente:

```json
{
  "meta": {
    "courseTitle": "...",
    "weekNumber": 1,
    "theme": "...",
    "studyHours": 10,
    "calendar": {"mode": "numbered", "startDate": null, "endDate": null}
  },
  "lessonPlan": {
    "welcome": "...",
    "learningObjectives": [],
    "prerequisites": [],
    "contentSections": [
      {
        "number": "1",
        "title": "...",
        "body": "...",
        "subsections": [],
        "caseStudy": null,
        "reflection": null,
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
    "synthesis": "...",
    "nextWeekConnection": "...",
    "glossary": [],
    "references": [],
    "assessment": {
      "format": "4 multiple-choice + 2 true-false",
      "questions": [],
      "moodleGift": "..."
    },
    "timePlan": {
      "targetMinutes": 600,
      "items": [],
      "calculationMethod": "derived-after-content"
    }
  },
  "blocks": []
}
```

`blocks` continuará sendo a camada de apresentação importável pelo Aula Studio. O `lessonPlan` preservará a autoria pedagógica, os recursos, os critérios e o cálculo detalhado sem depender apenas do texto renderizado.

## 6. Blocos Aula Studio mais adequados

O editor já possui blocos que cobrem o padrão dos exemplos:

- `hero` para abertura;
- `topic` + `titulo` + `prose` para seções de conteúdo;
- `destaque`, `atencao` e `reflexao` para caixas editoriais;
- `video`, `audio` e `imagem` para mídia;
- `materiais` para leituras e links;
- `tabela`, `linhadotempo`, `cases`, `feature`, `slider` e `accordion` para visualização estruturada;
- `quiz` para avaliação;
- `sintese` e `referencias` para fechamento.

A IA deverá escolher os blocos conforme a função didática. Não deve transformar toda a semana em uma sequência de parágrafos.

## 7. Dimensionamento de tempo depois do conteúdo

O cálculo deverá partir de itens concretos, por exemplo:

- leitura do texto principal;
- vídeos e áudios, usando a duração real quando disponível;
- leituras obrigatórias e extras;
- estudo de tabelas, imagens, casos ou dados;
- reflexão individual;
- webprática e seus blocos;
- produção do entregável;
- atividade avaliativa;
- revisão e síntese.

Cada item terá `estimatedMinutes`, `basis` e `confidence`. A soma deverá ser comparada com `hoursPerWeek * 60`:

- **subdimensionado:** sugerir aprofundamento, prática ou leitura adicional;
- **adequado:** manter a semana;
- **superdimensionado:** sugerir leitura extra opcional, redução de escopo ou divisão da prática.

As fórmulas da planilha que o usuário enviar futuramente substituirão a camada atual de cálculo, sem alterar o contrato pedagógico.

## 8. Leitura da planilha de apoio

A planilha contém quatro abas: `Leia-me`, `dicionario_dados`, `dados_academicos` e `resumo_exemplo`.

Indicadores calculados na aba de dados:

- 3.743 registros;
- 420 estudantes únicos por matrícula;
- 417 nomes distintos — existem nomes iguais associados a matrículas diferentes, portanto o identificador correto é a matrícula;
- 11 campi;
- 8 cursos;
- 2 níveis de ensino;
- 4 turnos;
- 4 anos de ingresso;
- 5 períodos letivos;
- 31 disciplinas;
- 5 situações acadêmicas;
- nota média: 6,69;
- frequência média: 78,98%;
- 1.895 registros aprovados;
- 547 reprovados;
- 1.009 reprovados por falta;
- 213 evadidos;
- 79 trancados;
- taxa de evasão por registro: 5,69%.

A planilha é consistente para a webprática: não há valores fora das faixas esperadas, não há duplicidade de matrícula + período + disciplina e as 292 notas ausentes correspondem exatamente a registros evadidos ou trancados.

### Cuidado metodológico para o dashboard

A base tem registros por estudante/disciplina/período, não uma linha por estudante. Portanto:

- taxas por situação devem declarar o denominador;
- indicadores de estudante devem agregar por matrícula;
- o alerta de frequência `< 75%` combinado com `Evadido` ou `Reprovado por Falta` encontra 1.222 registros e 354 estudantes únicos;
- isso representa um caso didático de alerta retrospectivo, não um modelo preditivo de evasão;
- para uso real, o sistema deve separar histórico, sinal de risco, intervenção realizada e resultado posterior.

## 9. Próximas mudanças no Gerador

1. Ampliar o schema semanal para preservar `lessonPlan`.
2. Reescrever o prompt de geração para exigir a estrutura editorial completa.
3. Fazer o preenchimento assistido de briefing coletar recursos e práticas como conjuntos pedagógicos.
4. Criar validações de coerência: objetivo sem conteúdo, recurso sem finalidade, prática sem produto, avaliação sem gabarito e tempo sem base.
5. Gerar blocos Aula Studio a partir das seções, recursos, reflexões, webpráticas e avaliação.
6. Calcular a carga depois da geração do conteúdo.
7. Adicionar exportação do **Plano de Ensino detalhado** em etapa separada, no nível da disciplina, além dos JSONs semanais.
8. Manter recursos não verificados explicitamente marcados para revisão humana.

## 10. Limite atual da análise

Os arquivos enviados permitem calibrar muito bem o formato semanal e a webprática. Ainda não foi fornecido o DOCX ou modelo do **Plano de Ensino detalhadíssimo** mencionado pelo usuário. O gerador pode preparar o contrato e uma primeira versão, mas a reprodução fiel desse documento exigirá analisar também esse arquivo-modelo.
