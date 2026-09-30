const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const DIDACTIC_ARCS = Object.freeze([
  { id: "descoberta-conceitual", label: "Descoberta conceitual", sequence: ["opening", "diagnostic", "conceptExplanation", "workedExample", "reflection", "synthesis"] },
  { id: "estudo-de-caso", label: "Estudo de caso", sequence: ["opening", "diagnostic", "conceptExplanation", "workedExample", "guidedPractice", "reflection", "assessment", "synthesis"] },
  { id: "oficina-aplicada", label: "Oficina aplicada", sequence: ["opening", "conceptExplanation", "workedExample", "guidedPractice", "independentPractice", "assessment", "synthesis"] },
  { id: "analise-de-dados", label: "Análise de dados", sequence: ["opening", "diagnostic", "conceptExplanation", "workedExample", "guidedPractice", "independentPractice", "reflection", "assessment", "synthesis"] },
  { id: "debate-orientado", label: "Debate orientado", sequence: ["opening", "diagnostic", "conceptExplanation", "guidedPractice", "reflection", "assessment", "synthesis"] },
  { id: "revisao-e-sintese", label: "Revisão e síntese", sequence: ["opening", "diagnostic", "guidedPractice", "independentPractice", "reflection", "assessment", "synthesis"] }
]);

export const DIDACTIC_PHASE_LABELS = Object.freeze({
  opening: "Abertura e contextualização",
  diagnostic: "Diagnóstico inicial",
  conceptExplanation: "Explicação dos conceitos",
  workedExample: "Exemplo aplicado",
  guidedPractice: "Atividade guiada",
  independentPractice: "Prática independente",
  reflection: "Discussão e reflexão",
  assessment: "Avaliação da aprendizagem",
  synthesis: "Síntese e preparação para a próxima semana"
});

function findArc(value) {
  const raw = text(typeof value === "object" ? value.id || value.type || value.mode : value).toLowerCase();
  return DIDACTIC_ARCS.find((arc) => arc.id === raw || arc.label.toLowerCase() === raw) || null;
}

function phasePlanFor(sequence, provided = {}, omissions = {}) {
  const phasePlan = {};
  for (const phase of Object.keys(DIDACTIC_PHASE_LABELS)) phasePlan[phase] = Boolean(provided[phase] ?? sequence.includes(phase));
  return {
    ...phasePlan,
    labels: DIDACTIC_PHASE_LABELS,
    omitted: Object.keys(DIDACTIC_PHASE_LABELS).filter((phase) => !phasePlan[phase]).map((phase) => ({ phase, label: DIDACTIC_PHASE_LABELS[phase], reason: text(omissions[phase], "Não foi incluída porque o arco desta semana não a exige.") }))
  };
}

export function normalizeDidacticArc(value, hasWebPractice = false, index = 0) {
  const provided = findArc(value);
  const fallback = DIDACTIC_ARCS[index % DIDACTIC_ARCS.length];
  const arc = provided || fallback;
  const source = object(value);
  const sequence = list(source.sequence);
  const chosenSequence = sequence.length ? sequence : [...arc.sequence];
  const providedPhasePlan = object(source.phasePlan || source.phases || source.didacticStructure);
  const omissions = object(source.omissionReasons || source.omittedReasons);
  return {
    id: arc.id,
    label: arc.label,
    rationale: text(source.rationale) || `O arco organiza a aprendizagem em uma progressão adequada ao foco desta semana.`,
    sequence: chosenSequence,
    phasePlan: phasePlanFor(chosenSequence, providedPhasePlan, omissions),
    hasWebPractice: Boolean(hasWebPractice),
    webPracticeRole: hasWebPractice ? "A webprática é um projeto aplicado separado e entra apenas no momento indicado." : "Esta semana não possui webprática programada.",
    omittedPhasePolicy: "Fases podem ser omitidas, mas a omissão precisa ter justificativa pedagógica."
  };
}

function ids(value, fallback) {
  if (Array.isArray(value)) return value.map((item) => text(typeof item === "object" ? item.id || item.title || item.number : item)).filter(Boolean);
  return fallback ? [fallback] : [];
}

export function buildAlignmentMatrix(plan = {}) {
  const objectives = list(plan.learningObjectives || plan.objectives);
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const activities = Array.isArray(plan.activities) ? plan.activities : [];
  const questions = Array.isArray(plan.assessment?.questions) ? plan.assessment.questions : [];
  const explicit = Array.isArray(plan.alignmentMatrix) ? plan.alignmentMatrix : [];
  return objectives.map((objective, index) => {
    const source = object(explicit[index]);
    const section = sections[index % Math.max(1, sections.length)];
    const activity = activities[index % Math.max(1, activities.length)];
    const question = questions[index % Math.max(1, questions.length)];
    return {
      id: text(source.id, `alignment-${index + 1}`),
      objective,
      contentSections: ids(source.contentSections, section ? text(section.number || String(index + 1)) : ""),
      activities: ids(source.activities, activity ? text(activity.id || activity.title) : ""),
      evidence: text(source.evidence || activity?.evidence || activity?.product || activity?.delivery || (question ? "Resposta fundamentada na avaliação" : "Registro de aplicação ou reflexão")),
      assessmentQuestions: ids(source.assessmentQuestions, question ? text(question.id || `question-${index + 1}`) : ""),
      learningEvidence: text(source.learningEvidence || source.evidenceType, activity?.evidenceType || "produção observável do estudante"),
      alignmentNote: text(source.alignmentNote, "Verificar se conteúdo, atividade, evidência e avaliação exigem o mesmo verbo de ação do objetivo.")
    };
  });
}

export function buildProgression(plan = {}, index = 0) {
  const previous = Array.isArray(plan.spiralReview?.previousConceptsReviewed) ? plan.spiralReview.previousConceptsReviewed : [];
  const next = Array.isArray(plan.spiralReview?.preparationForNextWeek) ? plan.spiralReview.preparationForNextWeek : [];
  return {
    weekNumber: Number(plan.weekNumber || index + 1),
    previousConceptsReviewed: previous,
    newConcepts: Array.isArray(plan.spiralReview?.newConcepts) ? plan.spiralReview.newConcepts : list(plan.keyConcepts || plan.glossary).slice(0, 5),
    preparationForNextWeek: next,
    cumulativeEvidence: list(plan.spiralReview?.cumulativeEvidence),
    projectMilestone: text(plan.spiralReview?.projectMilestone)
  };
}

export function pedagogicalReview(plan = {}) {
  const objectives = list(plan.learningObjectives || plan.objectives);
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const resources = Object.values(plan.resources || {}).flatMap((items) => Array.isArray(items) ? items : []);
  const questions = Array.isArray(plan.assessment?.questions) ? plan.assessment.questions : [];
  const practices = Array.isArray(plan.webPractices) ? plan.webPractices : [];
  const activities = Array.isArray(plan.activities) ? plan.activities : [];
  const alignment = Array.isArray(plan.alignmentMatrix) && plan.alignmentMatrix.length ? plan.alignmentMatrix : buildAlignmentMatrix(plan);
  const checks = [
    { id: "title-present", label: "A semana possui título específico e abertura.", pass: Boolean(text(plan.theme) && text(plan.welcome)) },
    { id: "objective-present", label: "A semana possui objetivos observáveis.", pass: objectives.length >= 4 },
    { id: "content-present", label: "Os objetivos aparecem em conteúdo desenvolvido.", pass: sections.length >= 5 && sections.filter((section) => text(section.body).length >= 120).length >= 4 },
    { id: "alignment-complete", label: "Cada objetivo possui conteúdo, atividade, evidência e avaliação relacionados.", pass: alignment.length >= objectives.length && alignment.every((item) => item.contentSections.length && item.evidence && item.assessmentQuestions.length) },
    { id: "activity-present", label: "Existe pelo menos uma atividade ativa ou evidência de produção.", pass: activities.length > 0 || practices.some((practice) => practice.product || practice.delivery) },
    { id: "diagnostic-present", label: "O diagnóstico inicial está presente ou sua ausência foi justificada.", pass: Boolean(plan.diagnostic?.prompt || plan.diagnostic?.question || plan.diagnostic?.justification || plan.formativeChecks?.length) },
    { id: "formative-present", label: "Há checagens formativas durante o percurso.", pass: Array.isArray(plan.formativeChecks) && plan.formativeChecks.length > 0 },
    { id: "summative-alignment", label: "A avaliação final está alinhada aos objetivos e tem feedback.", pass: questions.length >= 4 && questions.every((question) => question.explanation) },
    { id: "practice-complete", label: "Toda webprática possui produto, etapas, critérios e plano B.", pass: practices.every((practice) => practice.product && practice.steps?.length && (practice.rubric?.length || practice.criteria?.length) && practice.fallbackPlan) },
    { id: "resource-context", label: "Os recursos possuem função pedagógica e momento de uso.", pass: resources.every((resource) => Boolean(resource.objective || resource.pedagogicalUse || resource.guidingQuestion)) },
    { id: "accessibility", label: "Imagens e vídeos possuem alternativa acessível ou revisão pendente.", pass: resources.filter((resource) => ["image", "video", "audio"].includes(resource.kind)).every((resource) => resource.altText || resource.caption || resource.videoAccessibility || resource.requiresVerification) },
    { id: "differentiation", label: "Há trilhas essencial, padrão e aprofundamento.", pass: Boolean(plan.differentiation?.support?.length && plan.differentiation?.standard?.length && plan.differentiation?.extension?.length) },
    { id: "self-assessment", label: "O estudante recebe autoavaliação ou reflexão final.", pass: Boolean(plan.selfAssessment?.questions?.length || plan.selfAssessment?.prompts?.length || plan.reflection) }
  ];
  const passed = checks.filter((check) => check.pass).length;
  return { status: passed === checks.length ? "ready" : passed >= checks.length - 3 ? "review" : "incomplete", score: passed, total: checks.length, checks, alignmentMatrix: alignment };
}

export function fallbackDidacticArc(input, index = 0) {
  const hasPractice = Boolean(input.webPractices?.length);
  const options = hasPractice ? ["oficina-aplicada", "estudo-de-caso", "analise-de-dados", "descoberta-conceitual"] : ["descoberta-conceitual", "estudo-de-caso", "analise-de-dados", "revisao-e-sintese"];
  return normalizeDidacticArc(options[index % options.length], hasPractice, index);
}
