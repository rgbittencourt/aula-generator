import { buildAlignmentMatrix, buildProgression, fallbackDidacticArc, pedagogicalReview, normalizeDidacticArc } from "./pedagogy.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

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

function scheduledPractice(practice, index) {
  const moments = list(practice?.moments || practice?.moment);
  if (!moments.length) return index === 0;
  const week = String(index + 1);
  return moments.some((moment) => new RegExp(`(?:semana|week)\\s*${week}\\b`, "i").test(moment) || new RegExp(`\\b${week}\\b`).test(moment));
}

function normalizeGuide(source = {}, plan = {}, input = {}, index = 0) {
  const raw = object(source);
  const practices = Array.isArray(raw.webPractices) ? raw.webPractices : (Array.isArray(input.webPractices) ? input.webPractices : (Array.isArray(plan.webPractices) ? plan.webPractices : []));
  const review = pedagogicalReview(plan);
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
    qualityReview: raw.qualityReview && typeof raw.qualityReview === "object" ? raw.qualityReview : review,
    webPractices: practices,
    webPracticeProjects: practices,
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
    const scopedInput = { ...input, webPractices: (input.webPractices || []).filter((practice) => scheduledPractice(practice, index)) };
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
  if (!projects.length) return input.webPractices || [];
  return projects;
}
