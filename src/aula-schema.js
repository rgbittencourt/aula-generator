import { normalizeDidacticArc, buildAlignmentMatrix, buildProgression, pedagogicalReview } from "./pedagogy.js";
import { measureLessonQuality } from "./content-quality.js";
import { normalizeAcademicProfile } from "./academic.js";
import { progressionForWeek } from "./curriculum.js";

export const DEFAULT_LICENSE = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br";

export const KNOWN_BLOCK_TYPES = new Set([
  "hero", "topic", "topic-collapsible", "topic-slider", "divider", "pagebreak",
  "titulo", "sintese", "referencias", "prose", "citacao", "eyebrow", "destaque",
  "atencao", "reflexao", "pitaco", "imagem", "parallax", "video", "audio", "cases",
  "feature", "textoimagem", "filmstrip", "tabela", "flashcards", "slider", "accordion",
  "columns", "externalembed", "linhadotempo", "quiz", "materiais", "collapsebreak"
]);

const ROOT_TYPES = new Set(["hero", "pagebreak", "sintese", "referencias", "parallax", "topic", "topic-collapsible", "topic-slider", "divider"]);
const NESTED_KEYS = ["children", "items", "columns", "eras", "events", "cards", "steps", "questions", "features"];
const text = (value, fallback = "") => String(value ?? fallback).trim();
const integer = (value, fallback) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? n : fallback; };
const number = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const bool = (value, fallback = false) => value === undefined || value === null ? fallback : Boolean(value);
const RESOURCE_READING_LEVELS = new Set(["none", "essential", "advanced", "dense"]);

function resourceCount(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  return Math.min(12, Math.max(0, integer(value, fallback)));
}

function resourceReadingLevel(value, fallback = "essential") {
  const level = text(value).toLowerCase();
  return RESOURCE_READING_LEVELS.has(level) ? level : fallback;
}

function normalizeResourceTarget(value = {}, defaults = {}) {
  const source = object(value);
  return {
    videosPerWeek: resourceCount(source.videosPerWeek ?? source.videos ?? source.videoCount, defaults.videosPerWeek ?? 1),
    articlesPerWeek: resourceCount(source.articlesPerWeek ?? source.articles ?? source.articleCount, defaults.articlesPerWeek ?? 1),
    requiredReadingsPerWeek: resourceCount(source.requiredReadingsPerWeek ?? source.requiredReadings ?? source.mandatoryReadings, defaults.requiredReadingsPerWeek ?? 1),
    requiredReadingLevel: resourceReadingLevel(source.requiredReadingLevel ?? source.readingLevel, defaults.requiredReadingLevel ?? "essential")
  };
}

export function normalizeResourcePlan(value = {}, weeks = 1) {
  const source = object(value);
  const defaults = normalizeResourceTarget(source.default || source.defaults || source, { videosPerWeek: 1, articlesPerWeek: 1, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" });
  const entries = Array.isArray(source.weeks) ? source.weeks : [];
  const weekPlans = entries.map((entry) => {
    const item = object(entry);
    const weekNumber = integer(item.weekNumber || item.week, 0);
    if (weekNumber < 1 || weekNumber > weeks) return null;
    return {
      weekNumber,
      videosPerWeek: item.videosPerWeek === "" || item.videos === "" || item.videoCount === "" ? null : resourceCount(item.videosPerWeek ?? item.videos ?? item.videoCount, defaults.videosPerWeek),
      articlesPerWeek: item.articlesPerWeek === "" || item.articles === "" || item.articleCount === "" ? null : resourceCount(item.articlesPerWeek ?? item.articles ?? item.articleCount, defaults.articlesPerWeek),
      requiredReadingsPerWeek: item.requiredReadingsPerWeek === "" || item.requiredReadings === "" || item.mandatoryReadings === "" ? null : resourceCount(item.requiredReadingsPerWeek ?? item.requiredReadings ?? item.mandatoryReadings, defaults.requiredReadingsPerWeek),
      requiredReadingLevel: text(item.requiredReadingLevel || item.readingLevel) ? resourceReadingLevel(item.requiredReadingLevel || item.readingLevel, defaults.requiredReadingLevel) : null
    };
  }).filter(Boolean).filter((entry, index, list) => list.findIndex((candidate) => candidate.weekNumber === entry.weekNumber) === index);
  return { default: defaults, weeks: weekPlans };
}

export function resourcePlanForWeek(input = {}, index = 0) {
  const plan = input.resourcePlan || normalizeResourcePlan({}, input.weeks || 1);
  const defaults = plan.default || normalizeResourcePlan({}, input.weeks || 1).default;
  const override = (plan.weeks || []).find((entry) => entry.weekNumber === index + 1) || {};
  return {
    weekNumber: index + 1,
    videosPerWeek: resourceCount(override.videosPerWeek, defaults.videosPerWeek),
    articlesPerWeek: resourceCount(override.articlesPerWeek, defaults.articlesPerWeek),
    requiredReadingsPerWeek: resourceCount(override.requiredReadingsPerWeek, defaults.requiredReadingsPerWeek),
    requiredReadingLevel: resourceReadingLevel(override.requiredReadingLevel, defaults.requiredReadingLevel)
  };
}

function defaultWeeklyObjectives(input = {}, index = 0) {
  const supplied = splitLines(input.objectives);
  const topic = text(input.title, "o tema da semana");
  const defaults = [
    `Explicar os conceitos centrais de ${topic} na perspectiva desta semana.`,
    `Relacionar ${topic} a um exemplo ou problema concreto do contexto educacional.`,
    `Analisar criticamente implicações, limites ou decisões associadas a ${topic}.`,
    `Aplicar o que foi estudado em uma situação de gestão, pesquisa ou produção.`,
    "Sintetizar os aprendizados e formular uma pergunta para continuar o percurso."
  ];
  const rotated = supplied.length ? supplied.map((item, itemIndex) => `${item} — foco da semana ${index + 1}`) : [];
  return [...rotated, ...defaults].filter((item, itemIndex, list) => list.indexOf(item) === itemIndex).slice(0, 8);
}

function specificTheme(value, input, index) {
  const candidate = text(value);
  if (candidate && !/^conteúdo da semana$|^seção \d+$|^sem título$/iu.test(candidate)) return candidate;
  return `${text(input.title, "Curso")} — Semana ${index + 1}`;
}

export function splitLines(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function slugify(value, fallback = "aula") {
  const slug = text(value, fallback).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeResource(value = {}, index = 0, defaultKind = "material") {
  const resource = object(value);
  const href = text(resource.href || resource.link || resource.url);
  const verificationStatus = text(resource.verificationStatus, href ? "provided-needs-review" : "suggested-no-url");
  const researchStatus = text(resource.researchStatus || resource.status, href ? "candidate-found" : "suggested");
  const accessibility = object(resource.accessibility || resource.videoAccessibility);
  return {
    id: text(resource.id, `${slugify(defaultKind)}-${index + 1}`),
    kind: text(resource.kind || resource.type, defaultKind),
    title: text(resource.title, "Recurso sugerido"),
    href,
    source: text(resource.source || resource.publisher || resource.institution),
    author: text(resource.author),
    required: bool(resource.required ?? resource.mandatory, false),
    moment: text(resource.moment || resource.placement),
    objective: text(resource.objective || resource.purpose),
    guidingQuestion: text(resource.guidingQuestion || resource.question),
    bridgeParagraph: text(resource.bridgeParagraph || resource.connectionParagraph || resource.bridge),
    durationMinutes: Math.max(0, number(resource.durationMinutes || resource.duration, 0)),
    pages: text(resource.pages),
    wordCount: Math.max(0, number(resource.wordCount || resource.words, 0)),
    year: text(resource.year),
    altText: text(resource.altText || resource.alt),
    caption: text(resource.caption),
    credit: text(resource.credit),
    license: text(resource.license),
    licenseUrl: text(resource.licenseUrl),
    sourcePage: text(resource.sourcePage),
    provider: text(resource.provider),
    thumbnail: text(resource.thumbnail),
    sectionNumber: text(resource.sectionNumber || resource.section || resource.sectionId),
    searchQuery: text(resource.searchQuery || resource.query),
    candidateId: text(resource.candidateId),
    researchRequestId: text(resource.researchRequestId),
    selectionReason: text(resource.selectionReason),
    pedagogicalUse: text(resource.pedagogicalUse),
    researchStatus,
    humanApproval: text(resource.humanApproval || resource.approvalStatus, "pending"),
    curation: {
      alignment: text(resource.curation?.alignment || resource.alignmentScore),
      quality: text(resource.curation?.quality || resource.qualityAssessment),
      currency: text(resource.curation?.currency || resource.currentness),
      accessibility: text(resource.curation?.accessibility || resource.accessibilityAssessment),
      durationFit: text(resource.curation?.durationFit),
      license: text(resource.curation?.license || resource.licenseAssessment),
      language: text(resource.curation?.language || resource.languageFit),
      moment: text(resource.curation?.moment || resource.momentFit),
      score: Math.max(0, number(resource.curation?.score || resource.curationScore, 0))
    },
    accessibility: {
      hasCaptions: bool(accessibility.hasCaptions ?? resource.hasCaptions, false),
      hasTranscript: bool(accessibility.hasTranscript ?? resource.hasTranscript, false),
      summary: text(accessibility.summary || resource.accessibilitySummary),
      lowBandwidthAlternative: text(accessibility.lowBandwidthAlternative || resource.lowBandwidthAlternative),
      altText: text(accessibility.altText || resource.altText || resource.alt),
      diagramAlternative: text(accessibility.diagramAlternative || resource.diagramAlternative)
    },
    videoAccessibility: ["video", "audio"].includes(text(resource.kind || resource.type, defaultKind)) ? {
      hasCaptions: bool(accessibility.hasCaptions ?? resource.hasCaptions, false),
      hasTranscript: bool(accessibility.hasTranscript ?? resource.hasTranscript, false),
      summary: text(accessibility.summary || resource.accessibilitySummary),
      lowBandwidthAlternative: text(accessibility.lowBandwidthAlternative || resource.lowBandwidthAlternative)
    } : null,
    verificationStatus,
    requiresVerification: bool(resource.requiresVerification, !href || verificationStatus !== "verified"),
    notes: text(resource.notes)
  };
}

function normalizeResources(value, defaultKind = "material") {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => normalizeResource(item, index, defaultKind)).filter((item) => item.title || item.href || item.searchQuery);
}

function normalizeArtifacts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((artifact, index) => {
    const item = object(artifact);
    return {
      id: text(item.id, `artifact-${index + 1}`),
      filename: text(item.filename || item.fileName, `arquivo-${index + 1}.md`),
      title: text(item.title, `Arquivo de apoio ${index + 1}`),
      format: text(item.format, "markdown"),
      purpose: text(item.purpose || item.objective),
      content: text(item.content || item.body),
      template: text(item.template),
      required: bool(item.required, true),
      notes: text(item.notes)
    };
  }).filter((item) => item.title || item.content || item.template);
}

function normalizeActivities(value) {
  if (!Array.isArray(value)) return [];
  return value.map((activity, index) => {
    const item = object(activity);
    return {
      id: text(item.id, `activity-${index + 1}`),
      type: text(item.type || item.kind, "atividade"),
      title: text(item.title, `Atividade ${index + 1}`),
      count: Math.max(0, number(item.count || item.quantity, 1)),
      durationMinutes: Math.max(0, number(item.durationMinutes || item.minutes, 0)),
      unitDurationMinutes: Math.max(0, number(item.unitDurationMinutes, 0)),
      hoursPerCommunication: Math.max(0, number(item.hoursPerCommunication, 0)),
      required: bool(item.required, true),
      instructions: text(item.instructions),
      evidence: text(item.evidence || item.product || item.delivery),
      evidenceType: text(item.evidenceType || item.learningEvidence),
      feedback: text(item.feedback || item.formativeFeedback),
      criteria: splitLines(item.criteria),
      notes: text(item.notes)
    };
  });
}

function normalizeRubric(value) {
  if (!Array.isArray(value)) return [];
  return value.map((criterion, index) => {
    const item = object(criterion);
    return {
      id: text(item.id, `criterion-${index + 1}`),
      criterion: text(item.criterion || item.title, `Critério ${index + 1}`),
      excellent: text(item.excellent || item.advanced || item.meets),
      developing: text(item.developing || item.basic || item.partial),
      beginning: text(item.beginning || item.insufficient || item.minimum)
    };
  });
}

function normalizePractice(value = {}, index = 0) {
  const practice = object(value);
  const steps = Array.isArray(practice.steps)
    ? practice.steps.map((step, stepIndex) => {
      const item = object(step);
      return { order: stepIndex + 1, title: text(item.title, `Etapa ${stepIndex + 1}`), instructions: text(item.instructions || item.body || item.text), minutes: Math.max(0, number(item.minutes || item.durationMinutes, 0)), evidence: text(item.evidence || item.product || item.delivery) };
    })
    : splitLines(practice.steps).map((step, stepIndex) => ({ order: stepIndex + 1, title: `Etapa ${stepIndex + 1}`, instructions: step, minutes: 0 }));
  return {
    id: text(practice.id, `webpractice-${index + 1}`),
    title: text(practice.title, `Webprática ${index + 1}`),
    type: text(practice.type, "Laboratório prático"),
    modality: text(practice.modality || practice.format, "Aula síncrona / laboratório prático"),
    weekNumber: Math.max(0, integer(practice.weekNumber || practice.week, 0)),
    date: validDate(practice.date || practice.sessionDate) ? text(practice.date || practice.sessionDate) : "",
    dayOfWeek: text(practice.dayOfWeek || practice.day),
    startTime: text(practice.startTime || practice.start),
    endTime: text(practice.endTime || practice.end),
    platform: text(practice.platform || practice.environment),
    tool: text(practice.tool || practice.tools),
    sessionTitle: text(practice.sessionTitle || practice.sessionName),
    context: text(practice.context || practice.scenario || practice.problem),
    problem: text(practice.problem || practice.context || practice.scenario),
    studentRole: text(practice.studentRole || practice.role),
    challenge: text(practice.challenge),
    prerequisites: splitLines(practice.prerequisites),
    moments: splitLines(practice.moments || practice.moment),
    objective: text(practice.objective),
    preparation: text(practice.preparation),
    teacherPreparation: splitLines(practice.teacherPreparation || practice.teacherPrep),
    studentPreparation: splitLines(practice.studentPreparation || practice.studentPrep),
    materials: splitLines(practice.materials),
    instructions: text(practice.instructions),
    steps,
    product: text(practice.product || practice.deliverable || practice.delivery),
    deliverable: text(practice.deliverable || practice.product || practice.delivery),
    assessment: text(practice.assessment),
    criteria: splitLines(practice.criteria),
    rubric: normalizeRubric(practice.rubric || practice.criteria),
    prompts: splitLines(practice.prompts || practice.prompt),
    roteiro: object(practice.roteiro || practice.sessionPlan || practice.timeline),
    artifacts: normalizeArtifacts(practice.artifacts || practice.files || practice.outputs),
    continuation: text(practice.continuation),
    fallbackPlan: text(practice.fallbackPlan || practice.planB),
    revision: text(practice.revision || practice.reviewProcess),
    examples: normalizeArtifacts(practice.examples || practice.exampleFiles),
    variants: { simplified: text(practice.variants?.simplified || practice.simplifiedVersion), advanced: text(practice.variants?.advanced || practice.advancedVersion) },
    resources: normalizeResources(practice.resources, "practice-resource"),
    durationMinutes: Math.max(0, number(practice.durationMinutes || practice.sessionMinutes, 45)),
    delivery: text(practice.delivery || practice.evidence)
  };
}

function studentPractice(practice = {}) {
  return {
    id: text(practice.id),
    title: text(practice.title),
    type: text(practice.type),
    moments: splitLines(practice.moments),
    objective: text(practice.objective),
    instructions: text(practice.instructions),
    steps: Array.isArray(practice.steps) ? practice.steps.map((step) => ({ order: step.order, title: text(step.title), instructions: text(step.instructions), minutes: Math.max(0, number(step.minutes, 0)), evidence: text(step.evidence) })) : [],
    product: text(practice.product || practice.delivery),
    assessment: text(practice.assessment),
    durationMinutes: Math.max(0, number(practice.durationMinutes, 0))
  };
}

function normalizeMaterial(value = {}, index = 0) {
  const material = object(value);
  const normalized = normalizeResource({ ...material, kind: material.kind || material.type, href: material.link || material.href }, index, "material");
  return {
    ...normalized,
    type: text(material.type || material.kind, "Texto-base"),
    link: normalized.href,
    alignment: text(material.alignment || material.contentAlignment),
    use: text(material.use || material.howToUse || material.readingGuide),
    notes: text(material.notes)
  };
}

function normalizeSection(value = {}, index = 0) {
  const section = object(value);
  const reflection = section.reflection || section.reflexao;
  const caseStudy = object(section.caseStudy || section.studyCase);
  return {
    number: text(section.number, String(index + 1)),
    title: text(section.title, `Seção ${index + 1}`),
    body: text(section.body || section.content),
    subsections: Array.isArray(section.subsections) ? section.subsections.map((item, subIndex) => ({
      number: text(item?.number, `${index + 1}.${subIndex + 1}`), title: text(item?.title, `Subseção ${subIndex + 1}`), body: text(item?.body || item?.content), resources: normalizeResources(item?.resources, "subsection-resource")
    })) : [],
    caseStudy: Object.keys(caseStudy).length ? { title: text(caseStudy.title), context: text(caseStudy.context || caseStudy.body), data: text(caseStudy.data), questions: splitLines(caseStudy.questions) } : null,
    reflection: reflection ? (typeof reflection === "string" ? { question: text(reflection), body: "" } : { question: text(reflection.question || reflection.title), body: text(reflection.body || reflection.context) }) : null,
    keyTerms: splitLines(section.keyTerms || section.terms),
    counterpoint: text(section.counterpoint || section.limit || section.alternativeInterpretation),
    didacticRole: text(section.didacticRole || section.role),
    resources: normalizeResources(section.resources, "section-resource")
  };
}

function normalizeGlossary(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? { term: text(item), definition: "" } : { term: text(item?.term || item?.word), definition: text(item?.definition || item?.body) }).filter((item) => item.term || item.definition);
}

function normalizeReference(value, index = 0) {
  if (typeof value === "string") return { id: `ref-${String(index + 1).padStart(2, "0")}`, citation: text(value), type: "fonte-a-conferir", authors: [], year: "", publisher: "", doi: "", href: "", verified: false, verificationStatus: "needs-human-review", usedInSections: [], supportsClaims: [] };
  const item = object(value);
  return {
    id: text(item.id, `ref-${String(index + 1).padStart(2, "0")}`),
    citation: text(item.citation || item.title || item.reference),
    type: text(item.type, "fonte-a-conferir"),
    authors: splitLines(item.authors || item.author),
    year: text(item.year),
    publisher: text(item.publisher || item.journal || item.institution),
    doi: text(item.doi),
    href: text(item.href || item.url || item.link),
    verified: bool(item.verified, false),
    verificationStatus: text(item.verificationStatus, item.verified ? "verified" : "needs-human-review"),
    usedInSections: splitLines(item.usedInSections || item.sections),
    supportsClaims: splitLines(item.supportsClaims || item.claimIds),
    notes: text(item.notes)
  };
}

function normalizeReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeReference).filter((item) => item.citation || item.href || item.doi);
}

function normalizeClaimEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const item = object(entry);
    return {
      id: text(item.id, `claim-${String(index + 1).padStart(2, "0")}`),
      claim: text(item.claim),
      sectionNumber: text(item.sectionNumber || item.section),
      sourceIds: splitLines(item.sourceIds || item.sources),
      sourceType: text(item.sourceType),
      supportLevel: text(item.supportLevel, "insufficient"),
      verificationStatus: text(item.verificationStatus, "needs-human-review"),
      note: text(item.note)
    };
  }).filter((item) => item.claim);
}

function normalizeAssessment(value = {}) {
  const assessment = object(value);
  const questions = Array.isArray(assessment.questions) ? assessment.questions.map((question, index) => {
    const item = object(question);
    const options = Array.isArray(item.options) ? item.options.map((option) => text(option)).filter(Boolean) : [];
    return {
      id: text(item.id, `question-${index + 1}`),
      type: text(item.type, options.length === 2 ? "true-false" : "multiple-choice"),
      objective: text(item.objective),
      q: text(item.q || item.question),
      options,
      answer: Number.isFinite(Number(item.answer)) ? Number(item.answer) : (typeof item.answer === "boolean" ? (item.answer ? 1 : 0) : 0),
      explanation: text(item.explanation || item.feedback),
      feedbackByOption: Array.isArray(item.feedbackByOption || item.optionFeedback) ? (item.feedbackByOption || item.optionFeedback).map((feedback) => text(feedback)) : [],
      formative: bool(item.formative, false),
      summative: bool(item.summative, true),
      points: Math.max(0, number(item.points, 1))
    };
  }).filter((item) => item.q) : [];
  return {
    title: text(assessment.title, "Atividade avaliativa"),
    format: text(assessment.format, "4 questões de múltipla escolha + 2 de verdadeiro/falso"),
    required: bool(assessment.required, true),
    passMark: number(assessment.passMark, 6),
    durationMinutes: Math.max(0, number(assessment.durationMinutes || assessment.timeEstimateMinutes, 0)),
    questions,
    moodleGift: text(assessment.moodleGift || assessment.gift),
    feedback: text(assessment.feedback),
    notes: text(assessment.notes)
  };
}

function normalizeTimePlan(value = {}) {
  const plan = object(value);
  const items = Array.isArray(plan.items) ? plan.items.map((item, index) => {
    const entry = object(item);
    const minutes = Math.max(0, number(entry.minutes ?? entry.estimatedMinutes, 0));
    return {
      id: text(entry.id, `time-${index + 1}`),
      title: text(entry.title, `Atividade ${index + 1}`),
      category: text(entry.category, "content"),
      minutes,
      estimatedMinutes: minutes,
      learnerMinutes: Math.max(0, number(entry.learnerMinutes, minutes)),
      instructionalMinutes: Math.max(0, number(entry.instructionalMinutes, 0)),
      required: bool(entry.required, true),
      basis: text(entry.basis, "estimativa pedagógica"),
      confidence: text(entry.confidence, "medium"),
      formulaKey: text(entry.formulaKey),
      details: object(entry.details)
    };
  }).filter((item) => item.minutes > 0 || item.title) : [];
  return {
    targetMinutes: Math.max(0, number(plan.targetMinutes, 0)),
    targetLearnerMinutes: Math.max(0, number(plan.targetLearnerMinutes, plan.targetMinutes)),
    targetInstructionalMinutes: Math.max(0, number(plan.targetInstructionalMinutes, 0)),
    calculatedMinutes: Math.max(0, number(plan.calculatedMinutes, 0)),
    requiredMinutes: Math.max(0, number(plan.requiredMinutes, 0)),
    optionalMinutes: Math.max(0, number(plan.optionalMinutes, 0)),
    instructionalMinutes: Math.max(0, number(plan.instructionalMinutes, 0)),
    items,
    unresolved: Array.isArray(plan.unresolved) ? plan.unresolved.map((entry) => object(entry)) : [],
    formulaProfile: object(plan.formulaProfile),
    workloadAdjustment: object(plan.workloadAdjustment),
    breakdown: object(plan.breakdown),
    calculationMethod: text(plan.calculationMethod, "derived-after-content"),
    notes: text(plan.notes)
  };
}

function normalizeDiagnostic(value) {
  if (typeof value === "string") return { prompt: text(value), type: "pergunta de entrada", evidence: "resposta inicial do estudante" };
  const source = object(value);
  return { type: text(source.type, "pergunta de entrada"), prompt: text(source.prompt || source.question || source.instructions), expectedEvidence: text(source.expectedEvidence || source.evidence), feedback: text(source.feedback), justification: text(source.justification) };
}

function normalizeFormativeChecks(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const item = object(entry);
    return { id: text(item.id, `check-${index + 1}`), moment: text(item.moment || item.when, `Durante a seção ${index + 1}`), prompt: text(item.prompt || item.question || item.instructions), expectedEvidence: text(item.expectedEvidence || item.evidence), feedback: text(item.feedback), action: text(item.action || item.ifWrong) };
  }).filter((item) => item.prompt || item.expectedEvidence);
}

function normalizeDifferentiation(value) {
  const source = object(value);
  const normalize = (items) => Array.isArray(items) ? items.map((item) => typeof item === "string" ? { title: item, instructions: item, resources: [] } : { title: text(item?.title || item?.label), instructions: text(item?.instructions || item?.body || item?.description), resources: normalizeResources(item?.resources, "differentiation-resource") }).filter((item) => item.title || item.instructions) : [];
  return { support: normalize(source.support || source.essential || source.recovery), standard: normalize(source.standard || source.core), extension: normalize(source.extension || source.advanced || source.deepening), rationale: text(source.rationale) };
}

function normalizeSelfAssessment(value) {
  const source = object(value);
  return { title: text(source.title, "Autoavaliação"), prompts: splitLines(source.prompts || source.questions || source.items), scale: splitLines(source.scale), feedback: text(source.feedback) };
}

export function normalizeLessonPlan(raw = {}, input = {}, index = 0) {
  const plan = object(raw);
  const resources = object(plan.resources);
  const rawSections = Array.isArray(plan.contentSections) ? plan.contentSections : (Array.isArray(plan.sections) ? plan.sections : []);
  const contentSections = rawSections.length
    ? rawSections.map(normalizeSection).filter((section) => section.title || section.body || section.subsections.length)
    : [{ number: "1", title: `${text(input.title, "Tema")} em contexto`, body: text(input.content, `Estude os conceitos centrais de ${input.title} e relacione-os a exemplos concretos da gestão educacional.`), subsections: [], caseStudy: null, reflection: null, keyTerms: [], resources: [] }];
  const videos = normalizeResources(resources.videos || plan.videos, "video");
  const requiredReadings = normalizeResources(resources.readingsRequired || plan.readingsRequired, "reading-required");
  const extraReadings = normalizeResources(resources.readingsExtra || plan.readingsExtra, "reading-extra");
  const images = normalizeResources(resources.images || plan.images, "image");
  const podcasts = normalizeResources(resources.podcasts || plan.podcasts, "podcast");
  const datasets = normalizeResources(resources.datasets || plan.datasets, "dataset");
  // A webprática é uma sessão síncrona independente e será entregue em DOCX.
  // Nunca a misture no texto-base nem nos blocos do aluno.
  const practices = [];
  const activities = normalizeActivities(plan.activities);
  const normalized = {
    weekNumber: index + 1,
    theme: specificTheme(plan.theme || plan.title, input, index),
    welcome: text(plan.welcome || plan.welcomeText, `Nesta semana, você vai compreender ${text(input.title, "o tema do curso")} a partir de conceitos, exemplos e uma aplicação orientada. A leitura retoma o percurso anterior e prepara a próxima etapa.`),
    learningObjectives: splitLines(plan.learningObjectives || plan.objectives).length ? splitLines(plan.learningObjectives || plan.objectives) : defaultWeeklyObjectives(input, index),
    prerequisites: splitLines(plan.prerequisites),
    contentDensity: text(plan.contentDensity, "completa"),
    didacticArc: normalizeDidacticArc(plan.didacticArc, false, index),
    contentSections,
    resources: { videos, readingsRequired: requiredReadings, readingsExtra: extraReadings, images, podcasts, datasets },
    webPractices: [],
    activities,
    diagnostic: normalizeDiagnostic(plan.diagnostic || plan.initialDiagnostic),
    formativeChecks: normalizeFormativeChecks(plan.formativeChecks || plan.checkpoints),
    differentiation: normalizeDifferentiation(plan.differentiation),
    selfAssessment: normalizeSelfAssessment(plan.selfAssessment || plan.studentSelfAssessment),
    synthesis: text(plan.synthesis),
    nextWeekConnection: text(plan.nextWeekConnection || plan.whatsNext),
    glossary: normalizeGlossary(plan.glossary),
    references: normalizeReferences(plan.references || input.references),
    claimEvidence: normalizeClaimEvidence(plan.claimEvidence || plan.evidenceMap),
    assessment: normalizeAssessment(plan.assessment),
    resourceResearch: object(plan.resourceResearch),
    alignmentMatrix: Array.isArray(plan.alignmentMatrix) ? plan.alignmentMatrix : [],
    spiralReview: object(plan.spiralReview),
    timePlan: normalizeTimePlan(plan.timePlan),
    humanReview: bool(plan.humanReview ?? plan.requiresHumanReview, true),
    academicProfile: normalizeAcademicProfile(input.academicProfile, input),
    academicPlan: object(plan.academicPlan),
    notes: splitLines(plan.notes)
  };
  normalized.alignmentMatrix = buildAlignmentMatrix(normalized);
  normalized.spiralReview = buildProgression(normalized, index);
  normalized.pedagogicalReview = pedagogicalReview(normalized);
  return normalized;
}

export function normalizeCourseInput(raw = {}) {
  const calendarMode = raw.calendarMode === "calendar" ? "calendar" : "week-number";
  const weeks = Math.min(52, Math.max(1, integer(raw.weeks, 1)));
  const hoursPerWeek = Math.min(80, Math.max(0, number(raw.hoursPerWeek, 4)));
  const practice = raw.webPractice && typeof raw.webPractice === "object" ? raw.webPractice : {};
  const enabled = Boolean(raw.webPracticeEnabled ?? practice.enabled ?? (Array.isArray(raw.webPractices) && raw.webPractices.length));
  const rawPractices = Array.isArray(raw.webPractices) ? raw.webPractices : [];
  const webPractices = enabled ? (rawPractices.length ? rawPractices.map(normalizePractice) : [normalizePractice(practice, 0)]) : [];
  const legacyMoments = webPractices.flatMap((item) => item.moments);
  const legacyInstructions = webPractices.map((item) => `${item.title}: ${item.instructions}`).filter(Boolean).join("\n");
  const materials = Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial).filter((material) => material.title || material.objective || material.alignment || material.link || material.use) : [];
  return {
    title: text(raw.title || raw.generalTheme, "Curso sem título"),
    audience: text(raw.audience, "Adultos em formação"),
    level: text(raw.level, "Intermediário"),
    objectives: splitLines(raw.objectives),
    content: text(raw.content),
    references: splitLines(raw.references),
    videoLinks: splitLines(raw.videoLinks),
    videoSearchSuggestions: splitLines(raw.videoSearchSuggestions),
    imageLinks: splitLines(raw.imageLinks),
    imageSearchSuggestions: splitLines(raw.imageSearchSuggestions),
    materials,
    weeks, hoursPerWeek, calendarMode,
    didacticMode: text(raw.didacticMode, "auto"),
    startDate: calendarMode === "calendar" && validDate(raw.startDate) ? raw.startDate : null,
    webPractices,
    webPractice: { enabled, moments: legacyMoments.length ? legacyMoments : splitLines(practice.moments || raw.practiceMoments), instructions: legacyInstructions || text(practice.instructions || raw.practiceInstructions), durationMinutes: webPractices.reduce((sum, item) => sum + item.durationMinutes, 0) },
    resourcePlan: normalizeResourcePlan(raw.resourcePlan || raw.weeklyResourcePlan, weeks),
    author: text(raw.author), role: text(raw.role), institution: text(raw.institution), year: text(raw.year, String(new Date().getFullYear())), language: text(raw.language, "pt-BR"),
    license: text(raw.license, DEFAULT_LICENSE),
    formulaConfig: raw.formulaConfig && typeof raw.formulaConfig === "object" ? raw.formulaConfig : null,
    academicProfile: normalizeAcademicProfile(raw.academicProfile, raw)
  };
}

function addDays(dateString, days) { if (!dateString) return null; const date = new Date(`${dateString}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export function weekCalendar(input, index) {
  const weekNumber = index + 1;
  if (input.calendarMode !== "calendar" || !input.startDate) return { weekNumber, label: `Semana ${weekNumber}`, startDate: null, endDate: null };
  const startDate = addDays(input.startDate, index * 7); const endDate = addDays(startDate, 6);
  return { weekNumber, label: `Semana ${weekNumber} · ${startDate.split("-").reverse().join("/")}`, startDate, endDate };
}

export function practiceScheduledForWeek(practice = {}, input = {}, index = 0) {
  const weekNumber = index + 1;
  const directWeek = Math.max(0, integer(practice.weekNumber || practice.week, 0));
  const date = text(practice.date || practice.sessionDate);
  const hasDate = validDate(date);
  if (directWeek && directWeek !== weekNumber) return false;
  if (hasDate) {
    if (input.calendarMode !== "calendar" || !input.startDate) return false;
    const calendar = weekCalendar(input, index);
    return date >= calendar.startDate && date <= calendar.endDate;
  }
  if (directWeek) return true;
  const moments = splitLines(practice.moments || practice.moment);
  if (moments.some((moment) => new RegExp(`(?:semana|week)\\s*${weekNumber}\\b`, "i").test(moment) || new RegExp(`\\b${weekNumber}\\s*(?:ª|a)?\\s*semana\\b`, "i").test(moment))) return true;
  if (moments.some((moment) => validDate(moment))) {
    const calendar = input.calendarMode === "calendar" && input.startDate ? weekCalendar(input, index) : null;
    return Boolean(calendar && moments.some((moment) => moment >= calendar.startDate && moment <= calendar.endDate));
  }
  return false;
}

function newId(prefix, weekNumber, index) { return `${prefix}${weekNumber}-${String(index + 1).padStart(3, "0")}`; }
function safeProps(props) { return props && typeof props === "object" && !Array.isArray(props) ? { ...props } : {}; }

function normalizeNested(value, weekNumber, path, seen) {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    if (typeof item.type === "string") return sanitizeBlock(item, weekNumber, `${path}-${index}`, seen);
    const copy = { ...item };
    for (const key of NESTED_KEYS) if (Array.isArray(copy[key])) copy[key] = normalizeNested(copy[key], weekNumber, `${path}-${key}-${index}`, seen);
    return copy;
  });
}

export function sanitizeBlock(raw, weekNumber = 1, path = "block", seen = new Set()) {
  if (!raw || typeof raw !== "object") return null;
  const type = text(raw.type); if (!KNOWN_BLOCK_TYPES.has(type)) return null;
  let id = text(raw.id, `b${weekNumber}-${path}`); if (seen.has(id)) id = `${id}-${seen.size + 1}`; seen.add(id);
  const props = safeProps(raw.props);
  for (const key of NESTED_KEYS) if (Array.isArray(props[key])) props[key] = normalizeNested(props[key], weekNumber, `${id}-${key}`, seen);
  if (["topic", "topic-collapsible", "topic-slider"].includes(type)) props.children = Array.isArray(props.children) ? props.children.filter(Boolean) : [];
  return { id, type, ...(ROOT_TYPES.has(type) ? { bg: text(raw.bg, "neutral-default"), pad: text(raw.pad, "normal") } : {}), props };
}

function resourceForBlock(block, plan = {}) {
  const resources = Object.values(plan.resources || {}).flatMap((items) => Array.isArray(items) ? items : []);
  const resourceId = text(block?.props?.resourceId || block?.props?.items?.[0]?.resourceId);
  if (resourceId) return resources.find((resource) => resource.id === resourceId) || null;
  const title = text(block?.props?.title || block?.props?.caption || block?.props?.items?.[0]?.title);
  return title ? resources.find((resource) => resource.title === title) || null : null;
}

function resourceSectionIndex(resource, plan = {}, sectionCount = 1, fallbackIndex = 0) {
  const explicit = Number.parseInt(resource?.sectionNumber, 10);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= sectionCount) return explicit - 1;
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const found = sections.findIndex((section) => (section.resources || []).some((item) => item.id === resource?.id));
  return found >= 0 ? found : Math.min(Math.max(0, fallbackIndex), Math.max(0, sectionCount - 1));
}

function resourceBridgeBlock(resource, weekNumber, sectionIndex, resourceIndex) {
  const bridge = resource?.bridgeParagraph || resource?.pedagogicalUse || resource?.objective || `Use este recurso neste ponto para relacionar ${resource?.title || "o material"} ao conceito estudado nesta seção.`;
  return { id: newId("c-resource-bridge-", weekNumber, sectionIndex * 10 + resourceIndex), type: "prose", props: { body: richHtml(bridge), dropcap: false, dropcapTone: "terracotta", resourceId: resource?.id || "" } };
}

function integrateRootResources(blocks, weekNumber, plan = {}) {
  const resourceTypes = new Set(["video", "imagem", "materiais", "audio"]);
  const rootResourceBlocks = blocks.filter((block) => resourceTypes.has(block.type));
  const remaining = blocks.filter((block) => !resourceTypes.has(block.type));
  let topic = remaining.find((block) => ["topic", "topic-collapsible", "topic-slider"].includes(block.type));
  const nestedResourceBlocks = topic && Array.isArray(topic.props?.children) ? topic.props.children.filter((block) => resourceTypes.has(block.type)) : [];
  const resourceBlocks = [...rootResourceBlocks, ...nestedResourceBlocks];
  if (!resourceBlocks.length) return blocks;
  if (!topic) {
    topic = { id: newId("b-topic-", weekNumber, 90), type: "topic", bg: "neutral-default", pad: "normal", props: { children: [] } };
    remaining.push(topic);
  }
  topic.props = safeProps(topic.props);
  const resourceIds = new Set(resourceBlocks.map((block) => text(block.props?.resourceId || block.props?.items?.[0]?.resourceId || resourceForBlock(block, plan)?.id)).filter(Boolean));
  topic.props.children = (Array.isArray(topic.props.children) ? topic.props.children : []).filter((block) => !(resourceTypes.has(block.type) || (block.type === "prose" && resourceIds.has(text(block.props?.resourceId)))));
  const children = topic.props.children;
  const anchors = children.map((child, index) => ({ index, number: Number.parseInt(text(child.props?.text).match(/^\s*(\d+)/)?.[1], 10) })).filter((anchor) => Number.isInteger(anchor.number));
  const grouped = new Map();
  resourceBlocks.forEach((block, resourceIndex) => {
    const resource = resourceForBlock(block, plan);
    const sectionCount = Math.max(1, Array.isArray(plan.contentSections) && plan.contentSections.length ? plan.contentSections.length : anchors.length);
    const sectionIndex = resourceSectionIndex(resource, plan, sectionCount, resourceIndex);
    const additions = grouped.get(sectionIndex) || [];
    additions.push(resourceBridgeBlock(resource, weekNumber, sectionIndex, resourceIndex), block);
    grouped.set(sectionIndex, additions);
  });
  let offset = 0;
  [...grouped.entries()].sort(([left], [right]) => left - right).forEach(([sectionIndex, additions]) => {
    const anchor = anchors.find((entry) => entry.number === sectionIndex + 1);
    const next = anchors.find((entry) => entry.number > sectionIndex + 1);
    const start = anchor?.index ?? -1;
    const end = next?.index ?? children.length;
    const body = children.findIndex((child, index) => index > start && index < end && child.type === "prose" && !child.props?.resourceId);
    const insertAt = (body >= 0 ? body + 1 : start + 1) + offset;
    children.splice(Math.max(0, insertAt), 0, ...additions);
    offset += additions.length;
  });
  topic.props.children = children;
  return remaining;
}

export function weekMeta(input, index) {
  const calendar = weekCalendar(input, index);
  return { title: `${input.title} — ${calendar.label}`, courseTitle: input.title, weekNumber: calendar.weekNumber, weekLabel: calendar.label, calendarStartDate: calendar.startDate, calendarEndDate: calendar.endDate, studyHours: input.hoursPerWeek, author: input.author, role: input.role, institution: input.institution, year: input.year, aiTool: "", aiUse: "", license: input.license };
}

function html(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function richHtml(value) {
  const source = text(value);
  if (!source) return "";
  if (/<(?:p|ul|ol|h[1-6]|strong|em|blockquote|br)\b/i.test(source)) return source.replace(/<script[\s\S]*?<\/script>/gi, "");
  return source.split(/\n\s*\n|\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${html(paragraph)}</p>`).join("");
}
function youtubeId(value) { const match = text(value).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i); return match ? match[1] : ""; }

function fallbackLessonPlan(input, index) {
  const weekFocus = progressionForWeek(input, index);
  const videos = input.videoLinks.map((href, i) => normalizeResource({ id: `video-${i + 1}`, type: "video", title: `Vídeo fornecido ${i + 1}`, href, required: false, verificationStatus: "provided-needs-review" }, i, "video"));
  const suggestions = input.videoSearchSuggestions.map((searchQuery, i) => normalizeResource({ id: `video-search-${i + 1}`, type: "video", title: `Busca de vídeo ${i + 1}`, searchQuery, verificationStatus: "suggested-no-url", requiresVerification: true }, i, "video"));
  const imageLinks = input.imageLinks.map((href, i) => normalizeResource({ id: `image-${i + 1}`, type: "image", title: `Imagem fornecida ${i + 1}`, href, required: false, verificationStatus: "provided-needs-review", requiresVerification: true }, i, "image"));
  const suppliedMaterials = input.materials.map((material) => ({ ...material, required: Boolean(material.required) }));
  return normalizeLessonPlan({
    weekNumber: index + 1,
    theme: weekFocus.theme,
    welcome: `Nesta semana, você vai avançar no percurso de ${input.title}. A pergunta central é: ${weekFocus.centralQuestion}`,
    learningObjectives: weekFocus.objectives,
    contentSections: weekFocus.sectionSequence.slice(0, 7).map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title, body: sectionIndex === 0 && input.content ? input.content : `Esta seção desenvolve ${weekFocus.newConcepts[sectionIndex % Math.max(1, weekFocus.newConcepts.length)] || weekFocus.theme} por meio de uma explicação, um exemplo e uma pergunta de aplicação.`, subsections: [], reflection: { question: "Que problema real do seu contexto pode ser melhor compreendido com este tema?" }, resources: [] })),
    resources: { videos: [...videos, ...suggestions], readingsRequired: [], readingsExtra: suppliedMaterials.map((item) => normalizeResource(item, 0, "reading-extra")), images: imageLinks, podcasts: [], datasets: [] },
    webPractices: [],
    didacticArc: { id: weekFocus.arc, rationale: "Exemplo local seguindo o mapa longitudinal do curso." },
    synthesis: "Retome os conceitos centrais, conecte-os aos exemplos e registre uma aplicação possível no seu contexto.",
    nextWeekConnection: weekFocus.bridgeToNext,
    glossary: weekFocus.newConcepts.map((term) => ({ term, definition: `Conceito central da etapa: ${term}.` })),
    references: input.references,
    assessment: { title: "Atividade avaliativa", format: "Questões para revisão", questions: [] },
    timePlan: { calculationMethod: "derived-after-content" }
  }, input, index);
}

function fallbackBlocks(input, index, plan = fallbackLessonPlan(input, index)) {
  const week = index + 1; const calendar = weekCalendar(input, index); const objective = plan.learningObjectives[0] || `Compreender os fundamentos de ${input.title}.`;
  const blocks = [{ id: newId("b-hero-", week, 0), type: "hero", bg: "neutral-default", pad: "normal", props: { eyebrow: calendar.label.toUpperCase(), title: `${plan.theme}: ${calendar.label}`, lead: objective, author: input.author || "Autor", authorImage: "", readTime: `${input.hoursPerWeek} h de estudo`, date: input.year } }];
  const children = [];
  if (plan.welcome) children.push({ id: newId("c-welcome-", week, children.length), type: "prose", props: { body: richHtml(plan.welcome), dropcap: false, dropcapTone: "terracotta" } });
  if (plan.learningObjectives.length) children.push({ id: newId("c-objectives-", week, children.length), type: "destaque", props: { title: "Objetivos de aprendizagem", body: `<ul>${plan.learningObjectives.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`, tone: "sage", icon: "" } });
  const allResources = [...plan.resources.videos, ...plan.resources.images, ...plan.resources.readingsRequired, ...plan.resources.readingsExtra, ...plan.resources.podcasts, ...plan.resources.datasets];
  const usedResources = new Set();
  const resourceChildren = (resources, sectionIndex) => {
    const selected = resources.filter((resource) => {
      const declared = Number.parseInt(resource.sectionNumber, 10);
      return !usedResources.has(resource.id) && (!resource.sectionNumber || declared === sectionIndex + 1 || (!Number.isFinite(declared) && sectionIndex === 0));
    });
    selected.forEach((resource) => usedResources.add(resource.id));
    const bridges = selected.map((resource, resourceIndex) => ({ id: newId("c-resource-bridge-", week, sectionIndex * 10 + resourceIndex), type: "prose", props: { body: richHtml(resource.bridgeParagraph || resource.pedagogicalUse || resource.objective || `Use este recurso neste ponto para relacionar ${resource.title || "o material"} ao conceito estudado nesta seção.`), dropcap: false, dropcapTone: "terracotta", resourceId: resource.id } }));
    const media = selected.filter((resource) => resource.kind === "video" && youtubeId(resource.href)).slice(0, 2).map((resource, resourceIndex) => ({ id: newId("c-video-", week, sectionIndex * 10 + resourceIndex), type: "video", props: { id: youtubeId(resource.href), title: resource.title, caption: resource.pedagogicalUse || resource.objective || "Vídeo para aprofundar o conceito desta seção.", credit: resource.credit || resource.source || "", start: "", resourceId: resource.id } }));
    const images = selected.filter((resource) => resource.kind === "image" && resource.href).slice(0, 2).map((resource, resourceIndex) => ({ id: newId("c-image-", week, sectionIndex * 10 + resourceIndex), type: "imagem", props: { src: resource.href, slotId: "", caption: resource.caption || resource.title, credit: resource.credit || resource.source || "", ratio: "16/9", resourceId: resource.id } }));
    const materials = selected.filter((resource) => !media.some((block) => block.props.title === resource.title) && !images.some((block) => block.props.caption === resource.title) && (resource.title || resource.href)).map((resource) => ({ type: resource.kind, title: `${resource.required ? "Leitura orientada: " : "Para aprofundar: "}${resource.title}`, source: resource.source || resource.objective || resource.pedagogicalUse, href: resource.href, resourceId: resource.id }));
    return [...bridges, ...media, ...images, ...(materials.length ? [{ id: newId("c-materials-", week, sectionIndex), type: "materiais", props: { title: "Recurso para usar nesta seção", items: materials } }] : [])];
  };
  plan.contentSections.forEach((section, sectionIndex) => {
    children.push({ id: newId("c-title-", week, sectionIndex + 2), type: "titulo", props: { text: `${section.number} ${section.title}`, level: "h2" } });
    if (section.body) children.push({ id: newId("c-prose-", week, sectionIndex + 20), type: "prose", props: { body: richHtml(section.body), dropcap: sectionIndex === 0, dropcapTone: "terracotta" } });
    children.push(...resourceChildren([...(section.resources || []), ...allResources], sectionIndex));
    section.subsections.forEach((sub, subIndex) => { children.push({ id: newId("c-subtitle-", week, sectionIndex * 10 + subIndex + 1), type: "titulo", props: { text: `${sub.number} ${sub.title}`, level: "h3" } }); if (sub.body) children.push({ id: newId("c-subprose-", week, sectionIndex * 10 + subIndex + 3), type: "prose", props: { body: richHtml(sub.body), dropcap: false, dropcapTone: "terracotta" } }); });
    if (section.reflection?.question) children.push({ id: newId("c-reflection-", week, sectionIndex + 1), type: "reflexao", props: { title: "Para refletir", question: html(section.reflection.question), body: html(section.reflection.body), tone: "lavender", icon: "" } });
  });
  blocks.push({ id: newId("b-topic-", week, 1), type: "topic", bg: "neutral-default", pad: "normal", props: { children } });
  if (plan.synthesis) blocks.push({ id: newId("b-synthesis-", week, 0), type: "sintese", bg: "sage-deep", pad: "airy", props: { eyebrow: "Síntese", title: "A ideia que fecha a semana", body: richHtml(plan.synthesis) } });
  if (plan.references.length) blocks.push({ id: newId("b-references-", week, 0), type: "referencias", bg: "neutral-default", pad: "normal", props: { title: "Referências", items: plan.references.map((item) => ({ html: html(item.citation || item.title || item.href), href: item.href || "", credit: item.publisher || item.authors?.join(", ") || "" })) } });
  if (plan.assessment.questions.length) blocks.push({ id: newId("b-quiz-", week, 0), type: "quiz", bg: "neutral-subtle", pad: "normal", props: { title: plan.assessment.title, intro: plan.assessment.format, avaliativo: true, passMark: plan.assessment.passMark, questions: plan.assessment.questions } });
  return blocks;
}

export function buildFallbackLesson(input, index) {
  const lessonPlan = fallbackLessonPlan(input, index);
  return { meta: weekMeta(input, index), lessonPlan, blocks: fallbackBlocks(input, index, lessonPlan) };
}

export function normalizeLesson(raw, input, index) {
  const fallback = buildFallbackLesson(input, index);
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const directPlan = source.contentSections || source.sections || source.theme || source.welcome || source.learningObjectives ? source : {};
  const lessonPlan = normalizeLessonPlan(source.lessonPlan || source.plan || directPlan, input, index);
  const sourceBlocks = integrateRootResources(Array.isArray(source.blocks) ? source.blocks.map((block, i) => sanitizeBlock(block, index + 1, `block-${i}`, seen)).filter(Boolean) : [], index + 1, lessonPlan);
  const hasHero = sourceBlocks.some((block) => block.type === "hero" && text(block.props?.title));
  const hasTopic = sourceBlocks.some((block) => ["topic", "topic-collapsible", "topic-slider"].includes(block.type) && Array.isArray(block.props?.children) && block.props.children.length > 0);
  const hasObjectives = sourceBlocks.some((block) => block.type === "destaque" && text(block.props?.title).toLowerCase().includes("objetiv"));
  const hasContent = sourceBlocks.some((block) => block.type === "prose" || block.type === "titulo");
  const blocks = sourceBlocks.length && hasHero && hasTopic && hasObjectives && hasContent ? sourceBlocks : fallbackBlocks(input, index, lessonPlan);
  const baseMeta = weekMeta(input, index);
  const suppliedMeta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const meta = { ...fallback.meta, ...baseMeta, ...suppliedMeta, title: lessonPlan.theme, courseTitle: input.title, weekNumber: index + 1, weekLabel: baseMeta.weekLabel, calendarStartDate: baseMeta.calendarStartDate, calendarEndDate: baseMeta.calendarEndDate, studyHours: input.hoursPerWeek };
  const lesson = { meta, lessonPlan, blocks };
  return { ...lesson, contentQuality: measureLessonQuality(lesson, input) };
}

export function normalizeWeeklyOutput(raw, input) {
  const candidates = Array.isArray(raw) ? raw : (Array.isArray(raw?.weeks) ? raw.weeks : []);
  return Array.from({ length: input.weeks }, (_, index) => normalizeLesson(candidates[index], input, index));
}

export function validateLesson(lesson) {
  return Boolean(lesson && lesson.meta && lesson.lessonPlan && Array.isArray(lesson.lessonPlan.contentSections) && Array.isArray(lesson.blocks) && lesson.blocks.length > 0 && lesson.blocks.every((block) => KNOWN_BLOCK_TYPES.has(block.type)));
}
