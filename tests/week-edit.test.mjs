import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { applyEdits, editWeek, markdownToHtml, splitBlocks } from "../src/week-edit.js";

const input = normalizeCourseInput({ title: "TGE", weeks: 3, hoursPerWeek: 4, year: 2026, author: "R" });
const plan = {
  theme: "Sistemas acadêmicos", welcome: "<p>Bem-vindos.</p>", learningObjectives: ["Comparar sistemas"],
  contentSections: [
    { number: "1", title: "SUAP e SIGAA", body: "<p>O <strong>SUAP</strong> nasceu no IFRN.</p><ul><li>a</li><li>b</li></ul><p>Fim da seção.</p>", subsections: [{ number: "1.1", title: "Caso", body: "<p>Um caso.</p>" }], resources: [{ id: "w1-r1", kind: "video", title: "Vídeo X", href: "https://youtu.be/x", sectionNumber: "1" }], callouts: [], figures: [] }
  ],
  synthesis: "<p>Síntese.</p>", nextWeekConnection: "<p>Próxima.</p>",
  assessment: { title: "Prova", questions: [{ q: "Q1?", options: ["a", "b", "c", "d", "e"], answer: 0 }] },
  references: [{ citation: "Autor (2020)" }]
};
const week = normalizeLesson({ lessonPlan: plan }, input, 0);

test("splitBlocks separa p/ul sem perder nada", () => {
  const parts = splitBlocks(plan.contentSections[0].body);
  assert.deepEqual(parts.map((part) => part.editable), [true, true, true]);
  assert.equal(parts.map((part) => part.html).join(""), plan.contentSections[0].body);
  assert.match(markdownToHtml("Texto com **negrito** e [link](https://a.b)."), /<p>Texto com <strong>negrito<\/strong> e <a href="https:\/\/a.b"/);
  assert.equal(markdownToHtml("## título\n\n> 🔎 recurso"), "");
});

test("título: só o tema muda; questões, recursos e texto permanecem", async () => {
  const calls = [];
  const ask = async (messages, options) => { calls.push(options.label); return { title: "Semana 1 — Quem manda no sistema? SUAP, SIGAA e a decisão institucional" }; };
  const result = await editWeek(input, 0, week, "refaça só o título, mais provocativo", "title", { nextTheme: "Dados" }, ask);
  assert.deepEqual(calls, ["edit:title"]);
  assert.equal(result.week.lessonPlan.theme, "Quem manda no sistema? SUAP, SIGAA e a decisão institucional");
  assert.equal(result.week.meta.title.includes("Quem manda no sistema"), true);
  assert.equal(result.week.lessonPlan.assessment.questions.length, 1);
  assert.equal(result.week.lessonPlan.contentSections[0].body, week.lessonPlan.contentSections[0].body);
  assert.equal(result.week.lessonPlan.contentSections[0].resources.length, 1);
  assert.equal(result.week.generationMeta.lastEdit.scope, "title");
});

test("ajuste pontual: troca, apaga e insere blocos; o resto fica igual", async () => {
  const ask = async (messages) => {
    assert.match(messages[1].content, /\[1:p1\] O \*\*SUAP\*\* nasceu no IFRN\./);
    assert.match(messages[1].content, /\[synthesis:p1\] Síntese\./);
    return { title: null, sectionTitles: [{ number: "1", title: "SUAP, SIGAA e quem mantém" }], changes: [
      { id: "1:p1", action: "replace", markdown: "O **SUAP** nasceu no IFRN, em 2011." },
      { id: "1:p3", action: "delete" },
      { after: "1:p1", action: "insert", markdown: "Um parágrafo novo." },
      { id: "9:p9", action: "replace", markdown: "x" }
    ], summary: "Ajustei a seção 1." };
  };
  const result = await editWeek(input, 0, week, "acrescente o ano", "edit", {}, ask);
  const section = result.week.lessonPlan.contentSections[0];
  assert.equal(section.title, "SUAP, SIGAA e quem mantém");
  assert.equal(section.body, "<p>O <strong>SUAP</strong> nasceu no IFRN, em 2011.</p><p>Um parágrafo novo.</p><ul><li>a</li><li>b</li></ul>");
  assert.equal(section.subsections[0].body, "<p>Um caso.</p>");
  assert.equal(result.week.lessonPlan.synthesis, "<p>Síntese.</p>");
  assert.equal(result.week.lessonPlan.assessment.questions.length, 1);
  assert.equal(section.resources.length, 1);
  assert.deepEqual(result.skipped, ["9:p9"]);
  assert.equal(result.summary, "Ajustei a seção 1.");
});

test("ajuste pontual sem nada aplicável falha com mensagem clara", async () => {
  await assert.rejects(editWeek(input, 0, week, "x", "edit", {}, async () => ({ changes: [] })), (error) => error.code === "EDIT_NO_RESULT");
  await assert.rejects(editWeek(input, 0, { lessonPlan: {} }, "x", "edit", {}, async () => ({})), (error) => error.code === "EDIT_WEEK_MISSING");
});
