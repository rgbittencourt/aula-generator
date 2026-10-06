import { KNOWN_BLOCK_TYPES, normalizeLesson, normalizeWeeklyOutput, practiceScheduledForWeek, resourcePlanForWeek } from "./aula-schema.js";
import { measureLessonQuality, qualityPromptGuidance, qualityTargets } from "./content-quality.js";
import { buildTeacherGuide } from "./teacher-guide.js";
import { ACADEMIC_SYSTEM_PROMPT, buildAcademicPlanPrompt, buildAcademicReviewPrompt, normalizeAcademicPlan, normalizeAcademicReview, normalizeAcademicProfile } from "./academic.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";
import { applyCompositionInstruction, compositionPlanForWeek } from "./composition.js";
import { callJson } from "./ai-client.js";
import { selectResourcesWithAI } from "./resource-curator.js";
export { selectResourcesWithAI };

export function buildBriefingPrompt(input, missingFields = []) {
  const compactInput = compactBriefingInput(input, missingFields);
  const requestedPracticeCount = Array.isArray(input.webPractices) ? input.webPractices.length : 0;
  return `Atue como designer instrucional e assistente de planejamento de curso. Complete somente os campos que estão vazios no briefing abaixo. Responda somente JSON válido com estas propriedades: audience (string), objectives (array de strings), content (string), webPractices (array de objetos), materials (array de objetos), references (array de strings), videoSearchSuggestions (array de strings), imageSearchSuggestions (array de strings), notes (array de strings).

Campos que precisam de preenchimento: ${missingFields.length ? missingFields.join(", ") : "nenhum; apenas revise e sugira melhorias"}.

Regras:
- não altere nem repita informações que já foram fornecidas;
- escreva em português do Brasil, com linguagem humana, clara e pedagogicamente útil;
- produza objetivos observáveis, progressivos e adequados ao público e ao nível;
- organize o conteúdo em uma sequência didática coerente com o número de semanas e a carga horária;
- examine também cada item de webPractices pelo índice informado em "Campos que precisam de preenchimento". Preserve id, título, agenda e qualquer valor já fornecido; complete somente as propriedades vazias daquela webprática, sem substituir uma sessão existente por outra;
- considere títulos automáticos como "Webprática 1", "Webprática 2" e semelhantes como placeholders, não como títulos fornecidos, quando o campo title estiver listado para preenchimento;
- respeite o academicProfile recebido, especialmente profundidade, quantidade de seções, referências e exigência de contrapontos;
- se webpráticas estiverem ativadas, gere no mínimo uma e, quando pedagogicamente justificável, várias práticas distintas. Cada objeto deve conter title, type, modality, weekNumber/date quando disponível, startTime/endTime quando disponíveis, platform/tool, context, problem, objective, preparation, teacherPreparation, studentPreparation, materials, instructions, steps, product, criteria, rubric, assessment, continuation, fallbackPlan, prompts, artifacts, resources, roteiro com blocos cronometrados e durationMinutes;
- trate cada webprática como aula síncrona ou laboratório independente, com roteiro operacional próprio; nunca a transforme em leitura, seção, atividade ou bloco do texto-base semanal;
- alinhe cada webprática a objetivos e conteúdos específicos, distribuindo-as em semanas e datas coerentes do calendário;
- quando uma webprática já existir parcialmente, devolva o mesmo item/id e preencha os campos solicitados, especialmente título, semana/data, ferramenta, objetivo, contexto, preparação, materiais, produto e plano B. Não crie uma segunda prática para substituir a primeira;
- gere materiais de apoio como objetos com type, title, link, moment, required, objective, alignment, use, pages, durationMinutes e notes. Eles devem servir aos objetivos e conteúdos, indicar por que serão usados, em que momento entram e como o estudante trabalhará com eles;
- para referências e artigos, sugira obras, autores, documentos ou fontes que o professor deve conferir; não invente URLs, DOI, páginas ou dados bibliográficos específicos;
- para vídeos e imagens, gere termos de busca e intenção pedagógica; use links somente quando já tiverem sido fornecidos pelo usuário;
- não preencha nome de autor ou instituição, pois esses dados devem vir do usuário;
- não escreva markdown fora das strings do JSON.
- mantenha as respostas concisas: no máximo 6 objetivos, 8 materiais, 8 referências e 8 termos de busca de cada tipo; complete somente os campos listados e preserve os demais valores;
- QUANTIDADE DE WEBPRÁTICAS: o briefing recebeu ${requestedPracticeCount} item(ns). Se esse número for maior que zero, retorne exatamente ${requestedPracticeCount} webprática(s), na mesma ordem e preservando cada id; nunca reduza a lista a uma só prática e nunca descarte um item parcialmente preenchido. Se o número for zero e as webpráticas estiverem ativadas, crie pelo menos uma.

Contexto essencial do briefing atual (campos extensos e configurações não relacionadas foram omitidos para manter a solicitação dentro do limite do modelo):
${JSON.stringify(compactInput, null, 2)}

Retorne JSON válido agora.`;
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function stringList(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function safeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clipText(value, limit = 600) {
  const source = text(value);
  return source.length > limit ? `${source.slice(0, Math.max(0, limit - 1)).trim()}…` : source;
}
function compactList(value, itemLimit = 8, textLimit = 240) {
  return (Array.isArray(value) ? value : stringList(value)).slice(0, itemLimit).map((item) => clipText(item, textLimit)).filter(Boolean);
}
function compactBriefingPractice(practice = {}, index = 0) {
  return {
    id: text(practice.id) || `webpractice-${index + 1}`,
    title: clipText(practice.title, 140),
    type: clipText(practice.type, 100),
    modality: clipText(practice.modality, 120),
    weekNumber: safeNumber(practice.weekNumber, 0),
    date: clipText(practice.date, 40),
    dayOfWeek: clipText(practice.dayOfWeek, 40),
    startTime: clipText(practice.startTime, 20),
    endTime: clipText(practice.endTime, 20),
    platform: clipText(practice.platform, 120),
    tool: clipText(practice.tool, 160),
    context: clipText(practice.context, 420),
    problem: clipText(practice.problem, 420),
    objective: clipText(practice.objective, 420),
    preparation: clipText(practice.preparation, 420),
    materials: compactList(practice.materials, 6, 140),
    instructions: clipText(practice.instructions, 520),
    steps: (Array.isArray(practice.steps) ? practice.steps : []).slice(0, 6).map((step) => ({
      title: clipText(step?.title, 120),
      instructions: clipText(step?.instructions, 220),
      minutes: safeNumber(step?.minutes, 0)
    })).filter((step) => step.title || step.instructions),
    product: clipText(practice.product, 300),
    assessment: clipText(practice.assessment, 300),
    criteria: compactList(practice.criteria, 5, 180),
    fallbackPlan: clipText(practice.fallbackPlan, 300),
    durationMinutes: Math.max(0, safeNumber(practice.durationMinutes, 45))
  };
}
function compactBriefingMaterial(material = {}, index = 0) {
  return {
    id: text(material.id) || `material-${index + 1}`,
    type: clipText(material.type, 80),
    title: clipText(material.title, 180),
    link: clipText(material.link || material.href, 500),
    source: clipText(material.source, 160),
    required: Boolean(material.required),
    moment: clipText(material.moment, 160),
    objective: clipText(material.objective, 320),
    alignment: clipText(material.alignment, 320),
    use: clipText(material.use, 320),
    durationMinutes: Math.max(0, safeNumber(material.durationMinutes, 0)),
    notes: clipText(material.notes, 200)
  };
}
function compactProfile(profile = {}) {
  return {
    discipline: clipText(profile.discipline || profile.subject || profile.theme, 180),
    depth: clipText(profile.depth || profile.depthLevel, 80),
    targetWords: safeNumber(profile.targetWords, 0),
    minimumSections: safeNumber(profile.minimumSections, 0),
    minimumReferences: safeNumber(profile.minimumReferences, 0),
    primarySourcesRequired: safeNumber(profile.primarySourcesRequired, 0),
    historicalScope: clipText(profile.historicalScope, 260),
    requiredAuthors: compactList(profile.requiredAuthors, 6, 160),
    requiredFrameworks: compactList(profile.requiredFrameworks, 6, 180),
    avoidTopics: compactList(profile.avoidTopics, 8, 160),
    sourcePolicy: clipText(profile.sourcePolicy, 260),
    requireCounterarguments: Boolean(profile.requireCounterarguments),
    requireConceptComparison: Boolean(profile.requireConceptComparison),
    requireCaseStudy: Boolean(profile.requireCaseStudy)
  };
}
export function compactBriefingInput(input = {}, missingFields = []) {
  const fields = new Set(Array.isArray(missingFields) ? missingFields : []);
  const include = (name) => !fields.size || fields.has(name) || [...fields].some((field) => field.startsWith(`${name}[`));
  const context = {
    title: clipText(input.title, 240),
    audience: clipText(input.audience, 240),
    level: clipText(input.level, 80),
    weeks: Math.max(1, safeNumber(input.weeks, 1)),
    hoursPerWeek: Math.max(0, safeNumber(input.hoursPerWeek, 0)),
    calendarMode: clipText(input.calendarMode, 40),
    startDate: clipText(input.startDate, 40),
    objectives: compactList(input.objectives, 8, 240),
    content: clipText(input.content, 5000),
    academicProfile: compactProfile(input.academicProfile),
    webPractice: { enabled: Boolean(input.webPractice?.enabled), durationMinutes: Math.max(0, safeNumber(input.webPractice?.durationMinutes, 0)) },
    webPracticeCount: Array.isArray(input.webPractices) ? input.webPractices.length : 0
  };
  if (include("webPractices")) context.webPractices = (Array.isArray(input.webPractices) ? input.webPractices : []).slice(0, 16).map(compactBriefingPractice);
  if (include("materials")) context.materials = (Array.isArray(input.materials) ? input.materials : []).slice(0, 10).map(compactBriefingMaterial);
  if (include("references")) context.references = compactList(input.references, 8, 260);
  if (include("videoSearchSuggestions")) context.videoSearchSuggestions = compactList(input.videoSearchSuggestions, 8, 180);
  if (include("imageSearchSuggestions")) context.imageSearchSuggestions = compactList(input.imageSearchSuggestions, 8, 180);
  if (include("notes")) context.notes = compactList(input.notes, 8, 220);
  const defaults = input.resourcePlan?.default || {};
  context.resourcePlan = { videosPerWeek: safeNumber(defaults.videosPerWeek, 0), articlesPerWeek: safeNumber(defaults.articlesPerWeek, 0), requiredReadingsPerWeek: safeNumber(defaults.requiredReadingsPerWeek, 0), requiredReadingLevel: clipText(defaults.requiredReadingLevel, 50) };
  return context;
}

function normalizeBriefingPractice(practice, index) {
  return {
    id: text(practice?.id) || `webpractice-${index + 1}`,
    title: text(practice?.title || practice?.sessionTitle),
    type: text(practice?.type) || "Laboratório prático",
    modality: text(practice?.modality || practice?.format) || "Aula síncrona / laboratório prático",
    weekNumber: Math.max(0, safeNumber(practice?.weekNumber || practice?.week, 0)),
    date: text(practice?.date || practice?.sessionDate),
    dayOfWeek: text(practice?.dayOfWeek || practice?.day),
    startTime: text(practice?.startTime || practice?.start),
    endTime: text(practice?.endTime || practice?.end),
    platform: text(practice?.platform || practice?.environment),
    tool: text(practice?.tool || practice?.tools),
    sessionTitle: text(practice?.sessionTitle || practice?.sessionName),
    moments: stringList(practice?.moments || practice?.moment),
    objective: text(practice?.objective),
    preparation: text(practice?.preparation),
    materials: stringList(practice?.materials),
    instructions: text(practice?.instructions),
    steps: Array.isArray(practice?.steps) ? practice.steps : stringList(practice?.steps),
    product: text(practice?.product),
    assessment: text(practice?.assessment),
    criteria: stringList(practice?.criteria || practice?.rubric),
    continuation: text(practice?.continuation),
    fallbackPlan: text(practice?.fallbackPlan || practice?.planB),
    resources: Array.isArray(practice?.resources) ? practice.resources : [],
    durationMinutes: Math.max(5, safeNumber(practice?.durationMinutes, 45))
  };
}

function normalizeBriefingMaterial(material, index) {
  return {
    id: text(material?.id) || `material-${index + 1}`,
    type: text(material?.type) || "Texto-base",
    title: text(material?.title),
    link: text(material?.link || material?.href),
    source: text(material?.source || material?.publisher || material?.institution),
    author: text(material?.author),
    required: Boolean(material?.required ?? material?.mandatory),
    moment: text(material?.moment),
    objective: text(material?.objective),
    alignment: text(material?.alignment || material?.contentAlignment),
    use: text(material?.use || material?.howToUse),
    pages: text(material?.pages),
    durationMinutes: Math.max(0, safeNumber(material?.durationMinutes, 0)),
    verificationStatus: text(material?.verificationStatus) || (material?.link ? "provided-needs-review" : "suggested-no-url"),
    notes: text(material?.notes)
  };
}

function mergeBriefingPractice(original = {}, suggestion = {}, index = 0) {
  const base = normalizeBriefingPractice(original, index);
  const proposed = normalizeBriefingPractice({ ...base, ...suggestion }, index);
  const fields = ["title", "type", "modality", "weekNumber", "date", "dayOfWeek", "startTime", "endTime", "platform", "tool", "sessionTitle", "moments", "objective", "preparation", "materials", "instructions", "steps", "product", "assessment", "criteria", "continuation", "fallbackPlan", "resources", "durationMinutes"];
  const merged = { ...base };
  fields.forEach((field) => {
    const current = merged[field];
    const empty = Array.isArray(current) ? current.length === 0 : !String(current ?? "").trim() || (field === "weekNumber" && !Number(current));
    if (empty && proposed[field] !== undefined && (Array.isArray(proposed[field]) ? proposed[field].length : String(proposed[field] ?? "").trim())) merged[field] = proposed[field];
  });
  merged.id = base.id || proposed.id || `webpractice-${index + 1}`;
  return merged;
}

export async function assistBriefing(input, missingFields = []) {
  const raw = await callJson([
    { role: "system", content: `Você é um designer instrucional brasileiro. Complete somente os campos vazios do briefing, preserve o que já existe, escreva em português do Brasil e não invente URLs, fontes verificadas ou dados factuais. Responda apenas JSON válido e mantenha listas concisas.` },
    { role: "user", content: buildBriefingPrompt(input, missingFields) }
  ], {
    temperature: 0.35,
    maxTokens: Math.min(8000, Math.max(3000, Number(process.env.OPENAI_ASSIST_MAX_TOKENS || 6000))),
    retryMaxTokens: Math.min(8000, Math.max(3000, Number(process.env.OPENAI_ASSIST_MAX_TOKENS || 6000))),
    formatRetryInstruction: "Retorne somente JSON válido e compacto com audience, objectives, content, webPractices, materials, references, videoSearchSuggestions, imageSearchSuggestions e notes. Preserve IDs e não repita textos longos já fornecidos."
  });
  const requestedPractices = Array.isArray(input.webPractices) ? input.webPractices : [];
  const suggestedPractices = Array.isArray(raw.webPractices) ? raw.webPractices.map(normalizeBriefingPractice) : [];
  const practices = requestedPractices.length
    ? requestedPractices.map((practice, index) => {
        const suggestion = suggestedPractices.find((candidate) => candidate.id === practice.id || (candidate.title && candidate.title === practice.title)) || suggestedPractices[index] || {};
        return mergeBriefingPractice(practice, suggestion, index);
      })
    : suggestedPractices;
  return {
    audience: text(raw.audience), objectives: stringList(raw.objectives), content: text(raw.content),
    webPractices: practices,
    materials: Array.isArray(raw.materials) ? raw.materials.map(normalizeBriefingMaterial) : [],
    references: stringList(raw.references), videoSearchSuggestions: stringList(raw.videoSearchSuggestions), imageSearchSuggestions: stringList(raw.imageSearchSuggestions), notes: stringList(raw.notes)
  };
}

const BLOCK_TYPES = [...KNOWN_BLOCK_TYPES].join(", ");

export function buildWeekGenerationPrompt(input, weekIndex = 0, academicPlan = null, progression = null, previousWeeks = []) {
  const weekNumber = weekIndex + 1;
  const progressionMap = progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, weekIndex, progressionMap);
  const previous = weekFocus.bridgeFromPrevious || (weekNumber > 1 ? `A semana anterior foi a ${weekNumber - 1}; retome um conceito dela e mostre como esta semana avança.` : "Esta é a abertura do curso; construa a base conceitual e anuncie o percurso.");
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  const textBudget = qualityTargets(input);
  const scheduledPractices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, weekIndex));
  const resourcePlan = resourcePlanForWeek(input, weekIndex);
  const compositionPlan = compositionPlanForWeek(input, weekIndex);
  const compositionTargets = Object.values(compositionPlan.rows).filter((row) => row.count > 0).map((row) => `${row.count}× ${row.label} (${row.policy}, ${row.itemsPerBlock > 1 ? `${row.itemsPerBlock} itens/bloco` : "bloco único"})`);
  const previousSummaries = (previousWeeks || []).slice(-3).map((lesson, index) => ({
    weekNumber: lesson?.lessonPlan?.weekNumber || index + 1,
    theme: lesson?.lessonPlan?.theme || lesson?.meta?.title,
    objectives: (lesson?.lessonPlan?.learningObjectives || []).slice(0, 4),
    sectionTitles: (lesson?.lessonPlan?.contentSections || []).map((section) => section.title).filter(Boolean).slice(0, 8)
  }));
  return `Gere UMA semana de material didático: uma unidade didática semanal completa em JSON para o curso abaixo. Esta é a semana ${weekNumber} de ${input.weeks}. ${previous}

${qualityPromptGuidance(input)}

O texto é o produto principal. Não entregue resumo, tópicos telegráficos, frases soltas, uma lista de links ou apenas instruções para o professor. Escreva para o estudante ler e aprender. O padrão de referência é uma aula em DOCX com abertura, objetivos, explicação conceitual, exemplos, casos, contrapontos críticos, síntese, glossário, referências e avaliação. Varie o arco didático conforme o tema. Webpráticas são aulas síncronas/laboratórios separados: nunca descreva, anuncie, instrua ou transforme a webprática em conteúdo-base desta semana.

PADRÃO EDITORIAL DOS EXEMPLOS DE REFERÊNCIA:
- escreva uma unidade com narrativa contínua, não uma coleção de tópicos; cada seção deve responder a uma pergunta e preparar a próxima;
- produza pelo menos ${textBudget.requiredSectionCount} seções principais na sequência indicada; cada corpo de seção deve ter aproximadamente ${textBudget.sectionTargetWords} palavras, nunca menos que ${textBudget.sectionMinimumWords} nem mais que ${textBudget.sectionMaximumWords}, além de subseções quando o conceito exigir;
- comece pela importância do problema e pelo contexto do estudante; depois defina conceitos, compare perspectivas, apresente um caso verificável, aplique critérios e discuta limites, riscos ou controvérsias;
- insira vídeos, imagens, artigos e documentos no ponto exato em que ajudam a entender a seção, com pergunta-guia e finalidade; não crie uma galeria de links no final;
- termine com síntese conceitual de pelo menos 100 palavras, conexão explícita com a próxima semana de pelo menos 60 palavras, glossário e avaliação alinhada; não finalize depois de apenas três seções;
- antes de responder, confira internamente se cada objetivo específico aparece em pelo menos uma seção, atividade e questão de avaliação.
- use a composição de blocos abaixo como um plano editorial, não como decoração: cada bloco deve resolver uma função pedagógica no ponto da seção indicada;
- não crie blocos repetitivos só para cumprir número. Quando um tipo estiver com política "required", entregue a quantidade solicitada; quando estiver com "prefer", entregue se houver função pedagógica clara.

MAPA LONGITUDINAL OBRIGATÓRIO — não ignore este bloco e não substitua seus objetivos por toda a lista geral do curso:
- Tema e título desta semana: ${weekFocus.theme}
- Pergunta central: ${weekFocus.centralQuestion}
- Objetivos específicos desta semana: ${JSON.stringify(weekFocus.objectives)}
- Conceitos novos que precisam ser definidos: ${JSON.stringify(weekFocus.newConcepts)}
- Sequência editorial sugerida: ${JSON.stringify(weekFocus.sectionSequence)}
- Arco didático preferencial: ${weekFocus.arc}
- Ponte recebida: ${weekFocus.bridgeFromPrevious}
- Ponte para a próxima semana: ${weekFocus.bridgeToNext}
- Marco/evidência da etapa: ${weekFocus.projectMilestone}
- Elementos obrigatórios: ${JSON.stringify(weekFocus.mustInclude)}
- O que não repetir nem antecipar: ${weekFocus.doNotRepeat}

REQUISITOS DE RECURSOS DESTA SEMANA — cumpra estas quantidades sem inventar links:
- vídeos: ${resourcePlan.videosPerWeek}; artigos acadêmicos: ${resourcePlan.articlesPerWeek}; leituras obrigatórias totais: ${resourcePlan.requiredReadingsPerWeek}; nível de leitura obrigatória: ${resourcePlan.requiredReadingLevel};
- artigos podem contar como parte das leituras obrigatórias, sem duplicar artificialmente a lista. Se não houver URL verificável, use searchQuery e verificationStatus "suggested-no-url" para que a pesquisa/curadoria localize candidatos depois;
- distribua os recursos nas seções em que serão usados. Se uma meta for 0, não force esse tipo de recurso na semana.

COMPOSIÇÃO EDITORIAL DO AULA STUDIO — a saída deve conter uma propriedade separada "composition", um array de objetos de bloco; não gere "blocks":
- metas desta semana: ${compositionTargets.length ? compositionTargets.join("; ") : "nenhum bloco adicional solicitado"};
- cada item de "composition" deve ter "type", "sectionNumber" e conteúdo específico para esta semana. Tipos válidos: ${BLOCK_TYPES};
- use "destaque" para uma ideia-chave, "atencao" para erro/limite, "reflexao" para pergunta aberta, "citacao" somente com citação fornecida ou claramente marcada para conferência, "imagem"/"parallax"/"textoimagem" com src apenas se houver recurso real, "cases" para comparação de situações, "feature" para sinais/ideias, "tabela" para comparação estruturada, "accordion" para perguntas e respostas, "flashcards" para recuperação ativa, "slider" para procedimento, "linhadotempo" para evolução, "columns" para contrastes, "quiz" para checagem formativa e "externalembed" somente com embed real;
- quando um bloco exigir itens, forneça "items", "cards", "steps", "questions", "eras", "columns", "features" ou "rows" completos conforme o tipo. O conteúdo deve ser específico, não use “Item 1” ou “Pergunta 1” sem completar o conceito;
- a quantidade solicitada é por semana e pode ser zero. Não conte títulos, parágrafos, recursos, webpráticas ou a avaliação final como composição. O servidor materializará a composição em blocos Aula Studio dentro do tópico.

Semanas já geradas (use somente para continuidade; não copie seus títulos, objetivos ou seções):
${JSON.stringify(previousSummaries, null, 2)}

Retorne somente este objeto de alto nível: { "lessonPlan": { ... }, "teacherGuide": { "webPracticeProjects": [...], "mediationMessages": { "whatsapp": [...], "moodle": [...] } } }. Não gere blocks: o servidor transformará o lessonPlan em blocos editáveis do Aula Studio depois da validação. O lessonPlan é a prioridade absoluta. teacherGuide não deve duplicar o texto-base do aluno; mantenha nele as orientações internas do professor, projetos de webprática quando houver sessão agendada e mensagens de acompanhamento.

lessonPlan obrigatório:
- weekNumber, theme (título específico e informativo, nunca "Conteúdo da semana"), welcome (80–160 palavras, contextualizada e ligada ao percurso), didacticArc com sequence, phasePlan e omissionReasons, composition (array de blocos editoriais conforme o plano acima). A phasePlan pode omitir etapas, mas deve justificar a omissão;
- learningObjectives com 4–8 objetivos observáveis, específicos desta semana, usando verbos como explicar, comparar, analisar, aplicar, avaliar ou criar;
- prerequisites e contentDensity;
- contentSections com pelo menos ${textBudget.requiredSectionCount} seções principais. Cada seção deve ter number, title, didacticRole, body com aproximadamente ${textBudget.sectionTargetWords} palavras (mínimo ${textBudget.sectionMinimumWords}, máximo ${textBudget.sectionMaximumWords}), subsections, caseStudy quando pertinente, reflection quando pertinente, keyTerms e resources. A progressão deve ir do problema/pergunta para conceitos, exemplos ou evidências, aplicação e crítica. Não repita a mesma introdução em seções diferentes;
- resources com videos, readingsRequired, readingsExtra, images, podcasts e datasets. Cada vídeo, artigo, leitura ou imagem deve estar dentro da seção em que será usado e conter title, source, author quando conhecido, href somente se foi fornecido no briefing ou retornado por um provedor, required, sectionNumber, objective, guidingQuestion, bridgeParagraph e pedagogicalUse, durationMinutes, altText/caption/credit para imagens, searchQuery quando o link não estiver disponível, verificationStatus e requiresVerification. O bridgeParagraph deve ser um parágrafo de ligação escrito para o ponto exato da seção;
- webPractices: retorne sempre [] dentro de lessonPlan. Se houver prática programada para esta semana, desenvolva o projeto completo exclusivamente em teacherGuide.webPracticeProjects, com problem, context, studentRole, challenge, deliverable, prerequisites, materials, data, steps (cada uma com minutes, instructions e evidence), criteria, rubric com níveis, examples, revision, fallbackPlan, accessibility, prompts, artifacts e versões simplified/advanced;
- diagnostic com pergunta/problema inicial, evidência esperada e feedback; formativeChecks com perguntas durante o texto, momento, evidência, feedback e ação de intervenção;
- activities para fóruns, discussões, produção, estudo de caso ou encontro síncrono, com type, title, instructions, durationMinutes, evidence, evidenceType, feedback, criteria e required;
- alignmentMatrix: uma linha por objetivo, ligando contentSections, activities, evidence e assessmentQuestions. Não deixe objetivo sem atividade, evidência e avaliação;
- differentiation com trilhas support/essential, standard e extension, cada uma com instruções e recursos;
- accessibility com alternativas para baixa conexão, linguagem clara, uso em celular, diagramas e mídias;
- selfAssessment com perguntas de autoavaliação, escala e feedback;
- spiralReview com previousConceptsReviewed, newConcepts, preparationForNextWeek, cumulativeEvidence e projectMilestone;
- synthesis com pelo menos 100 palavras, nextWeekConnection com pelo menos 60 palavras, glossary com 5–10 termos, references como objetos estruturados e assessment;
- claimEvidence: mapa de evidências com id, claim, sectionNumber, sourceIds, sourceType, supportLevel, verificationStatus e note. Afirmações sem fonte devem usar supportLevel "insufficient" e verificationStatus "needs-human-review";
- assessment com normalmente 6 questões: 4 múltipla escolha com 4 alternativas e 2 verdadeiro/falso, alinhadas a objetivos e texto, com resposta e explicação;
- timePlan com targetMinutes 0, items vazio e calculationMethod "derived-after-content".

Regras de escrita:
- escreva em ${input.language}, com linguagem humana, clara, específica, variada e pedagogicamente provocadora;
- produza pelo menos ${textBudget.targetWords} palavras úteis no conjunto do texto do aluno. Essa é uma meta mínima operacional, não uma estimativa: conte e amplie antes de devolver o JSON. A aula do aluno tem prioridade absoluta sobre o Material de Mediação;
- inclua pelo menos ${profile.minimumReferences} referências, sendo ${profile.primarySourcesRequired} acadêmica(s) ou oficial(is), sem inventar dados bibliográficos; use a política: ${profile.sourcePolicy};
- ${profile.requireCounterarguments ? "inclua pelo menos um contraponto, controvérsia ou limite" : "inclua contraponto apenas quando pertinente"}; ${profile.requireConceptComparison ? "compare conceitos próximos ou abordagens alternativas quando pertinente" : "não force comparação se ela não for pertinente"}; ${profile.requireCaseStudy ? "inclua estudo de caso ou exemplo contextualizado" : "use exemplo contextualizado quando ajudar"};
- conecte o tema à realidade do público (${input.audience}) e do nível (${input.level}); use os exemplos, recortes regionais e instituições fornecidos no briefing;
- inclua pelo menos um exemplo concreto, uma situação-problema ou estudo de caso e um contraponto/limite quando forem pertinentes;
- integre vídeos, imagens, artigos e leituras na seção em que serão usados, precedidos ou seguidos por um parágrafo de ligação que explique o que o estudante deve observar, comparar ou responder; não crie uma galeria final de links;
- não force diagnóstico, vídeo, leitura, webprática ou quiz quando não houver função pedagógica; webprática nunca deve aparecer no corpo do texto-base, nas contentSections, no welcome, na síntese ou nas atividades da aula semanal;
- nunca invente URLs, DOI, durações, autores, números ou referências verificadas. Para recurso ainda não conferido, use searchQuery e verificationStatus "suggested-no-url";
- não escreva markdown fora das strings do JSON e não inclua comentários.

teacherGuide deve incluir resourceNotes, mediationStops e mediationMessages mesmo quando não houver webprática. Crie uma parada de mediação para a abertura, para cada formativeCheck e activity relevante e para o fechamento; se não houver uma parada explícita, crie um ponto de acompanhamento durante o estudo. Gere duas listas paralelas, whatsapp e moodle, com uma mensagem para cada parada. O teor deve ser equivalente, mas não uma cópia: WhatsApp pode ser mais informal, próximo, humanizado e ter humor leve; Moodle deve ser mais organizado, claro e adequado a um aviso de curso. Cada item deve conter relatedId, relatedType, timing, purpose, studentNeed, teacherIntent, tone e text. As mensagens devem explicar por que vale a pena fazer a etapa, reconhecer dificuldades e convidar a uma ação concreta, sem inventar agenda, link ou obrigação que não esteja no briefing. Se houver webprática programada, inclua também em webPracticeProjects a preparação do professor e do aluno, agenda, roteiro com minutos, falas/prompts, produto, critérios, rubrica, plano B, acessibilidade e artefatos. O projeto será exportado em DOCX separado e as mensagens no Material de Mediação em PDF.

Perfil acadêmico desta trilha:
${JSON.stringify(profile, null, 2)}

Mapa completo do curso para garantir progressão e não repetição:
${JSON.stringify(progressionMap, null, 2)}

Planejamento acadêmico prévio desta semana:
${JSON.stringify(academicPlan || { status: "não disponível; construa um plano interno antes de escrever" }, null, 2)}

Briefing estruturado da aula-base:
${JSON.stringify({ ...input, webPractices: [], weekToGenerate: weekNumber }, null, 2)}

Sessões práticas independentes agendadas para esta semana (não inserir no texto-base; desenvolver somente em teacherGuide.webPracticeProjects e no DOCX separado):
${JSON.stringify(scheduledPractices, null, 2)}

Retorne JSON completo, sem omitir propriedades obrigatórias.`;
}

export function buildGenerationPrompt(input) {
  return `Gere ${input.weeks} semanas, uma por objeto, seguindo o contrato de buildWeekGenerationPrompt e o academicProfile recebido. O processo esperado é planejamento acadêmico, redação completa, revisão crítica e reescrita condicional. Varie o arco didático conforme o conteúdo; lessonPlan.webPractices deve ser sempre []; não inclua webprática no texto-base ou em semanas não programadas; desenvolva sessões agendadas somente em teacherGuide.webPracticeProjects; gere também mediationMessages com versões distintas para WhatsApp e Moodle; misture recursos no ponto de uso; mantenha teacherGuide separado e produza blocks exclusivamente para o aluno no Aula Studio. A carga horária será calculada depois do conteúdo.\n\n${JSON.stringify(input, null, 2)}`;
}

async function repairWeekWithAI(input, index, raw, quality, academicPlan = {}, academicReview = {}) {
  const weekNumber = index + 1;
  const scheduledPractices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index));
  const prompt = `A semana ${weekNumber} abaixo foi rejeitada por insuficiência textual. Reescreva a unidade inteira, não faça um resumo e não remova conteúdo que já esteja bom.

${qualityPromptGuidance(input)}

Problemas estruturais detectados: ${quality.issues.join("; ") || "conteúdo abaixo do padrão"}.
Problemas acadêmicos detectados: ${(academicReview.issues || []).map((issue) => issue.description).join("; ") || "nenhum relatório disponível"}.

Entregue somente { lessonPlan, teacherGuide }. lessonPlan precisa ter título específico, welcome, 4–8 objetivos observáveis, contentSections conforme o academicProfile, exemplos/caso/contraponto, synthesis, nextWeekConnection, glossary, references estruturadas, claimEvidence, assessment com 6 questões e timePlan. lessonPlan.webPractices deve ser sempre []; não mencione a sessão prática no texto-base. Se houver prática agendada, mantenha o projeto completo somente em teacherGuide.webPracticeProjects. Não gere blocks. Não invente URLs ou referências verificadas; use searchQuery para recursos sem link. Preserve o mapa de evidências e marque toda pendência como needs-human-review.

Semana a revisar:
${JSON.stringify(raw?.lessonPlan || raw, null, 2)}

Briefing do curso:
${JSON.stringify({ ...input, webPractices: [], scheduledWebPractices: scheduledPractices, weekToGenerate: weekNumber }, null, 2)}

Planejamento acadêmico:
${JSON.stringify(academicPlan, null, 2)}

Retorne JSON completo agora.`;
  return callJson([
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de reparo textual. Preserve o que estiver correto, mas cumpra o piso de palavras e as quotas por seção; não faça um acréscimo marginal nem devolva uma versão resumida.` },
    { role: "user", content: prompt }
  ], { temperature: 0.35 });
}

async function reviewWeekWithAI(input, index, academicPlan, draft) {
  const rawReview = await callJson([
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de revisão crítica. Não reescreva a aula nesta chamada; retorne somente o relatório JSON solicitado.` },
    { role: "user", content: buildAcademicReviewPrompt(input, index, academicPlan, draft) }
  ], { temperature: 0.2 });
  return normalizeAcademicReview(rawReview);
}

async function planWeekWithAI(input, index, progression = null) {
  const weekFocus = progressionForWeek(input, index, progression || buildCourseProgression(input));
  try {
    const rawPlan = await callJson([
      { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de planejamento acadêmico. Planeje antes de redigir e retorne somente o JSON do plano.` },
      { role: "user", content: buildAcademicPlanPrompt(input, index, weekFocus) }
    ], { temperature: 0.25 });
    return normalizeAcademicPlan(rawPlan, input, index);
  } catch {
    return normalizeAcademicPlan({ weekNumber: index + 1, theme: weekFocus.theme, centralQuestion: weekFocus.centralQuestion, objectives: weekFocus.objectives, centralConcepts: weekFocus.newConcepts, sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title })) }, input, index);
  }
}

function coerceLessonEnvelope(value) {
  const source = value && typeof value === "object" ? value : {};
  if (source.lessonPlan && typeof source.lessonPlan === "object") return source;
  if (source.plan && typeof source.plan === "object") return { ...source, lessonPlan: source.plan };
  if (source.week?.lessonPlan && typeof source.week.lessonPlan === "object") return { ...source, lessonPlan: source.week.lessonPlan, teacherGuide: source.teacherGuide || source.week.teacherGuide };
  if (source.week && typeof source.week === "object" && (source.week.contentSections || source.week.sections || source.week.theme || source.week.welcome)) return { ...source, lessonPlan: source.week, teacherGuide: source.teacherGuide || source.week.teacherGuide };
  if (source.contentSections || source.sections || source.theme || source.welcome || source.learningObjectives) return { ...source, lessonPlan: source };
  return source;
}

function enforceWeekFocus(raw, weekFocus, weekNumber) {
  raw = coerceLessonEnvelope(raw);
  if (!raw?.lessonPlan || typeof raw.lessonPlan !== "object") return raw;
  raw.lessonPlan.theme = weekFocus.theme;
  raw.lessonPlan.weekNumber = weekNumber;
  raw.lessonPlan.learningObjectives = weekFocus.objectives;
  raw.lessonPlan.didacticArc = { ...(raw.lessonPlan.didacticArc || {}), id: weekFocus.arc };
  raw.lessonPlan.spiralReview = {
    ...(raw.lessonPlan.spiralReview || {}),
    previousConceptsReviewed: weekNumber > 1 ? (raw.lessonPlan.spiralReview?.previousConceptsReviewed || [weekFocus.bridgeFromPrevious]) : [],
    newConcepts: weekFocus.newConcepts,
    preparationForNextWeek: [weekFocus.bridgeToNext],
    projectMilestone: weekFocus.projectMilestone
  };
  return raw;
}

export async function generateOneWeek(input, index, options = {}) {
  const weekNumber = index + 1;
  const useAcademicPipeline = process.env.AULA_ACADEMIC_PIPELINE !== "false";
  // A Vercel Hobby encerra funções longas. O modo de uma etapa mantém o prompt
  // acadêmico completo, mas evita as chamadas extras de planejamento/revisão na
  // mesma requisição. O pipeline completo continua disponível com false.
  const singlePass = options.singlePass ?? process.env.AULA_SINGLE_PASS !== "false";
  // A rota distribuída salva a primeira versão antes de qualquer reparo. Isso
  // evita que uma semana curta dispare mais uma ou duas chamadas longas e
  // ultrapasse o limite da função serverless.
  const deferRepair = Boolean(options.deferRepair);
  const generationMeta = { phase: "draft", mode: singlePass ? "single-pass" : "academic-pipeline", repairPending: false, repairAttempts: 0, repairReason: [] };
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const academicPlan = !singlePass && useAcademicPipeline
    ? await planWeekWithAI(input, index, progression)
    : normalizeAcademicPlan({
        weekNumber: index + 1,
        theme: weekFocus.theme,
        centralQuestion: weekFocus.centralQuestion,
        objectives: weekFocus.objectives,
        centralConcepts: weekFocus.newConcepts,
        sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title, purpose: "Desenvolver a progressão específica da semana." })),
        controversies: [weekFocus.doNotRepeat]
      }, input, index);
  let raw = coerceLessonEnvelope(await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: buildWeekGenerationPrompt(input, index, academicPlan, progression, options.previousWeeks) }
  ], {
    temperature: 0.42,
    formatRetryInstruction: "A resposta anterior foi truncada ou inválida. Retorne somente { \"lessonPlan\": { ... }, \"teacherGuide\": { \"webPracticeProjects\": [], \"mediationMessages\": { \"whatsapp\": [], \"moodle\": [] } } }, com o texto didático completo, as seções desenvolvidas, as mensagens de acompanhamento e o piso de palavras solicitado. Não gere blocks, não repita o conteúdo no teacherGuide e responda somente JSON válido."
  }));
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (!singlePass && useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  enforceWeekFocus(raw, weekFocus, weekNumber);
  const initialLesson = normalizeLesson(raw, input, index);
  const initialQuality = measureLessonQuality(initialLesson, input, { peerLessons: options.previousWeeks || [] });
  const repairableIssues = initialQuality.issues.some((issue) => /conteúdo curto|poucas seções|seções ainda|boas-vindas|síntese|avaliação|objetivos insuficientes|título principal|tópico de conteúdo|bloco hero|bloco visível|matriz/i.test(issue));
  const needsQualityRepair = repairableIssues || initialQuality.status === "insufficient";
  if (deferRepair && (needsQualityRepair || academicReview.rewriteRequired)) {
    generationMeta.repairPending = true;
    generationMeta.repairReason = [...new Set([...(initialQuality.issues || []), ...((academicReview.issues || []).map((issue) => issue.description).filter(Boolean))])].slice(0, 8);
    generationMeta.nextAction = "Refazer esta semana pela prévia depois que a versão inicial for salva.";
  }
  if (!deferRepair && !singlePass && process.env.AULA_AUTO_REPAIR !== "false" && (repairableIssues || academicReview.rewriteRequired)) {
    try {
      generationMeta.repairAttempts += 1;
      const repaired = coerceLessonEnvelope(await repairWeekWithAI(input, index, raw, initialQuality, academicPlan, academicReview));
      const repairedLesson = normalizeLesson(repaired, input, index);
      const repairedQuality = measureLessonQuality(repairedLesson, input, { peerLessons: options.previousWeeks || [] });
      const requiredGain = Math.max(250, Math.round(qualityTargets(input).targetWords * 0.10));
      const substantialRepair = repairedQuality.wordCount - initialQuality.wordCount >= requiredGain;
      const reachesMinimum = repairedQuality.wordCount >= repairedQuality.minimumWords;
      if (reachesMinimum || (substantialRepair && repairedQuality.score >= initialQuality.score)) {
        raw = mergeRepairedResponse(raw, repaired);
        if (useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
          try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { /* preserva o relatório anterior */ }
        }
      }
    } catch {
      // A versão inicial será devolvida com pendência explícita para revisão humana.
    }
  }
  if (!deferRepair && singlePass && process.env.AULA_AUTO_REPAIR !== "false" && needsQualityRepair) {
    try {
      generationMeta.repairAttempts += 1;
      const repaired = coerceLessonEnvelope(await regenerateWeekWithAI(
        input,
        index,
        initialLesson,
        `A análise automática encontrou estes problemas: ${initialQuality.issues.join("; ")}. Não devolva a semana ainda incompleta. Amplie substancialmente o texto até cumprir o piso de ${initialQuality.minimumWords} palavras e a meta de ${initialQuality.targetWords}, sem repetir outras semanas. Preserve o foco "${weekFocus.theme}", desenvolva as seções da sequência ${weekFocus.sectionSequence.join("; ")}, inclua um caso ou aplicação verificável, contraponto, síntese, conexão com a próxima semana e avaliação alinhada.`,
        { maxTokens: regenerationTokenBudget(input), retryMaxTokens: regenerationTokenBudget(input), progression }
      ));
      enforceWeekFocus(repaired, weekFocus, weekNumber);
      const repairedLesson = normalizeLesson(repaired, input, index);
      const repairedQuality = measureLessonQuality(repairedLesson, input, { peerLessons: options.previousWeeks || [] });
      const requiredGain = Math.max(250, Math.round(qualityTargets(input).targetWords * 0.10));
      const substantialRepair = repairedQuality.wordCount - initialQuality.wordCount >= requiredGain;
      const reachesMinimum = repairedQuality.wordCount >= repairedQuality.minimumWords;
      if (reachesMinimum || (substantialRepair && repairedQuality.score >= initialQuality.score)) raw = mergeRepairedResponse(raw, repaired);
    } catch {
      // Preserva a primeira versão com a pendência de qualidade visível ao professor.
    }
  }
  let finalLesson = normalizeLesson(raw, input, index);
  let finalQuality = measureLessonQuality(finalLesson, input, { peerLessons: options.previousWeeks || [] });
  if (!deferRepair && singlePass && process.env.AULA_AUTO_REPAIR !== "false" && finalQuality.wordCount < finalQuality.minimumWords * 0.25) {
    try {
      generationMeta.repairAttempts += 1;
      const rescue = coerceLessonEnvelope(await regenerateWeekWithAI(
        input,
        index,
        finalLesson,
        `RESGATE DE SAÍDA INACEITAVELMENTE CURTA: a versão atual contém apenas ${finalQuality.wordCount} palavras didáticas. Gere a semana novamente do zero, sem resumir, sem teacherGuide e sem blocks. Entregue pelo menos ${finalQuality.minimumWords} palavras úteis, ${qualityTargets(input).requiredSectionCount} seções desenvolvidas, abertura, síntese, conexão com a próxima semana, avaliação e objetivos observáveis.`,
        { maxTokens: Math.min(14000, Math.max(regenerationTokenBudget(input), 12000)), retryMaxTokens: Math.min(14000, Math.max(regenerationTokenBudget(input), 12000)), progression }
      ));
      enforceWeekFocus(rescue, weekFocus, weekNumber);
      const rescueLesson = normalizeLesson(rescue, input, index);
      const rescueQuality = measureLessonQuality(rescueLesson, input, { peerLessons: options.previousWeeks || [] });
      const rescueReachedUsefulSize = rescueQuality.wordCount >= rescueQuality.minimumWords * 0.5 || rescueQuality.wordCount - finalQuality.wordCount >= 300 || rescueQuality.status !== "insufficient";
      if (rescueReachedUsefulSize) {
        raw = mergeRepairedResponse(raw, rescue);
        finalLesson = rescueLesson;
        finalQuality = rescueQuality;
      }
    } catch {
      // Mantém a versão atual e deixa a pendência explícita para a revisão humana.
    }
  }
  enforceWeekFocus(raw, weekFocus, weekNumber);
  generationMeta.initialQuality = { status: initialQuality.status, score: initialQuality.score, wordCount: initialQuality.wordCount, minimumWords: initialQuality.minimumWords };
  generationMeta.finalQuality = { status: finalQuality.status, score: finalQuality.score, wordCount: finalQuality.wordCount, minimumWords: finalQuality.minimumWords };
  if (!generationMeta.repairPending) generationMeta.phase = "complete";
  return {
    ...(raw?.lessonPlan || raw?.blocks ? raw : raw?.week || raw),
    academicPlan,
    teacherGuide: { ...(raw?.teacherGuide || {}), academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] },
    generationMeta
  };
}

const clip = (value, limit) => String(value ?? "").slice(0, limit);

function compactRegenerationSection(section = {}) {
  return {
    number: section.number,
    title: section.title,
    body: clip(section.body, 2800),
    subsections: (section.subsections || []).map((sub) => ({ number: sub.number, title: sub.title, body: clip(sub.body, 900) })).slice(0, 4),
    caseStudy: section.caseStudy ? { context: clip(section.caseStudy.context, 1100), data: clip(section.caseStudy.data, 800), question: clip(section.caseStudy.question, 400), response: clip(section.caseStudy.response, 400) } : null,
    reflection: section.reflection ? { question: clip(section.reflection.question, 400), body: clip(section.reflection.body, 600) } : null,
    keyTerms: (section.keyTerms || []).slice(0, 6),
    counterpoint: clip(section.counterpoint, 800),
    didacticRole: section.didacticRole,
    resources: (section.resources || []).map((resource) => ({ title: resource.title, kind: resource.kind, href: resource.href, required: resource.required, objective: resource.objective, pedagogicalUse: resource.pedagogicalUse })).slice(0, 6)
  };
}

function regenerationTokenBudget(input, options = {}) {
  const target = qualityTargets(input).targetWords;
  const configured = Number(options.maxTokens || process.env.OPENAI_REGEN_MAX_TOKENS || 10000);
  // O reparo devolve apenas lessonPlan. Para 3.000 palavras, 8–10 mil
  // tokens permitem texto substancial e JSON completo sem carregar o guia.
  return Math.min(14000, Math.max(8000, configured, Math.ceil(target * 2.2)));
}

function mergeRepairedResponse(original, repaired) {
  const base = original && typeof original === "object" ? original : {};
  const next = repaired && typeof repaired === "object" ? repaired : {};
  return {
    ...base,
    ...next,
    teacherGuide: next.teacherGuide || base.teacherGuide || {}
  };
}

export async function regenerateWeekWithAI(input, index, currentWeek, instruction, options = {}) {
  input = applyCompositionInstruction(input, index, instruction);
  const weekNumber = index + 1;
  const singlePass = process.env.AULA_SINGLE_PASS !== "false";
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const currentPlan = currentWeek?.lessonPlan || currentWeek || {};
  const compositionPlan = compositionPlanForWeek(input, index);
  const compositionTargets = Object.values(compositionPlan.rows).filter((row) => row.count > 0).map((row) => `${row.count}× ${row.label} (${row.policy}, ${row.itemsPerBlock > 1 ? `${row.itemsPerBlock} itens/bloco` : "bloco único"})`);
  const academicPlan = singlePass
    ? normalizeAcademicPlan({ weekNumber, theme: currentPlan.theme || `${input.title} — Semana ${weekNumber}`, objectives: input.objectives }, input, index)
    : await planWeekWithAI(input, index);
  const compactInput = {
    title: input.title,
    audience: input.audience,
    level: input.level,
    language: input.language,
    hoursPerWeek: input.hoursPerWeek,
    objectives: (input.objectives || []).slice(0, 12),
    content: String(input.content || "").slice(0, 7000),
    academicProfile: normalizeAcademicProfile(input.academicProfile, input),
    references: (input.references || []).slice(0, 12),
    materials: (input.materials || []).slice(0, 12).map((item) => ({ title: item.title, type: item.type, link: item.link, moment: item.moment, objective: item.objective, alignment: item.alignment, use: item.use, pages: item.pages, durationMinutes: item.durationMinutes })),
    resourcePlan: resourcePlanForWeek(input, index),
    webPractices: [],
    weekToGenerate: weekNumber,
    compositionTargets
  };
  const compactWeek = {
    theme: currentPlan.theme,
    welcome: currentPlan.welcome,
    learningObjectives: currentPlan.learningObjectives || currentPlan.objectives,
    contentSections: (currentPlan.contentSections || []).map(compactRegenerationSection).slice(0, 8),
    activities: (currentPlan.activities || []).map((activity) => ({ id: activity.id, title: activity.title, type: activity.type, instructions: clip(activity.instructions, 1200), evidence: clip(activity.evidence, 600), durationMinutes: activity.durationMinutes })).slice(0, 8),
    formativeChecks: (currentPlan.formativeChecks || []).map((check) => ({ id: check.id, moment: check.moment, prompt: clip(check.prompt || check.question, 800), feedback: clip(check.feedback, 800) })).slice(0, 6),
    synthesis: clip(currentPlan.synthesis, 3000),
    nextWeekConnection: clip(currentPlan.nextWeekConnection, 1600),
    glossary: (currentPlan.glossary || []).slice(0, 12).map((item) => ({ term: item.term, definition: clip(item.definition, 500) })),
    references: (currentPlan.references || []).slice(0, 8).map((item) => typeof item === "string" ? item : ({ citation: clip(item.citation || item.title, 700), href: item.href, verificationStatus: item.verificationStatus })),
    claimEvidence: (currentPlan.claimEvidence || []).slice(0, 12).map((item) => ({ id: item.id, claim: clip(item.claim, 700), sourceIds: item.sourceIds, verificationStatus: item.verificationStatus, note: clip(item.note, 400) })),
    assessment: { title: currentPlan.assessment?.title, format: currentPlan.assessment?.format, questions: (currentPlan.assessment?.questions || []).map((question) => ({ id: question.id, q: clip(question.q, 1000), options: (question.options || []).slice(0, 6).map((option) => clip(option, 350)), answer: question.answer, explanation: clip(question.explanation, 900) })).slice(0, 8) },
    timePlan: { targetMinutes: currentPlan.timePlan?.targetMinutes },
    didacticArc: { id: currentPlan.didacticArc?.id, label: currentPlan.didacticArc?.label, sequence: currentPlan.didacticArc?.sequence },
    composition: (currentPlan.composition?.entries || currentPlan.composition || []).slice(0, 24)
  };
  const textBudget = qualityTargets(input);
  const prompt = `Refaça somente a semana ${weekNumber} do curso abaixo. O professor pediu esta alteração:

"${String(instruction || "").trim()}"

Preserve os fatos, referências e recursos válidos, mas cumpra a solicitação de forma visível. A semana deve continuar sendo uma unidade didática completa, não um resumo. ${qualityPromptGuidance(input)}
Esta é uma correção de insuficiência textual. Não faça um acréscimo marginal de 20, 30 ou 50 palavras. Reescreva e amplie as seções abaixo do orçamento até atingir o piso de ${textBudget.minimumWords} palavras. Cada seção deve conter explicação conceitual, exemplo ou aplicação, consequência/limite e transição para a próxima. Se o texto atual estiver curto, substitua o corpo curto por um corpo desenvolvido; não apenas acrescente uma frase ao final.
Faça uma revisão acadêmica explícita: corrija afirmações sem suporte, diferencie fato e interpretação, acrescente contraponto quando exigido, preserve o mapa de evidências e não invente fontes. ${normalizeAcademicProfile(input.academicProfile, input).sourcePolicy}

  Retorne somente { "lessonPlan": { ... } }. Não gere blocks nem teacherGuide; o servidor preservará/reconstruirá o Material de Mediação. O lessonPlan deve manter título específico, welcome, objetivos observáveis, pelo menos ${textBudget.requiredSectionCount} seções conforme o orçamento, exemplos/caso/contraponto quando pertinente, síntese, próxima semana, glossário, referências estruturadas, claimEvidence, avaliação e timePlan. lessonPlan.webPractices deve ser sempre []; não inclua qualquer descrição ou instrução da sessão prática no texto-base. Não invente URLs ou fontes verificadas. A prioridade desta resposta é o texto substancial do aluno; não reduza o corpo para economizar tokens.
  COMPOSIÇÃO OBRIGATÓRIA DA SEMANA: ${compositionTargets.length ? compositionTargets.join("; ") : "nenhum bloco adicional solicitado"}. Se a solicitação do professor pedir acrescentar, remover ou alterar um bloco (por exemplo, “acrescente 1 quiz”), cumpra isso explicitamente e retorne lessonPlan.composition com entradas completas e específicas para a semana. Quando houver uma quantidade configurada maior que zero, não omita silenciosamente o bloco: o servidor o materializará no JSON do Aula Studio.

Briefing essencial do curso:
${JSON.stringify(compactInput, null, 2)}

Foco longitudinal obrigatório desta semana:
${JSON.stringify(weekFocus, null, 2)}

Planejamento acadêmico atualizado:
${JSON.stringify(academicPlan, null, 2)}

Semana atual, em formato compacto:
${JSON.stringify(compactWeek, null, 2)}

Retorne JSON completo agora.`;
  const regenerationMaxTokens = regenerationTokenBudget(input, options);
  let raw = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ], {
    temperature: 0.35,
    maxTokens: regenerationMaxTokens,
    retryMaxTokens: regenerationMaxTokens,
    formatRetryInstruction: `A resposta anterior foi truncada ou continha JSON inválido. Refaça agora somente { "lessonPlan": { ... } }, sem teacherGuide e sem blocks. Preserve a meta mínima de ${textBudget.minimumWords} palavras, ${textBudget.requiredSectionCount} seções com aproximadamente ${textBudget.sectionTargetWords} palavras cada, síntese, avaliação e a composição solicitada (${compositionTargets.join("; ") || "nenhum bloco adicional"}). Responda somente JSON válido, sem markdown, comentários, texto extra ou vírgulas finais.`
  });
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (!singlePass && process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  if (!singlePass && process.env.AULA_AUTO_REPAIR !== "false" && academicReview.rewriteRequired) {
    try {
      raw = await repairWeekWithAI(input, index, raw, { issues: ["a revisão acadêmica solicitou reescrita"] }, academicPlan, academicReview);
      if (process.env.AULA_ACADEMIC_REVIEW !== "false") academicReview = await reviewWeekWithAI(input, index, academicPlan, raw);
    } catch { /* a semana segue para revisão humana */ }
  }
  return { ...raw, academicPlan, ...(raw?.teacherGuide ? { teacherGuide: { ...raw.teacherGuide, academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] } } : {}) };
}

export async function generateWithAI(input) {
  const weeks = [];
  const progression = buildCourseProgression(input);
  const batchSize = Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 1));
  for (let start = 0; start < input.weeks; start += batchSize) {
    const batch = await Promise.all(Array.from({ length: Math.min(batchSize, input.weeks - start) }, (_, offset) => generateOneWeek(input, start + offset, { progression, previousWeeks: weeks })));
    weeks.push(...batch);
  }
  const normalizedWeeks = normalizeWeeklyOutput({ weeks }, input);
  const teacherGuides = normalizedWeeks.map((lesson, index) => {
    const scopedInput = { ...input, webPractices: (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index)) };
    return buildTeacherGuide(scopedInput, lesson, { ...(weeks[index]?.teacherGuide || {}), webPracticeProjects: weeks[index]?.teacherGuide?.webPracticeProjects || weeks[index]?.teacherGuide?.webPractices || [] }, index);
  });
  return { weeks: normalizedWeeks, teacherGuides };
}


export async function regenerateMediationMessageWithAI({ input = {}, weekNumber = 1, theme = "", channel = "whatsapp", timing = "", purpose = "", studentNeed = "", teacherIntent = "", currentText = "", tone = "", instructions = "", relatedContext = {} } = {}) {
  const channelLabel = channel === "moodle" ? "Mensagens do Moodle" : "WhatsApp";
  const prompt = `Reescreva uma única mensagem de acompanhamento para estudantes. Responda somente JSON válido no formato {"text":"...","purpose":"...","teacherIntent":"..."}.

Canal: ${channelLabel}.
Curso: ${input.title || "curso"}.
Semana: ${weekNumber}.
Tema: ${theme || "tema da semana"}.
Momento: ${timing || "momento da semana"}.
Propósito pedagógico: ${purpose || "orientar o avanço do estudante"}.
Necessidade do estudante: ${studentNeed || "compreender o próximo passo"}.
Intenção de mediação do professor: ${teacherIntent || "acolher, orientar e encorajar"}.
Tom solicitado para esta mensagem: ${tone || (channel === "moodle" ? "acolhedor, claro e organizado" : "próximo, humano e com humor leve")}.
Informações específicas acrescentadas pelo professor: ${instructions || "nenhuma"}.
Texto atual para melhorar: ${currentText || "nenhum"}.
Contexto adicional da parada/atividade: ${JSON.stringify(relatedContext)}.

Regras: seja específico e empático; explique por que vale a pena fazer a etapa; reconheça dificuldades sem infantilizar; convide a uma ação concreta; não invente data, link, nota, obrigação ou conteúdo ausente; não use frases genéricas de motivação; para WhatsApp escreva como mensagem natural e próxima; para Moodle escreva como aviso claro e bem estruturado; não diga que é uma IA; escreva em português do Brasil.`;
  const result = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ], { temperature: 0.65, maxTokens: 900, retryMaxTokens: 1200, formatRetryInstruction: "Retorne somente JSON com text, purpose e teacherIntent." });
  return {
    text: String(result?.text || result?.message || "").trim(),
    purpose: String(result?.purpose || purpose).trim(),
    teacherIntent: String(result?.teacherIntent || teacherIntent).trim(),
    tone: String(tone || "").trim()
  };
}
