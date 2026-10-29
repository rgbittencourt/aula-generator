import test from "node:test";
import assert from "node:assert/strict";
import { bloomLevel, bloomProfile, derivativesMethodologyBlock, methodForWeek, normalizeMethodologyPlan, productionMethodologyBlock, writerMethodologyBlock } from "../src/methodology.js";
import { normalizeCourseInput } from "../src/aula-schema.js";
import { buildWriterPrompt, derivativesPrompt } from "../src/claude-writer.js";
import { pedagogicalReview } from "../src/pedagogy.js";

const baseInput = (extra = {}) => normalizeCourseInput({ title: "Fundamentos de Gestão de Projetos", weeks: 3, objectives: ["Explicar o ciclo de vida de um projeto"], ...extra });

test("sem os campos novos, a entrada fica na abordagem atual e sem metodologia (compatível com a versão principal)", () => {
  const input = baseInput();
  assert.equal(input.pedagogicalApproach, "atual");
  assert.deepEqual(input.methodologyPlan, { default: "nenhuma", weeks: [] });
  assert.equal(writerMethodologyBlock(input, 0), "");
  assert.equal(derivativesMethodologyBlock(input, 0, { activities: true, assessment: true }), "");
  assert.equal(productionMethodologyBlock(input), "");
});

test("abordagem atual: o prompt de redação não muda", () => {
  const input = baseInput();
  assert.doesNotMatch(buildWriterPrompt(input, 0), /ABORDAGEM PEDAGÓGICA|METODOLOGIA ATIVA/);
});

test("abordagem nova entra nos prompts de redação, derivados e produção", () => {
  const input = baseInput({ pedagogicalApproach: "nova" });
  assert.match(buildWriterPrompt(input, 0), /Planeje de trás para frente/);
  assert.match(buildWriterPrompt(input, 0), /APRENDIZAGEM MULTIMÍDIA/);
  const prompt = derivativesPrompt(input, 0, { theme: "T", contentSections: [], learningObjectives: ["Comparar"] }, [], "assessment");
  assert.match(prompt, /ALINHAMENTO CONSTRUTIVO/);
  assert.match(productionMethodologyBlock(input), /Redundância/);
});

test("metodologia por semana sobrepõe o padrão do curso", () => {
  const input = baseInput({ methodologyPlan: { default: "estudo-de-caso", weeks: [{ weekNumber: 2, method: "pbl" }, { weekNumber: 9, method: "pbl" }, { weekNumber: 3, method: "inexistente" }] } });
  assert.deepEqual(input.methodologyPlan.weeks, [{ weekNumber: 2, method: "pbl" }]);
  assert.equal(methodForWeek(input, 0).id, "estudo-de-caso");
  assert.equal(methodForWeek(input, 1).id, "pbl");
  assert.match(buildWriterPrompt(input, 1), /Aprendizagem Baseada em Problemas/);
  const activities = derivativesPrompt(input, 1, { theme: "T", contentSections: [], learningObjectives: [] }, [], "activities");
  assert.match(activities, /"activeMethodology"/);
  assert.match(activities, /investigação orientada/);
});

test("a IA escolhe: as atividades pedem a escolha e a justificativa", () => {
  const input = baseInput({ methodologyPlan: { default: "auto" } });
  const activities = derivativesPrompt(input, 0, { theme: "T", contentSections: [], learningObjectives: [] }, [], "activities");
  assert.match(activities, /escolha UMA destas/);
});

test("Bloom: verbos vagos e níveis", () => {
  assert.equal(bloomLevel("Compreender os conceitos de TIC"), "vago");
  assert.equal(bloomLevel("Ao final, o estudante será capaz de comparar SIGAA e SUAP"), "analisar");
  assert.equal(bloomLevel("Elaborar o termo de abertura"), "criar");
  assert.equal(bloomLevel("Identificar as fases"), "lembrar");
  const profile = bloomProfile(["Conhecer X", "Aplicar Y"]);
  assert.equal(profile.vague.length, 1);
  assert.equal(profile.higher.length, 1);
});

test("revisão pedagógica: checagens novas só na abordagem nova; metodologia em qualquer abordagem", () => {
  const plan = { learningObjectives: ["Compreender X", "Identificar Y"], activities: [{ title: "Fórum" }] };
  const atual = pedagogicalReview(plan, { input: baseInput(), index: 0 });
  assert.ok(!atual.checks.some((check) => check.id.startsWith("bloom")));
  const nova = pedagogicalReview(plan, { input: baseInput({ pedagogicalApproach: "nova", methodologyPlan: { default: "estudo-de-caso" } }), index: 0 });
  const byId = Object.fromEntries(nova.checks.map((check) => [check.id, check.pass]));
  assert.equal(byId["bloom-verbs"], false);
  assert.equal(byId["bloom-balance"], false);
  assert.equal(byId["methodology-applied"], false);
  const ok = pedagogicalReview({ ...plan, learningObjectives: ["Analisar X"], activeMethodology: { label: "Estudo de caso", howApplied: "O caso conduz o fórum." } }, { input: baseInput({ pedagogicalApproach: "nova", methodologyPlan: { default: "estudo-de-caso" } }), index: 0 });
  assert.ok(ok.checks.filter((check) => ["bloom-verbs", "bloom-balance", "methodology-applied"].includes(check.id)).every((check) => check.pass));
});

test("plano de metodologia normaliza lixo sem quebrar", () => {
  assert.deepEqual(normalizeMethodologyPlan(null, 4), { default: "nenhuma", weeks: [] });
  assert.deepEqual(normalizeMethodologyPlan({ default: "x", weeks: "y" }, 4), { default: "nenhuma", weeks: [] });
});
