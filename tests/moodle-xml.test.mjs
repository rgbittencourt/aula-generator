import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createMoodleXml, createCombinedMoodleXml, quizQuestions } from "../src/moodle-xml.js";
import { createWeeksZip } from "../src/zip.js";
import { normalizeLessonPlan, normalizeCourseInput } from "../src/aula-schema.js";

const question = (n) => ({
  type: "multiple-choice",
  objective: "Definir",
  q: `Pergunta ${n} com <b>tag</b> & "aspas"?`,
  options: ["A certa", "B errada", "C errada", "D errada", "E errada ]]> perigosa"],
  answer: 2,
  explanation: "Seção 1.",
  feedbackByOption: ["fb A", "fb B", "Correto: fb C", "fb D", "fb E"]
});
const lesson = (n = 2) => ({ lessonPlan: { assessment: { title: "T", questions: [question(1), question(2)].slice(0, n) } }, meta: { title: "Semana" }, blocks: [] });

async function wellFormed(xml) {
  const { xml2js } = await import("xml-js");
  return xml2js(xml, { compact: false });
}

test("Moodle XML: 5 alternativas, feedback em todas, correta com fraction 100", async () => {
  const xml = createMoodleXml(lesson(), { courseTitle: "TGE", weekNumber: 3 });
  const doc = await wellFormed(xml);
  assert.equal(doc.elements[0].name, "quiz");
  assert.match(xml, /\$course\$\/top\/TGE\/Semana 3/);
  assert.equal((xml.match(/<question type="multichoice">/g) || []).length, 2);
  assert.equal((xml.match(/<answer fraction=/g) || []).length, 10);
  assert.equal((xml.match(/<answer fraction="100"/g) || []).length, 2);
  assert.equal((xml.match(/<answer [^>]*>[\s\S]*?<feedback format="html">\s*<text><!\[CDATA\[<p>[^<]+/g) || []).length, 10, "feedback em todas as alternativas");
  assert.match(xml, /<single>true<\/single>/);
  assert.match(xml, /Correto: fb C/);
});

test("Moodle XML: sem questões não gera arquivo; CDATA com ]]> continua válido", async () => {
  assert.equal(createMoodleXml({ lessonPlan: { assessment: { questions: [] } } }), "");
  await wellFormed(createMoodleXml(lesson(1)));
  const combined = createCombinedMoodleXml([lesson(), lesson(1)], { courseTitle: "TGE" });
  await wellFormed(combined);
  assert.match(combined, /Semana 1/);
  assert.match(combined, /Semana 2/);
  assert.equal(quizQuestions(lesson()).length, 2);
});

test("normalizeLesson completa feedbackByOption ao tamanho das alternativas e limita answer", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, hoursPerWeek: 1, objectives: ["Conhecer"] });
  const plan = normalizeLessonPlan({ assessment: { questions: [{ q: "P?", options: ["a", "b", "c", "d", "e"], answer: 9, feedbackByOption: ["x"] }] } }, input, 0);
  const q = plan.assessment.questions[0];
  assert.equal(q.feedbackByOption.length, 5);
  assert.equal(q.answer, 4);
});

test("ZIP separa o quiz Moodle XML do .aula.json", async () => {
  const input = { title: "Curso Q", weeks: 2, webPractices: [], hoursPerWeek: 1 };
  const buffer = await createWeeksZip(input, [lesson(), lesson(1)], null, []);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  assert.ok(names.includes("moodle/semana-01-quiz.xml"));
  assert.ok(names.includes("moodle/semana-02-quiz.xml"));
  assert.ok(names.includes("moodle/todas-as-semanas-quiz.xml"));
  await wellFormed(await zip.files["moodle/todas-as-semanas-quiz.xml"].async("string"));
});
