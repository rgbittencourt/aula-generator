const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const list = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : String(value ?? "").split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};

export const DEFAULT_ACADEMIC_PROFILE = Object.freeze({
  level: "graduação",
  discipline: "",
  depth: "aprofundado",
  targetWords: 2800,
  minimumSections: 6,
  minimumReferences: 4,
  primarySourcesRequired: 1,
  citationStyle: "autor-data",
  historicalScope: "",
  requiredAuthors: [],
  requiredFrameworks: [],
  avoidTopics: [],
  sourcePolicy: "usar somente fontes verificáveis e sinalizar pendências",
  requireCounterarguments: true,
  requireConceptComparison: true,
  requireCaseStudy: true
});

export function normalizeAcademicProfile(raw = {}, input = {}) {
  const source = object(raw);
  const level = text(source.level || input.academicLevel || input.level, DEFAULT_ACADEMIC_PROFILE.level);
  const normalizedLevel = level.toLowerCase();
  const inheritedDepth = normalizedLevel.includes("avanç") || normalizedLevel.includes("avanc") || normalizedLevel.includes("pós") || normalizedLevel.includes("pos") ? "avançado" : normalizedLevel.includes("inici") || normalizedLevel.includes("bás") || normalizedLevel.includes("bas") ? "básico" : DEFAULT_ACADEMIC_PROFILE.depth;
  const depth = text(source.depth, inheritedDepth);
  const hours = Math.max(0, Number(input.hoursPerWeek) || 0);
  const defaultWords = depth === "avançado" ? Math.max(3200, Math.round(hours * 700) || 3500) : depth === "básico" ? Math.max(1800, Math.round(hours * 500) || 2200) : Math.max(2400, Math.round(hours * 620) || 2800);
  return {
    level,
    discipline: text(source.discipline || input.discipline || input.title),
    depth,
    targetWords: clamp(source.targetWords, 1400, 7000, defaultWords),
    minimumSections: clamp(source.minimumSections, 4, 12, depth === "avançado" ? 7 : 6),
    minimumReferences: clamp(source.minimumReferences, 0, 20, depth === "avançado" ? 6 : 4),
    primarySourcesRequired: clamp(source.primarySourcesRequired, 0, 10, depth === "avançado" ? 2 : 1),
    citationStyle: text(source.citationStyle, DEFAULT_ACADEMIC_PROFILE.citationStyle),
    historicalScope: text(source.historicalScope),
    requiredAuthors: list(source.requiredAuthors),
    requiredFrameworks: list(source.requiredFrameworks),
    avoidTopics: list(source.avoidTopics),
    sourcePolicy: text(source.sourcePolicy, DEFAULT_ACADEMIC_PROFILE.sourcePolicy),
    requireCounterarguments: source.requireCounterarguments === undefined ? true : Boolean(source.requireCounterarguments),
    requireConceptComparison: source.requireConceptComparison === undefined ? true : Boolean(source.requireConceptComparison),
    requireCaseStudy: source.requireCaseStudy === undefined ? true : Boolean(source.requireCaseStudy)
  };
}

export const ACADEMIC_SYSTEM_PROMPT = `Você é um designer instrucional, autor acadêmico e revisor científico especializado em materiais educacionais de nível superior.

Sua tarefa é produzir conteúdo didático rigoroso, aprofundado, verificável, pedagogicamente estruturado e adequado ao público informado.

PRIORIDADES, NESTA ORDEM:
1. Correção conceitual e factual.
2. Coerência com o nível acadêmico e o público.
3. Profundidade explicativa.
4. Alinhamento entre objetivos, conteúdo, atividades, evidências e avaliação.
5. Clareza, progressão didática e legibilidade.
6. Rastreabilidade das fontes e transparência sobre incertezas.

REGRAS DE RIGOR ACADÊMICO:
- Defina os conceitos centrais antes de aplicá-los.
- Diferencie conceitos próximos, correntes teóricas e interpretações divergentes.
- Explique relações de causa, consequência, condição e limite.
- Não use frases genéricas como "é muito importante", "na sociedade atual" ou "cada vez mais relevante" sem explicar por quê.
- Não apresente opinião, hipótese ou interpretação como fato.
- Diferencie fato, interpretação, inferência, exemplo e recomendação.
- Inclua limites, controvérsias, contrapontos e interpretações alternativas quando pertinentes.
- Relacione cada conceito a exemplos concretos e contextualizados.
- Não substitua explicação por listas de tópicos nem faça uma compilação de definições.
- Não repita ideias para aumentar artificialmente o tamanho do texto.
- Nunca invente autores, livros, artigos, DOI, URLs, números, instituições, resultados ou dados estatísticos.
- Use somente fontes fornecidas pelo usuário ou candidatos retornados pelos provedores.
- Quando algo não puder ser confirmado, marque verificationStatus como needs-human-review e explique a pendência.
- Vídeos, blogs e páginas comerciais são complementares e não sustentam sozinhos afirmações acadêmicas importantes.
- Toda afirmação central deve estar apoiada por uma referência, um recurso verificável, um dado fornecido ou uma explicação identificada como exemplo.

HIERARQUIA PREFERENCIAL DE FONTES:
1. Artigos revisados por pares, livros acadêmicos e documentos oficiais.
2. Universidades, órgãos públicos, organismos internacionais e centros de pesquisa.
3. Relatórios técnicos de instituições reconhecidas.
4. Materiais profissionais e educacionais especializados.
5. Vídeos, blogs e páginas gerais somente como complemento.

REGRAS PEDAGÓGICAS:
- Escreva para o estudante, não apenas para o professor.
- Comece com uma pergunta, problema, situação ou contexto significativo.
- Desenvolva conceitos progressivamente, com exemplos e aplicação.
- Faça cada atividade produzir uma evidência concreta.
- Faça a avaliação verificar objetivos realmente trabalhados no texto.
- Não force vídeo, leitura, quiz ou webprática sem função didática.
- Insira recursos no ponto de uso, junto da seção correspondente.
- Se uma etapa for omitida, registre a justificativa.
- Mantenha separado o conteúdo do aluno e as orientações exclusivas do professor.

Responda somente JSON válido conforme o contrato solicitado. Nunca mostre sua verificação interna.`;

export function buildAcademicPlanPrompt(input, weekIndex = 0) {
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  const weekNumber = weekIndex + 1;
  return `Planeje academicamente a semana ${weekNumber} de ${input.weeks} antes da redação. Não escreva ainda a aula completa.

Retorne somente JSON com:
{
  "weekNumber": ${weekNumber},
  "theme": "título específico",
  "centralQuestion": "pergunta orientadora",
  "centralConcepts": ["conceitos que serão definidos"],
  "relatedConcepts": ["conceitos próximos ou relacionados"],
  "objectives": ["objetivos observáveis"],
  "sectionSequence": [{"number":"1","title":"...","purpose":"...","keyClaims":["..."],"example":"...","counterpoint":"..."}],
  "requiredSources": [{"topic":"...","sourceType":"...","reason":"..."}],
  "claimsRequiringEvidence": [{"id":"claim-01","claim":"...","sectionNumber":"1","sourceType":"..."}],
  "examples": ["exemplo contextualizado"],
  "controversies": ["limite ou interpretação alternativa"],
  "assessmentPlan": [{"objective":"...","evidence":"...","questionType":"..."}],
  "omissions": [{"phase":"...","reason":"..."}]
}

Perfil acadêmico configurado:
${JSON.stringify(profile, null, 2)}

Briefing:
${JSON.stringify({ title: input.title, audience: input.audience, level: input.level, discipline: profile.discipline, objectives: input.objectives, content: input.content, references: input.references }, null, 2)}

Regras: planeje uma progressão argumentativa real; não crie referências bibliográficas específicas sem fonte fornecida; inclua contrapontos quando o perfil exigir; não trate o planejamento como uma lista superficial.`;
}

export function normalizeAcademicPlan(raw = {}, input = {}, index = 0) {
  const source = object(raw);
  const sections = Array.isArray(source.sectionSequence) ? source.sectionSequence.map((section, sectionIndex) => {
    const item = object(section);
    return {
      number: text(item.number, String(sectionIndex + 1)),
      title: text(item.title, `Seção ${sectionIndex + 1}`),
      purpose: text(item.purpose),
      keyClaims: list(item.keyClaims || item.claims),
      example: text(item.example),
      counterpoint: text(item.counterpoint)
    };
  }) : [];
  return {
    weekNumber: Number(source.weekNumber || index + 1),
    theme: text(source.theme),
    centralQuestion: text(source.centralQuestion),
    centralConcepts: list(source.centralConcepts),
    relatedConcepts: list(source.relatedConcepts),
    objectives: list(source.objectives),
    sectionSequence: sections,
    requiredSources: Array.isArray(source.requiredSources) ? source.requiredSources.map((item) => ({ topic: text(item?.topic), sourceType: text(item?.sourceType), reason: text(item?.reason) })).filter((item) => item.topic || item.reason) : [],
    claimsRequiringEvidence: Array.isArray(source.claimsRequiringEvidence) ? source.claimsRequiringEvidence.map((item, claimIndex) => ({ id: text(item?.id, `claim-${String(claimIndex + 1).padStart(2, "0")}`), claim: text(item?.claim), sectionNumber: text(item?.sectionNumber), sourceType: text(item?.sourceType), supportLevel: "insufficient", verificationStatus: "needs-human-review", note: "A fonte precisa ser localizada e conferida." })).filter((item) => item.claim) : [],
    examples: list(source.examples),
    controversies: list(source.controversies),
    assessmentPlan: Array.isArray(source.assessmentPlan) ? source.assessmentPlan.map((item) => ({ objective: text(item?.objective), evidence: text(item?.evidence), questionType: text(item?.questionType) })).filter((item) => item.objective || item.evidence) : [],
    omissions: Array.isArray(source.omissions) ? source.omissions.map((item) => ({ phase: text(item?.phase), reason: text(item?.reason) })).filter((item) => item.phase || item.reason) : []
  };
}

export function normalizeAcademicReview(raw = {}) {
  const source = object(raw);
  const issues = Array.isArray(source.issues) ? source.issues.map((item, index) => ({
    id: text(item?.id, `review-issue-${index + 1}`),
    severity: text(item?.severity, "medium"),
    type: text(item?.type, "editorial"),
    sectionNumber: text(item?.sectionNumber),
    description: text(item?.description || item?.issue),
    suggestedRepair: text(item?.suggestedRepair || item?.repair)
  })).filter((item) => item.description) : [];
  return {
    status: text(source.status, issues.some((item) => item.severity === "high") ? "needs-revision" : "approved-with-review"),
    issues,
    strengths: list(source.strengths),
    unsupportedClaims: list(source.unsupportedClaims),
    rewriteRequired: Boolean(source.rewriteRequired || issues.some((item) => item.severity === "high")),
    checkedAt: new Date().toISOString()
  };
}

export function buildAcademicReviewPrompt(input, weekIndex, academicPlan, draft) {
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  return `Você é o revisor acadêmico e editor pedagógico final. Analise a semana ${weekIndex + 1} abaixo em relação ao planejamento, ao perfil acadêmico e ao briefing.

Retorne somente JSON:
{
  "status": "approved" | "approved-with-review" | "needs-revision",
  "strengths": ["..."],
  "issues": [{"severity":"high|medium|low","type":"unsupported-claim|superficiality|misalignment|invented-source|repetition|weak-example|missing-counterpoint|accessibility|other","sectionNumber":"...","description":"...","suggestedRepair":"..."}],
  "unsupportedClaims": ["claim sem sustentação"],
  "rewriteRequired": false
}

Verifique obrigatoriamente:
1. Cada conceito central está definido e explicado, não apenas enumerado.
2. As afirmações factuais possuem suporte ou estão explicitamente qualificadas.
3. Não existem autores, instituições, números, DOI ou URLs inventados.
4. Fatos, interpretações, exemplos e recomendações estão diferenciados.
5. Existe pelo menos um exemplo concreto e, quando exigido, estudo de caso contextualizado.
6. Existe limite, controvérsia ou contraponto quando o perfil exigir.
7. Cada objetivo aparece no conteúdo e tem atividade, evidência e questão de avaliação.
8. Os recursos estão no momento correto e têm função pedagógica.
9. O texto não é repetitivo, genérico ou artificialmente alongado.
10. A síntese fecha o raciocínio e a conexão com a próxima semana é coerente.
11. A linguagem atende ao nível acadêmico, à acessibilidade e ao público.

Perfil:
${JSON.stringify(profile, null, 2)}

Planejamento acadêmico:
${JSON.stringify(academicPlan, null, 2)}

Semana redigida:
${JSON.stringify(draft, null, 2)}`;
}

export function academicProfileSummary(input = {}) {
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  return `${profile.level} · ${profile.depth} · meta ${profile.targetWords} palavras · ${profile.minimumSections} seções · ${profile.minimumReferences} referências`;
}
