const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const managementTechnologyTrack = [
  {
    theme: "Fundamentos: Gestão Educacional na Era Digital",
    centralQuestion: "O que muda na gestão educacional quando dados, sistemas e tecnologias passam a mediar decisões institucionais?",
    objectives: [
      "Diferenciar dado, informação, conhecimento e sabedoria no contexto da gestão educacional.",
      "Relacionar a racionalidade limitada de Herbert Simon aos desafios de decisão de um gestor educacional.",
      "Compreender TIC e Sistema de Informação aplicados à educação.",
      "Explicar por que governança de dados precede dashboards e automações.",
      "Identificar dimensões da gestão educacional impactadas por tecnologias, com exemplos concretos.",
      "Reconhecer modelos de maturidade digital e difusão de inovações.",
      "Problematizar a tensão entre gestão gerencialista, gestão democrática e equidade digital."
    ],
    newConcepts: ["DIKW", "racionalidade limitada", "TIC", "Sistemas de Informação", "governança de dados", "maturidade digital", "equidade digital"],
    sectionSequence: ["Por que estudar o tema", "DIKW e racionalidade limitada", "TIC e Sistemas de Informação", "Governança de dados", "Dimensões e maturidade digital", "Gestão democrática e equidade", "Síntese crítica"],
    arc: "descoberta-conceitual",
    mustInclude: ["Herbert Simon", "Everett Rogers", "DIKW", "governança de dados", "caso institucional contextualizado"],
    doNotRepeat: "Não entrar em profundidade na legislação de Governo Digital, nos módulos de SIGE, em modelos preditivos ou em ferramentas de dashboard; apenas anunciar essas próximas etapas.",
    bridgeFromPrevious: "Abertura do curso: não há conceitos prévios a retomar.",
    bridgeToNext: "A governança conceitual desta semana será concretizada na política pública brasileira de Governo Digital.",
    projectMilestone: "Mapa conceitual inicial da gestão educacional digital"
  },
  {
    theme: "Governo Digital no Brasil: políticas, maturidade e dados públicos",
    centralQuestion: "Como leis, estratégias e infraestruturas de dados transformam a gestão educacional pública brasileira?",
    objectives: [
      "Explicar Governo Digital e sua base legal brasileira, incluindo a Lei nº 14.129/2021.",
      "Descrever objetivos da Estratégia Nacional de Governo Digital e sua relação com dados públicos.",
      "Aplicar o modelo de Layne e Lee a um serviço ou sistema educacional.",
      "Situar a trajetória brasileira de governo eletrônico e governo digital.",
      "Analisar a Plataforma Nilo Peçanha como estudo de caso de informação governamental educacional.",
      "Relacionar interoperabilidade, dados abertos e LGPD à gestão educacional.",
      "Problematizar exclusão digital e governança algorítmica."
    ],
    newConcepts: ["Governo Digital", "Lei nº 14.129/2021", "ENGD", "Layne e Lee", "interoperabilidade", "dados abertos", "LGPD"],
    sectionSequence: ["Conceito e princípios", "Governo eletrônico e governo digital", "Modelo de maturidade", "História brasileira", "Lei e estratégias nacionais", "PNP e Rede Federal", "Dados abertos e LGPD", "Limites e inclusão"],
    arc: "estudo-de-caso",
    mustInclude: ["Lei nº 14.129/2021", "ENGD 2024-2027", "Layne e Lee", "Plataforma Nilo Peçanha", "LGPD", "caso brasileiro verificável"],
    doNotRepeat: "Não redefinir longamente DIKW, TIC ou governança básica; retomar esses conceitos apenas para aplicá-los à política pública.",
    bridgeFromPrevious: "Retomar governança de dados, maturidade digital e equidade da Semana 1.",
    bridgeToNext: "A política pública será observada por dentro dos sistemas acadêmicos e administrativos, especialmente SIGAA e SUAP.",
    projectMilestone: "Diagnóstico de maturidade digital de um serviço educacional"
  },
  {
    theme: "Sistemas de Informação para Gestão Educacional: SIGE, SIGAA e SUAP",
    centralQuestion: "Como sistemas acadêmicos organizam processos, dados e decisões em instituições educacionais complexas?",
    objectives: [
      "Definir SIGE e situar SIGAA e SUAP como exemplos concretos.",
      "Descrever a arquitetura modular de sistemas de gestão educacional.",
      "Comparar SIGAA e SUAP a partir de um caso real de decisão institucional.",
      "Analisar riscos de dependência técnica, implantação e resistência organizacional.",
      "Compreender Software Público Brasileiro e sua relação com a Rede Federal.",
      "Explicar integração entre sistemas acadêmicos, Educacenso e estatísticas oficiais.",
      "Problematizar personalização versus padronização em sistemas de larga escala."
    ],
    newConcepts: ["SIGE", "SIGAA", "SUAP", "ERP educacional", "arquitetura modular", "Software Público", "integração de sistemas"],
    sectionSequence: ["O que é um SIGE", "SIGAA e SUAP", "Arquitetura e módulos", "Implementação e fatores críticos", "Software Público", "Integração e estatísticas", "Personalização versus padronização"],
    arc: "estudo-de-caso",
    mustInclude: ["SIGAA", "SUAP", "ERP", "arquitetura modular", "Software Público Brasileiro", "Educacenso", "comparação com critérios explícitos"],
    doNotRepeat: "Não permanecer na história geral do Governo Digital; abrir o sistema, seus módulos, fluxos, dados e consequências organizacionais.",
    bridgeFromPrevious: "Aplicar interoperabilidade e maturidade da Semana 2 aos sistemas que registram a vida acadêmica.",
    bridgeToNext: "Os sistemas produzem dados; a próxima semana analisa como transformá-los em indicadores e decisões sem cair em vieses.",
    projectMilestone: "Matriz comparativa de sistemas e fluxos de dados"
  },
  {
    theme: "Dados, Indicadores e Learning Analytics: evidências, vieses e ética",
    centralQuestion: "Como transformar dados educacionais em evidências úteis sem confundir correlação, previsão e decisão justa?",
    objectives: [
      "Definir Learning Analytics e Mineração de Dados Educacionais.",
      "Analisar evasão como fenômeno multifatorial e indicador de gestão.",
      "Conhecer modelos reais de predição de evasão e seus limites.",
      "Analisar criticamente um caso documentado de falha algorítmica na educação.",
      "Aplicar o framework FATE a um projeto de análise de dados educacionais.",
      "Diferenciar indicador descritivo, sinal de risco, previsão e intervenção.",
      "Reconhecer desafios institucionais, vieses e efeitos de classificação."
    ],
    newConcepts: ["Learning Analytics", "EDM", "indicadores", "evasão", "modelos preditivos", "FATE", "xAPI", "viés algorítmico"],
    sectionSequence: ["Origem e definição", "Indicadores e evasão", "Modelos brasileiros", "Caso de falha", "Vieses e profecia autorrealizável", "FATE e governança", "xAPI e implementação", "Critérios de decisão"],
    arc: "analise-de-dados",
    mustInclude: ["Learning Analytics", "EDM", "evasão multifatorial", "modelo real", "caso de falha", "FATE", "limites éticos"],
    doNotRepeat: "Não ensinar novamente arquitetura de SIGE nem apresentar dashboards como solução pronta; concentrar-se em validade, evidência, viés e consequência.",
    bridgeFromPrevious: "Usar os dados produzidos por SIGAA, SUAP e integrações para discutir indicadores e análises.",
    bridgeToNext: "Os indicadores precisam ser comunicados para apoiar decisões; a próxima semana trata de visualização, ETL e dashboards.",
    projectMilestone: "Ficha crítica de um indicador educacional"
  },
  {
    theme: "Ferramentas e Dashboards: visualização, ETL e decisão",
    centralQuestion: "O que torna um dashboard educacional útil, compreensível, acessível e defensável para uma decisão real?",
    objectives: [
      "Aplicar princípios de visualização de dados de Tufte e Stephen Few.",
      "Reconhecer atributos pré-atentivos e gráficos enganosos.",
      "Comparar ferramentas de BI conforme contexto, manutenção e governança.",
      "Explicar como dados saem de SIGAA ou SUAP e chegam a um dashboard por ETL.",
      "Analisar um caso real de construção e validação de dashboard educacional.",
      "Diferenciar indicador útil de métrica de vaidade.",
      "Aplicar critérios de acessibilidade, privacidade e LGPD ao design de painéis."
    ],
    newConcepts: ["data-ink ratio", "chartjunk", "atributos pré-atentivos", "BI", "ETL", "camada semântica", "acessibilidade", "LGPD"],
    sectionSequence: ["Princípios antes da ferramenta", "Percepção e gráficos enganosos", "Caso de visualização", "Ferramentas de BI", "ETL e camada semântica", "Dashboard e decisão", "Acessibilidade e LGPD", "Preparação da prática"],
    arc: "oficina-aplicada",
    mustInclude: ["Tufte", "Stephen Few", "data-ink ratio", "ETL", "camada semântica", "caso de dashboard", "acessibilidade e LGPD"],
    doNotRepeat: "Não começar por uma lista de softwares; princípios, decisão, dados e usuários vêm antes da ferramenta.",
    bridgeFromPrevious: "Transformar indicadores e critérios éticos da Semana 4 em visualizações que apoiem decisões.",
    bridgeToNext: "A próxima semana/prática aplicará esses princípios em uma ferramenta e em um protótipo construído com apoio de IA.",
    projectMilestone: "Especificação de um dashboard institucional"
  },
  {
    theme: "Vibe Coding e o Futuro da Gestão Educacional: prototipagem, riscos e governança",
    centralQuestion: "Quando o Vibe Coding amplia a capacidade de inovação de um gestor e quando ele cria risco técnico, ético ou institucional?",
    objectives: [
      "Definir Vibe Coding e situar sua origem recente.",
      "Diferenciar Vibe Coding de Engenharia Agêntica.",
      "Analisar casos documentados de falhas de segurança em sistemas construídos com IA.",
      "Reconhecer dívida técnica, Shadow IT, privacidade e riscos de dados reais.",
      "Avaliar quando prototipagem assistida por IA é apropriada para um gestor educacional.",
      "Aplicar um framework de decisão para prototipar, validar, escalar ou encaminhar à TI.",
      "Preparar-se para a webprática de construção de dashboard ou ferramenta."
    ],
    newConcepts: ["Vibe Coding", "Engenharia Agêntica", "dívida técnica", "Shadow IT", "segurança", "prototipagem", "governança"],
    sectionSequence: ["Definição e origem", "Evolução para engenharia agêntica", "Ciclo de prototipagem", "Casos de falha", "Segurança e privacidade", "Quando usar e quando não usar", "Framework de decisão", "Preparação da prática"],
    arc: "debate-orientado",
    mustInclude: ["Andrej Karpathy", "Vibe Coding", "Engenharia Agêntica", "caso de falha verificável", "segurança", "privacidade", "framework de decisão"],
    doNotRepeat: "Não tratar IA como propaganda nem repetir a aula de dashboards; conectar a prática a critérios de segurança, validação e governança.",
    bridgeFromPrevious: "Usar a especificação de dashboard da Semana 5 como problema aplicado, sem expor dados pessoais reais.",
    bridgeToNext: "Fechar o percurso com uma decisão responsável sobre protótipo, evidência, manutenção e governança.",
    projectMilestone: "Framework de decisão para uso responsável de IA"
  }
];

const genericStages = [
  ["Fundamentos e linguagem do tema", "definir conceitos centrais, origem, problema e vocabulário"],
  ["Contexto, modelos e evolução", "situar o tema histórica, social ou institucionalmente e comparar modelos"],
  ["Sistemas, métodos e casos", "abrir o funcionamento do tema e analisar um caso contextualizado"],
  ["Dados, evidências e limites", "examinar evidências, indicadores, vieses, riscos e controvérsias"],
  ["Aplicação, ferramentas e decisão", "aplicar critérios a uma situação real antes de escolher ferramentas"],
  ["Síntese, projeto e uso responsável", "integrar conceitos, produzir uma decisão ou projeto e definir governança"]
];

function isManagementTechnologyCourse(input = {}) {
  const source = [input.title, input.discipline, input.content, ...(input.objectives || [])].join(" ").toLowerCase();
  return /gest[aã]o educacional|tecnologias para gest[aã]o|learning analytics|sige|sigaa|suap|governo digital/.test(source);
}

function genericWeek(input, index, weeks) {
  const [label, method] = genericStages[Math.min(index, genericStages.length - 1)];
  const objectives = list(input.objectives);
  const assigned = objectives.filter((_, objectiveIndex) => objectiveIndex % Math.max(1, weeks) === index).slice(0, 2);
  const focus = assigned.length ? `${label}: ${assigned[0].replace(/^(compreender|conhecer|entender|analisar|avaliar|aplicar)\s+/iu, "")}` : label;
  const generatedObjectives = [
    `Explicar os conceitos centrais de ${focus.toLowerCase()}.`,
    ...assigned,
    `Aplicar ${focus.toLowerCase()} a uma situação concreta do contexto de ${input.audience || "atuação do estudante"}.`,
    `Avaliar limites, riscos ou interpretações alternativas relacionados a ${focus.toLowerCase()}.`
  ].filter((item, itemIndex, all) => item && all.indexOf(item) === itemIndex).slice(0, 6);
  return {
    theme: `${text(input.title) || "Curso"}: ${focus}`,
    centralQuestion: `Como ${method} para compreender e agir melhor no tema desta semana?`,
    objectives: generatedObjectives,
    newConcepts: [focus, ...assigned],
    sectionSequence: ["Pergunta e contexto", "Conceitos centrais", "Modelo ou perspectiva", "Exemplo ou caso", "Aplicação orientada", "Limites e contrapontos", "Síntese"],
    arc: ["descoberta-conceitual", "estudo-de-caso", "analise-de-dados", "oficina-aplicada", "debate-orientado", "revisao-e-sintese"][index % 6],
    mustInclude: [focus, ...assigned, "exemplo contextualizado", "limite ou contraponto"],
    doNotRepeat: index ? `Não repetir o foco principal das semanas anteriores; avance a partir de ${label.toLowerCase()}.` : "Não antecipar aplicações complexas antes de construir o vocabulário básico.",
    bridgeFromPrevious: index ? `Retomar a ideia central da Semana ${index} sem reescrever sua explicação.` : "Abertura do curso; não há semana anterior.",
    bridgeToNext: index + 1 < weeks ? `Preparar os conceitos necessários para a Semana ${index + 2}.` : "Consolidar o percurso e indicar continuidade.",
    projectMilestone: `Evidência aplicada da etapa ${index + 1}`
  };
}

export function buildCourseProgression(input = {}) {
  const weeks = Math.max(1, Number(input.weeks) || 1);
  const source = isManagementTechnologyCourse(input) ? managementTechnologyTrack.slice(0, Math.min(weeks, managementTechnologyTrack.length)) : Array.from({ length: Math.min(weeks, genericStages.length) }, (_, index) => genericWeek(input, index, weeks));
  const result = source.map((week, index) => ({ weekNumber: index + 1, ...week }));
  while (result.length < weeks) {
    const index = result.length;
    result.push({ weekNumber: index + 1, ...genericWeek(input, index, weeks) });
  }
  return {
    courseTitle: text(input.title),
    weeks: result,
    rule: "Cada semana deve acrescentar conceitos novos, usar uma evidência própria e terminar preparando a próxima; não repetir a lista geral de objetivos como objetivos semanais."
  };
}

export function progressionForWeek(input, index = 0, progression = null) {
  const map = progression || buildCourseProgression(input);
  return map.weeks?.[index] || genericWeek(input, index, Math.max(1, Number(input.weeks) || 1));
}
