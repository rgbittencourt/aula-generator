import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildFallbackLesson, normalizeCourseInput, normalizeWeeklyOutput, weekCalendar, validateLesson } from "../src/aula-schema.js";
import { calculateCourseWorkload, calculateWeekWorkload } from "../src/calculations.js";
import { createWeeksZip } from "../src/zip.js";
import { buildBriefingPrompt } from "../src/ai.js";

test("normaliza briefing com calendário real e webpráticas independentes", () => {
  const input = normalizeCourseInput({ title: "Cidades sustentáveis", weeks: "3", hoursPerWeek: "2.5", calendarMode: "calendar", startDate: "2026-10-05", objectives: "Analisar\nAplicar", webPracticeEnabled: true, webPractices: [{ title: "Mapa do bairro", type: "Pesquisa orientada", moments: "Semana 2", objective: "Analisar" }, { title: "Debate", type: "Debate ou seminário", moments: "Semana 3", objective: "Avaliar" }], materials: [{ title: "Texto-base", type: "Texto-base", objective: "Preparar a análise", alignment: "Mobilidade urbana" }] });
  assert.equal(input.weeks, 3);
  assert.equal(input.hoursPerWeek, 2.5);
  assert.equal(input.startDate, "2026-10-05");
  assert.deepEqual(input.objectives, ["Analisar", "Aplicar"]);
  assert.equal(input.webPractice.enabled, true);
  assert.equal(input.webPractices.length, 2);
  assert.equal(input.materials[0].alignment, "Mobilidade urbana");
  assert.deepEqual(weekCalendar(input, 1), { weekNumber: 2, label: "Semana 2 · 12/10/2026", startDate: "2026-10-12", endDate: "2026-10-18" });
});

test("prompt do assistente exige práticas distintas e materiais alinhados", () => {
  const prompt = buildBriefingPrompt(normalizeCourseInput({ title: "Curso", webPracticeEnabled: true }), ["webPractices", "materials"]);
  assert.match(prompt, /webpráticas.*distintas/i);
  assert.match(prompt, /materiais de apoio/i);
  assert.match(prompt, /não links inventados/i);
});

test("fallback gera uma aula válida para cada semana", () => {
  const input = normalizeCourseInput({ title: "História da ciência", weeks: 2, hoursPerWeek: 4, objectives: ["Comparar teorias"], webPracticeEnabled: true, practiceInstructions: "Faça uma pesquisa orientada.", videoLinks: "https://www.youtube.com/watch?v=abc123" });
  const weeks = normalizeWeeklyOutput({ weeks: [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)] }, input);
  assert.equal(weeks.length, 2);
  assert.equal(validateLesson(weeks[0]), true);
  assert.ok(weeks[0].blocks.some((block) => block.type === "hero"));
  assert.ok(weeks[0].blocks.some((block) => block.type === "destaque"));
  assert.ok(weeks[0].blocks.some((block) => block.type === "video"));
});

test("cálculo mantém carga total e aceita perfil futuro da planilha", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, hoursPerWeek: 5 });
  const pending = calculateCourseWorkload(input);
  assert.equal(pending.totalMinutes, 600);
  assert.equal(pending.formulaStatus, "pending-spreadsheet");
  const configured = calculateWeekWorkload(input, 0, { ratios: { content: 0.5, practice: 0.25, assessment: 0.15, review: 0.1 } });
  assert.equal(configured.formulaStatus, "configured");
  assert.equal(Object.values(configured.allocation).reduce((sum, value) => sum + value, 0), 300);
});

test("ZIP contém um JSON por semana em semanas/", async () => {
  const input = normalizeCourseInput({ title: "Curso ZIP", weeks: 2, hoursPerWeek: 1, objectives: ["Conhecer"] });
  const weeks = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const buffer = await createWeeksZip(input, weeks);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => name.endsWith(".aula.json"));
  assert.equal(names.length, 2);
  assert.ok(names.every((name) => name.startsWith("semanas/semana-")));
});
