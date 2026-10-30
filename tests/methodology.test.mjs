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

test("webprática: herda a metodologia da semana ou usa a própria", async () => {
  const { methodForPractice, webPracticeMethodologyBlock } = await import("../src/methodology.js");
  const input = baseInput({ methodologyPlan: { default: "estudo-de-caso" }, webPracticeEnabled: true, webPractices: [{ title: "Lab A", weekNumber: 1 }, { title: "Lab B", weekNumber: 1, methodology: "juri-simulado" }] });
  assert.equal(input.webPractices[1].methodology, "juri-simulado");
  assert.equal(methodForPractice(input.webPractices[0], input, 0).id, "estudo-de-caso");
  assert.equal(methodForPractice(input.webPractices[1], input, 0).id, "juri-simulado");
  const block = webPracticeMethodologyBlock(input, 0, input.webPractices);
  assert.match(block, /"Lab A": Estudo de caso/);
  assert.match(block, /"Lab B": Júri simulado/);
  const prompt = derivativesPrompt(input, 0, { theme: "T", contentSections: [], learningObjectives: [] }, input.webPractices, "webpractice");
  assert.match(prompt, /METODOLOGIA ATIVA DAS WEBPRÁTICAS/);
  assert.equal(webPracticeMethodologyBlock(baseInput(), 0, [{ title: "Lab" }]), "");
});

test("webprática: a metodologia declarada aparece no roteiro", async () => {
  const { practicePackageMarkdown } = await import("../src/webpractice.js");
  const md = practicePackageMarkdown(baseInput(), { title: "Lab", activeMethodology: { label: "Júri simulado / debate", rationale: "r", howApplied: "h" } }, 0);
  assert.match(md, /\*\*Metodologia ativa:\*\* Júri simulado/);
});

test("Preencher vazios com IA: regra de Bloom só na abordagem nova", async () => {
  const { buildBriefingPrompt } = await import("../src/ai.js");
  assert.match(buildBriefingPrompt(baseInput({ pedagogicalApproach: "nova" }), ["objectives"]), /TAXONOMIA DE BLOOM REVISADA/);
  assert.doesNotMatch(buildBriefingPrompt(baseInput(), ["objectives"]), /TAXONOMIA DE BLOOM REVISADA/);
});

test("voz humana: regras no prompt da abordagem nova e conferência de clichês", async () => {
  const { aiClicheReport } = await import("../src/methodology.js");
  assert.match(buildWriterPrompt(baseInput({ pedagogicalApproach: "nova" }), 0), /VOZ HUMANA/);
  const report = aiClicheReport("Além disso, vale ressaltar que é fundamental. Além disso, nesse contexto.");
  assert.equal(report.hits[0].term, "além disso");
  assert.ok(report.total >= 4);
  const review = pedagogicalReview({ learningObjectives: ["Analisar X"], contentSections: [{ body: "Além disso, vale ressaltar. Além disso, é fundamental. Nesse contexto, em suma." }] }, { input: baseInput({ pedagogicalApproach: "nova" }), index: 0 });
  assert.equal(review.checks.find((check) => check.id === "human-voice").pass, false);
});

test("raciocínio do modelo: desligado onde a API permite", async () => {
  const { anthropicThinkingConfig } = await import("../src/ai-client.js");
  const before = process.env.ANTHROPIC_THINKING; delete process.env.ANTHROPIC_THINKING;
  try {
    assert.deepEqual(anthropicThinkingConfig("claude-sonnet-5-5").thinking, { type: "between_tools" });
    assert.deepEqual(anthropicThinkingConfig("claude-sonnet-5").thinking, { type: "disabled" });
    assert.equal(anthropicThinkingConfig("claude-opus-5-5").thinking, null);
    assert.equal(anthropicThinkingConfig("claude-opus-5-5").effort, "low");
    assert.equal(anthropicThinkingConfig("claude-sonnet-4-6").thinking, null);
    process.env.ANTHROPIC_THINKING = "default";
    assert.equal(anthropicThinkingConfig("claude-sonnet-5-5").thinking, null);
  } finally { if (before === undefined) delete process.env.ANTHROPIC_THINKING; else process.env.ANTHROPIC_THINKING = before; }
});

test("figuras: diagrama, foto e Napkin são reconhecidos; só o diagrama vai para a IA desenhar", async () => {
  const { parseWeekMarkdown } = await import("../src/writer-markdown.js");
  const { illustrateWeek } = await import("../src/illustrate.js");
  const md = `# Semana 1 — Teste\n## Boas-vindas\nOlá.\n## Objetivos de aprendizagem\nAo final desta semana, você será capaz de:\n- Analisar X\n## 1. Seção\nTexto da seção um com conteúdo.\n\n> 🖼️ **Figura** [diagrama | descrição: "árvore de operadores"]: Árvore.\n\n> 🖼️ **Figura** [foto | descrição: "servidor de banco de dados em rack" | prompt: "foto realista de um rack de servidores em data center, luz fria, sem pessoas"]: Um data center.\n\n> 🖼️ **Figura** [napkin | descrição: "ciclo da consulta" | texto: "A consulta é analisada, traduzida, otimizada e executada."]: Ciclo.\n## Síntese conceitual\nFim.\n`;
  const { lessonPlan } = parseWeekMarkdown(md, { weekNumber: 1 });
  const figures = lessonPlan.contentSections[0].figures;
  assert.deepEqual(figures.map((figure) => figure.kind), ["diagrama", "foto", "napkin"]);
  assert.match(figures[1].prompt, /rack de servidores/);
  assert.match(figures[2].napkinText, /otimizada/);
  const asked = [];
  await illustrateWeek({ title: "T" }, { lessonPlan, blocks: [] }, { ask: async (messages) => { asked.push(messages); return { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' }; } });
  assert.equal(asked.length, 1);
});

test("guia da metodologia: prompt próprio com as atividades da semana; entra no Material de Mediação", async () => {
  const input = baseInput({ methodologyPlan: { default: "sala-invertida" } });
  const prompt = derivativesPrompt(input, 0, { theme: "T", contentSections: [], learningObjectives: ["Analisar X"], activities: [{ title: "Quiz de verificação", instructions: "Responda" }] }, [], "methodology");
  assert.match(prompt, /"methodologyGuide"/);
  assert.match(prompt, /Sala de aula invertida/);
  assert.match(prompt, /Quiz de verificação/);
  assert.doesNotMatch(prompt, /"feedbackByOption"/);
  const { buildTeacherGuides } = await import("../src/teacher-guide.js");
  const guide = buildTeacherGuides(input, [{ lessonPlan: { weekNumber: 1, theme: "T", learningObjectives: [], contentSections: [] } }], [{ methodologyGuide: { method: "Sala de aula invertida", phases: [{ name: "Antes" }] } }])[0];
  assert.equal(guide.methodologyGuide.method, "Sala de aula invertida");
  assert.equal(guide.methodologyRequested, true);
});
