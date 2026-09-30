import { buildAlignmentMatrix, fallbackDidacticArc, pedagogicalReview, normalizeDidacticArc } from "./pedagogy.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function normalizeDifferentiation(value = {}) {
  const source = object(value);
  return {
    support: list(source.support || source.essential || source.recovery),
    standard: list(source.standard || source.core),
    extension: list(source.extension || source.advanced || source.deepening)
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
  const practices = Array.isArray(raw.webPractices) ? raw.webPractices : (Array.isArray(input.webPractices) && input.webPractices.length ? input.webPractices : (Array.isArray(plan.webPractices) ? plan.webPractices : []));
  return {
    weekNumber: index + 1,
    title: text(raw.title || plan.theme || `${input.title} - Semana ${index + 1}`),
    purpose: text(raw.purpose || raw.instructionalPurpose || raw.rationale) || `Orientar a aprendizagem da semana ${index + 1} com foco nos objetivos previstos.`,
    didacticArc: normalizeDidacticArc(raw.didacticArc || plan.didacticArc, practices.length > 0, index),
    objectives: list(raw.objectives || plan.learningObjectives || input.objectives),
    alignmentMatrix: Array.isArray(raw.alignmentMatrix) && raw.alignmentMatrix.length ? raw.alignmentMatrix : buildAlignmentMatrix(plan),
    diagnostic: object(raw.diagnostic || raw.initialDiagnostic),
    formativeChecks: Array.isArray(raw.formativeChecks || raw.checkpoints) ? (raw.formativeChecks || raw.checkpoints) : [],
    mediationQuestions: list(raw.mediationQuestions || raw.facilitationQuestions),
    commonMisconceptions: list(raw.commonMisconceptions || raw.misconceptions),
    interventions: list(raw.interventions || raw.interventionTips),
    differentiation: normalizeDifferentiation(raw.differentiation),
    accessibility: list(raw.accessibility || raw.accessibilityNotes),
    assessmentNotes: list(raw.assessmentNotes || raw.evaluationNotes),
    selfAssessment: object(raw.selfAssessment || raw.studentSelfAssessment),
    spiralReview: object(raw.spiralReview),
    resourceNotes: Array.isArray(raw.resourceNotes) ? raw.resourceNotes : [],
    qualityReview: raw.qualityReview && typeof raw.qualityReview === "object" ? raw.qualityReview : pedagogicalReview(plan),
    webPractices: practices,
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
    for (const practice of guide.webPractices || []) {
      const id = text(practice.id || practice.title);
      if (!id || projects.some((current) => text(current.id || current.title) === id)) continue;
      projects.push(practice);
    }
  }
  if (!projects.length) return input.webPractices || [];
  return projects;
}
