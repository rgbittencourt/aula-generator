import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { normalizeDidacticArc, pedagogicalReview } from "../src/pedagogy.js";
import { calculateWeekWorkload } from "../src/calculations.js";
import { validateCourse } from "../src/validation.js";

test("arco variável registra fases ativas e justificativas de omissão", () => {
  const arc = normalizeDidacticArc({ id: "estudo-de-caso", phasePlan: { diagnostic: false }, omissionReasons: { diagnostic: "A situação-problema já funciona como diagnóstico." } }, false, 0);
  assert.equal(arc.id, "estudo-de-caso");
  assert.equal(arc.phasePlan.diagnostic, false);
  assert.match(arc.phasePlan.omitted.find((item) => item.phase === "diagnostic").reason, /situação-problema/i);
});

test("webprática preserva projeto, produto, evidência e rubrica", () => {
  const practice = normalizeCourseInput({ title: "Curso", weeks: 1, webPracticeEnabled: true, webPractices: [{ title: "Mapa de indicadores", problem: "Escolher indicadores", studentRole: "Analista", deliverable: "Mapa", steps: [{ title: "Escolher", minutes: 15, evidence: "Descrição" }], rubric: [{ criterion: "Adequação", excellent: "Direta", developing: "Parcial" }], fallbackPlan: "Usar tabela offline" }] }).webPractices[0];
  assert.equal(practice.problem, "Escolher indicadores");
  assert.equal(practice.deliverable, "Mapa");
  assert.equal(practice.steps[0].evidence, "Descrição");
  assert.equal(practice.rubric[0].criterion, "Adequação");
  assert.equal(practice.fallbackPlan, "Usar tabela offline");
});

test("matriz e checklist detectam objetivo sem atividade e avaliação", () => {
  const input = normalizeCourseInput({ title: "Indicadores", weeks: 1, hoursPerWeek: 2, objectives: ["Analisar indicadores"] });
  const lesson = normalizeLesson({ lessonPlan: { theme: "Indicadores educacionais", welcome: "Uma abertura longa o suficiente para contextualizar o problema e orientar o estudante nesta unidade.", learningObjectives: ["Analisar indicadores", "Comparar indicadores", "Aplicar indicadores", "Avaliar decisões"], contentSections: Array.from({ length: 5 }, (_, i) => ({ number: String(i + 1), title: `Seção ${i + 1}`, body: "Texto desenvolvido sobre o conceito, seu contexto, um exemplo aplicado e seus limites para a tomada de decisão educacional.".repeat(3) })), diagnostic: { prompt: "O que você já conhece?" }, formativeChecks: [{ prompt: "Explique o conceito." }], activities: [{ id: "activity-1", title: "Mapa", evidence: "Mapa produzido" }], assessment: { questions: [{ id: "question-1", q: "Qual decisão?", options: ["A", "B"], answer: 0, explanation: "Porque..." }, { id: "question-2", q: "Qual dado?", options: ["A", "B"], answer: 0, explanation: "Porque..." }, { id: "question-3", q: "Qual limite?", options: ["A", "B"], answer: 0, explanation: "Porque..." }, { id: "question-4", q: "Qual uso?", options: ["A", "B"], answer: 0, explanation: "Porque..." }] }, differentiation: { support: ["Glossário"], standard: ["Atividade"], extension: ["Artigo"] }, selfAssessment: { prompts: ["O que aprendi?"] }, synthesis: "Uma síntese desenvolvida com a ideia central, a aplicação e o limite.", nextWeekConnection: "Na próxima semana, o conceito será retomado.", spiralReview: { newConcepts: ["Indicador"] } } }, input, 0);
  assert.equal(lesson.lessonPlan.alignmentMatrix.length, 4);
  assert.ok(lesson.lessonPlan.pedagogicalReview.checks.some((check) => check.id === "alignment-complete"));
  const workload = { weeks: [calculateWeekWorkload(input, input.formulaConfig, lesson)] };
  const report = validateCourse(input, [lesson], workload);
  assert.equal(report.summary.totalWeeks, 1);
});
