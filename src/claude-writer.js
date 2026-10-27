// Modo de escrita em prosa ("como o Claude escreve").
//
// Em vez de pedir à IA um JSON de ~40 campos (o que a faz escrever "para preencher
// campos"), a semana é gerada em duas etapas:
//
//   1. REDAÇÃO   — um texto corrido em Markdown, no tom e na estrutura da aula de
//                  referência (writer-voice.js). Esta é a chamada longa e cara.
//   2. DERIVADOS — uma chamada curta, em JSON, que lê o texto já escrito e produz o
//                  que precisa ser consistente com ele: avaliação com feedback por
//                  alternativa, atividades, verificações formativas e o Material de
//                  Mediação (WhatsApp/Moodle).
//
// O analisador (writer-markdown.js) converte o Markdown em lessonPlan, sem IA, e o
// restante do sistema (blocos do Aula Studio, qualidade, ponte entre semanas,
// pesquisa de recursos) segue igual. AULA_WRITER=json volta ao modo antigo.

import { callJson, callText, getAIModel } from "./ai-client.js";
import { normalizeAcademicPlan } from "./academic.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";
import { measureLessonQuality, qualityTargets } from "./content-quality.js";
import { applyCompositionInstruction } from "./composition.js";
import { normalizeLesson, practiceScheduledForWeek, resourcePlanForWeek } from "./aula-schema.js";
import { closingRequirement, formatBridgeContext } from "./bridge.js";
import { writerSystemPrompt } from "./writer-voice.js";
import { parseWeekMarkdown, planToMarkdown, plain } from "./writer-markdown.js";
import { applyFactCheck } from "./fact-check.js";
import { compactBriefingPractice, compactWeekInput, enforceWeekFocus } from "./ai.js";

export function writerMode() {
  const configured = String(process.env.AULA_WRITER || "").trim().toLowerCase();
  return configured === "json" || configured === "legacy" ? "json" : "prose";
}

const urlsIn = (value) => new Set((JSON.stringify(value ?? {}).match(/https?:\/\/[^\s"'\\<>)]+/g) || []).map((url) => url.replace(/[.,;]+$/, "")));
const listText = (items) => (items || []).map((item) => `- ${item}`).join("\n");

function writerTokenBudget(targets) {
  const configured = Number(process.env.AULA_WRITER_MAX_TOKENS || 0);
  // Português gasta ~1,6–1,9 token por palavra; callouts e títulos somam ~15%.
  const estimated = Math.ceil(targets.targetWords * 2.3) + 1500;
  return Math.min(16000, Math.max(6000, configured || estimated));
}

function previousWeeksBlock(previousWeeks = []) {
  const summaries = (previousWeeks || []).slice(-3).map((lesson, position) => ({
    semana: lesson?.lessonPlan?.weekNumber || position + 1,
    tema: lesson?.lessonPlan?.theme || lesson?.meta?.title,
    objetivos: (lesson?.lessonPlan?.learningObjectives || []).slice(0, 4),
    secoes: (lesson?.lessonPlan?.contentSections || []).map((section) => section.title).filter(Boolean).slice(0, 8)
  }));
  return summaries.length ? `SEMANAS JÁ ESCRITAS (para retomar pelo nome e não repetir; não copie títulos nem trechos):\n${JSON.stringify(summaries, null, 2)}` : "";
}

export function buildWriterPrompt(input, index, { progression = null, previousWeeks = [], bridges = [], current = null, instruction = "" } = {}) {
  const weekNumber = index + 1;
  const focus = progressionForWeek(input, index, progression || buildCourseProgression(input));
  const targets = qualityTargets(input);
  const resourcePlan = resourcePlanForWeek(input, index);
  const compactInput = compactWeekInput(input, index, resourcePlan);
  const provided = [...urlsIn({ videoLinks: input.videoLinks, imageLinks: input.imageLinks, materials: input.materials, references: input.references })];
  const bridge = formatBridgeContext(bridges, weekNumber);
  const intro = `Esta é a semana ${weekNumber} de ${input.weeks}. ${weekNumber > 1
    ? (focus.bridgeFromPrevious || `Retome um conceito da semana ${weekNumber - 1} pelo nome e mostre como esta semana avança.`)
    : "É a abertura do curso: construa a base conceitual e anuncie o percurso."}`;
  const revision = current ? `

TEXTO ATUAL DA SEMANA (é o que o professor está revendo):
<<<
${String(planToMarkdown(current)).slice(0, 48000)}
>>>

PEDIDO DO PROFESSOR PARA ESTA REVISÃO:
"${String(instruction || "").trim()}"

Como revisar: reescreva o documento inteiro já com o pedido incorporado. O que o professor não mencionou deve permanecer praticamente idêntico (mesmas frases, mesma ordem, mesmos casos e callouts), porque ele já leu e aprovou esses trechos. Não encolha o texto, não resuma e mantenha a voz. Se o pedido mudar um fato ou um caso, ajuste também o que dependia dele (síntese, glossário, referências, "Pontos a conferir").` : "";
  return `Escreva a unidade da semana ${weekNumber} do curso "${input.title}". ${intro}

PÚBLICO E NÍVEL: ${input.audience || "estudantes de pós-graduação"} (${input.level || "pós-graduação"}), em ${input.language || "português do Brasil"}.

MAPA DESTA SEMANA (obrigatório):
- Título da semana: ${focus.theme}
- Pergunta central: ${focus.centralQuestion}
- Objetivos (use estes, com estas palavras, na seção "Objetivos de aprendizagem"):
${listText(focus.objectives)}
- Conceitos novos a definir: ${JSON.stringify(focus.newConcepts)}
- Sequência sugerida das seções: ${JSON.stringify(focus.sectionSequence)}
- Ponte recebida: ${focus.bridgeFromPrevious || "(abertura do curso)"}
- Ponte para a próxima semana: ${focus.bridgeToNext || "(encerramento do curso)"}
- Marco da etapa: ${focus.projectMilestone || "(não definido)"}
- Elementos obrigatórios: ${JSON.stringify(focus.mustInclude)}
- Não repetir nem antecipar: ${focus.doNotRepeat}

TAMANHO: pelo menos ${targets.requiredSectionCount} seções numeradas, cada uma com cerca de ${targets.sectionTargetWords} palavras (mínimo ${targets.sectionMinimumWords}); no total, ao menos ${targets.targetWords} palavras de texto para o estudante. Textos curtos serão recusados: desenvolva cada ideia com conceito, caso concreto, lição e limite antes de passar à seguinte.

RECURSOS: ${resourcePlan.videosPerWeek} vídeo(s) e ${resourcePlan.articlesPerWeek} artigo(s) nesta semana (${resourcePlan.requiredReadingsPerWeek} de leitura obrigatória, nível ${resourcePlan.requiredReadingLevel}). Cada um é um callout 🔎 colocado no parágrafo exato em que ajuda, com "busca" específica. ${provided.length ? `Links fornecidos pelo professor (únicos que podem aparecer em "url:"): ${provided.join(" ")}` : "O professor não forneceu links: use somente \"busca\"."}
${bridge ? `\n${bridge}\n` : ""}
${closingRequirement()} Esse texto vai na seção "O que vem por aí", em um único parágrafo.
${previousWeeksBlock(previousWeeks)}
${revision}

BRIEFING DO CURSO:
${JSON.stringify(compactInput, null, 2)}

Escreva agora o documento completo em Markdown, no formato indicado, sem comentários antes ou depois.`;
}

async function writeMarkdown(messages, options) {
  let { text, truncated } = await callText(messages, { ...options, cacheSystem: true });
  if (truncated) {
    // A saída acabou no meio do texto: pede a continuação a partir do ponto exato.
    const continuation = await callText([
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: "Sua resposta foi cortada pelo limite de saída. Continue exatamente de onde parou, sem repetir nada do que já escreveu, e termine o documento com todas as seções que faltam (Síntese conceitual, O que vem por aí, Glossário rápido desta semana, Referências desta semana e Pontos a conferir)." }
    ], { ...options, cacheSystem: true });
    text = `${text.trimEnd()}\n\n${continuation.text.trimStart()}`;
    truncated = continuation.truncated;
  }
  return { text, truncated };
}

const DERIVATIVES_SYSTEM = `Você é designer instrucional de um curso de pós-graduação a distância. Recebe uma semana de material didático já escrita e produz, em JSON válido, as peças que dependem dela: avaliação, atividades, verificações formativas e mensagens de mediação. Tudo precisa ser respondível e verificável a partir do texto recebido; nunca cobre algo que o texto não ensinou. Escreva em português do Brasil, no mesmo tom do texto.`;

export function derivativesPrompt(input, index, plan, scheduledPractices, part = "all") {
  const weekNumber = index + 1;
  const sections = (plan.contentSections || []).map((section) => `### ${section.number}. ${section.title}\n${plain(String(section.body || "").replace(/<[^>]+>/g, " "))}\n${(section.subsections || []).map((sub) => `#### ${sub.number} ${sub.title}\n${plain(String(sub.body || "").replace(/<[^>]+>/g, " "))}`).join("\n")}`).join("\n\n");
  const text = `${plain(String(plan.welcome || "").replace(/<[^>]+>/g, " "))}\n\n${sections}\n\nSÍNTESE: ${plain(String(plan.synthesis || "").replace(/<[^>]+>/g, " "))}`.slice(0, 40000);
  return `Texto da semana ${weekNumber} ("${plan.theme}") do curso "${input.title}":

${text}

Objetivos da semana:
${listText(plan.learningObjectives)}

Devolva somente este objeto JSON:
{
${part === "guide" ? "" : `  "assessment": {
    "title": "Atividade avaliativa — Semana ${weekNumber}",
    "format": "6 questões objetivas de múltipla escolha, com 5 alternativas e feedback em todas elas",
    "questions": [
      { "type": "multiple-choice", "objective": "objetivo observável coberto", "q": "enunciado", "options": ["A","B","C","D","E"], "answer": 0, "explanation": "por que a correta está certa, citando o texto", "feedbackByOption": ["feedback da alternativa A","...B","...C","...D","...E"] }
    ]
  }`}${part === "all" ? ",\n" : ""}${part === "assessment" ? "" : `  "diagnostic": { "prompt": "pergunta de entrada ligada ao dia a dia do estudante", "expectedEvidence": "...", "feedback": "..." },
  "formativeChecks": [ { "moment": "Depois da seção N", "prompt": "pergunta", "expectedEvidence": "...", "feedback": "...", "action": "o que fazer se errar" } ],
  "activities": [ { "type": "fórum", "title": "...", "instructions": "...", "durationMinutes": 40, "evidence": "...", "evidenceType": "...", "feedback": "...", "criteria": ["..."], "required": true } ],
  "selfAssessment": { "title": "Autoavaliação", "prompts": ["..."], "scale": ["..."], "feedback": "..." },
  "teacherGuide": {
    "resourceNotes": ["orientação ao professor sobre os recursos desta semana"],
    "mediationStops": [ { "id": "stop-1", "title": "Abertura", "timing": "início da semana", "purpose": "..." } ],
    "mediationMessages": {
      "whatsapp": [ { "relatedId": "stop-1", "relatedType": "abertura", "timing": "...", "purpose": "...", "studentNeed": "...", "teacherIntent": "...", "tone": "próximo, com humor leve", "text": "mensagem curta, humana" } ],
      "moodle": [ { "relatedId": "stop-1", "relatedType": "abertura", "timing": "...", "purpose": "...", "studentNeed": "...", "teacherIntent": "...", "tone": "claro e organizado", "text": "aviso de curso organizado" } ]
    }${scheduledPractices.length ? ',\n    "webPracticeProjects": [ { "title": "...", "problem": "...", "context": "...", "studentRole": "...", "challenge": "...", "deliverable": "...", "steps": [ { "minutes": 10, "instructions": "...", "evidence": "..." } ], "criteria": ["..."], "fallbackPlan": "..." } ]' : ""}
  }`}
}

${part === "guide" ? "" : `REGRAS DA AVALIAÇÃO
- Exatamente 6 questões, todas de múltipla escolha com EXATAMENTE 5 alternativas e uma única correta, cobrindo todos os objetivos. Não use verdadeiro/falso. "answer" é o índice (começando em 0, de 0 a 4) da alternativa correta; varie a posição da correta entre as questões.
- Enunciados diretos, sem "todas as anteriores" e sem pegadinha de redação. As alternativas erradas devem ser plausíveis: erros reais de leitura do conceito, não absurdos.
- "feedbackByOption" tem EXATAMENTE 5 entradas, na mesma ordem das alternativas, todas preenchidas: a da correta explica por que está certa (citando o texto); cada uma das 4 erradas explica o equívoco de leitura em uma ou duas frases e aponta a seção que o corrige (por exemplo, "releia a seção 3"). Nenhum feedback pode ser vazio ou genérico ("errado").
- Nada de números, nomes ou datas que o texto não tenha dito.

`}${part === "assessment" ? "" : `REGRAS DO MATERIAL DE MEDIAÇÃO
- Uma parada para a abertura, uma para cada verificação formativa ou atividade e uma para o fechamento. Para cada parada, uma mensagem de WhatsApp e uma de Moodle, de teor equivalente, mas não cópia: o WhatsApp é mais próximo e pode ter humor leve; o Moodle, mais organizado.
- As mensagens explicam por que vale a pena fazer a etapa, reconhecem a dificuldade e convidam a uma ação concreta. Não invente data, link nem obrigação que não esteja no briefing.
${scheduledPractices.length ? `- Há webprática agendada para esta semana: desenvolva o projeto completo apenas em teacherGuide.webPracticeProjects (nunca no texto do aluno). Briefing da prática: ${JSON.stringify(scheduledPractices.map((practice, practiceIndex) => compactBriefingPractice(practice, practiceIndex)))}\n` : ""}
`}Responda somente JSON válido.`;
}

// A avaliação (6 questões × 5 alternativas × 5 feedbacks) e o material de mediação
// somam mais saída do que cabe em uma só resposta. São duas chamadas em paralelo,
// cada uma com o seu limite de saída; se uma falha, a outra não se perde na repetição
// (o erro é da etapa inteira e a repetição refaz as duas).
async function buildDerivatives(input, index, plan) {
  const scheduled = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index));
  const call = (part, maxTokens) => callJson([
    { role: "system", content: DERIVATIVES_SYSTEM },
    { role: "user", content: derivativesPrompt(input, index, plan, scheduled, part) }
  ], {
    temperature: 0.35,
    maxTokens,
    cacheSystem: true,
    formatRetryInstruction: `A resposta anterior foi truncada ou inválida. Devolva novamente somente o objeto JSON pedido (${part === "assessment" ? "assessment" : "diagnostic, formativeChecks, activities, selfAssessment, teacherGuide"}), sempre com JSON válido e completo.`
  });
  try {
    // allSettled: não deixa uma chamada solta rodando (e gastando tokens) depois que a outra falhou.
    const [assessmentResult, guideResult] = await Promise.allSettled([call("assessment", 8000), call("guide", 12000)]);
    if (assessmentResult.status === "rejected") throw assessmentResult.reason;
    if (guideResult.status === "rejected") throw guideResult.reason;
    const assessment = assessmentResult.value;
    const guide = guideResult.value;
    const data = { ...(guide && typeof guide === "object" ? guide : {}), ...(assessment && typeof assessment === "object" && assessment.assessment ? { assessment: assessment.assessment } : {}) };
    return { data, error: "" };
  } catch (error) {
    return { data: {}, error: error?.message || "Falha ao gerar a avaliação e o Material de Mediação." };
  }
}

function mergeDerivatives(plan, derivatives) {
  const pick = (key) => derivatives[key] && (Array.isArray(derivatives[key]) ? derivatives[key].length : Object.keys(derivatives[key]).length) ? { [key]: derivatives[key] } : {};
  return { ...plan, ...pick("assessment"), ...pick("diagnostic"), ...pick("formativeChecks"), ...pick("activities"), ...pick("selfAssessment") };
}

async function composeWeek(input, index, markdown, options = {}) {
  // Se a redação já consumiu boa parte do tempo da requisição, os derivados saem
  // numa requisição própria (/api/derivatives) em vez de estourar o limite da hospedagem.
  const limitMs = Number(process.env.AULA_WRITER_DERIVATIVES_AFTER_MS || 170000);
  const deferDerivatives = Boolean(options.deferDerivatives) || (options.startedAt > 0 && Date.now() - options.startedAt > limitMs);
  const weekNumber = index + 1;
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const resourcePlan = resourcePlanForWeek(input, index);
  const { lessonPlan: parsed, stats } = parseWeekMarkdown(markdown, { allowedUrls: urlsIn({ videoLinks: input.videoLinks, imageLinks: input.imageLinks, materials: input.materials, references: input.references }), requiredReadings: resourcePlan.requiredReadingsPerWeek, weekNumber });
  const factCheck = applyFactCheck(parsed, { input, previousWeeks: options.previousWeeks });
  const { data: derivatives, error: derivativesError } = deferDerivatives ? { data: {}, error: "" } : await buildDerivatives(input, index, { ...parsed, theme: parsed.theme || weekFocus.theme });
  const raw = { lessonPlan: mergeDerivatives(parsed, derivatives), teacherGuide: derivatives.teacherGuide && typeof derivatives.teacherGuide === "object" ? derivatives.teacherGuide : {} };
  enforceWeekFocus(raw, weekFocus, weekNumber);
  return { raw, stats: { ...stats, factCheck }, derivativesError, weekFocus, derivativesPending: deferDerivatives };
}

function academicStub(input, index, weekFocus) {
  return normalizeAcademicPlan({
    weekNumber: index + 1,
    theme: weekFocus.theme,
    centralQuestion: weekFocus.centralQuestion,
    objectives: weekFocus.objectives,
    centralConcepts: weekFocus.newConcepts,
    sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title, purpose: "Desenvolver a progressão específica da semana." })),
    controversies: [weekFocus.doNotRepeat]
  }, input, index);
}

function finish(input, index, composed, { truncated, mode, previousWeeks, deferRepair }) {
  const { raw, stats, derivativesError, weekFocus, derivativesPending } = composed;
  const academicPlan = academicStub(input, index, weekFocus);
  const lesson = normalizeLesson(raw, input, index);
  const quality = measureLessonQuality(lesson, input, { peerLessons: previousWeeks || [] });
  const reasons = [];
  if (truncated) reasons.push("a redação foi cortada pelo limite de saída");
  if (derivativesError) reasons.push("a avaliação e o Material de Mediação não puderam ser gerados; refaça a semana");
  if (quality.status === "insufficient" || quality.wordCount < quality.minimumWords) reasons.push(...(quality.issues || []).slice(0, 5));
  const generationMeta = {
    phase: reasons.length ? "draft" : "complete",
    mode,
    writer: "prose",
    model: getAIModel(),
    repairPending: Boolean(deferRepair && reasons.length),
    // A avaliação e o Material de Mediação saem numa segunda requisição (/api/derivatives),
    // para que cada requisição tenha o seu próprio limite de tempo na hospedagem.
    derivativesPending: Boolean(derivativesPending),
    repairAttempts: 0,
    repairReason: reasons.slice(0, 8),
    nextAction: reasons.length ? "Refazer esta semana pela prévia (ela já foi salva)." : undefined,
    initialQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords },
    finalQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords },
    writerStats: stats
  };
  return {
    ...raw,
    academicPlan,
    teacherGuide: { ...(raw.teacherGuide || {}), academicPlan, academicReview: { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false }, claimEvidence: raw.lessonPlan?.claimEvidence || [] },
    generationMeta
  };
}

export async function generateWeekProse(input, index, options = {}) {
  const startedAt = Date.now();
  const progression = options.progression || buildCourseProgression(input);
  const targets = qualityTargets(input);
  const messages = [
    { role: "system", content: writerSystemPrompt() },
    { role: "user", content: buildWriterPrompt(input, index, { progression, previousWeeks: options.previousWeeks, bridges: options.bridges }) }
  ];
  const draft = await writeMarkdown(messages, { temperature: 0.6, maxTokens: writerTokenBudget(targets), ignoreRequestBudget: true });
  const composed = await composeWeek(input, index, draft.text, { progression, deferDerivatives: options.deferDerivatives, startedAt, previousWeeks: options.previousWeeks });
  return finish(input, index, composed, { truncated: draft.truncated, mode: "prose-writer", previousWeeks: options.previousWeeks, deferRepair: options.deferRepair });
}

export async function regenerateWeekProse(input, index, currentWeek, instruction, options = {}) {
  const startedAt = Date.now();
  input = applyCompositionInstruction(input, index, instruction);
  const progression = options.progression || buildCourseProgression(input);
  const targets = qualityTargets(input);
  const current = currentWeek?.lessonPlan || currentWeek || {};
  const messages = [
    { role: "system", content: writerSystemPrompt() },
    { role: "user", content: buildWriterPrompt(input, index, { progression, previousWeeks: options.previousWeeks, bridges: options.bridges, current, instruction }) }
  ];
  const draft = await writeMarkdown(messages, { temperature: 0.5, maxTokens: writerTokenBudget(targets), ignoreRequestBudget: true });
  const composed = await composeWeek(input, index, draft.text, { progression, deferDerivatives: options.deferDerivatives, startedAt, previousWeeks: options.previousWeeks });
  return finish(input, index, composed, { truncated: draft.truncated, mode: "prose-regenerate", previousWeeks: options.previousWeeks, deferRepair: false });
}

// Segunda etapa do modo de prosa: avaliação, atividades e Material de Mediação a
// partir do texto que o professor já tem. Recebe a semana normalizada (lessonPlan)
// e devolve a semana reconstruída, o guia do professor e o novo estado de geração.
export async function completeWeekDerivatives(input, index, week, teacherGuide = {}) {
  const plan = week?.lessonPlan || {};
  if (!Array.isArray(plan.contentSections) || !plan.contentSections.length) {
    const error = new Error("Envie a semana já escrita para gerar a avaliação e o Material de Mediação.");
    error.code = "DERIVATIVES_WEEK_MISSING";
    throw error;
  }
  const { data, error } = await buildDerivatives(input, index, plan);
  if (error) {
    const failure = new Error(`Não foi possível gerar a avaliação e o Material de Mediação desta semana. O texto foi preservado; tente novamente. (${error})`);
    failure.code = "DERIVATIVES_FAILED";
    failure.retryable = true;
    throw failure;
  }
  const guide = { ...(teacherGuide && typeof teacherGuide === "object" ? teacherGuide : {}), ...(data.teacherGuide && typeof data.teacherGuide === "object" ? data.teacherGuide : {}) };
  const lesson = normalizeLesson({ lessonPlan: mergeDerivatives(plan, data), teacherGuide: guide }, input, index);
  const quality = measureLessonQuality(lesson, input, {});
  const previous = week?.generationMeta || {};
  const reasons = (previous.repairReason || []).filter((reason) => !/avaliação e o Material de Mediação/.test(reason));
  const generation = {
    ...previous,
    derivativesPending: false,
    repairReason: reasons,
    phase: reasons.length || previous.repairPending ? previous.phase || "draft" : "complete",
    finalQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords }
  };
  lesson.generationMeta = { ...(lesson.generationMeta || {}), ...generation };
  return { week: lesson, teacherGuide: guide, generation };
}
