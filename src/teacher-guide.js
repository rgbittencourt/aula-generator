import { buildAlignmentMatrix, buildProgression, fallbackDidacticArc, pedagogicalReview, normalizeDidacticArc } from "./pedagogy.js";
import { practiceScheduledForWeek } from "./aula-schema.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function defaultMediationMessages(input = {}, plan = {}, practices = [], index = 0) {
  const theme = text(plan.theme || input.title, `o tema da semana ${index + 1}`);
  const activity = Array.isArray(plan.activities) ? text(plan.activities.find((item) => item?.title)?.title) : "";
  const practice = practices[0];
  const practiceLine = practice
    ? ` Nesta semana também temos a webprática “${text(practice.title, "atividade prática")}”; confira a agenda e chegue com os materiais combinados.`
    : "";
  return {
    whatsapp: [
      { id: `whatsapp-opening-${index + 1}`, timing: "Início da semana", text: `Oi, pessoal! A nossa trilha desta semana é “${theme}”. Comecem pela abertura e pelos objetivos; a ideia é entender o assunto e já enxergar onde ele aparece na prática.${practiceLine}` },
      { id: `whatsapp-nudge-${index + 1}`, timing: "Durante a semana", text: `Passando para lembrar: não deixem a leitura e a atividade de “${activity || theme}” para a última curva. Estudem um pouco por vez, anotem uma dúvida e tragam uma aplicação do conteúdo para a conversa. O cérebro agradece — e o prazo também.` },
      { id: `whatsapp-closing-${index + 1}`, timing: "Encerramento da semana", text: `Antes de fechar a semana, revisem a síntese, respondam à avaliação e confiram se a produção foi enviada. Se algo ficou nebuloso, registrem a dúvida; dúvida anotada vira ponto de partida, não peso na mochila.` }
    ],
    moodle: [
      { id: `moodle-opening-${index + 1}`, timing: "Abertura da semana", text: `Olá, turma! Nesta semana estudaremos “${theme}”. Leiam a apresentação, observem os objetivos e sigam a sequência proposta para relacionar os conceitos ao contexto de vocês.${practiceLine}` },
      { id: `moodle-nudge-${index + 1}`, timing: "Acompanhamento", text: `Como está o percurso até aqui? Reserve um bloco de estudo para o texto-base e outro para a atividade${activity ? ` “${activity}”` : " prevista"}. Registre no fórum ou no espaço indicado uma conexão, pergunta ou exemplo do seu contexto.` },
      { id: `moodle-closing-${index + 1}`, timing: "Fechamento", text: `Para concluir a semana, revise a síntese, responda à avaliação e envie a evidência solicitada. Use o espaço de mensagens para compartilhar dúvidas e avanços; a participação ajuda a transformar leitura em aprendizagem.` }
    ]
  };
}

function normalizeMessageList(value, channel, fallback, index) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = values.map((item, messageIndex) => {
    const source = typeof item === "string" ? { text: item } : object(item);
    return {
      id: text(source.id, `${channel}-${index + 1}-${messageIndex + 1}`),
      timing: text(source.timing || source.when || source.moment, `Mensagem ${messageIndex + 1}`),
      purpose: text(source.purpose || source.objective),
      text: text(source.text || source.message || source.body || source.content)
    };
  }).filter((item) => item.text);
  return normalized.length ? normalized : fallback;
}

function normalizeMediationMessages(value, input, plan, practices, index) {
  const fallback = defaultMediationMessages(input, plan, practices, index);
  const source = object(value);
  return {
    whatsapp: normalizeMessageList(source.whatsapp || source.whatsApp, "whatsapp", fallback.whatsapp, index),
    moodle: normalizeMessageList(source.moodle || source.moodleMessages, "moodle", fallback.moodle, index)
  };
}

function normalizeDifferentiation(value = {}) {
  const source = object(value);
  const normalize = (items) => Array.isArray(items) ? items.map((item) => typeof item === "string" ? { title: item, instructions: item } : { title: text(item?.title || item?.label), instructions: text(item?.instructions || item?.body || item?.description), resources: item?.resources || [] }).filter((item) => item.title || item.instructions) : [];
  return {
    support: normalize(source.support || source.essential || source.recovery),
    standard: normalize(source.standard || source.core),
    extension: normalize(source.extension || source.advanced || source.deepening),
    rationale: text(source.rationale)
  };
}

function normalizeGuide(source = {}, plan = {}, input = {}, index = 0) {
  const raw = object(source);
  const inputPractices = Array.isArray(input.webPractices) ? input.webPractices : [];
  const generatedPractices = Array.isArray(raw.webPracticeProjects) && raw.webPracticeProjects.length
    ? raw.webPracticeProjects
    : (Array.isArray(raw.webPractices) ? raw.webPractices : []);
  const candidatePractices = [...inputPractices, ...generatedPractices];
  const mergedPractices = [];
  candidatePractices.forEach((practice) => {
    const original = inputPractices.find((item) => text(item.id) === text(practice?.id) || text(item.title) === text(practice?.title));
    const merged = { ...(original || {}), ...(practice || {}) };
    const key = text(merged.id || merged.title);
    const existingIndex = mergedPractices.findIndex((item) => text(item.id || item.title) === key || (text(item.title) && text(item.title) === text(merged.title)));
    if (existingIndex >= 0) mergedPractices[existingIndex] = { ...mergedPractices[existingIndex], ...merged };
    else if (key) mergedPractices.push(merged);
  });
  const practices = mergedPractices.filter((practice) => practiceScheduledForWeek(practice, input, index));
  const review = pedagogicalReview(plan);
  const mediationMessages = normalizeMediationMessages(raw.mediationMessages || raw.studentMessages || raw.communicationMessages || raw.messages, input, plan, practices, index);
  return {
    weekNumber: index + 1,
    title: text(raw.title || plan.theme || `${input.title} - Semana ${index + 1}`),
    purpose: text(raw.purpose || raw.instructionalPurpose || raw.rationale) || `Orientar a aprendizagem da semana ${index + 1} com foco nos objetivos previstos.`,
    didacticArc: normalizeDidacticArc(raw.didacticArc || plan.didacticArc, practices.length > 0, index),
    objectives: list(raw.objectives || plan.learningObjectives || input.objectives),
    alignmentMatrix: Array.isArray(raw.alignmentMatrix) && raw.alignmentMatrix.length ? raw.alignmentMatrix : (plan.alignmentMatrix?.length ? plan.alignmentMatrix : buildAlignmentMatrix(plan)),
    diagnostic: object(raw.diagnostic || plan.diagnostic),
    formativeChecks: Array.isArray(raw.formativeChecks || raw.checkpoints) ? (raw.formativeChecks || raw.checkpoints) : (plan.formativeChecks || []),
    summativeAssessment: object(raw.summativeAssessment || raw.finalAssessment || plan.assessment),
    mediationQuestions: list(raw.mediationQuestions || raw.facilitationQuestions),
    commonMisconceptions: list(raw.commonMisconceptions || raw.misconceptions),
    interventions: list(raw.interventions || raw.interventionTips),
    differentiation: normalizeDifferentiation(raw.differentiation || plan.differentiation),
    accessibility: object(raw.accessibility || raw.accessibilityPlan),
    assessmentNotes: list(raw.assessmentNotes || raw.evaluationNotes),
    selfAssessment: object(raw.selfAssessment || raw.studentSelfAssessment || plan.selfAssessment),
    spiralReview: object(raw.spiralReview || plan.spiralReview || buildProgression(plan, index)),
    resourceNotes: Array.isArray(raw.resourceNotes) ? raw.resourceNotes : [],
    academicProfile: object(raw.academicProfile || input.academicProfile),
    academicPlan: object(raw.academicPlan || plan.academicPlan),
    claimEvidence: Array.isArray(raw.claimEvidence || plan.claimEvidence) ? (raw.claimEvidence || plan.claimEvidence) : [],
    academicReview: object(raw.academicReview || { status: "not-run", issues: [], rewriteRequired: false }),
    qualityReview: raw.qualityReview && typeof raw.qualityReview === "object" ? raw.qualityReview : review,
    webPractices: practices,
    webPracticeProjects: practices,
    mediationMessages,
    learnerEvidence: list(raw.learnerEvidence || raw.evidence),
    workloadAdvice: list(raw.workloadAdvice || raw.timeAdjustmentSuggestions),
    notes: list(raw.notes)
  };
}

export function buildTeacherGuide(input, lesson, source = {}, index = 0) {
  const plan = lesson?.lessonPlan || {};
  const guide = normalizeGuide(source, plan, input, index);
  if (!guide.didacticArc?.sequence?.length) guide.didacticArc = fallbackDidacticArc(input, index);
  return guide;
}

export function buildTeacherGuides(input, lessons = [], provided = []) {
  return lessons.map((lesson, index) => {
    const scopedInput = { ...input, webPractices: (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index)) };
    return buildTeacherGuide(scopedInput, lesson, provided[index] || {}, index);
  });
}

export function collectWebPracticeProjects(input, teacherGuides = []) {
  const projects = [];
  for (const guide of teacherGuides) {
    for (const practice of guide.webPracticeProjects || guide.webPractices || []) {
      const id = text(practice.id || practice.title);
      if (!id || projects.some((current) => text(current.id || current.title) === id)) continue;
      projects.push(practice);
    }
  }
  if (!projects.length) return (input.webPractices || []).filter((practice) => Number(practice.weekNumber || practice.week) > 0 || text(practice.date || practice.sessionDate) || list(practice.moments || practice.moment).length);
  return projects;
}
