// Abordagem pedagógica e metodologias ativas.
//
// "atual": a geração segue exatamente como na v1.2.1 (nenhum bloco extra nos prompts).
// "nova": planejamento reverso (Wiggins & McTighe), objetivos com verbos observáveis e
// equilíbrio cognitivo (Bloom revisada, Anderson & Krathwohl), alinhamento construtivo
// (Biggs) e princípios de aprendizagem multimídia (Mayer) nos materiais.
// As metodologias ativas podem ser escolhidas por semana em qualquer abordagem.

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const PEDAGOGICAL_APPROACHES = Object.freeze([
  { id: "atual", label: "Atual (como na versão principal)" },
  { id: "nova", label: "Nova: planejamento reverso, Bloom e multimídia" }
]);

export const ACTIVE_METHODS = Object.freeze([
  {
    id: "sala-invertida",
    label: "Sala de aula invertida",
    hint: "O estudo vem antes; o tempo junto é para aplicar.",
    text: "O texto é o estudo prévio: deixe explícito, logo na abertura, que ele prepara uma tarefa de aplicação. Feche cada bloco de duas ou três seções com uma pergunta curta de autoverificação (\"Antes de seguir, você consegue…?\"). A síntese diz exatamente o que o estudante precisa trazer pronto para a aplicação.",
    activities: "Uma verificação rápida de leitura (quiz formativo curto ou 3 perguntas) que o estudante faz logo depois do texto; uma atividade principal de APLICAÇÃO do conteúdo a uma situação nova (fórum ou produto curto), que não seja possível responder só copiando o texto; se houver webprática na semana, ela é o momento síncrono de aplicação.",
    mediation: "Mostre ao professor como usar o resultado da verificação de leitura para decidir o que retomar antes da aplicação, e como reagir a quem chega sem ter estudado.",
    keywords: ["invertid", "prévi", "aplica"]
  },
  {
    id: "estudo-de-caso",
    label: "Estudo de caso",
    hint: "Um caso real ou realista conduz a semana.",
    text: "Construa a semana em torno de UM caso âncora, real (com fonte) ou explicitamente apresentado como caso ilustrativo. Apresente o caso cedo, com dados e dilemas suficientes para análise, e use os conceitos das seções seguintes para lê-lo. Não entregue a solução do caso no texto: deixe o dilema aberto para a atividade.",
    activities: "A atividade principal é a análise do caso: perguntas em níveis crescentes (o que aconteceu → por quê, à luz dos conceitos → o que você recomendaria e com que critérios), com entrega no fórum ou como produto curto, e critérios que valorizem o uso dos conceitos da semana.",
    mediation: "Dê ao professor perguntas de aprofundamento para o fórum, sinais de análise superficial (só resumir o caso) e como devolver a pergunta para o estudante pensar.",
    keywords: ["caso"]
  },
  {
    id: "pbl",
    label: "Aprendizagem Baseada em Problemas (ABP/PBL)",
    hint: "Um problema aberto vem antes da teoria.",
    text: "Abra a semana com um problema aberto e contextualizado, sem resposta única, ANTES de apresentar os conceitos. Em seguida, organize as seções como as perguntas que alguém precisaria responder para enfrentar esse problema. Não resolva o problema no texto.",
    activities: "Estruture a atividade principal nas etapas da ABP: (1) o que já sabemos e o que precisamos descobrir, (2) investigação orientada com as seções e os recursos da semana, (3) proposta de solução justificada, (4) reflexão sobre o que foi aprendido. Critérios avaliam a qualidade da justificativa, não a resposta \"certa\".",
    mediation: "Oriente o professor a atuar como tutor: perguntas que destravam sem dar a resposta, sinais de grupo/estudante travado e como ajustar o escopo do problema.",
    keywords: ["problema"]
  },
  {
    id: "projetos",
    label: "Aprendizagem Baseada em Projetos",
    hint: "A semana avança uma entrega de um projeto maior.",
    text: "Deixe claro qual parte do projeto da disciplina esta semana faz avançar e por quê. Cada seção deve contribuir para essa entrega parcial; use exemplos do tipo de produto que o estudante vai construir.",
    activities: "A atividade principal é uma ENTREGA PARCIAL do projeto (marco desta semana), com checklist do que entregar, rubrica com critérios observáveis e um espaço de feedback entre pares ou do professor antes da versão final.",
    mediation: "Mostre ao professor como acompanhar o marco: o que conferir na entrega parcial, sinais de projeto desalinhado e como dar feedback que o estudante consiga usar na próxima etapa.",
    keywords: ["projeto", "entrega"]
  },
  {
    id: "peer-instruction",
    label: "Instrução por pares (Peer Instruction)",
    hint: "Questões conceituais, discussão entre pares e nova resposta.",
    text: "Destaque, em cada seção, o ponto conceitual que costuma ser mal entendido e explique por que a confusão acontece; isso alimenta as questões conceituais da semana.",
    activities: "Questões conceituais (não de memorização) com alternativas que representem as confusões reais; o fluxo é: responder sozinho → discutir com colegas no fórum, justificando → responder de novo. Em EaD, adapte a votação para quiz e a discussão para fórum; se houver webprática, use o ciclo completo ao vivo.",
    mediation: "Explique ao professor como ler a distribuição das respostas (muitos acertos: avançar; dividido: discussão entre pares; muitos erros: retomar o conceito) e como conduzir a rodada de discussão.",
    keywords: ["pares", "conceitua"]
  },
  {
    id: "gamificacao",
    label: "Gamificação",
    hint: "Missões, níveis e feedback imediato ligados aos objetivos.",
    text: "Mantenha o texto acadêmico, mas apresente o percurso da semana como uma sequência de missões ligadas aos objetivos, anunciadas na abertura.",
    activities: "Organize as atividades como missões em níveis (do básico ao desafio), cada uma ligada a um objetivo, com feedback imediato e pontuação ou insígnia por missão. A pontuação nunca substitui os critérios de aprendizagem: deixe claro o que conta para a nota.",
    mediation: "Dê ao professor orientações para manter o engajamento sem competição excessiva e para acolher quem fica para trás nas missões.",
    keywords: ["missão", "missões", "nível", "níveis"]
  },
  {
    id: "juri-simulado",
    label: "Júri simulado / debate",
    hint: "Posições em disputa, com argumentos fundamentados.",
    text: "Apresente a questão controversa da semana de forma justa, com os melhores argumentos de cada lado e as evidências que os sustentam, sem tomar partido no texto.",
    activities: "Defina a questão do júri ou do debate, os papéis (defesa, acusação, jurados ou equivalentes), o material-base de cada lado (seções do texto e recursos), o roteiro das rodadas e os critérios de avaliação dos argumentos. Em EaD, adapte para fórum em rodadas ou para a webprática.",
    mediation: "Oriente o professor a mediar o debate com respeito, a cobrar evidência em cada argumento e a fazer o fechamento que reconcilia as posições com os objetivos.",
    keywords: ["júri", "juri", "debate", "argument"]
  },
  {
    id: "rotacao-estacoes",
    label: "Rotação por estações",
    hint: "Três ou quatro estações com tarefas diferentes.",
    text: "Organize as seções de modo que possam ser estudadas como estações relativamente independentes, cada uma com uma tarefa própria ao final.",
    activities: "De 3 a 4 estações com tarefas diferentes (por exemplo: leitura com perguntas, vídeo com análise, exercício prático, discussão), tempo sugerido e produto de cada uma; ao final, uma síntese que integre as estações. Funciona melhor no presencial ou na webprática; em EaD assíncrona, transforme as estações em trilhas da semana.",
    mediation: "Explique ao professor como organizar o tempo e os grupos, e como fazer o fechamento que integra o que foi visto em cada estação.",
    keywords: ["estaç", "trilha"]
  },
  {
    id: "design-thinking",
    label: "Design thinking",
    hint: "Empatia, definição, ideação e protótipo.",
    text: "Apresente um desafio real centrado em pessoas e use as seções para dar os conceitos necessários a cada fase (empatia, definição, ideação, protótipo e teste).",
    activities: "Estruture a atividade principal nas fases do design thinking, com uma entrega curta por fase (mapa de empatia, pergunta \"Como poderíamos…?\", ideias, protótipo simples) e critérios que valorizem a ligação com o usuário real.",
    mediation: "Oriente o professor a manter o foco no usuário, a evitar soluções prontas cedo demais e a dar feedback sobre o protótipo.",
    keywords: ["empatia", "protótipo", "prototip", "como poderíamos"]
  }
]);

export const METHOD_CHOICES = Object.freeze([
  { id: "nenhuma", label: "Nenhuma específica" },
  { id: "auto", label: "A IA escolhe e justifica" },
  ...ACTIVE_METHODS.map(({ id, label }) => ({ id, label }))
]);

const methodById = (id) => ACTIVE_METHODS.find((method) => method.id === id) || null;
const validChoice = (id) => METHOD_CHOICES.some((choice) => choice.id === id);

export function normalizeApproach(value) {
  const raw = text(value).toLowerCase();
  return PEDAGOGICAL_APPROACHES.some((approach) => approach.id === raw) ? raw : "atual";
}

export function normalizeMethodologyPlan(raw = {}, weeks = 1) {
  const source = object(raw);
  const defaultMethod = validChoice(text(source.default)) ? text(source.default) : "nenhuma";
  const entries = Array.isArray(source.weeks) ? source.weeks : [];
  const byWeek = new Map();
  entries.forEach((entry) => {
    const weekNumber = Number(object(entry).weekNumber || object(entry).week);
    const method = text(object(entry).method);
    if (Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= weeks && method && validChoice(method)) byWeek.set(weekNumber, method);
  });
  return { default: defaultMethod, weeks: [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([weekNumber, method]) => ({ weekNumber, method })) };
}

// Metodologia em vigor numa semana: a escolha específica da semana ou, se não houver, o padrão do curso.
export function methodForWeek(input = {}, index = 0) {
  const plan = object(input.methodologyPlan);
  const specific = (Array.isArray(plan.weeks) ? plan.weeks : []).find((entry) => Number(entry.weekNumber) === index + 1);
  const id = text(specific?.method || plan.default || "nenhuma");
  if (id === "auto") return { id: "auto", label: "A IA escolhe e justifica", method: null };
  const method = methodById(id);
  return method ? { id: method.id, label: method.label, method } : { id: "nenhuma", label: "Nenhuma específica", method: null };
}

export function isNewApproach(input = {}) {
  return normalizeApproach(input.pedagogicalApproach) === "nova";
}

// ---------- Taxonomia de Bloom revisada ----------

export const BLOOM_LEVELS = Object.freeze(["lembrar", "entender", "aplicar", "analisar", "avaliar", "criar"]);

const BLOOM_VERBS = {
  lembrar: ["listar", "nomear", "identificar", "reconhecer", "definir", "citar", "recordar", "enumerar", "localizar", "indicar", "apontar", "memorizar"],
  entender: ["explicar", "descrever", "resumir", "interpretar", "classificar", "exemplificar", "parafrasear", "ilustrar", "caracterizar", "situar", "conceituar", "discutir", "inferir", "traduzir"],
  aplicar: ["aplicar", "executar", "usar", "utilizar", "implementar", "calcular", "resolver", "demonstrar", "empregar", "operar", "simular", "realizar", "praticar", "mapear", "preencher", "configurar"],
  analisar: ["analisar", "comparar", "diferenciar", "distinguir", "organizar", "examinar", "investigar", "relacionar", "contrastar", "categorizar", "problematizar", "diagnosticar", "decompor", "correlacionar", "testar"],
  avaliar: ["avaliar", "julgar", "criticar", "justificar", "argumentar", "defender", "verificar", "priorizar", "decidir", "recomendar", "validar", "selecionar", "posicionar-se", "ponderar", "monitorar"],
  criar: ["criar", "elaborar", "planejar", "propor", "projetar", "construir", "desenvolver", "produzir", "formular", "compor", "redigir", "conceber", "prototipar", "desenhar", "estruturar", "gerar", "sistematizar"]
};

export const VAGUE_VERBS = Object.freeze(["compreender", "conhecer", "entender", "saber", "aprender", "apreciar", "perceber", "familiarizar-se", "familiarizar", "conscientizar-se", "conscientizar", "refletir", "estudar", "ver"]);

const VERB_LEVEL = new Map(Object.entries(BLOOM_VERBS).flatMap(([level, verbs]) => verbs.map((verb) => [verb, level])));

// Primeiro verbo do objetivo, ignorando aberturas como "Ao final, o estudante será capaz de".
export function objectiveVerb(objective) {
  const cleaned = text(objective).toLowerCase()
    .replace(/^[-•*\d.)\s]+/, "")
    .replace(/^(ao final[^,:]*[,:]\s*)?((o|a) (estudante|aluno|aluna|participante|cursista)\s+)?(ser[áa] capaz de|poder[áa]|deve(r[áa])?)\s+/, "")
    .replace(/^ser capaz de\s+/, "");
  const match = cleaned.match(/^[a-zà-ú]+(-se)?/);
  return match ? match[0] : "";
}

export function bloomLevel(objective) {
  const verb = objectiveVerb(objective);
  if (!verb) return null;
  if (VAGUE_VERBS.includes(verb)) return "vago";
  return VERB_LEVEL.get(verb) || VERB_LEVEL.get(verb.replace(/-se$/, "")) || null;
}

export function bloomProfile(objectives = []) {
  const list = (Array.isArray(objectives) ? objectives : []).map(text).filter(Boolean);
  const items = list.map((objective) => ({ objective, verb: objectiveVerb(objective), level: bloomLevel(objective) }));
  const vague = items.filter((item) => item.level === "vago");
  const higher = items.filter((item) => ["aplicar", "analisar", "avaliar", "criar"].includes(item.level));
  return { items, vague, higher };
}

// ---------- Blocos de prompt ----------

const MAYER_TEXT = `(Estes princípios valem sem mudar a voz descrita no guia: prosa corrida, de professor conversando com a turma.)
- Pré-treino: defina cada termo técnico na primeira vez que ele aparece, em linguagem simples, antes de usá-lo num raciocínio.
- Sinalização discreta: o leitor precisa saber, logo no começo de cada seção, que pergunta ela responde. Diga isso com naturalidade, não com fórmula ("Nesta seção veremos…" é proibido).
- Coerência: corte o que não serve a nenhum objetivo; o tamanho vem de desenvolvimento (caso, exemplo, contraexemplo), nunca de enfeite ou repetição.
- Contiguidade: figura, tabela ou recurso 🔎 fica junto do parágrafo que o explica.
- Personalização: fale com o estudante (você, vocês, a gente), como numa boa aula.`;

// Voz humana: marcas típicas de texto gerado por IA em português, que o professor percebe na hora.
export const AI_CLICHES = Object.freeze([
  "além disso", "nesse sentido", "dessa forma", "desse modo", "vale ressaltar", "vale destacar", "é importante ressaltar", "é importante destacar",
  "é fundamental", "é crucial", "é essencial", "em resumo", "em suma", "em síntese,", "neste contexto", "nesse contexto", "no cenário atual",
  "nos dias de hoje", "cada vez mais", "desempenha um papel", "papel crucial", "papel fundamental", "não se trata apenas", "mais do que nunca",
  "no mundo atual", "em um mundo", "por fim, mas não menos importante", "mergulhar", "jornada", "desbravar", "potencializar", "alavancar",
  "nesta seção, veremos", "nesta seção veremos", "como vimos anteriormente", "imagine que você", "a chave para", "ferramenta poderosa"
]);

export function aiClicheReport(textValue = "") {
  const plain = String(textValue || "").toLowerCase();
  const words = plain.split(/\s+/).filter(Boolean).length || 1;
  const hits = AI_CLICHES.map((term) => ({ term, count: plain.split(term).length - 1 })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const total = hits.reduce((sum, item) => sum + item.count, 0);
  return { total, perThousand: Math.round((total / words) * 10000) / 10, hits };
}

const HUMAN_VOICE = `VOZ HUMANA (o texto precisa soar como um professor de verdade escrevendo, não como IA)
- Proibido usar: ${AI_CLICHES.map((term) => `"${term}"`).join(", ")}. Encadeie as ideias pelo próprio raciocínio (por isso, só que, aí está o problema, repare que), não por conectivos de redação.
- Abra cada seção com algo concreto (uma situação de sala de aula ou de trabalho, um erro comum, um dado, uma pergunta que o estudante faria), não com definição de dicionário.
- Varie de verdade o ritmo: frases curtas ao lado de períodos longos; nem todo parágrafo termina com uma "lição" ou moral.
- Nada de trios automáticos ("rápido, eficiente e seguro"), de "não é só X, é Y" nem de dois-pontos dramáticos em série. Negrito só para termo novo e para a ideia que o estudante precisa guardar, no máximo uma por seção.
- Use exemplos com cara de Brasil e da área do curso (instituições, sistemas, situações reais do público do briefing). Não invente histórias pessoais do professor ("certa vez, em minha turma…"): use situações típicas ("é comum, em sala, alguém perguntar…").
- Antes de entregar, releia como se fosse o estudante: se uma frase poderia estar em qualquer texto sobre qualquer assunto, reescreva-a com o assunto desta aula.`;

function methodText(choice) {
  if (choice.id === "auto") return `METODOLOGIA ATIVA DESTA SEMANA: a IA escolhe (ela será definida junto com as atividades). Escreva o texto de modo que prepare o estudante para uma atividade de aplicação, análise ou criação, e não só para lembrar.`;
  if (!choice.method) return "";
  return `METODOLOGIA ATIVA DESTA SEMANA: ${choice.method.label}
${choice.method.text}
As atividades e a mediação da semana serão montadas depois, a partir deste texto, seguindo a mesma metodologia.`;
}

// Bloco acrescentado ao prompt de redação (texto do estudante).
export function writerMethodologyBlock(input = {}, index = 0) {
  const choice = methodForWeek(input, index);
  const parts = [];
  if (isNewApproach(input)) {
    parts.push(`ABORDAGEM PEDAGÓGICA (planejamento reverso, objetivos observáveis e aprendizagem multimídia)
- Planeje de trás para frente: antes de escrever, defina para si qual evidência o estudante vai produzir para cada objetivo (a avaliação e as atividades desta semana serão geradas depois, a partir deste texto, e vão cobrar exatamente isso). Toda seção precisa preparar para pelo menos uma dessas evidências; se uma seção não serve a nenhum objetivo, ela não entra.
- Objetivos: mantenha a intenção dos objetivos recebidos, mas, se algum começar com verbo vago (compreender, conhecer, entender, saber, aprender, perceber, refletir), reescreva-o com um verbo observável equivalente (explicar, comparar, aplicar, analisar, avaliar, propor…). Garanta que pelo menos um objetivo da semana esteja em nível de aplicação ou acima (aplicar, analisar, avaliar ou criar).
- Na síntese, diga com clareza o que o estudante deve ser capaz de FAZER ao final da semana, ligado aos objetivos.
PRINCÍPIOS DE APRENDIZAGEM MULTIMÍDIA NO TEXTO
${MAYER_TEXT}

${HUMAN_VOICE}`);
  }
  const method = methodText(choice);
  if (method) parts.push(method);
  return parts.join("\n\n");
}

// Bloco acrescentado ao prompt das peças derivadas (avaliação, atividades, mediação, explicações).
export function derivativesMethodologyBlock(input = {}, index = 0, wants = {}) {
  const choice = methodForWeek(input, index);
  const parts = [];
  if (isNewApproach(input) && (wants.assessment || wants.activities)) {
    parts.push(`ALINHAMENTO CONSTRUTIVO (abordagem nova)
- Cada objetivo precisa de pelo menos uma atividade e de pelo menos uma questão que exijam o MESMO nível de pensamento do verbo do objetivo: se o objetivo pede "analisar", a questão não pode pedir só "lembrar"; se pede "propor", a atividade precisa gerar uma proposta.
- Distribua as questões entre os níveis dos objetivos (Bloom revisada): não mais que duas questões só de memorização.
- Os critérios das atividades descrevem o que se observa na produção do estudante, com os verbos dos objetivos.`);
  }
  if (wants.activities) {
    if (choice.method) {
      parts.push(`METODOLOGIA ATIVA DESTA SEMANA: ${choice.method.label}
ATIVIDADES: ${choice.method.activities}
Inclua no JSON "activeMethodology": { "id": "${choice.method.id}", "label": "${choice.method.label}", "rationale": "por que ela serve aos objetivos desta semana, em 1 ou 2 frases", "howApplied": "como as atividades desta semana aplicam a metodologia, em 2 a 4 frases", "modalityNote": "adaptação para EaD ou para a webprática, se necessária" }.`);
    } else if (choice.id === "auto") {
      parts.push(`METODOLOGIA ATIVA DESTA SEMANA: escolha UMA destas, a que melhor servir aos objetivos e ao texto: ${ACTIVE_METHODS.map((method) => method.label).join("; ")}. Estruture as atividades por ela.
Inclua no JSON "activeMethodology": { "id": "identificador curto", "label": "nome da metodologia escolhida", "rationale": "por que ela serve aos objetivos desta semana, em 1 ou 2 frases", "howApplied": "como as atividades aplicam a metodologia, em 2 a 4 frases", "modalityNote": "adaptação para EaD ou para a webprática, se necessária" }.`);
    }
  }
  if ((wants.mediation || wants.explain) && choice.method) {
    parts.push(`MEDIAÇÃO DA METODOLOGIA (${choice.method.label}): ${choice.method.mediation}`);
  }
  return parts.join("\n\n");
}

// Bloco para roteiros de vídeo e slides (abordagem nova).
export function productionMethodologyBlock(input = {}) {
  if (!isNewApproach(input)) return "";
  return `PRINCÍPIOS DE APRENDIZAGEM MULTIMÍDIA (obrigatórios)
- Redundância: a narração explica; o slide não repete a narração palavra por palavra. Não leia os tópicos do slide.
- Modalidade: prefira imagem/diagrama + narração a texto + narração.
- Segmentação: a cada 3 ou 4 minutos de fala, uma pausa explícita ("antes de seguir, pense em…") ou uma pergunta de verificação; o vídeo deve poder ser cortado nesses pontos.
- Sinalização: anuncie no início o que será visto e marque cada mudança de parte.
- Coerência: nada de efeito, música ou imagem decorativa que não ajude a entender.
- Personalização: fale com o estudante, em primeira e segunda pessoa.
- Voz humana: nada de "além disso", "vale ressaltar", "é fundamental", "nesse contexto", "em suma", "no cenário atual", "jornada", "mergulhar"; fale como o professor falaria gravando para a turma dele.`;
}

// ---------- Webpráticas (sessões síncronas) ----------

// Metodologia de uma webprática: "semana" (ou vazio) herda a metodologia da semana em que ela acontece.
export function methodForPractice(practice = {}, input = {}, index = 0) {
  const id = text(object(practice).methodology);
  if (!id || id === "semana") return { ...methodForWeek(input, index), inherited: true };
  if (id === "auto") return { id: "auto", label: "A IA escolhe e justifica", method: null, inherited: false };
  const method = methodById(id);
  return method ? { id: method.id, label: method.label, method, inherited: false } : { id: "nenhuma", label: "Nenhuma específica", method: null, inherited: false };
}

// Bloco acrescentado às regras da webprática: uma orientação por sessão agendada.
export function webPracticeMethodologyBlock(input = {}, index = 0, practices = []) {
  const lines = (Array.isArray(practices) ? practices : []).map((practice, position) => {
    const choice = methodForPractice(practice, input, index);
    const name = text(practice.title || practice.sessionTitle) || `Webprática ${position + 1}`;
    if (choice.id === "nenhuma") return "";
    if (choice.id === "auto") return `- "${name}": escolha UMA destas metodologias, a que melhor servir ao objetivo da sessão: ${ACTIVE_METHODS.map((method) => method.label).join("; ")}. Organize os passos (steps) pelas etapas dela.`;
    return `- "${name}": ${choice.method.label}. ${choice.method.activities} Como é uma sessão ao vivo, use a versão síncrona completa da metodologia (sem as adaptações para fórum) e faça os passos (steps), com seus minutos, seguirem as etapas dela. Mediação: ${choice.method.mediation}`;
  }).filter(Boolean);
  if (!lines.length) return "";
  return `METODOLOGIA ATIVA DAS WEBPRÁTICAS (sessões síncronas)
${lines.join("\n")}
Em cada projeto com metodologia, inclua "activeMethodology": { "label": "nome da metodologia", "rationale": "por que ela serve ao objetivo da sessão, em 1 ou 2 frases", "howApplied": "como os passos da sessão aplicam a metodologia, em 2 a 4 frases" }.`;
}

// Regra extra para "Preencher vazios com IA" (abordagem nova): objetivos pela Taxonomia de Bloom revisada.
export function briefingObjectivesRule(input = {}) {
  if (!isNewApproach(input)) return "";
  return `
OBJETIVOS PELA TAXONOMIA DE BLOOM REVISADA (obrigatório nesta abordagem):
- Cada objetivo começa com UM verbo observável no infinitivo, seguido do objeto e do contexto (ex.: "Comparar SIGAA e SUAP quanto a ... no contexto de ...").
- Proibido começar com verbo vago: compreender, conhecer, entender, saber, aprender, perceber, refletir, familiarizar-se.
- Faça os objetivos progredirem ao longo do curso, dos níveis mais simples aos mais complexos: no máximo um objetivo de lembrar/entender (identificar, explicar, descrever…); os demais em aplicar (aplicar, resolver, utilizar…), analisar (comparar, analisar, diferenciar…), avaliar (avaliar, justificar, argumentar…) e criar (elaborar, propor, planejar…). Pelo menos um objetivo deve ser de avaliar ou criar.
- Ajuste o teto ao nível da turma: pós-graduação e superior chegam a avaliar/criar; FIC e cursos introdutórios podem parar em aplicar/analisar.
- Não escreva o nome do nível no texto do objetivo; o verbo já o indica.`;
}

// ---------- Guia de aplicação da metodologia (Material de Mediação) ----------

export const METHODOLOGY_GUIDE_SPEC = `  "teacherGuide": {
    "methodologyGuide": {
      "method": "nome da metodologia",
      "whatItIs": "o que é, em 2 ou 3 frases simples, para quem nunca usou",
      "whyHere": "por que ela serve aos objetivos DESTA semana, em 2 frases",
      "beforeTheWeek": ["o que o professor prepara antes de abrir a semana (materiais, avisos, ajustes no Moodle)"],
      "phases": [ { "name": "nome da etapa (ex.: Antes do encontro: estudo prévio)", "when": "quando, no calendário da semana (ex.: dias 1 a 3)", "goal": "para que serve esta etapa", "teacherActions": ["o que o professor faz"], "studentActions": ["o que o estudante faz"], "materials": ["o que é usado: seção do texto, vídeo, quiz, fórum, webprática"] } ],
      "studentInstructions": "texto pronto para postar no Moodle explicando ao estudante como a semana vai funcionar com esta metodologia: o que fazer, em que ordem e por quê (de 80 a 150 palavras, tom acolhedor, sem jargão)",
      "monitoring": [ { "indicator": "o que acompanhar (ex.: quantos fizeram o quiz de verificação)", "howToCheck": "onde e como ver isso (relatório do Moodle, fórum, respostas)", "when": "quando olhar", "ifLow": "o que fazer se estiver abaixo do esperado" } ],
      "successSignals": ["sinal observável de que a metodologia está funcionando"],
      "warningSignals": [ { "signal": "sinal de que não está funcionando", "action": "o que fazer, concretamente" } ],
      "assessment": { "howToAssess": "como avaliar se os estudantes aprenderam com esta metodologia (o que conta, o que não conta)", "criteria": [ { "criterion": "critério observável", "evidence": "evidência na produção do estudante" } ] },
      "pitfalls": ["erro comum de quem aplica esta metodologia pela primeira vez, e como evitar"],
      "adaptations": { "ead": "como fica 100% a distância e assíncrono", "synchronous": "como aproveitar um encontro ao vivo ou a webprática", "largeClass": "ajuste para turma grande ou pouco participativa" }
    }
  }`;

export function methodologyGuideRules(input = {}, index = 0, plan = {}) {
  const choice = methodForWeek(input, index);
  const declared = plan.activeMethodology && typeof plan.activeMethodology === "object" ? plan.activeMethodology : {};
  const method = choice.method || ACTIVE_METHODS.find((item) => item.label === text(declared.label) || item.id === text(declared.id)) || null;
  const label = method ? method.label : text(declared.label) || "a metodologia ativa escolhida para a semana";
  const activities = (Array.isArray(plan.activities) ? plan.activities : []).slice(0, 6).map((activity) => ({ titulo: text(activity.title), tipo: text(activity.type), instrucoes: text(activity.instructions).slice(0, 500), evidencia: text(activity.evidence) }));
  return `REGRAS DO GUIA DE APLICAÇÃO DA METODOLOGIA
- Metodologia desta semana: ${label}.${declared.howApplied ? ` Como as atividades já geradas a aplicam: ${text(declared.howApplied)}` : ""}${method ? `\n- Referência da metodologia: ${method.text} ${method.activities} ${method.mediation}` : ""}
- O leitor é o professor que talvez nunca tenha usado esta metodologia: o guia precisa dizer COMO aplicar, QUANDO cada etapa acontece, DE QUE JEITO conduzir e COMO saber se está funcionando. Seja concreto e prático; nada de definição genérica de manual.
- Amarre tudo ao que esta semana já tem: as seções do texto, as atividades abaixo, o quiz, o fórum, os vídeos e a webprática, se houver. Use os nomes reais delas. Não invente atividade nova sem dizer que é sugestão opcional.
- "phases": de 3 a 5 etapas em ordem cronológica, cobrindo antes, durante e depois. Cada uma com ações do professor e do estudante.
- "monitoring": de 3 a 5 indicadores que o professor consegue de fato ver no Moodle ou na turma. "warningSignals": de 3 a 5, cada um com ação concreta.
- Escreva em português do Brasil, de colega para colega, sem jargão vazio.
${activities.length ? `ATIVIDADES JÁ GERADAS PARA A SEMANA:\n${JSON.stringify(activities, null, 2)}` : ""}`;
}
