import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFallbackLesson, normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { toStudentLesson } from "../src/student-export.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { createMediationMaterialPdf } from "../src/pdf.js";

const explain = {
  weekSummary: "O estudante aprende a separar indicador de meta 🙂 e volta ao caso → aplica.",
  keyIdeas: ["Indicador não é meta."],
  studentFAQ: [{ question: "A atividade é em grupo?", answer: "Não, é individual.", sectionRef: "2" }],
  commonMisconceptions: [{ misconception: "Meta e indicador são iguais", whyItHappens: "Aparecem juntos.", howToAddress: "Pedir os dois por escrito." }],
  interventions: [{ signal: "Sem acesso há 3 dias", action: "Mensagem individual", message: "Oi, posso ajudar a começar?" }],
  sensitivePoints: ["O número de 38% precisa de conferência."]
};

function pdfText(buffer) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "med-")), "m.pdf");
  fs.writeFileSync(file, buffer);
  try { return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }); } catch { return null; }
}

test("Material de Mediação traz todas as semanas geradas com situação, as explicações e as semanas que faltam", async () => {
  const input = normalizeCourseInput({ title: "Curso de acompanhamento", weeks: 4, hoursPerWeek: 3, objectives: ["Analisar"] });
  const lessons = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const guides = buildTeacherGuides(input, lessons, [explain, {}]);
  const buffer = await createMediationMaterialPdf(input, guides, null, { explicitScope: true, releasedWeekIndexes: [0] });
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  const text = pdfText(buffer);
  if (text == null) return; // sem poppler no ambiente: só a geração é verificada
  assert.match(text, /Sumário/);
  assert.match(text, /Mapa da UC/);
  assert.match(text, /A semana em uma página/);
  assert.match(text, /Perguntas prováveis dos alunos/);
  assert.match(text, /A atividade é em grupo\?/);
  assert.match(text, /Equívocos comuns/);
  assert.match(text, /Liberada/);
  assert.match(text, /Rascunho/);
  assert.match(text, /Semanas ainda não geradas/);
  assert.doesNotMatch(text, /\[object Object\]|undefined|Não informado/);
  assert.doesNotMatch(text, /🙂/);
});

test("Material de Mediação sem nenhuma semana gerada ainda abre com o aviso e a lista de semanas previstas", async () => {
  const input = normalizeCourseInput({ title: "Curso novo", weeks: 3, objectives: ["Aplicar"] });
  const buffer = await createMediationMaterialPdf(input, [], null, {});
  const text = pdfText(buffer);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  if (text != null) { assert.match(text, /Nenhuma semana gerada ainda/); assert.match(text, /Semanas ainda não geradas/); }
});

test("Material de Mediação não quebra com emojis, setas e símbolos fora do alfabeto do PDF", async () => {
  const input = normalizeCourseInput({ title: "Curso ✨ símbolos → ≥", weeks: 1, objectives: ["Aplicar 🎯"] });
  const lesson = buildFallbackLesson(input, 0);
  const guides = buildTeacherGuides(input, [lesson], [{ ...explain, weekSummary: "Texto com emoji 🚀 e ✓ e “aspas”." }]);
  const buffer = await createMediationMaterialPdf(input, guides, null, {});
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
});

test("bloco de referências do Aula Studio leva cada referência como texto, nunca como objeto", () => {
  const input = normalizeCourseInput({ title: "Curso refs", weeks: 1, objectives: ["Aplicar"] });
  const lesson = buildFallbackLesson(input, 0);
  const references = [{ citation: "AUTOR, A. Título. 2020.", href: "https://doi.org/10.1/x", publisher: "Editora" }, { citation: "OUTRO, B. Livro. 2019." }];
  const normalized = normalizeLesson({ ...lesson, lessonPlan: { ...lesson.lessonPlan, references } }, input, 0);
  const refBlock = toStudentLesson(normalized).blocks.find((item) => item.type === "referencias");
  assert.ok(refBlock, "bloco de referências presente");
  refBlock.props.items.forEach((item) => assert.equal(typeof item, "string"));
  assert.match(refBlock.props.items[0], /AUTOR, A\./);
  assert.match(refBlock.props.items[0], /href="https:\/\/doi\.org\/10\.1\/x"/);
  assert.doesNotMatch(JSON.stringify(refBlock), /\[object Object\]/);
});

test("crédito do ClassAuthor e autoria presentes no Studio, no ClassAuthor, no XML e no PDF", async () => {
  const { GENERATOR_CREDIT } = await import("../src/student-export.js");
  const { createMoodleXml } = await import("../src/moodle-xml.js");
  const { toGeneratorWeek } = await import("../src/student-export.js");
  assert.equal(GENERATOR_CREDIT, "Construído com ClassAuthor, uma ferramenta de planejamento pedagógico desenvolvida por Rogério Bittencourt, INOVALAB - IFSC.");
  const input = normalizeCourseInput({ title: "Curso crédito", weeks: 1, objectives: ["Aplicar"], author: "Prof. Fulana", institution: "IFSC" });
  const lesson = buildFallbackLesson(input, 0);
  const studio = toStudentLesson(lesson);
  assert.equal(studio.meta.aiUse, GENERATOR_CREDIT);
  assert.equal(studio.meta.generatedBy, GENERATOR_CREDIT);
  assert.equal(studio.meta.author, "Prof. Fulana");
  assert.equal(toGeneratorWeek(lesson).credit, GENERATOR_CREDIT);
  const last = studio.blocks[studio.blocks.length - 1];
  assert.equal(last.type, "topic");
  assert.match(last.props.children[0].props.body, /Construído com <strong>ClassAuthor<\/strong>, uma ferramenta de planejamento pedagógico/);
  assert.equal(studio.blocks.filter((block) => /^b-credit-/.test(block.id)).length, 1);
  const xml = createMoodleXml(lesson, { courseTitle: "Curso crédito", weekNumber: 1 });
  if (xml) assert.ok(xml.includes(GENERATOR_CREDIT));
  const guides = buildTeacherGuides(input, [lesson], [{}]);
  const text = pdfText(await createMediationMaterialPdf(input, guides, null, {}));
  if (text != null) { assert.match(text, /Autoria: Prof\. Fulana/); assert.match(text.replace(/\s+/g, " "), /Construído com ClassAuthor, uma ferramenta de planejamento pedagógico desenvolvida por Rogério Bittencourt, INOVALAB - IFSC\./); }
});
