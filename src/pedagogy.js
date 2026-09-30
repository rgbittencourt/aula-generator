const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

export const DIDACTIC_ARCS = Object.freeze([
  { id: "descoberta-conceitual", label: "Descoberta conceitual", sequence: ["contexto", "conceito", "exemplo", "reflexao", "sintese"] },
  { id: "estudo-de-caso", label: "Estudo de caso", sequence: ["situacao-problema", "evidencias", "analise", "debate", "sintese"] },
  { id: "oficina-aplicada", label: "Oficina aplicada", sequence: ["desafio", "modelo", "pratica-guiada", "producao", "revisao"] },
  { id: "analise-de-dados", label: "Análise de dados", sequence: ["pergunta", "dados", "interpretacao", "decisao", "comunicacao"] },
  { id: "debate-orientado", label: "Debate orientado", sequence: ["provocacao", "leitura", "argumentos", "debate", "posicionamento"] },
  { id: "revisao-e-sintese", label: "Revisão e síntese", sequence: ["retomada", "comparacao", "aplicacao", "autoavaliacao", "sintese"] }
]);

function findArc(value) {
  const raw = text(typeof value === "object" ? value.id || value.type || value.mode : value).toLowerCase();
  return DIDACTIC_ARCS.find((arc) => arc.id === raw || arc.label.toLowerCase() === raw) || null;
}

export function normalizeDidacticArc(value, hasWebPractice = false, index = 0) {
  const provided = findArc(value);
  const fallback = DIDACTIC_ARCS[index % DIDACTIC_ARCS.length];
  const arc = provided || fallback;
  const sequence = list(typeof value === "object" ? value.sequence : null);
  return {
    id: arc.id,
    label: arc.label,
    rationale: text(typeof value === "object" ? value.rationale : "") || `O arco organiza a aprendizagem em uma progressão adequada ao foco desta semana.`,
    sequence: sequence.length ? sequence : [...arc.sequence],
    hasWebPractice: Boolean(hasWebPractice),
    webPracticeRole: hasWebPractice ? "A webprática é um projeto aplicado separado e entra apenas no momento indicado." : "Esta semana não possui webprática programada."
  };
}

export function buildAlignmentMatrix(plan = {}) {
  const objectives = list(plan.learningObjectives || plan.objectives);
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const activities = Array.isArray(plan.activities) ? plan.activities : [];
  const questions = Array.isArray(plan.assessment?.questions) ? plan.assessment.questions : [];
  return objectives.map((objective, index) => {
    const section = sections[index % Math.max(1, sections.length)];
    const activity = activities[index % Math.max(1, activities.length)];
    const question = questions[index % Math.max(1, questions.length)];
    return {
      objective,
      contentSections: section ? [text(section.number || String(index + 1))] : [],
      activities: activity ? [text(activity.id || activity.title)] : [],
      evidence: text(activity?.product || activity?.delivery || (question ? "Resposta fundamentada na avaliação" : "Registro de aplicação ou reflexão")),
      assessmentQuestions: question ? [text(question.id || `question-${index + 1}`)] : [],
      alignmentNote: "Verificar se a atividade e a avaliação exigem o mesmo verbo de ação do objetivo."
    };
  });
}

export function pedagogicalReview(plan = {}) {
  const objectives = list(plan.learningObjectives || plan.objectives);
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const resources = Object.values(plan.resources || {}).flatMap((items) => Array.isArray(items) ? items : []);
  const questions = Array.isArray(plan.assessment?.questions) ? plan.assessment.questions : [];
  const practices = Array.isArray(plan.webPractices) ? plan.webPractices : [];
  const checks = [
    { id: "objective-present", label: "A semana possui objetivos observáveis.", pass: objectives.length > 0 },
    { id: "content-present", label: "Os objetivos aparecem em conteúdo desenvolvido.", pass: sections.some((section) => text(section.body).length >= 120) },
    { id: "resource-context", label: "Os recursos possuem função pedagógica e momento de uso.", pass: resources.length === 0 || resources.every((resource) => Boolean(resource.objective || resource.pedagogicalUse || resource.guidingQuestion)) },
    { id: "assessment-alignment", label: "Há avaliação ou evidência relacionada aos objetivos.", pass: questions.length > 0 || practices.some((practice) => practice.product || practice.delivery) },
    { id: "practice-optional", label: "A webprática só aparece quando foi programada.", pass: practices.every((practice) => practice.title && practice.objective) },
    { id: "accessibility", label: "Imagens e vídeos possuem alternativa ou revisão de acessibilidade.", pass: resources.filter((resource) => ["image", "video", "audio"].includes(resource.kind)).every((resource) => resource.altText || resource.caption || resource.requiresVerification) }
  ];
  return { status: checks.every((check) => check.pass) ? "ready" : "review", score: checks.filter((check) => check.pass).length, total: checks.length, checks };
}

export function fallbackDidacticArc(input, index = 0) {
  const hasPractice = Boolean(input.webPractices?.length);
  const options = hasPractice ? ["oficina-aplicada", "estudo-de-caso", "analise-de-dados", "descoberta-conceitual"] : ["descoberta-conceitual", "estudo-de-caso", "analise-de-dados", "revisao-e-sintese"];
  return normalizeDidacticArc(options[index % options.length], hasPractice, index);
}
