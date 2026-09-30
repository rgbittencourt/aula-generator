import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildFallbackLesson, normalizeCourseInput, normalizeLesson, normalizeWeeklyOutput, weekCalendar, validateLesson } from "../src/aula-schema.js";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload, calculateWeekWorkload } from "../src/calculations.js";
import { digitalContentMinutes, readingMinutes } from "../src/formula-profile.js";
import { createWeeksZip } from "../src/zip.js";
import { buildBriefingPrompt, buildWeekGenerationPrompt } from "../src/ai.js";

test("normaliza briefing com calendário real e webpráticas independentes", () => {
  const input = normalizeCourseInput({ title: "Cidades sustentáveis", weeks: "3", hoursPerWeek: "2.5", calendarMode: "calendar", startDate: "2026-10-05", objectives: "Analisar\nAplicar", imageLinks: "https://example.org/mapa.png", webPracticeEnabled: true, webPractices: [{ title: "Mapa do bairro", type: "Pesquisa orientada", moments: "Semana 2", objective: "Analisar" }, { title: "Debate", type: "Debate ou seminário", moments: "Semana 3", objective: "Avaliar" }], materials: [{ title: "Texto-base", type: "Texto-base", objective: "Preparar a análise", alignment: "Mobilidade urbana" }] });
  assert.equal(input.weeks, 3);
  assert.equal(input.hoursPerWeek, 2.5);
  assert.equal(input.startDate, "2026-10-05");
  assert.deepEqual(input.objectives, ["Analisar", "Aplicar"]);
  assert.equal(input.webPractice.enabled, true);
  assert.equal(input.webPractices.length, 2);
  assert.equal(input.materials[0].alignment, "Mobilidade urbana");
  assert.deepEqual(input.imageLinks, ["https://example.org/mapa.png"]);
  assert.deepEqual(weekCalendar(input, 1), { weekNumber: 2, label: "Semana 2 · 12/10/2026", startDate: "2026-10-12", endDate: "2026-10-18" });
});

test("prompt do assistente exige práticas distintas, materiais alinhados e fontes sem URLs inventadas", () => {
  const prompt = buildBriefingPrompt(normalizeCourseInput({ title: "Curso", webPracticeEnabled: true }), ["webPractices", "materials"]);
  assert.match(prompt, /webpráticas.*distintas/i);
  assert.match(prompt, /materiais de apoio/i);
  assert.match(prompt, /não invente URLs/i);
});

test("prompt semanal exige unidade didática completa antes do cálculo de tempo", () => {
  const input = normalizeCourseInput({ title: "Gestão educacional", weeks: 4, hoursPerWeek: 10, objectives: ["Analisar políticas públicas"] });
  const prompt = buildWeekGenerationPrompt(input, 0);
  assert.match(prompt, /uma semana de material didático/i);
  assert.match(prompt, /lessonPlan/i);
  assert.match(prompt, /contentSections: 6 a 12/i);
  assert.match(prompt, /timePlan com targetMinutes 0/i);
  assert.match(prompt, /nunca invente URLs/i);
});

test("normaliza aula rica sem perder recursos, avaliação e metadados", () => {
  const input = normalizeCourseInput({ title: "Dados educacionais", weeks: 1, hoursPerWeek: 10, objectives: ["Analisar indicadores"] });
  const lesson = normalizeLesson({
    lessonPlan: {
      theme: "Indicadores e decisões",
      welcome: "Uma abertura contextualizada.",
      learningObjectives: ["Analisar indicadores"],
      contentSections: [{ number: "1", title: "Base conceitual", body: "Texto desenvolvido", reflection: { question: "O que muda no seu contexto?" }, resources: [{ type: "artigo", title: "Leitura extra", searchQuery: "indicadores educação artigo", required: false }] }],
      resources: { videos: [{ title: "Vídeo conferido", href: "https://youtu.be/abc123", verificationStatus: "provided-needs-review" }], images: [{ title: "Diagrama selecionado", href: "https://upload.wikimedia.org/example.png", provider: "wikimedia-commons", sourcePage: "https://commons.wikimedia.org/wiki/File:Example.png", license: "CC BY-SA", altText: "Diagrama do fluxo" }] },
      resourceResearch: { status: "ai-selected", alternatives: [{ candidateId: "commons:1" }] },
      assessment: { questions: [{ q: "O que é um indicador?", options: ["A", "B", "C", "D"], answer: 1, explanation: "Explicação." }] }
    },
    blocks: [{ type: "hero", props: { eyebrow: "Semana 1", title: "Indicadores", lead: "Começo" } }]
  }, input, 0);
  assert.equal(lesson.lessonPlan.contentSections[0].reflection.question, "O que muda no seu contexto?");
  assert.equal(lesson.lessonPlan.resources.videos[0].href, "https://youtu.be/abc123");
  assert.equal(lesson.lessonPlan.resources.images[0].provider, "wikimedia-commons");
  assert.equal(lesson.lessonPlan.resources.images[0].sourcePage, "https://commons.wikimedia.org/wiki/File:Example.png");
  assert.equal(lesson.lessonPlan.resourceResearch.status, "ai-selected");
  assert.equal(lesson.lessonPlan.assessment.questions.length, 1);
  assert.equal(validateLesson(lesson), true);
});

test("fallback gera uma aula válida para cada semana", () => {
  const input = normalizeCourseInput({ title: "História da ciência", weeks: 2, hoursPerWeek: 4, objectives: ["Comparar teorias"], webPracticeEnabled: true, practiceInstructions: "Faça uma pesquisa orientada.", videoLinks: "https://www.youtube.com/watch?v=abc123" });
  const weeks = normalizeWeeklyOutput({ weeks: [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)] }, input);
  assert.equal(weeks.length, 2);
  assert.equal(validateLesson(weeks[0]), true);
  assert.ok(weeks[0].lessonPlan.contentSections.length >= 1);
  assert.ok(weeks[0].blocks.some((block) => block.type === "hero"));
  assert.ok(weeks[0].blocks.some((block) => block.type === "destaque"));
  assert.ok(weeks[0].blocks.some((block) => block.type === "video"));
});

test("cálculo deriva itens do conteúdo e mantém perfil futuro da planilha", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, hoursPerWeek: 5, content: "Este é um texto-base substancial para a leitura da semana.", objectives: ["Conhecer"] });
  const lessons = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const pending = calculateCourseWorkload(input, input.formulaConfig, lessons);
  assert.equal(pending.totalMinutes, 600);
  assert.equal(pending.formulaStatus, "spreadsheet-profile");
  assert.ok(pending.derivedMinutes > 0);
  assert.ok(pending.weeks[0].items.length > 0);
  const configured = calculateWeekWorkload(input, 0, { ratios: { content: 0.5, practice: 0.25, assessment: 0.15, review: 0.1 } }, lessons[0]);
  assert.equal(configured.formulaStatus, "configured");
  assert.equal(Object.values(configured.allocation).reduce((sum, value) => sum + value, 0), 300);
  const enriched = attachWorkloadToLessons(lessons, pending);
  assert.equal(enriched[0].lessonPlan.timePlan.items.length, pending.weeks[0].items.length);
  const general = buildGeneralPlan(input, pending, enriched);
  assert.equal(general.totals.targetHours, 10);
  assert.ok(general.categoryTotals.contentMinutes > 0);
});

test("perfil Aplicativo + Material calcula leitura digital, artigo científico e texto popular", () => {
  assert.equal(Math.round(digitalContentMinutes(273)), 5);
  assert.equal(Math.round(readingMinutes({ type: "Artigo científico", pages: 10 })), 50);
  assert.equal(Math.round(readingMinutes({ type: "Texto popular", pages: 10 })), 30);
  assert.equal(Math.round(readingMinutes({ type: "Artigo científico", wordCount: 273 })), 5);
});

test("ZIP contém um JSON rico por semana em semanas/", async () => {
  const input = normalizeCourseInput({ title: "Curso ZIP", weeks: 2, hoursPerWeek: 1, objectives: ["Conhecer"], webPracticeEnabled: true, webPractices: [{ title: "Mapa de dados", type: "Projeto aplicado", objective: "Aplicar conceitos", durationMinutes: 45, artifacts: [{ filename: "modelo.md", title: "Modelo", format: "markdown", content: "# Modelo" }] }] });
  const weeks = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
  const enriched = attachWorkloadToLessons(weeks, workload);
  const buffer = await createWeeksZip(input, enriched, buildGeneralPlan(input, workload, enriched));
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => name.endsWith(".aula.json"));
  assert.equal(names.length, 2);
  assert.ok(names.every((name) => name.startsWith("semanas/semana-")));
  assert.ok(zip.files["planejamento-geral.json"]);
  assert.ok(Object.keys(zip.files).some((name) => name.includes("webpraticas/") && name.endsWith("guia-e-roteiro.md")));
  assert.ok(Object.keys(zip.files).some((name) => name.endsWith("modelo.md")));
  const first = JSON.parse(await zip.files[names[0]].async("string"));
  assert.ok(first.lessonPlan.contentSections.length);
});
